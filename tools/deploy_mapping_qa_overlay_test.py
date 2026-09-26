"""Mocked deployment controls; no subprocess or cloud mutation is permitted."""
import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import deploy_mapping_qa_overlay as mapping
from deploy_campaign_planner_overlay_test import metadata


def policies():
    policy = {"version": 3, "etag": "before", "bindings": [{"role": "roles/run.invoker",
              "members": ["serviceAccount:private@example.invalid"],
              "condition": {"title": "retained", "expression": "request.time < timestamp('2100-01-01T00:00:00Z')"}}]}
    return {"service": "projects/scaled-circle/locations/us-east1/services/test-service",
            "functionPolicy": copy.deepcopy(policy), "servicePolicy": copy.deepcopy(policy)}


class MappingDeploySafetyTests(unittest.TestCase):
    def invoke(self, before=None, after=None, before_iam=None, after_iam=None, error=None):
        original = metadata()
        entry = {"output": "reviewed-source", "liveSource": original["buildConfig"]["source"]["storageSource"]}
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "getSmartZonePlan-iam-baseline.private.json").write_text(json.dumps(policies()), encoding="utf-8")
            output = io.StringIO()
            result = mock.Mock(returncode=0, stdout=b"protected deployment output", stderr=b"")
            with mock.patch.object(mapping, "DEPLOY_STATE", state), mock.patch.object(mapping, "verify_candidate"), \
                    mock.patch.object(mapping, "load_entry", return_value=(entry, original)), \
                    mock.patch.object(mapping, "describe", side_effect=[before or original, after or original]), \
                    mock.patch.object(mapping, "read_iam", side_effect=[before_iam or policies(), after_iam or policies()]), \
                    mock.patch.object(mapping.subprocess, "run", return_value=result) as run, contextlib.redirect_stdout(output):
                if error:
                    with self.assertRaisesRegex(RuntimeError, error):
                        mapping.promote("getSmartZonePlan")
                else:
                    mapping.promote("getSmartZonePlan")
            self.assertNotIn("private@example.invalid", output.getvalue())
            self.assertNotIn("private-value", output.getvalue())
            self.assertNotIn("protected deployment output", output.getvalue())
            return run.call_args_list, output.getvalue()

    def test_iam_order_and_etag_are_ignored_but_grants_conditions_and_versions_are_preserved(self):
        before = policies()
        same = copy.deepcopy(before)
        same["servicePolicy"]["etag"] = "generated"
        self.assertEqual(mapping.normalized_iam(before), mapping.normalized_iam(same))
        for mutation in ("members", "condition", "version"):
            with self.subTest(mutation=mutation):
                changed = copy.deepcopy(before)
                if mutation == "version":
                    changed["servicePolicy"]["version"] = 1
                else:
                    changed["servicePolicy"]["bindings"][0][mutation] = [] if mutation == "members" else {"expression": "true"}
                self.assertNotEqual(mapping.normalized_iam(before), mapping.normalized_iam(changed))

    def test_preflight_source_runtime_or_nonactive_drift_prevents_any_deploy(self):
        for field in ("source", "runtime", "state"):
            with self.subTest(field=field):
                before = metadata()
                if field == "source":
                    before["buildConfig"]["source"]["storageSource"]["generation"] = "changed"
                elif field == "runtime":
                    before["buildConfig"]["runtime"] = "different"
                else:
                    before["state"] = "DEPLOYING"
                calls, _ = self.invoke(before=before, error="deployment stopped")
                self.assertEqual(calls, [])

    def test_preflight_function_or_service_iam_drift_prevents_any_deploy(self):
        for scope in ("functionPolicy", "servicePolicy"):
            with self.subTest(scope=scope):
                changed = policies()
                changed[scope]["bindings"][0]["members"].append("allUsers")
                calls, _ = self.invoke(before_iam=changed, error="Live IAM changed")
                self.assertEqual(calls, [])

    def test_after_iam_drift_stops_without_retry_and_prints_no_policy_contents(self):
        changed = policies()
        changed["servicePolicy"]["bindings"] = []
        calls, output = self.invoke(after_iam=changed, error="do not continue")
        self.assertEqual(len(calls), 1)
        self.assertIn('"iamUnchanged": false', output)

    def test_after_configuration_drift_stops_without_retry(self):
        after = metadata()
        after["buildConfig"]["entryPoint"] = "different"
        calls, output = self.invoke(after=after, error="do not continue")
        self.assertEqual(len(calls), 1)
        self.assertIn("buildConfig.entryPoint", output)

    def test_success_deploys_only_existing_target_source_with_no_config_or_iam_flags(self):
        calls, output = self.invoke()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].args[0], [str(mapping.GCLOUD), "functions", "deploy", "getSmartZonePlan", "--gen2",
                         "--project=scaled-circle", "--region=us-east1", "--source=reviewed-source", "--quiet", "--format=json"])
        self.assertIn('"iamUnchanged": true', output)

    def test_candidate_revision_or_application_source_drift_is_rejected(self):
        result = lambda code, output=b"": mock.Mock(returncode=code, stdout=output, stderr=b"")
        with mock.patch.object(mapping.subprocess, "run", return_value=result(0, b"different")):
            with self.assertRaisesRegex(RuntimeError, "approved candidate"):
                mapping.verify_candidate()
        with mock.patch.object(mapping.subprocess, "run", side_effect=[result(0, mapping.APPROVED_CANDIDATE.encode()), result(1), result(0)]):
            with self.assertRaisesRegex(RuntimeError, "application source changed"):
                mapping.verify_candidate()

    def test_iam_reads_require_the_expected_cloud_run_service_scope(self):
        description = metadata()
        description["serviceConfig"]["service"] = "projects/other/locations/us-east1/services/test-service"
        with mock.patch.object(mapping, "private_json") as read:
            with self.assertRaisesRegex(RuntimeError, "outside the approved scope"):
                mapping.read_iam("getSmartZonePlan", description, "test")
            read.assert_not_called()

    def test_capture_is_read_only_and_will_not_replace_a_changed_iam_baseline(self):
        original = metadata()
        entry = {"liveSource": original["buildConfig"]["source"]["storageSource"]}
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            with mock.patch.object(mapping, "DEPLOY_STATE", state), mock.patch.object(mapping, "verify_candidate"), \
                    mock.patch.object(mapping, "load_entry", return_value=(entry, original)), \
                    mock.patch.object(mapping, "describe", return_value=original), \
                    mock.patch.object(mapping, "read_iam", return_value=policies()) as iam, \
                    mock.patch.object(mapping.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()):
                mapping.capture_iam()
                self.assertEqual(iam.call_count, 3)
                run.assert_not_called()
                baseline = state / "getSmartZonePlan-iam-baseline.private.json"
                original_bytes = baseline.read_bytes()
                changed = policies()
                changed["servicePolicy"]["bindings"] = []
                iam.return_value = changed
                with self.assertRaisesRegex(RuntimeError, "existing baseline retained"):
                    mapping.capture_iam()
                self.assertEqual(baseline.read_bytes(), original_bytes)


if __name__ == "__main__":
    unittest.main()

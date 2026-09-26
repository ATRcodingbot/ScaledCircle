"""Offline guard tests. Every cloud/Git subprocess is mocked."""
import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

import deploy_mapping_correction_overlay as correction
from deploy_campaign_planner_overlay_test import metadata
from deploy_mapping_qa_overlay_test import policies

SHA = "a" * 40


def current():
    result = metadata()
    result["name"] = "projects/scaled-circle/locations/us-east1/functions/getSmartZonePlan"
    result["buildConfig"]["source"]["storageSource"].update(bucket="source", object="source.zip")
    return result


class CorrectionSafetyTests(unittest.TestCase):
    def test_candidate_requires_explicit_sha_exact_head_clean_checkout_and_pushed_branch(self):
        result = lambda text: mock.Mock(returncode=0, stdout=text.encode(), stderr=b"")
        cases = [(None, [], "explicit"), (SHA, ["different"], "HEAD"),
                 (SHA, [SHA, "?? unstaged.py"], "clean"),
                 (SHA, [SHA, "", "codex/test", "b" * 40 + "\trefs/heads/codex/test"], "pushed")]
        for source_sha, outputs, message in cases:
            with self.subTest(message=message), mock.patch.object(correction.subprocess, "run", side_effect=[result(s) for s in outputs]):
                with self.assertRaisesRegex(RuntimeError, message):
                    correction.candidate(source_sha)
        with mock.patch.object(correction.subprocess, "run", side_effect=[result(s) for s in
                [SHA, "", "codex/test", SHA + "\trefs/heads/codex/test"]]) as run:
            self.assertEqual(correction.candidate(SHA), "codex/test")
            self.assertEqual(run.call_args.args[0], ["git", "ls-remote", "--exit-code", "--heads", "origin", "refs/heads/codex/test"])

    def test_archive_rejects_traversal_absolute_and_symlink_entries(self):
        for filename, mode in [("../outside", 0), ("C:/outside", 0), ("/outside", 0), ("link", 0o120777 << 16)]:
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as directory:
                archive = Path(directory) / "source.zip"
                with zipfile.ZipFile(archive, "w") as bundle:
                    item = zipfile.ZipInfo(filename)
                    item.external_attr = mode
                    bundle.writestr(item, "bad")
                with self.assertRaisesRegex(RuntimeError, "unsafe"):
                    correction.extract_archive(archive, Path(directory) / "base")

    def test_archive_requires_dependency_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "source.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("index.js", "exports.unchanged=true;")
            with self.assertRaisesRegex(RuntimeError, "dependency lock"):
                correction.extract_archive(archive, Path(directory) / "base")

    def test_preflight_rejects_source_configuration_nonactive_and_iam_drift(self):
        original = current()
        for drift in ("source", "build", "trigger", "env", "state", "iam"):
            after = copy.deepcopy(original)
            policy = policies()
            if drift == "source": after["buildConfig"]["source"]["storageSource"]["generation"] = "different"
            if drift == "build": after["buildConfig"]["serviceAccount"] = "different"
            if drift == "trigger": after["eventTrigger"]["retryPolicy"] = "different"
            if drift == "env": after["serviceConfig"]["environmentVariables"] = {}
            if drift == "state": after["state"] = "DEPLOYING"
            if drift == "iam": policy["servicePolicy"]["bindings"] = []
            with self.subTest(drift=drift), tempfile.TemporaryDirectory() as directory:
                file = Path(directory) / "iam.private.json"
                file.write_text(json.dumps(policies()), encoding="utf-8")
                entry = {"baseline": {"liveSource": original["buildConfig"]["source"]["storageSource"], "iamFile": str(file)}}
                with mock.patch.object(correction, "candidate"), mock.patch.object(correction, "load_entry", return_value=(entry, original)), \
                        mock.patch.object(correction, "describe", return_value=after), mock.patch.object(correction, "iam", return_value=policy), \
                        mock.patch.object(correction.subprocess, "run") as run:
                    with self.assertRaises(RuntimeError):
                        correction.preflight("getSmartZonePlan", SHA, Path(directory))
                    run.assert_not_called()

    def promote(self, verify=False, after=None, policy=None, error=False):
        original = current()
        with tempfile.TemporaryDirectory() as directory:
            stream = io.StringIO()
            with mock.patch.object(correction, "STATE", Path(directory)), \
                    mock.patch.object(correction, "preflight", return_value=({"output": "reviewed-source"}, original, policies())), \
                    mock.patch.object(correction, "describe", return_value=after or original), \
                    mock.patch.object(correction, "iam", return_value=policy or policies()), \
                    mock.patch.object(correction.subprocess, "run", return_value=mock.Mock(returncode=0, stdout=b"private-output", stderr=b"")) as run, \
                    contextlib.redirect_stdout(stream):
                if error:
                    with self.assertRaisesRegex(RuntimeError, "do not continue"):
                        correction.promote("getSmartZonePlan", SHA, verify_only=verify)
                else:
                    correction.promote("getSmartZonePlan", SHA, verify_only=verify)
            self.assertNotIn("private-output", stream.getvalue())
            self.assertNotIn("private@example.invalid", stream.getvalue())
            self.assertNotIn("private-value", stream.getvalue())
            return run.call_args_list

    def test_verify_action_is_read_only(self):
        self.assertEqual(self.promote(verify=True), [])

    def test_deployment_sends_only_source_flags_to_exact_existing_target(self):
        calls = self.promote()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].args[0], [str(correction.GCLOUD), "functions", "deploy", "getSmartZonePlan", "--gen2",
            "--project=scaled-circle", "--region=us-east1", "--source=reviewed-source", "--quiet", "--format=json"])

    def test_post_deployment_drift_blocks_continuation_without_retry(self):
        after = current()
        after["serviceConfig"]["secretEnvironmentVariables"] = []
        self.assertEqual(len(self.promote(after=after, error=True)), 1)
        policy = policies()
        policy["functionPolicy"]["bindings"] = []
        self.assertEqual(len(self.promote(policy=policy, error=True)), 1)

    def test_metadata_scope_and_pinned_generation_are_required(self):
        for field in ("name", "state", "generation"):
            value = current()
            if field == "generation": value["buildConfig"]["source"]["storageSource"].pop(field)
            else: value[field] = "different"
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                correction.validate_metadata("getSmartZonePlan", value)


if __name__ == "__main__":
    unittest.main()

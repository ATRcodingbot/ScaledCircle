"""Synthetic safety checks; never invoke gcloud or access a live project."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("overlay", Path(__file__).with_name("deploy_campaign_planner_overlay.py"))
overlay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(overlay)


def metadata():
    return {"state": "ACTIVE", "environment": "GEN_2", "labels": {"owner": "retained"},
            "buildConfig": {"runtime": "nodejs24", "entryPoint": "businessOperationsV1",
                            "serviceAccount": "build-account", "environmentVariables": {"BUILD_SETTING": "private-value"},
                            "source": {"storageSource": {"generation": "original"}}, "build": "original-build",
                            "sourceProvenance": {"resolvedStorageSource": {"generation": "original"}}},
            "serviceConfig": {"environmentVariables": {"SETTING": "private-value"},
                              "secretEnvironmentVariables": [{"key": "SECRET", "version": "retained"}],
                              "revision": "old", "uri": "old-uri", "service": "old-service"},
            "eventTrigger": {"eventType": "retained-event", "retryPolicy": "RETRY_POLICY_RETRY"}}


class OverlaySafetyTests(unittest.TestCase):
    def test_generated_revision_and_build_metadata_do_not_look_like_setting_drift(self):
        before = metadata()
        after = copy.deepcopy(before)
        after["serviceConfig"].update(revision="new", uri="new-uri", service="new-service")
        after["buildConfig"].update(build="new-build", source={"storageSource": {"generation": "new"}}, sourceProvenance={})
        self.assertEqual(overlay.changed_configuration_fields(before, after), [])

    def test_runtime_build_trigger_environment_and_secret_drift_are_detected(self):
        before = metadata()
        for section, key in [("buildConfig", "runtime"), ("buildConfig", "entryPoint"),
                             ("buildConfig", "serviceAccount"), ("buildConfig", "environmentVariables"),
                             ("eventTrigger", "eventType"), ("eventTrigger", "retryPolicy"),
                             ("serviceConfig", "environmentVariables"), ("serviceConfig", "secretEnvironmentVariables")]:
            with self.subTest(section=section, key=key):
                after = copy.deepcopy(before)
                after[section][key] = "changed-private-value"
                self.assertEqual(overlay.changed_configuration_fields(before, after), [section + "." + key])

    def test_added_or_removed_configuration_sections_are_detected(self):
        before = metadata()
        for section in ["environment", "kmsKeyName", "labels", "eventTrigger"]:
            with self.subTest(section=section):
                after = copy.deepcopy(before)
                after[section] = "new-private-value"
                self.assertEqual(overlay.changed_configuration_fields(before, after), [section])

    def test_source_verification_rejects_extra_missing_and_changed_files(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            script = source / "index.js"
            script.write_text("reviewed source", encoding="utf-8")
            expected = overlay.source_hashes(source)
            overlay.verify_source(source, expected)
            unexpected = source / "unexpected.env"
            unexpected.write_text("private data", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "inventory"):
                overlay.verify_source(source, expected)
            unexpected.unlink()
            script.write_text("changed source", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "contents"):
                overlay.verify_source(source, expected)
            script.unlink()
            with self.assertRaisesRegex(RuntimeError, "inventory"):
                overlay.verify_source(source, expected)

    def invoke_operations(self, before, after, expected_error=None):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            source = state / "operations"
            source.mkdir()
            (source / "index.js").write_text("reviewed source", encoding="utf-8")
            (state / "operations-before.private.json").write_text(json.dumps(metadata()), encoding="utf-8")
            (state / "operations-source-manifest.private.json").write_text(json.dumps({"files": overlay.source_hashes(source)}), encoding="utf-8")
            result = mock.Mock(returncode=0, stdout=b"private output", stderr=b"")
            captured = io.StringIO()
            with mock.patch.object(overlay, "STATE", state), mock.patch("sys.argv", ["runner", "businessOperationsV1"]), \
                    mock.patch.object(overlay, "describe", side_effect=[before, after]), \
                    mock.patch.object(overlay.subprocess, "run", return_value=result) as run, contextlib.redirect_stdout(captured):
                if expected_error:
                    with self.assertRaisesRegex(RuntimeError, expected_error):
                        overlay.main()
                else:
                    overlay.main()
            self.assertNotIn("private-value", captured.getvalue())
            return run.call_args_list

    def test_preflight_runtime_or_source_drift_prevents_deploy(self):
        for drift in ["runtime", "source"]:
            with self.subTest(drift=drift):
                before = metadata()
                before["buildConfig"][drift] = "changed" if drift == "runtime" else {"storageSource": {"generation": "changed"}}
                self.assertEqual(self.invoke_operations(before, metadata(), "deployment stopped"), [])

    def test_after_trigger_drift_fails_with_no_retry(self):
        after = metadata()
        after["eventTrigger"]["eventType"] = "changed"
        self.assertEqual(len(self.invoke_operations(metadata(), after, "do not continue")), 1)

    def test_success_uses_only_existing_source_deploy_flags(self):
        calls = self.invoke_operations(metadata(), metadata())
        self.assertEqual(len(calls), 1)
        command = calls[0].args[0]
        self.assertEqual(command[:7], [str(overlay.GCLOUD), "functions", "deploy", "businessOperationsV1", "--gen2", "--project=scaled-circle", "--region=us-east1"])
        self.assertTrue(command[7].startswith("--source="))
        self.assertEqual(command[8:], ["--quiet", "--format=json"])


if __name__ == "__main__":
    unittest.main()

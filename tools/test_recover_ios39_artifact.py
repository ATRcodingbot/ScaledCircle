import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import urllib.request
from unittest.mock import patch

import recover_ios39_artifact as recovery


class RecoveryGateTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.ipa = Path(self.temporary.name) / 'original.ipa'
        self.ipa.write_bytes(b'synthetic artifact; never an application')
        self.output = Path(self.temporary.name) / 'validated/recovered-ios39.ipa'
        self.expected = hashlib.sha256(self.ipa.read_bytes()).hexdigest()
        self.hash_patch = patch.object(recovery, 'IPA_SHA256', self.expected)
        self.hash_patch.start()
        self.addCleanup(self.hash_patch.stop)
        self.observed = []

    def checks(self, failed=None, missing_result=None):
        def check(name):
            def run(_):
                self.observed.append(name)
                if name == failed:
                    raise ValueError('Synthetic failure')
                return None if name == missing_result else True
            return run
        return {name: check(name) for name in recovery.REQUIRED_CHECKS}

    def test_all_guards_run_before_identical_artifact_is_publishable(self):
        result = recovery.validate_and_stage(self.ipa, self.output, self.checks())
        self.assertEqual(self.observed, list(recovery.REQUIRED_CHECKS))
        self.assertEqual(result['artifactValidation'], 'PASS')
        self.assertEqual(self.output.read_bytes(), self.ipa.read_bytes())

    def test_each_guard_failure_prevents_publishable_artifact(self):
        for name in recovery.REQUIRED_CHECKS:
            with self.subTest(name=name), self.assertRaises(ValueError):
                recovery.validate_and_stage(self.ipa, self.output, self.checks(failed=name))
            self.assertFalse(self.output.exists())

    def test_missing_guard_or_missing_pass_result_blocks_publishing(self):
        for name in recovery.REQUIRED_CHECKS:
            checks = self.checks()
            del checks[name]
            with self.subTest(name=name), self.assertRaises(ValueError):
                recovery.validate_and_stage(self.ipa, self.output, checks)
            with self.assertRaises(ValueError):
                recovery.validate_and_stage(self.ipa, self.output, self.checks(missing_result=name))
            self.assertFalse(self.output.exists())

    def test_wrong_original_hash_blocks_before_any_guard(self):
        self.ipa.write_bytes(b'changed')
        with self.assertRaises(ValueError):
            recovery.validate_and_stage(self.ipa, self.output, self.checks())
        self.assertEqual(self.observed, [])

        self.assertFalse(self.output.exists())

    def test_mutation_during_validation_never_reaches_publishing(self):
        checks = self.checks()
        def mutate(_):
            self.ipa.write_bytes(b'changed during validation')
            return True
        checks['signing'] = mutate
        with self.assertRaises(ValueError):
            recovery.validate_and_stage(self.ipa, self.output, checks)
        self.assertFalse(self.output.exists())

    def test_preexisting_publishing_artifact_is_rejected(self):
        self.output.parent.mkdir()
        self.output.write_bytes(b'stale artifact')
        with self.assertRaisesRegex(ValueError, 'must be empty'):
            recovery.validate_and_stage(self.ipa, self.output, self.checks())
        self.assertEqual(self.observed, [])


class RecoveryWorkflowTest(unittest.TestCase):
    def test_preparation_failure_never_retrieves_or_stages_artifact(self):
        with patch.object(recovery, 'prepare_source', side_effect=ValueError('fetch failed')), patch.object(recovery, 'fetch_original') as fetch, patch.object(recovery, 'validate_and_stage') as stage:
            with self.assertRaises(ValueError):
                recovery.recover(Path('app'), Path('original.ipa'), True)
            fetch.assert_not_called()
            stage.assert_not_called()

    def test_missing_or_wrong_artifact_link_fails_before_network(self):
        for env in ({}, {'IOS39_RECOVERY_ARTIFACT_URL': 'https://example.com/artifact'}):
            with patch.dict(recovery.os.environ, env, clear=True), patch.object(recovery.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    recovery.fetch_original('unused.ipa')
                opener.assert_not_called()

    def test_artifact_redirect_never_forwards_api_token(self):
        request = urllib.request.Request(recovery.ARTIFACT_URL, headers={'x-auth-token': 'synthetic'})
        handler = recovery.ArtifactRedirectHandler()
        redirected = handler.redirect_request(request, None, 302, 'Found', {}, 'https://storage.example.com/ipa')
        self.assertIsNone(redirected.get_header('X-auth-token'))
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, 'Found', {}, 'http://storage.example.com/ipa')

    def test_only_validated_artifact_is_published_without_submission_or_rebuild(self):
        config = json.loads((recovery.ROOT / 'codemagic.yaml').read_text())
        self.assertEqual(set(config['workflows']), {'recover-ios39-upload-only'})
        workflow = config['workflows']['recover-ios39-upload-only']
        self.assertEqual(workflow['instance_type'], 'mac_mini_m2')
        self.assertEqual(workflow['max_build_duration'], 30)
        self.assertNotIn('triggering', workflow)
        self.assertEqual(workflow['environment']['groups'], ['ios39_artifact_recovery'])
        self.assertEqual(workflow['artifacts'], ['validated/recovered-ios39.ipa', 'ios39-validation.safe.json'])
        self.assertEqual(workflow['publishing'], {'app_store_connect': {
            'auth': 'integration', 'submit_to_testflight': False, 'submit_to_app_store': False}})
        script = workflow['scripts'][0]['script']
        self.assertIn('set -euo pipefail', script)
        self.assertIn('TOOLING_DIR', script)
        self.assertIn('APP_DIR', script)
        self.assertIn('"$TOOLING_DIR/tools/recover_ios39_artifact.py" --app-dir "$APP_DIR" --download', script)
        for forbidden in ('flutter build', 'xcodebuild', 'codesign --sign', '|| true', 'ignore_failure'):
            self.assertNotIn(forbidden, script)


if __name__ == '__main__':
    unittest.main()

import importlib.util
from pathlib import Path
import unittest
import base64
import plistlib
import os
import subprocess
import sys
import shutil

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('capture', HERE / 'run.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def test_fixed_input_diagnostics_all_missing_and_empty_never_expose_values(self):
        sentinel = 'synthetic-private-value-do-not-print'
        full = {name: sentinel for name in capture.REQUIRED_INPUTS}
        cases = [(full, True), ({}, False),
                 ({**full, 'IPAD_REVIEWER_PASSWORD': ''}, False)]
        for env, valid in cases:
            with self.subTest(valid=valid, supplied=list(env)):
                output = []
                if valid:
                    self.assertEqual(set(capture.require_inputs(env, output.append).values()), {'present'})
                else:
                    with self.assertRaises(RuntimeError) as error:
                        capture.require_inputs(env, output.append)
                    self.assertNotIn(sentinel, str(error.exception))
                    self.assertIn('IPAD_REVIEWER_PASSWORD', str(error.exception))
                self.assertEqual(len(output), 4)
                self.assertNotIn(sentinel, '\n'.join(output))
                self.assertTrue(all(line.split(': ')[-1] in {'absent', 'empty', 'present'} for line in output))

    def test_shell_and_python_forward_synthetic_environment_without_values(self):
        bash = shutil.which('bash') if sys.platform != 'win32' else 'C:/Program Files/Git/bin/bash.exe'
        self.assertTrue(bash and Path(bash).exists(), 'Bash required for wrapper verification')
        sentinel = 'synthetic-private-value-do-not-print'
        base = {k: v for k, v in os.environ.items() if k not in capture.REQUIRED_INPUTS}
        full = {name: sentinel for name in capture.REQUIRED_INPUTS}
        for extra, code, expected in [(full, 0, 'IPAD_REVIEWER_PASSWORD: present'),
                                      ({}, 1, 'IPAD_REVIEWER_PASSWORD: absent'),
                                      ({**full, 'IPAD_REVIEWER_PASSWORD': ''}, 1, 'IPAD_REVIEWER_PASSWORD: empty')]:
            # Use the current Python explicitly on Windows; the run.sh body and
            # its argument/environment forwarding remain the actual code under test.
            wrapper = 'python3() { "' + Path(sys.executable).as_posix() + '" "$@"; }; export -f python3; bash "$1" --preflight-only'
            result = subprocess.run([bash, '-c', wrapper, 'capture-test', str(HERE / 'run.sh')],
                                    env={**base, **extra}, text=True, capture_output=True)
            self.assertEqual(result.returncode, code, result.stderr)
            self.assertIn(expected, result.stdout)
            self.assertNotIn(sentinel, result.stdout + result.stderr)

    def test_yaml_imports_exact_group_and_only_safe_artifacts(self):
        config = (HERE / 'codemagic.yaml').read_text()
        self.assertIn('      groups:\n        - ipad_capture_reviewer\n', config)
        self.assertIn('max_build_duration: 30', config)
        self.assertNotIn('triggering:', config)
        self.assertIn('/tmp/sc-ipad-capture-status.json', config)
        self.assertEqual(capture.SOURCE, '26f29133fcd72edecf5c71497712674293228341')

    def test_plist_rejects_wrong_project_before_build(self):
        config = {'PROJECT_ID': 'scaled-circle', 'BUNDLE_ID': 'com.scaledcircle.app',
                  'GOOGLE_APP_ID': '1:1010956217112:ios:91c890b1ca2018a4e70c6d'}
        encode = lambda value: base64.b64encode(plistlib.dumps(value))
        self.assertTrue(capture.firebase_plist(encode(config)))
        with self.assertRaises(RuntimeError):
            capture.firebase_plist(encode({**config, 'PROJECT_ID': 'scaledcircle-staging'}))

    def test_pinned_lock_is_fully_parsed(self):
        lock = HERE.parents[1] / 'apps/mobile/pubspec.lock'
        packages = capture.versions(lock.read_text())
        self.assertEqual(packages['firebase_auth'], '6.6.1')
        self.assertEqual(packages['flutter'], '0.0.0')
        self.assertGreater(len(packages), 50)

    def test_only_installed_ios_runtime_and_exact_ipad_model(self):
        runtimes = {'runtimes': [
            {'isAvailable': False, 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-27-0', 'version': '27.0'},
            {'isAvailable': True, 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-26-6', 'version': '26.6'},
        ]}
        devices = {'devicetypes': [{'name': 'iPad Pro 13-inch (M4)', 'identifier': 'ipad-m4'}]}
        self.assertEqual(capture.simulator(runtimes, devices),
                         ('ipad-m4', 'com.apple.CoreSimulator.SimRuntime.iOS-26-6'))
        with self.assertRaises(RuntimeError):
            capture.simulator({'runtimes': []}, devices)

    def test_no_release_publishing_or_credential_artifact_configuration(self):
        config = (HERE / 'codemagic.yaml').read_text()
        self.assertNotIn('publishing:', config)
        self.assertNotIn('integrations:', config)
        self.assertNotIn('.app', config)
        driver = (HERE / 'capture_driver.dart').read_text()
        self.assertIn('logCommunicationToFile: false', driver)
        self.assertIn('printCommunication: false', driver)
        self.assertNotIn('String.fromEnvironment', driver)


if __name__ == '__main__':
    unittest.main()

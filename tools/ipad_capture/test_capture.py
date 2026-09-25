import importlib.util
from pathlib import Path
import unittest
import base64
import plistlib
import os
import subprocess
import sys
import shutil
import tempfile
import json
import struct
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('capture', HERE / 'run.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def test_invalid_command_json_is_failed_within_named_stage(self):
        secret = 'private-invalid-json-sentinel'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            output = []
            runner = capture.StageRunner(path / 'status.json', path / 'private', emit=output.append)
            with self.assertRaises(capture.StageFailure):
                runner.run('verify-flutter-sdk', [sys.executable, '-c', f'print("{secret}")'],
                           3, capture=True, transform=json.loads)
            stage = runner.data['stages'][0]
            self.assertEqual(stage['status'], 'failed')
            self.assertEqual(stage['exitCode'], 0)
            self.assertEqual(stage['failureCategory'], 'validation_failed')
            self.assertNotIn(secret, (path / 'status.json').read_text() + '\n'.join(output))

    def test_hanging_child_deadline_is_recorded_and_process_is_stopped(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            output = []
            runner = capture.StageRunner(path / 'status.json', path / 'private', budget=3, emit=output.append)
            started = time.monotonic()
            with self.assertRaises(capture.StageFailure):
                runner.run('compile-simulator', [sys.executable, '-c', 'import time; time.sleep(30)'], .2)
            runner.finish(False)
            self.assertLess(time.monotonic() - started, 7)
            stage = json.loads((path / 'status.json').read_text())['stages'][0]
            self.assertEqual(stage['status'], 'timeout')
            self.assertIsNotNone(stage['exitCode'])
            for name in ['startedAtUtc', 'endedAtUtc', 'deadlineAtUtc']:
                self.assertTrue(stage[name])
            self.assertLessEqual(stage['timeoutSeconds'], .2)

    def test_child_stdout_stderr_and_exception_cannot_enter_safe_artifacts(self):
        secret = 'private-sentinel-must-not-export'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            output = []
            runner = capture.StageRunner(path / 'status.json', path / 'private', emit=output.append)
            script = f'import sys;print("error: {secret}");sys.stderr.write("No such module {secret}");sys.exit(2)'
            with self.assertRaises(capture.StageFailure):
                runner.run('compile-simulator', [sys.executable, '-c', script], 3)
            try:
                with runner.step('prepare-harness', 1):
                    raise ValueError(secret)
            except ValueError:
                pass
            runner.finish(False)
            exported = (path / 'status.json').read_text() + '\n'.join(output)
            self.assertNotIn(secret, exported)
            self.assertIn('module_unavailable', exported)
            self.assertIn('reported_error', exported)
            self.assertNotIn('dart_compile_error', exported)
            self.assertEqual(runner.data['stages'][0]['exitCode'], 2)

    def test_completed_home_is_retained_after_later_schedule_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            source = path / 'private'
            source.mkdir()
            output = path / 'export'
            png = b'\x89PNG\r\n\x1a\n' + b'\x00' * 8 + struct.pack('>II', 2064, 2752) + b'\x00' * 20 + b'\x00\x00\x00\x00IEND\xaeB`\x82'
            (source / 'business-home.png').write_bytes(png)
            (source / 'schedule.png').write_bytes(png[:-12])
            events = [{'stage': name, 'outcome': 'success'} for name in
                      ['app-startup', 'authenticate', 'business-home-readiness', 'business-home-capture']]
            allowed = capture.approved_screens(events)
            first = capture.preserve_screens(source, output, {}, allowed)
            self.assertEqual([x['name'] for x in first], ['business-home.png'])
            (source / 'business-home.png').unlink()
            second = capture.preserve_screens(source, output, {}, allowed, 'partial_failed')
            self.assertEqual(first, second)
            self.assertTrue((output / 'business-home.png').exists())
            self.assertFalse((output / 'schedule.png').exists())
            self.assertEqual(json.loads((output / 'manifest.json').read_text())['status'], 'partial_failed')

    def test_login_or_unready_screenshot_is_not_promoted(self):
        self.assertFalse(capture.approved_screens([{'stage': 'business-home-capture', 'outcome': 'success'}]))
        self.assertFalse(capture.approved_screens([
            {'stage': 'app-startup', 'outcome': 'success'},
            {'stage': 'authenticate', 'outcome': 'success'},
            {'stage': 'business-home-readiness', 'outcome': 'failed'},
            {'stage': 'business-home-capture', 'outcome': 'success'}]))

    def test_driver_event_allowlist_strips_untrusted_fields(self):
        secret = 'private-sentinel-must-not-export'
        event = {'protocol': 2, 'stage': 'authenticate', 'outcome': 'failed', 'category': 'auth_failed',
                 'startedAtUtc': '2026-09-24T14:00:00Z', 'endedAtUtc': '2026-09-24T14:00:01Z',
                 'deadlineAtUtc': '2026-09-24T14:01:00Z', 'timeoutSeconds': 60,
                 'completedScreens': [], 'error': secret, 'request': secret}
        self.assertNotIn(secret, json.dumps(capture.safe_driver_event(event)))
        self.assertIsNone(capture.safe_driver_event({**event, 'category': secret}))
        self.assertIsNone(capture.safe_driver_event({**event, 'stage': {}}))
        self.assertEqual(capture.safe_driver_event({**event, 'timeoutSeconds': 60.0})['timeoutSeconds'], 60.0)
        self.assertIsNone(capture.safe_driver_event({**event, 'timeoutSeconds': float('nan')}))
        self.assertIsNone(capture.safe_driver_event({**event, 'timeoutSeconds': True}))

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
            {'isAvailable': True, 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', 'version': '26.5', 'supportedDeviceTypes': [{'identifier': 'ipad-m4'}]},
        ]}
        devices = {'devicetypes': [{'name': 'iPad Pro 13-inch (M4)', 'identifier': 'ipad-m4'}]}
        self.assertEqual(capture.simulator(runtimes, devices),
                         ('ipad-m4', 'com.apple.CoreSimulator.SimRuntime.iOS-26-5'))
        with self.assertRaises(RuntimeError):
            capture.simulator({'runtimes': []}, devices)
        with self.assertRaises(RuntimeError):
            capture.simulator({'runtimes': [{**runtimes['runtimes'][1], 'supportedDeviceTypes': []}]}, devices)
        self.assertEqual(capture.exact_host_value('26.5.1')('26.5.1\n'), '26.5.1')
        with self.assertRaises(capture.StageFailure):
            capture.exact_host_value('26.5.1')('26.6')
        source = (HERE / 'run.py').read_text()
        self.assertIn("['xcrun', 'simctl', 'list', 'runtimes', '-j'], 120,", source)

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

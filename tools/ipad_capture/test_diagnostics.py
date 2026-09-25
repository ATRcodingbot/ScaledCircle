import json
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from diagnostics import DiagnosticCapture


class DiagnosticTests(unittest.TestCase):
    def test_failure_image_is_independent_idempotent_and_keeps_stopping_point(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []
            def execute(args, **kwargs):
                calls.append(args)
                self.assertEqual(args[:5], ['xcrun', 'simctl', 'io', 'synthetic-simulator', 'screenshot'])
                self.assertEqual(kwargs['timeout'], 10)
                Path(args[-1]).write_bytes(b'\x89PNG\r\n\x1a\n' + b'\0' * 8 +
                    struct.pack('>II', 2064, 2752) + b'\0' * 20 + b'\0\0\0\0IEND\xaeB`\x82')
                return subprocess.CompletedProcess(args, 0)
            capture = DiagnosticCapture('synthetic-simulator', root / 'private', root / 'export', execute)
            events = [{'stage': 'login-screen', 'outcome': 'success'},
                      {'stage': 'email-find', 'outcome': 'timeout'}]
            capture.capture('failure', events)
            capture.capture('failure', events)
            self.assertEqual(len(calls), 1)
            self.assertTrue((root / 'export/failure.png').exists())
            result = json.loads((root / 'private/failure.json').read_text())
            self.assertEqual(result['lastCompletedStep'], 'login-screen')
            self.assertEqual(result['lastObservedStep'], 'email-find')
            self.assertEqual(result['status'], 'captured')

    def test_timeout_retains_safe_command_failure_and_ack(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def execute(args, **kwargs):
                raise subprocess.TimeoutExpired(args, 10, output='private sentinel')
            DiagnosticCapture('synthetic', root / 'private', root / 'export', execute).capture('failure', [])
            text = (root / 'export/failure.json').read_text()
            self.assertNotIn('private sentinel', text)
            self.assertEqual(json.loads(text)['failure'], 'simctl_timeout')
            self.assertTrue((root / 'private/failure.json').exists())

    def test_unprotected_password_state_refuses_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def execute(*args, **kwargs):
                self.fail('unsafe capture must not run')
            DiagnosticCapture('synthetic', root / 'private', root / 'export', execute).capture(
                'failure', [{'stage': 'password-input', 'outcome': 'running'}])
            self.assertEqual(json.loads((root / 'export/failure.json').read_text())['failure'],
                             'safe_screen_not_established')


if __name__ == '__main__':
    unittest.main()

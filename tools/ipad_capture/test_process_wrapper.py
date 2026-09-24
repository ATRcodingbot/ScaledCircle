"""Offline synthetic subprocess checks. No simulator, credentials, or CI calls."""
import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('capture_process_test', HERE / 'run.py')
capture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(capture)
VOLUME = 1024 * 1024
DUAL_STREAM = '''
import sys, threading
def emit(stream, value):
    stream.write(value * 1048576)
    stream.flush()
threads = [threading.Thread(target=emit, args=(sys.stdout.buffer, b'O')),
           threading.Thread(target=emit, args=(sys.stderr.buffer, b'E'))]
for thread in threads: thread.start()
for thread in threads: thread.join()
'''


class ProcessWrapperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='capture-process-test-')
        self.root = Path(self.temporary.name)
        self.output = []
        self.runner = capture.StageRunner(
            self.root / 'status.json', self.root / 'private', budget=15,
            emit=self.output.append)
        self.processes = []
        original_popen = subprocess.Popen

        def observe_popen(*args, **kwargs):
            process = original_popen(*args, **kwargs)
            self.processes.append(process)
            return process

        self.popen_patch = patch.object(capture.subprocess, 'Popen', side_effect=observe_popen)
        self.popen_patch.start()

    def tearDown(self):
        self.popen_patch.stop()
        # Only synthetic children launched by this test are eligible for cleanup.
        for process in self.processes:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=3)
        self.temporary.cleanup()

    def test_current_capture_drains_simultaneous_large_stdout_and_stderr(self):
        result = self.runner.run(
            'verify-flutter-sdk', [sys.executable, '-c', DUAL_STREAM], 5, capture=True)
        self.assertEqual(result, 'O' * VOLUME)
        self.assertEqual((self.root / 'private/worker.log').read_bytes(), b'E' * VOLUME)
        self.assertEqual(self.runner.data['stages'][-1]['exitCode'], 0)
        self.assertEqual(self.runner.data['stages'][-1]['status'], 'success')

    def test_current_shared_log_retains_both_large_streams(self):
        result = self.runner.run(
            'compile-simulator', [sys.executable, '-c', DUAL_STREAM], 5)
        raw = (self.root / 'private/worker.log').read_bytes()
        self.assertEqual(result, 0)
        self.assertEqual(len(raw), 2 * VOLUME)
        self.assertEqual(raw.count(b'O'), VOLUME)
        self.assertEqual(raw.count(b'E'), VOLUME)

    def test_timeout_kills_child_and_retains_partial_result_and_stage(self):
        script = '''
import sys, time
sys.stdout.write('synthetic-private-stdout'); sys.stdout.flush()
sys.stderr.write('synthetic-private-stderr'); sys.stderr.flush()
time.sleep(30)
'''
        ticks = []
        self.runner.tick = lambda: ticks.append(time.monotonic())
        start = time.monotonic()
        with self.assertRaises(capture.StageFailure):
            self.runner.run('verify-flutter-sdk', [sys.executable, '-c', script], .4, capture=True)
        self.runner.finish(False)
        self.assertLess(time.monotonic() - start, 7)
        self.assertIsNotNone(self.processes[-1].poll())
        stage = json.loads((self.root / 'status.json').read_text())['stages'][-1]
        self.assertEqual(stage['status'], 'timeout')
        self.assertEqual(stage['failureCategory'], 'deadline_exceeded')
        self.assertIsNotNone(stage['exitCode'])
        self.assertIsNotNone(stage['endedAtUtc'])
        self.assertGreaterEqual(len(ticks), 2)
        self.assertEqual((self.root / 'private/command-stdout.tmp').read_text(), 'synthetic-private-stdout')
        self.assertEqual((self.root / 'private/worker.log').read_text(), 'synthetic-private-stderr')
        safe = (self.root / 'status.json').read_text() + '\n'.join(self.output)
        self.assertNotIn('synthetic-private-', safe)

    def test_failed_child_retains_exact_exit_and_private_streams(self):
        script = "import sys; print('synthetic-private-stdout'); sys.stderr.write('error: synthetic-private-stderr'); sys.exit(7)"
        with self.assertRaises(capture.StageFailure):
            self.runner.run('verify-flutter-sdk', [sys.executable, '-c', script], 5, capture=True)
        stage = self.runner.data['stages'][-1]
        self.assertEqual(stage['exitCode'], 7)
        self.assertEqual(stage['status'], 'failed')
        self.assertEqual(stage['failureCategory'], 'command_failed')
        self.assertIn('reported_error', stage['diagnostics'])
        self.assertIn('synthetic-private-stdout', (self.root / 'private/command-stdout.tmp').read_text())
        self.assertIn('synthetic-private-stderr', (self.root / 'private/worker.log').read_text())
        self.assertNotIn('synthetic-private-', (self.root / 'status.json').read_text() + '\n'.join(self.output))

    def test_ac27734_actual_wrapper_drains_its_stdout_pipe(self):
        source = subprocess.run(
            ['git', 'show', 'ac27734:tools/ipad_capture/run.py'],
            cwd=HERE.parents[1], capture_output=True, text=True, timeout=5, check=True).stdout
        function = next(node for node in ast.walk(ast.parse(source))
                        if isinstance(node, ast.FunctionDef) and node.name == 'run')
        # Execute only the historical local subprocess wrapper, never its main.
        records = []
        with (self.root / 'old-worker.log').open('w+') as log:
            scope = {'subprocess': subprocess, 'log': log,
                     'progress': {'stage': 'verify-flutter-sdk'},
                     'record': lambda *args, **kwargs: records.append((args, kwargs))}
            exec(compile(ast.Module(body=[function], type_ignores=[]), '<historical-wrapper>', 'exec'), scope)
            result = scope['run']([sys.executable, '-c', DUAL_STREAM], capture=True,
                                  stage='verify-flutter-sdk')
        self.assertEqual(result, 'O' * VOLUME)
        self.assertEqual((self.root / 'old-worker.log').read_bytes(), b'E' * VOLUME)
        self.assertEqual(records, [(('verify-flutter-sdk',), {})])
        call = next(node for node in ast.walk(function)
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'run')
        self.assertNotIn('timeout', {keyword.arg for keyword in call.keywords})

    @unittest.skipIf(os.name == 'nt', 'POSIX process-group SIGTERM/SIGKILL path requires macOS/Linux')
    def test_posix_sigterm_refusal_escalates_and_records_exit(self):
        script = '''
import signal, sys, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
print('synthetic-ready', flush=True)
time.sleep(30)
'''
        started = time.monotonic()
        with self.assertRaises(capture.StageFailure):
            self.runner.run('compile-simulator', [sys.executable, '-c', script], .4)
        self.assertLess(time.monotonic() - started, 7)
        self.assertEqual(self.processes[-1].returncode, -9)
        self.assertEqual(self.runner.data['stages'][-1]['status'], 'timeout')


if __name__ == '__main__':
    unittest.main()

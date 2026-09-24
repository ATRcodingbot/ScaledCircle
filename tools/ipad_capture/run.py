"""Bounded unsigned simulator capture; raw process output stays private."""
import base64
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time

SOURCE = '26f29133fcd72edecf5c71497712674293228341'
SDK = '058e0af2c2b57e369d905a03ac9748b0ebf543c6'
LOCK = '2d929b3279125c2a0732212aee86ebf51607aaff76f315c9a0ff51e0bbf8ea94'
OUTPUT = Path('/tmp/sc-ipad-capture-output')
STATUS = Path('/tmp/sc-ipad-capture-status.json')
RUN_BUDGET_SECONDS = 24 * 60  # leaves six minutes of the CI cap for overhead/export
REQUIRED_INPUTS = ('IPAD_REVIEWER_EMAIL', 'IPAD_REVIEWER_PASSWORD',
                   'IPAD_REVIEWER_UID', 'IPAD_FIREBASE_PLIST_BASE64')
SCREENS = ('business-home', 'schedule', 'campaigns')
STAGES = {'input-preflight', 'verify-host', 'verify-flutter-sdk', 'check-source',
          'fetch-pinned-source', 'verify-fetched-source', 'checkout-pinned-source',
          'prepare-harness', 'resolve-harness-dependencies', 'verify-resolved-lock',
          'list-runtimes', 'list-device-types', 'select-runtime', 'create-simulator',
          'boot-simulator', 'wait-simulator-boot', 'compile-simulator', 'verify-app-bundle',
          'install-simulator-app', 'launch-and-driver', 'validate-screenshot-artifacts'}
DRIVER_STAGES = {'connect', 'app-startup', 'authenticate', 'logout', 'close', 'complete'} | {
    f'{screen}-{phase}' for screen in SCREENS for phase in ('navigation', 'readiness', 'capture')}
DRIVER_OUTCOMES = {'running', 'success', 'failed', 'timeout'}
DRIVER_CATEGORIES = {'none', 'driver_unavailable', 'startup_not_ready', 'harness_mismatch',
    'auth_refused', 'auth_timeout', 'auth_failed', 'auth_identity_mismatch', 'auth_unverified',
    'auth_network_unavailable', 'auth_invalid_credentials', 'route_unavailable', 'screen_not_ready',
    'screenshot_failed', 'cleanup_failed', 'stage_timeout', 'invalid_input'}


def utc():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.pending')
    pending.write_text(json.dumps(value, indent=2))
    os.replace(pending, path)


def inspect_inputs(environment, emit=print):
    states = {name: ('absent' if name not in environment else
                     'empty' if environment[name] == '' else 'present')
              for name in REQUIRED_INPUTS}
    for name, state in states.items():
        emit(name + ': ' + state)
    return states


def require_inputs(environment, emit=print):
    states = inspect_inputs(environment, emit)
    missing = [name + ' (' + state + ')' for name, state in states.items() if state != 'present']
    if missing:
        raise RuntimeError('Capture inputs unavailable: ' + ', '.join(missing))
    return states


def safe_diagnostics(text):
    # Emit classifications ONLY. Never attempt to sanitize arbitrary compiler lines.
    patterns = {
        'reported_error': r'\berror:',
        'dart_compile_error': r'Target kernel_snapshot_program failed|\.dart:\d+:\d+: Error:',
        'xcode_build_failed': r'BUILD FAILED|Xcode build failed',
        'module_unavailable': r'No such module|module .* not found',
        'linker_failed': r'linker command failed|Undefined symbols for architecture',
        'dependency_resolution_failed': r'version solving failed|Could not find compatible versions',
        'simulator_launch_failed': r'Application failed to start|Failed to launch',
        'permission_denied': r'Permission denied|Operation not permitted',
    }
    return sorted(name for name, pattern in patterns.items() if re.search(pattern, text, re.I))


def safe_driver_event(data):
    if not isinstance(data, dict) or data.get('protocol') != 2:
        return None
    if any(not isinstance(data.get(key), str) for key in ('stage', 'outcome', 'category')):
        return None
    if (data.get('stage') not in DRIVER_STAGES or data.get('outcome') not in DRIVER_OUTCOMES
            or data.get('category') not in DRIVER_CATEGORIES):
        return None
    result = {key: data[key] for key in ('protocol', 'stage', 'outcome', 'category')}
    for key in ('startedAtUtc', 'endedAtUtc', 'deadlineAtUtc'):
        value = data.get(key)
        if value is None and key == 'endedAtUtc':
            result[key] = None
        elif isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)', value):
            result[key] = value
        else:
            return None
    timeout = data.get('timeoutSeconds')
    if type(timeout) not in (int, float) or not 0 <= timeout <= 600:
        return None
    result['timeoutSeconds'] = timeout
    completed = data.get('completedScreens')
    if not isinstance(completed, list) or any(x not in SCREENS for x in completed):
        return None
    result['completedScreens'] = list(dict.fromkeys(completed))
    return result


class StageFailure(RuntimeError):
    pass


class StageRunner:
    def __init__(self, status, private, budget=RUN_BUDGET_SECONDS, emit=print):
        self.status = Path(status)
        self.private = Path(private)
        self.private.mkdir(parents=True, exist_ok=True)
        self.emit = emit
        self.end = time.monotonic() + budget
        self.data = {'source': SOURCE, 'startedAtUtc': utc(), 'budgetSeconds': budget,
                     'status': 'running', 'stages': [], 'driverEvents': []}
        self.tick = lambda: None
        self.save()

    def save(self):
        atomic_json(self.status, self.data)

    def input_states(self, environment):
        self.data['inputStates'] = inspect_inputs(environment, self.emit)
        self.save()

    @contextmanager
    def step(self, name, seconds):
        if name not in STAGES:
            raise ValueError('Unsupported stage name')
        duration = min(seconds, max(0, self.end - time.monotonic()))
        start = time.monotonic()
        event = {'stage': name, 'startedAtUtc': utc(), 'endedAtUtc': None,
                 'deadlineAtUtc': (datetime.now(timezone.utc) + timedelta(seconds=duration)).isoformat(),
                 'timeoutSeconds': round(duration, 3), 'status': 'running', 'exitCode': None,
                 'diagnostics': []}
        self.data['stages'].append(event)
        self.save()
        self.emit(json.dumps(event), flush=True) if self.emit is print else self.emit(json.dumps(event))
        try:
            if duration <= 0:
                raise TimeoutError()
            yield event, start + duration
            if time.monotonic() > start + duration:
                raise TimeoutError()
            event['status'] = 'success'
        except TimeoutError:
            event['status'] = 'timeout'
            event['failureCategory'] = 'deadline_exceeded'
            raise StageFailure('Stage deadline exceeded') from None
        except Exception:
            event['status'] = 'failed'
            event.setdefault('failureCategory', 'stage_failed')
            raise
        finally:
            event['endedAtUtc'] = utc()
            event['durationSeconds'] = round(time.monotonic() - start, 3)
            self.save()
            self.emit(json.dumps(event), flush=True) if self.emit is print else self.emit(json.dumps(event))

    def run(self, name, args, seconds, cwd=None, capture=False, env=None, allow_failure=False, transform=None):
        with self.step(name, seconds) as (event, deadline):
            logpath = self.private / 'worker.log'
            outpath = self.private / 'command-stdout.tmp'
            with logpath.open('ab') as log, outpath.open('wb') as out:
                offset = logpath.stat().st_size
                proc = subprocess.Popen(args, cwd=cwd, env=env, stdout=out if capture else log,
                                        stderr=log, start_new_session=os.name != 'nt')
                heartbeat = time.monotonic()
                try:
                    while proc.poll() is None:
                        self.tick()
                        with logpath.open('rb') as read:
                            read.seek(offset)
                            chunk = read.read(1024 * 1024)
                            offset += len(chunk)
                        found = safe_diagnostics(chunk.decode('utf-8', errors='replace'))
                        for item in found:
                            if item not in event['diagnostics']:
                                event['diagnostics'].append(item)
                                self.emit('Compiler/device diagnostic: ' + item)
                                self.save()
                        if time.monotonic() >= deadline:
                            raise TimeoutError()
                        if time.monotonic() - heartbeat >= 20:
                            self.emit('Capture stage still running: ' + name)
                            heartbeat = time.monotonic()
                        time.sleep(0.1)
                    event['exitCode'] = proc.returncode
                    self.tick()
                    # Include short-process diagnostics without exposing their content.
                    with logpath.open('rb') as read:
                        read.seek(offset)
                        for item in safe_diagnostics(read.read(1024 * 1024).decode('utf-8', errors='replace')):
                            if item not in event['diagnostics']:
                                event['diagnostics'].append(item)
                                self.emit('Compiler/device diagnostic: ' + item)
                    if proc.returncode and not allow_failure:
                        event['failureCategory'] = 'command_failed'
                        raise StageFailure('Command failed')
                finally:
                    if proc.poll() is None:
                        if os.name != 'nt':
                            os.killpg(proc.pid, signal.SIGTERM)
                        else:
                            proc.terminate()
                        try:
                            proc.wait(timeout=3)
                        except subprocess.TimeoutExpired:
                            if os.name != 'nt':
                                os.killpg(proc.pid, signal.SIGKILL)
                            else:
                                proc.kill()
                            proc.wait(timeout=3)
                        event['exitCode'] = proc.returncode
                    self.tick()
            if capture:
                if outpath.stat().st_size > 2 * 1024 * 1024:
                    raise StageFailure('Unexpected command output size')
                value = outpath.read_text(errors='replace').strip()
                if transform is not None:
                    try:
                        return transform(value)
                    except Exception:
                        event['failureCategory'] = 'validation_failed'
                        raise StageFailure('Command result validation failed') from None
                return value
            return proc.returncode

    def import_driver(self, path):
        try:
            with Path(str(path) + '.events.jsonl').open() as stream:
                rows = stream.readlines()[-100:]
        except OSError:
            try:
                rows = [Path(path).read_text()]
            except OSError:
                return
        for raw in rows:
            try:
                event = safe_driver_event(json.loads(raw))
            except ValueError:
                continue
            if event and event not in self.data['driverEvents']:
                self.data['driverEvents'].append(event)
                self.emit('Driver stage: ' + json.dumps(event))
                self.save()

    def finish(self, success):
        self.data.update(status='success' if success else 'failed', endedAtUtc=utc())
        self.save()


def approved_screens(events):
    successful = {e['stage'] for e in events if e.get('outcome') == 'success'}
    if not {'app-startup', 'authenticate'} <= successful:
        return set()
    return {name for name in SCREENS if
            {name + '-readiness', name + '-capture'} <= successful}


def preserve_screens(captures, output, metadata, approved, status='partial'):
    """Promote only complete fixed-name PNGs; never delete an earlier valid capture."""
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    for name in SCREENS:
        if name not in approved or (output / (name + '.png')).exists():
            continue
        source = Path(captures) / (name + '.png')
        if not source.exists():
            continue
        raw = source.read_bytes()
        if (len(raw) < 45 or raw[:8] != b'\x89PNG\r\n\x1a\n'
                or struct.unpack('>II', raw[16:24]) != (2064, 2752)
                or not raw.endswith(b'\x00\x00\x00\x00IEND\xaeB`\x82')):
            continue
        target = output / source.name
        if not target.exists():
            pending = target.with_suffix('.pending')
            pending.write_bytes(raw)
            os.replace(pending, target)
    assets = [{'name': name + '.png', 'width': 2064, 'height': 2752,
               'sha256': hashlib.sha256((output / (name + '.png')).read_bytes()).hexdigest()}
              for name in SCREENS if (output / (name + '.png')).exists()]
    atomic_json(output / 'manifest.json', {
        'source': SOURCE, 'flutterRevision': SDK, 'sourceLockSha256': LOCK,
        'captureKind': 'iPad simulator; debug driver harness; production source and backend',
        'status': status, 'assets': assets, **metadata,
        'reviewStatus': 'Unreviewed; manual privacy, error-state and layout review required before upload',
        'notEvidenceOf': ['physical iPad', 'physical push', 'signed release binary'],
        'nativeOverlayInspection': 'not_available_to_flutter_driver; manual review required',
        'releaseBuildNumbersChanged': False})
    return assets


def versions(text):
    return {name: re.search(r'^    version: "?([^"\n]+)', body, re.M).group(1)
            for name, body in re.findall(r'^  (\w+):\n(.*?)(?=^  \w+:|^sdks:)', text,
                                         re.M | re.S)}


def simulator(inventory, device_types):
    runtimes = [r for r in inventory['runtimes']
                if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')]
    runtimes.sort(key=lambda r: tuple(map(int, r['version'].split('.'))), reverse=True)
    types = [d for d in device_types['devicetypes'] if d['name'] == 'iPad Pro 13-inch (M4)']
    if not runtimes or not types:
        raise RuntimeError('Required installed iOS runtime / iPad Pro 13-inch (M4) unavailable')
    return types[0]['identifier'], runtimes[0]['identifier']


def firebase_plist(encoded):
    raw = base64.b64decode(encoded, validate=True)
    config = plistlib.loads(raw)
    expected = {'PROJECT_ID': 'scaled-circle', 'BUNDLE_ID': 'com.scaledcircle.app',
                'GOOGLE_APP_ID': '1:1010956217112:ios:91c890b1ca2018a4e70c6d'}
    if any(config.get(k) != v for k, v in expected.items()):
        raise RuntimeError('Production Firebase plist identity mismatch')
    return raw


@contextmanager
def private_workspace():
    # This is a fresh ephemeral CI worker. Recursive removal of a large Flutter
    # tree has no reliable deadline; leave private, unexported files to worker
    # disposal after bounded simulator/worktree cleanup and artifact export.
    yield tempfile.mkdtemp(prefix='sc-ipad-private-')


def main():
    if OUTPUT.exists():
        raise StageFailure('Capture output exists; use a fresh worker')
    simulator_id = None
    added_worktree = False
    success = False
    with private_workspace() as temporary:
        private = Path(temporary)
        runner = StageRunner(STATUS, private)
        captures = private / 'captures'
        captures.mkdir()
        checkout = private / 'application'
        metadata = {}
        driver_status = private / 'driver-status.json'
        last_checkpoint = 0.0
        def checkpoint(force=False):
            nonlocal last_checkpoint
            if not force and time.monotonic() - last_checkpoint < 1:
                return
            last_checkpoint = time.monotonic()
            runner.import_driver(driver_status)
            preserve_screens(captures, OUTPUT, metadata, approved_screens(runner.data['driverEvents']))
        runner.tick = checkpoint
        try:
            with runner.step('input-preflight', 10):
                runner.input_states(os.environ)
                require_inputs(os.environ, emit=lambda _: None)
            with runner.step('verify-host', 10):
                if sys.platform != 'darwin':
                    raise StageFailure('macOS/Xcode simulator worker required')
                tooling = Path(__file__).resolve().parent
                repo = Path(os.environ['CM_BUILD_DIR']).resolve()
            def verify_sdk(raw):
                data = json.loads(raw)
                if data.get('frameworkRevision') != SDK:
                    raise StageFailure('Flutter revision mismatch')
                return data
            runner.run('verify-flutter-sdk', ['flutter', '--version', '--machine'], 45, capture=True, transform=verify_sdk)
            present = runner.run('check-source', ['git', 'cat-file', '-e', SOURCE + '^{commit}'], 15, cwd=repo, allow_failure=True) == 0
            if not present:
                runner.run('fetch-pinned-source', ['git', 'fetch', '--no-tags', 'origin', SOURCE], 90, cwd=repo)
                def verify_source(raw):
                    if raw != SOURCE:
                        raise StageFailure('Fetched source mismatch')
                    return raw
                runner.run('verify-fetched-source', ['git', 'rev-parse', 'FETCH_HEAD^{commit}'], 15, cwd=repo, capture=True, transform=verify_source)
            runner.run('checkout-pinned-source', ['git', 'worktree', 'add', '--detach', str(checkout), SOURCE], 45, cwd=repo)
            added_worktree = True
            mobile = checkout / 'apps/mobile'
            with runner.step('prepare-harness', 15):
                (mobile / 'ios/Runner/GoogleService-Info.plist').write_bytes(firebase_plist(os.environ['IPAD_FIREBASE_PLIST_BASE64']))
                lock = mobile / 'pubspec.lock'
                if hashlib.sha256(lock.read_bytes()).hexdigest() != LOCK:
                    raise StageFailure('Pinned lock mismatch')
                original_versions = versions(lock.read_text())
                pubspec = mobile / 'pubspec.yaml'
                pubspec.write_text(pubspec.read_text().replace('dev_dependencies:\n', 'dev_dependencies:\n  flutter_driver:\n    sdk: flutter\n', 1))
                harness = mobile / 'test_driver'
                harness.mkdir(exist_ok=True)
                for filename in ['capture_app.dart', 'capture_driver.dart']:
                    shutil.copyfile(tooling / filename, harness / filename)
            runner.run('resolve-harness-dependencies', ['flutter', 'pub', 'get'], 180, cwd=mobile)
            with runner.step('verify-resolved-lock', 10):
                if any(versions(lock.read_text()).get(k) != v for k, v in original_versions.items()):
                    raise StageFailure('Harness changed app dependencies')
            runtimes = runner.run('list-runtimes', ['xcrun', 'simctl', 'list', 'runtimes', '-j'], 20, capture=True, transform=json.loads)
            types = runner.run('list-device-types', ['xcrun', 'simctl', 'list', 'devicetypes', '-j'], 20, capture=True, transform=json.loads)
            with runner.step('select-runtime', 10):
                device_type, runtime = simulator(runtimes, types)
                metadata = {'runtime': runtime, 'deviceType': device_type}
            simulator_id = runner.run('create-simulator', ['xcrun', 'simctl', 'create', 'ScaledCircle capture only', device_type, runtime], 30, capture=True)
            runner.run('boot-simulator', ['xcrun', 'simctl', 'boot', simulator_id], 30)
            runner.run('wait-simulator-boot', ['xcrun', 'simctl', 'bootstatus', simulator_id, '-b'], 120)
            runner.run('compile-simulator', ['flutter', 'build', 'ios', '--simulator', '--debug', '--no-codesign', '--no-pub',
                '--target=test_driver/capture_app.dart', '--dart-define=APP_ENV=production'], 720, cwd=mobile)
            bundle = mobile / 'build/ios/iphonesimulator/Runner.app'
            with runner.step('verify-app-bundle', 10):
                info = plistlib.loads((bundle / 'Info.plist').read_bytes())
                if info.get('CFBundleIdentifier') != 'com.scaledcircle.app' or info.get('DTPlatformName') != 'iphonesimulator':
                    raise StageFailure('Simulator bundle identity mismatch')
                if not (bundle / info['CFBundleExecutable']).is_file():
                    raise StageFailure('Simulator executable missing')
            runner.run('install-simulator-app', ['xcrun', 'simctl', 'install', simulator_id, str(bundle)], 60)
            child_env = {**os.environ, 'IPAD_SIMULATOR_UDID': simulator_id,
                         'IPAD_CAPTURE_OUTPUT': str(captures), 'IPAD_DRIVER_STATUS_FILE': str(driver_status)}
            runner.run('launch-and-driver', ['flutter', 'drive', '--no-pub', '--debug', '-d', simulator_id,
                '--use-application-binary=' + str(bundle), '--target=test_driver/capture_app.dart',
                '--driver=test_driver/capture_driver.dart', '--dart-define=APP_ENV=production',
                '--no-keep-app-running'], 600, cwd=mobile, env=child_env)
            with runner.step('validate-screenshot-artifacts', 10):
                checkpoint(force=True)
                if len(preserve_screens(captures, OUTPUT, metadata, approved_screens(runner.data['driverEvents']))) != len(SCREENS):
                    raise StageFailure('Incomplete screenshots')
            success = True
        finally:
            # Export before cleanup; each completed PNG was already retained during polling.
            checkpoint(force=True)
            preserve_screens(captures, OUTPUT, metadata, approved_screens(runner.data['driverEvents']), 'complete' if success else 'partial_failed')
            runner.finish(success)
            with (private / 'cleanup.log').open('wb') as log:
                commands = []
                if simulator_id:
                    commands.extend([['xcrun', 'simctl', 'shutdown', simulator_id], ['xcrun', 'simctl', 'delete', simulator_id]])
                if added_worktree:
                    commands.append(['git', 'worktree', 'remove', '--force', str(checkout)])
                for command in commands:
                    try:
                        subprocess.run(command, cwd=repo, stdout=log, stderr=log, timeout=15)
                    except (subprocess.TimeoutExpired, OSError):
                        print('Capture cleanup incomplete; ephemeral worker disposal required.', flush=True)
    print('Capture candidates retained as unreviewed simulator evidence. No distribution performed.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--preflight-only']:
            require_inputs(os.environ)
        elif sys.argv[1:]:
            raise StageFailure('Unsupported capture argument')
        else:
            main()
    except Exception:
        # Stage/status artifacts contain safe context; exception strings may contain secrets.
        print('iPad capture stopped; inspect safe stage status. No automatic retry.', flush=True)
        raise SystemExit(1) from None

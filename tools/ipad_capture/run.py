"""Disposable, unsigned simulator capture. Never run against the release worktree."""
import hashlib
import base64
import json
import os
import plistlib
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import sys

SOURCE = '26f29133fcd72edecf5c71497712674293228341'
SDK = '058e0af2c2b57e369d905a03ac9748b0ebf543c6'
LOCK = '2d929b3279125c2a0732212aee86ebf51607aaff76f315c9a0ff51e0bbf8ea94'
OUTPUT = Path('/tmp/sc-ipad-capture-output')
STATUS = Path('/tmp/sc-ipad-capture-status.json')
REQUIRED_INPUTS = ('IPAD_REVIEWER_EMAIL', 'IPAD_REVIEWER_PASSWORD',
                   'IPAD_REVIEWER_UID', 'IPAD_FIREBASE_PLIST_BASE64')
DRIVER_STAGES = {'connect', 'authenticate', 'business-home', 'schedule', 'campaigns', 'complete'}
DRIVER_OUTCOMES = {'running', 'success', 'failed', 'auth_refused', 'auth_failed', 'route_unavailable', 'screen_not_ready', 'screenshot_failed'}
progress = {'source': SOURCE, 'stage': 'input-preflight', 'status': 'not_started'}


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


def record(stage, status='running', **safe_fields):
    progress.update(stage=stage, status=status, **safe_fields)
    STATUS.write_text(json.dumps(progress, indent=2))
    print('Capture stage: ' + stage + ' [' + status + ']', flush=True)



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


def main():
    record('input-preflight', inputStates=inspect_inputs(os.environ))
    require_inputs(os.environ, emit=lambda _: None)
    if sys.platform != 'darwin':
        raise RuntimeError('macOS/Xcode simulator worker required')
    tooling = Path(__file__).resolve().parent
    repo = Path(os.environ['CM_BUILD_DIR']).resolve()
    if OUTPUT.exists():
        raise RuntimeError('Capture output already exists; use a fresh worker')
    simulator_id = None
    added_worktree = False
    success = False
    with tempfile.TemporaryDirectory(prefix='sc-ipad-private-') as temporary:
        private = Path(temporary)
        captures = private / 'captures'
        captures.mkdir()
        checkout = private / 'application'
        with (private / 'worker.log').open('w+') as log:
            def run(args, cwd=None, capture=False, env=None, stage=None):
                if stage:
                    record(stage)
                result = subprocess.run(args, cwd=cwd, env=env, text=True,
                                        stdout=subprocess.PIPE if capture else log, stderr=log)
                if result.returncode:
                    record(progress['stage'], 'failed', exitCode=result.returncode)
                    raise RuntimeError('Capture stage failed: ' + args[0])
                return result.stdout.strip() if capture else None
            try:
                sdk = json.loads(run(['flutter', '--version', '--machine'], capture=True, stage='verify-flutter-sdk'))
                if sdk['frameworkRevision'] != SDK:
                    raise RuntimeError('Flutter revision differs from matched source toolchain')
                present = subprocess.run(['git', 'cat-file', '-e', SOURCE + '^{commit}'],
                                         cwd=repo, stdout=log, stderr=log).returncode == 0
                if not present:
                    # Shallow CI checkouts may omit the older application commit.
                    # Fetch only the exact source SHA; never substitute the capture branch HEAD.
                    run(['git', 'fetch', '--no-tags', 'origin',
                         SOURCE], cwd=repo, stage='fetch-pinned-source')
                    fetched = run(['git', 'rev-parse', 'FETCH_HEAD^{commit}'], cwd=repo, capture=True)
                    if fetched != SOURCE:
                        raise RuntimeError('Fetched application commit does not match expected source')
                run(['git', 'cat-file', '-e', SOURCE + '^{commit}'], cwd=repo)
                run(['git', 'worktree', 'add', '--detach', str(checkout), SOURCE], cwd=repo, stage='checkout-pinned-source')
                added_worktree = True
                mobile = checkout / 'apps/mobile'
                record('validate-firebase-plist')
                (mobile / 'ios/Runner/GoogleService-Info.plist').write_bytes(
                    firebase_plist(os.environ['IPAD_FIREBASE_PLIST_BASE64']))
                record('verify-source-lock')
                lock = mobile / 'pubspec.lock'
                if hashlib.sha256(lock.read_bytes()).hexdigest() != LOCK:
                    raise RuntimeError('Pinned dependency lock mismatch')
                original_versions = versions(lock.read_text())
                pubspec = mobile / 'pubspec.yaml'
                pubspec.write_text(pubspec.read_text().replace('dev_dependencies:\n',
                    'dev_dependencies:\n  flutter_driver:\n    sdk: flutter\n', 1))
                harness = mobile / 'test_driver'
                harness.mkdir(exist_ok=True)
                for filename in ['capture_app.dart', 'capture_driver.dart']:
                    shutil.copyfile(tooling / filename, harness / filename)
                run(['flutter', 'pub', 'get'], cwd=mobile, stage='resolve-harness-dependencies')
                resolved = versions(lock.read_text())
                if any(resolved.get(k) != v for k, v in original_versions.items()):
                    raise RuntimeError('Harness would change pinned app dependencies')
                record('select-installed-ipad-runtime')
                device_type, runtime = simulator(
                    json.loads(run(['xcrun', 'simctl', 'list', 'runtimes', '-j'], capture=True)),
                    json.loads(run(['xcrun', 'simctl', 'list', 'devicetypes', '-j'], capture=True)))
                simulator_id = run(['xcrun', 'simctl', 'create', 'ScaledCircle capture only', device_type, runtime], capture=True, stage='create-simulator')
                run(['xcrun', 'simctl', 'boot', simulator_id])
                run(['xcrun', 'simctl', 'bootstatus', simulator_id, '-b'], stage='boot-simulator')
                child_env = {**os.environ, 'IPAD_SIMULATOR_UDID': simulator_id,
                             'IPAD_CAPTURE_OUTPUT': str(captures),
                             'IPAD_DRIVER_STATUS_FILE': str(private / 'driver-status.json')}
                run(['flutter', 'drive', '--no-pub', '--debug', '-d', simulator_id,
                     '--target=test_driver/capture_app.dart', '--driver=test_driver/capture_driver.dart',
                     '--dart-define=APP_ENV=production', '--no-keep-app-running'], cwd=mobile, env=child_env, stage='flutter-drive-build-and-capture')
                record('validate-screenshot-artifacts')
                assets = []
                for name in ['business-home', 'schedule', 'campaigns']:
                    path = captures / (name + '.png')
                    raw = path.read_bytes()
                    if raw[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', raw[16:24]) != (2064, 2752):
                        raise RuntimeError('Unexpected iPad screenshot size')
                    assets.append({'name': path.name, 'width': 2064, 'height': 2752,
                                   'sha256': hashlib.sha256(raw).hexdigest()})
                (captures / 'manifest.json').write_text(json.dumps({
                    'source': SOURCE, 'flutterRevision': SDK, 'sourceLockSha256': LOCK,
                    'captureKind': 'iPad simulator; debug driver harness; production source and backend',
                    'runtime': runtime, 'deviceType': device_type, 'assets': assets,
                    'reviewStatus': 'Manual privacy, loading/error state and layout review required before upload',
                    'notEvidenceOf': ['physical iPad', 'physical push', 'signed release binary'],
                    'releaseBuildNumbersChanged': False,
                }, indent=2))
                # Only a complete set becomes visible to artifact collection.
                os.replace(captures, OUTPUT)
                success = True
                record('complete', 'success')
            finally:
                driver_status = private / 'driver-status.json'
                if driver_status.exists():
                    # Driver writes only a fixed stage/outcome allowlist, never messages.
                    try:
                        data = json.loads(driver_status.read_text())
                        if data.get('stage') in DRIVER_STAGES and data.get('outcome') in DRIVER_OUTCOMES:
                            record(progress['stage'], progress['status'], driver={'stage': data['stage'], 'outcome': data['outcome']})
                    except (ValueError, OSError):
                        pass
                if simulator_id:
                    subprocess.run(['xcrun', 'simctl', 'shutdown', simulator_id], stdout=log, stderr=log)
                    subprocess.run(['xcrun', 'simctl', 'delete', simulator_id], stdout=log, stderr=log)
                if added_worktree:
                    subprocess.run(['git', 'worktree', 'remove', '--force', str(checkout)], cwd=repo, stdout=log, stderr=log)
                if not success:
                    for path in OUTPUT.glob('*'):
                        if path.is_file():
                            path.unlink()
    print('iPad screenshot candidates retained; manual review required. No distribution performed.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--preflight-only']:
            require_inputs(os.environ)
        elif sys.argv[1:]:
            raise RuntimeError('Unsupported capture argument')
        else:
            main()
    except Exception as error:
        # Error messages are only our fixed strings; other exceptions expose type only.
        if not sys.argv[1:]:
            record(progress['stage'], 'failed')
        print('iPad capture stopped:', str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1) from None

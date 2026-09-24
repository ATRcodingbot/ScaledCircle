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

SOURCE = '4834e69e565370b8d54f203ff50ba33e8242196d'
SDK = '058e0af2c2b57e369d905a03ac9748b0ebf543c6'
LOCK = '2d929b3279125c2a0732212aee86ebf51607aaff76f315c9a0ff51e0bbf8ea94'
OUTPUT = Path('/tmp/sc-ipad-capture-output')


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
    if os.uname().sysname != 'Darwin':
        raise RuntimeError('macOS/Xcode simulator worker required')
    for name in ['IPAD_REVIEWER_EMAIL', 'IPAD_REVIEWER_PASSWORD', 'IPAD_REVIEWER_UID',
                 'IPAD_FIREBASE_PLIST_BASE64']:
        if not os.environ.get(name):
            raise RuntimeError('Secure reviewer group incomplete')
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
            def run(args, cwd=None, capture=False, env=None):
                result = subprocess.run(args, cwd=cwd, env=env, text=True,
                                        stdout=subprocess.PIPE if capture else log, stderr=log)
                if result.returncode:
                    raise RuntimeError('Capture stage failed: ' + args[0])
                return result.stdout.strip() if capture else None
            try:
                sdk = json.loads(run(['flutter', '--version', '--machine'], capture=True))
                if sdk['frameworkRevision'] != SDK:
                    raise RuntimeError('Flutter revision differs from matched source toolchain')
                present = subprocess.run(['git', 'cat-file', '-e', SOURCE + '^{commit}'],
                                         cwd=repo, stdout=log, stderr=log).returncode == 0
                if not present:
                    # Shallow CI checkouts may omit the older application commit.
                    # Fetch only its existing named source tag; never substitute HEAD.
                    run(['git', 'fetch', '--no-tags', 'origin',
                         'refs/tags/internal-refresh-4834e69'], cwd=repo)
                    fetched = run(['git', 'rev-parse', 'FETCH_HEAD^{commit}'], cwd=repo, capture=True)
                    if fetched != SOURCE:
                        raise RuntimeError('Pinned application tag no longer matches expected source')
                run(['git', 'cat-file', '-e', SOURCE + '^{commit}'], cwd=repo)
                run(['git', 'worktree', 'add', '--detach', str(checkout), SOURCE], cwd=repo)
                added_worktree = True
                mobile = checkout / 'apps/mobile'
                (mobile / 'ios/Runner/GoogleService-Info.plist').write_bytes(
                    firebase_plist(os.environ['IPAD_FIREBASE_PLIST_BASE64']))
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
                run(['flutter', 'pub', 'get'], cwd=mobile)
                resolved = versions(lock.read_text())
                if any(resolved.get(k) != v for k, v in original_versions.items()):
                    raise RuntimeError('Harness would change pinned app dependencies')
                device_type, runtime = simulator(
                    json.loads(run(['xcrun', 'simctl', 'list', 'runtimes', '-j'], capture=True)),
                    json.loads(run(['xcrun', 'simctl', 'list', 'devicetypes', '-j'], capture=True)))
                simulator_id = run(['xcrun', 'simctl', 'create', 'ScaledCircle capture only', device_type, runtime], capture=True)
                run(['xcrun', 'simctl', 'boot', simulator_id])
                run(['xcrun', 'simctl', 'bootstatus', simulator_id, '-b'])
                child_env = {**os.environ, 'IPAD_SIMULATOR_UDID': simulator_id,
                             'IPAD_CAPTURE_OUTPUT': str(captures)}
                run(['flutter', 'drive', '--no-pub', '--debug', '-d', simulator_id,
                     '--target=test_driver/capture_app.dart', '--driver=test_driver/capture_driver.dart',
                     '--dart-define=APP_ENV=production', '--no-keep-app-running'], cwd=mobile, env=child_env)
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
            finally:
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
        main()
    except Exception as error:
        # Never expose subprocess logs or authentication payloads.
        print('iPad capture stopped:', str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1) from None

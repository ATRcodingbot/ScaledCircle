"""Package/verify the 21061 web correction. This tool never deploys or builds."""
import argparse
import copy
import hashlib
import json
import re
import shutil
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.firebase/mapping-21061-correction/hosting'
APP = ROOT / 'apps/mobile'
BUILD = APP / 'build/web'
BASE_STATE = ROOT / '.firebase/mapping-qa/hosting'
BASE = BASE_STATE / 'public'
PUBLIC = STATE / 'public'
CONFIG = ROOT / 'firebase.mapping-21061-correction.private.json'
MAINTAINED = ROOT / 'firebase.mapping-qa.private.json'
MANIFEST = STATE / 'manifest.private.json'
EXPECTED_LIVE = 'sites/scaled-circle/versions/2b7928b892584cb0'
GCLOUD = r'C:\Users\Greg\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
NODE = r'C:\Program Files\nodejs\node.exe'
FIREBASE = Path(r'C:\Users\Greg\AppData\Roaming\npm\node_modules\firebase-tools')
FLUTTER = Path(r'C:\Users\Greg\Desktop\App Development\flutter')
SOURCE_PATHS = ['apps/mobile/lib', 'apps/mobile/web', 'apps/mobile/assets',
                'apps/mobile/pubspec.yaml', 'apps/mobile/pubspec.lock']
EXTRA_PAGES = {'businesses/index.html', 'how-it-works/index.html',
               'pricing/index.html', 'referrals/index.html', 'scalers/index.html'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()


def verify_candidate(source_sha):
    if not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise RuntimeError('A full pinned source SHA is required')
    if git('rev-parse', 'HEAD') != source_sha:
        raise RuntimeError('Checkout differs from pinned source')
    if git('status', '--porcelain'):
        raise RuntimeError('Pinned source must be clean, including untracked files')
    branch = git('symbolic-ref', '--quiet', '--short', 'HEAD')
    remote = git('ls-remote', '--heads', 'origin', 'refs/heads/' + branch).split()
    if len(remote) != 2 or remote[0] != source_sha:
        raise RuntimeError('Current branch has not been pushed at the pinned source')


def source_inventory():
    return {name: sha((ROOT / name).read_bytes()) for name in
            git('ls-files', '--', *SOURCE_PATHS).splitlines()}


def inventory(folder):
    if not folder.is_dir():
        raise RuntimeError('Required package directory is unavailable')
    result = {}
    for path in sorted(folder.rglob('*')):
        if path.is_symlink():
            raise RuntimeError('Symlinks are not accepted in the Hosting package')
        if path.is_file():
            result[path.relative_to(folder).as_posix()] = sha(path.read_bytes())
    return result


def api_config(hosting):
    allowed = {'site', 'public', 'ignore', 'headers', 'rewrites'}
    if set(hosting) - allowed or hosting.get('site') != 'scaled-circle':
        raise RuntimeError('Unexpected maintained Hosting configuration')
    return {'headers': [{'glob': row['source'], 'headers': {
        entry['key']: entry['value'] for entry in row['headers']}}
        for row in hosting['headers']],
        'rewrites': [{'glob': row['source'], **({'path': row['destination']}
        if 'destination' in row else {'run': copy.deepcopy(row['run'])})}
        for row in hosting['rewrites']]}


def live_state():
    auth = subprocess.run([GCLOUD, 'auth', 'print-access-token'], capture_output=True)
    if auth.returncode:
        raise RuntimeError('Authorized Hosting read credential unavailable')
    token = auth.stdout.decode().strip()
    def get(resource):
        request = urllib.request.Request(
            'https://firebasehosting.googleapis.com/v1beta1/' + resource,
            headers={'Authorization': 'Bearer ' + token,
                     'X-Goog-User-Project': 'scaled-circle'})
        with urllib.request.urlopen(request, timeout=35) as response:
            return json.load(response)
    release = get('sites/scaled-circle/releases?pageSize=1')['releases'][0]
    version = get(release['version']['name'])
    return {'site': 'scaled-circle', 'releaseName': release['name'],
            'releaseTime': release['releaseTime'], 'type': release.get('type'),
            'versionName': version['name'], 'status': version['status'],
            'config': version.get('config', {})}


def validate_live(state, expected_config):
    if state['versionName'] != EXPECTED_LIVE:
        raise RuntimeError('Live Hosting differs from the reviewed baseline')
    if state['config'] != expected_config:
        raise RuntimeError('Hosting configuration differs from the reviewed baseline')


def verify_compiled_inputs():
    """Use Flutter's own file-cache hash implementation, not ordinary MD5."""
    matches = []
    build_digest = sha((BUILD / 'main.dart.js').read_bytes())
    for stamp in (APP / '.dart_tool/flutter_build').glob('*/dart2js.stamp'):
        output = stamp.parent / 'main.dart.js'
        if output.exists() and sha(output.read_bytes()) == build_digest:
            matches.append(stamp.parent)
    if len(matches) != 1:
        raise RuntimeError('Exactly one matching compiled Flutter build is required')
    build_state = matches[0]
    result = subprocess.run([
        str(FLUTTER / 'bin/cache/dart-sdk/bin/dart.exe'),
        str(ROOT / 'tools/verify_mapping_web_build_inputs.dart'),
        str(ROOT), str(build_state), str(STATE / 'build-input-verification.private.json'),
    ], cwd=ROOT, capture_output=True)
    if result.returncode:
        raise RuntimeError('Compiled source input verification failed; inspect safe verification file')
    compiled = read(STATE / 'build-input-verification.private.json')
    if compiled['sourceFilesChecked'] < 300 or compiled['mismatches'] or compiled['missingInputs']:
        raise RuntimeError('Compiled source input verification is incomplete')
    return compiled, build_state


def deployment_command():
    return [NODE, str(FIREBASE / 'lib/bin/firebase.js'), 'deploy', '--only', 'hosting',
            '--project', 'scaled-circle', '--config', str(CONFIG), '--non-interactive']


def prepare(source_sha):
    verify_candidate(source_sha)
    if PUBLIC.exists() or MANIFEST.exists() or CONFIG.exists():
        raise RuntimeError('Correction package already exists; verify it without overwriting')
    source = source_inventory()
    build = inventory(BUILD)
    baseline = inventory(BASE)
    baseline_manifest = read(BASE_STATE / 'manifest.private.json')
    if baseline != baseline_manifest['packageFiles']:
        raise RuntimeError('Reviewed baseline package changed')
    maintained = read(MAINTAINED)
    if set(maintained) != {'hosting'}:
        raise RuntimeError('Maintained configuration must contain Hosting only')
    state = live_state()
    validate_live(state, api_config(maintained['hosting']))
    extras = {name: digest for name, digest in baseline.items() if name not in build}
    if not EXTRA_PAGES.issubset(extras):
        raise RuntimeError('Expected retained static pages are missing or unexpectedly rebuilt')
    STATE.mkdir(parents=True, exist_ok=True)
    compiled, build_state = verify_compiled_inputs()
    shutil.copytree(BASE, PUBLIC)
    shutil.copytree(BUILD, PUBLIC, dirs_exist_ok=True)
    configured = copy.deepcopy(maintained)
    configured['hosting']['public'] = PUBLIC.relative_to(ROOT).as_posix()
    save(CONFIG, configured)
    package = inventory(PUBLIC)
    if package != {**baseline, **build} or source_inventory() != source or inventory(BUILD) != build:
        raise RuntimeError('Inputs changed while preparing the correction package')
    verify_candidate(source_sha)
    save(STATE / 'live-before.private.json', state)
    shutil.copyfile(APP / 'pubspec.lock', STATE / 'pubspec.lock.snapshot')
    for name in ['.filecache', 'dart2js.stamp', 'web_release_bundle.stamp', 'web_templated_files.stamp']:
        shutil.copyfile(build_state / name, STATE / ('build-' + name.lstrip('.') + '.snapshot'))
    manifest = {'preparedAt': datetime.now(timezone.utc).isoformat(),
        'sourceSha': source_sha, 'deployed': False, 'liveBefore': state,
        'configSha256': sha(CONFIG.read_bytes()), 'maintainedConfigSha256': sha(MAINTAINED.read_bytes()),
        'mainDartJsSha256': package['main.dart.js'], 'sourceFiles': source, 'buildFiles': build,
        'baselineFiles': baseline, 'packageFiles': package, 'retainedExtraFiles': extras,
        'compiledSourceVerification': compiled,
        'pubspecLockSha256': sha((APP / 'pubspec.lock').read_bytes()),
        'firebaseCliSha256': sha((FIREBASE / 'lib/bin/firebase.js').read_bytes()),
        'firebaseToolsVersion': read(FIREBASE / 'package.json')['version'],
        'deployCommand': deployment_command()}
    save(MANIFEST, manifest)
    (STATE / 'manifest.sha256').write_text(sha(MANIFEST.read_bytes()) + '\n', encoding='ascii')
    return manifest


def verify(source_sha):
    verify_candidate(source_sha)
    if sha(MANIFEST.read_bytes()) != (STATE / 'manifest.sha256').read_text().strip():
        raise RuntimeError('Prepared manifest changed')
    manifest = read(MANIFEST)
    checks = [(source_sha, manifest['sourceSha'], 'pinned source'),
        (source_inventory(), manifest['sourceFiles'], 'app source'),
        (inventory(BUILD), manifest['buildFiles'], 'compiled build'),
        (inventory(BASE), manifest['baselineFiles'], 'baseline assets'),
        (inventory(PUBLIC), manifest['packageFiles'], 'package assets'),
        (sha(CONFIG.read_bytes()), manifest['configSha256'], 'Hosting config'),
        (sha(MAINTAINED.read_bytes()), manifest['maintainedConfigSha256'], 'maintained config'),
        (sha((FIREBASE / 'lib/bin/firebase.js').read_bytes()), manifest['firebaseCliSha256'], 'Firebase CLI'),
        (read(FIREBASE / 'package.json')['version'], manifest['firebaseToolsVersion'], 'Firebase CLI version')]
    for actual, expected, label in checks:
        if actual != expected:
            raise RuntimeError(label + ' changed after preparation')
    configured = read(CONFIG)
    if set(configured) != {'hosting'} or api_config(configured['hosting']) != manifest['liveBefore']['config']:
        raise RuntimeError('Hosting-only scope/configuration changed')
    validate_live(live_state(), manifest['liveBefore']['config'])
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-sha', required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--prepare', action='store_true')
    mode.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    manifest = prepare(args.source_sha) if args.prepare else verify(args.source_sha)
    print(json.dumps({'prepared': True, 'deployedByThisCommand': False,
        'sourceSha': manifest['sourceSha'], 'mainDartJsSha256': manifest['mainDartJsSha256'],
        'retainedExtraFiles': list(manifest['retainedExtraFiles']), 'manifest': str(MANIFEST),
        'deployCommandForSeparateAuthorizedUse': deployment_command()}, indent=2))

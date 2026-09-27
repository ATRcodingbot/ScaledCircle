"""Prepare the GA4 Hosting-only package, preserving current public pages. Never deploys."""
import argparse
import copy
import shutil
import urllib.request
from datetime import datetime, timezone

import prepare_mapping_21061_hosting as base

ROOT = base.ROOT
STATE = ROOT / '.firebase/ga4-hosting-20260927'
BASE_STATE = ROOT / '.firebase/persistent-drawing-hosting'
PUBLIC = STATE / 'public'
CONFIG = STATE / 'firebase.hosting.private.json'
LOADER = b'<script src="/analytics.js" defer></script>'
EXPECTED_LIVE = 'sites/scaled-circle/versions/ab2ca6649cb5fc8e'


def prepare(source_sha):
    if base.git('rev-parse', 'HEAD') != source_sha or base.git('status', '--porcelain'):
        raise RuntimeError('Expected a clean pinned checkout')
    baseline_manifest = base.read(BASE_STATE / 'manifest.private.json')
    baseline = base.inventory(BASE_STATE / 'public')
    if baseline != baseline_manifest['packageFiles']:
        raise RuntimeError('Retained production package changed')
    configured = base.read(BASE_STATE / 'firebase.hosting.private.json')
    if set(configured) != {'hosting'}:
        raise RuntimeError('Hosting-only configuration required')
    live = base.live_state()
    if live['versionName'] != EXPECTED_LIVE or live['config'] != base.api_config(configured['hosting']):
        raise RuntimeError('Production baseline changed; reconcile before release')
    for name in sorted(base.EXTRA_PAGES | {'main.dart.js', 'index.html'}):
        with urllib.request.urlopen('https://scaledcircle.com/' + name, timeout=45) as response:
            if base.sha(response.read()) != baseline[name]:
                raise RuntimeError('Served baseline differs: ' + name)
    if PUBLIC.exists():
        raise RuntimeError('Package exists; do not overwrite retained evidence')
    STATE.mkdir(parents=True, exist_ok=True)
    base.STATE = STATE
    compiled, _ = base.verify_compiled_inputs()
    source = base.source_inventory()
    build = base.inventory(base.BUILD)
    shutil.copytree(BASE_STATE / 'public', PUBLIC)
    shutil.copytree(base.BUILD, PUBLIC, dirs_exist_ok=True)
    retained = {}
    for name in sorted(base.EXTRA_PAGES):
        file = PUBLIC / name
        original = file.read_bytes()
        if original.count(b'</head>') != 1 or b'analytics.js' in original:
            raise RuntimeError('Unexpected retained page structure: ' + name)
        updated = original.replace(b'</head>', LOADER + b'\n</head>', 1)
        file.write_bytes(updated)
        if updated.replace(LOADER + b'\n', b'', 1) != original:
            raise RuntimeError('Unexpected public-page content change')
        retained[name] = {'before': base.sha(original), 'after': base.sha(updated),
                          'onlyChange': 'same production analytics loader before closing head'}
    if source != base.source_inventory() or build != base.inventory(base.BUILD):
        raise RuntimeError('Source/build changed while packaging')
    configured = copy.deepcopy(configured)
    configured['hosting']['public'] = 'public'
    base.save(CONFIG, configured)
    manifest = {'preparedAt': datetime.now(timezone.utc).isoformat(),
                'sourceSha': source_sha, 'liveBefore': live, 'compiledInputs': compiled,
                'sourceFiles': source, 'buildFiles': build,
                'packageFiles': base.inventory(PUBLIC), 'retainedPages': retained,
                'configSha256': base.sha(CONFIG.read_bytes()),
                'dependencyLockUnchanged': base.sha((base.APP / 'pubspec.lock').read_bytes()) ==
                    base.sha((BASE_STATE / 'pubspec.lock.snapshot').read_bytes())}
    if not manifest['dependencyLockUnchanged']:
        raise RuntimeError('Dependency lock changed')
    base.save(STATE / 'manifest.private.json', manifest)
    print({'source': source_sha, 'files': len(manifest['packageFiles']),
           'compiledInputs': compiled, 'retainedPublicPages': len(retained),
           'hostingConfigUnchanged': True, 'dependencyLockUnchanged': True,
           'config': str(CONFIG), 'deployed': False})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-sha', required=True)
    prepare(parser.parse_args().source_sha)

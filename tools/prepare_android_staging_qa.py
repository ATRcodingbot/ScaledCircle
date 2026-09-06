"""Prepare an ignored Android staging checkout without changing production config."""
import argparse
import json
import pathlib
import shutil


def staging_client(config):
    if config['project_info']['project_id'] != 'scaledcircle-staging':
        raise ValueError('Staging project required')
    clients = [c for c in config['client'] if c['client_info'].get('android_client_info', {}).get('package_name') == 'com.scaledcircle.app']
    if len(clients) != 1 or clients[0]['client_info']['mobilesdk_app_id'] != '1:998249478055:android:afe7b04c80155aa6352882':
        raise ValueError('Exact registered staging Android app required')
    return clients[0]


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--config', required=True, type=pathlib.Path)
    options = args.parse_args()
    config = json.loads(options.config.read_text(encoding='utf-8-sig'))
    staging_client(config)
    root = pathlib.Path(__file__).resolve().parents[1]
    source = root / 'apps/mobile'
    target = root / '.firebase/android-staging-qa'
    if target.exists():
        raise ValueError('Use the existing isolated checkout or review it; no automatic overwrite')
    original = (source / 'android/app/google-services.json').read_bytes()
    shutil.copytree(source, target, ignore=shutil.ignore_patterns(
        'build', '.dart_tool', '.gradle', '.git', '.idea', '*.log',
        'google-services.json', '.lib', 'ios', 'macos', 'linux', 'windows'))
    (target / 'android/app/google-services.json').write_text(json.dumps(config, indent=2))
    assert (source / 'android/app/google-services.json').read_bytes() == original
    print('Prepared ignored staging checkout; production Android configuration unchanged.')


if __name__ == '__main__':
    main()

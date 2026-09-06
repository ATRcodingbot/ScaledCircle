"""Offline IPA content gate; Apple codesign/profile verification remains on macOS."""
import argparse
import hashlib
import json
import plistlib
from pathlib import Path
import zipfile


def inspect(path, version, build, environment='production'):
    if environment not in ('production', 'staging'):
        raise ValueError('Explicit production or staging environment required')
    project = 'scaled-circle' if environment == 'production' else 'scaledcircle-staging'
    app_id = ('1:1010956217112:ios:91c890b1ca2018a4e70c6d' if environment == 'production'
              else '1:998249478055:ios:e3e282258d5750db352882')
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Ambiguous duplicate archive entries')
        if any(n.startswith('/') or '..' in n.split('/') for n in names):
            raise ValueError('Unsafe archive entry path')
        roots = [n[:-10] for n in names if n.startswith('Payload/')
                 and n.count('/') == 2 and n.endswith('.app/Info.plist')]
        if len(roots) != 1:
            raise ValueError('Expected one top-level iOS application')
        root = roots[0]
        firebase_configs = [n for n in names if n.startswith(root)
                            and n.endswith('/GoogleService-Info.plist')]
        if firebase_configs != [root + 'GoogleService-Info.plist']:
            raise ValueError('Expected exactly one Firebase plist at application bundle root')
        info = plistlib.loads(archive.read(root + 'Info.plist'))
        config = plistlib.loads(archive.read(root + 'GoogleService-Info.plist'))
        expected = {'CFBundleIdentifier': 'com.scaledcircle.app',
                    'CFBundleShortVersionString': version, 'CFBundleVersion': build,
                    'CFBundleDisplayName': 'ScaledCircle'}
        for key, value in expected.items():
            if info.get(key) != value:
                raise ValueError('Application metadata mismatch: ' + key)
        for key, value in {'PROJECT_ID': project, 'BUNDLE_ID': 'com.scaledcircle.app',
                           'GOOGLE_APP_ID': app_id}.items():
            if config.get(key) != value:
                raise ValueError('Firebase configuration mismatch: ' + key)
        for key in ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription',
                    'NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription']:
            if not str(info.get(key, '')).strip():
                raise ValueError('Missing permission description: ' + key)
        if info.get('UIBackgroundModes') != ['location']:
            raise ValueError('Unreviewed background capabilities')
        forbidden = ['scaledcircle-staging', 'demo-scaledcircle', '10.0.2.2',
                     'http://127.0.0.1:5000', 'http://127.0.0.1:5001']
        required = ['https://us-east1-scaled-circle.cloudfunctions.net/', 'socialOAuthXCallbackV1']
        if environment == 'staging':
            # The runtime rejection guard deliberately names the forbidden
            # production project. Reject production configuration/origins,
            # not that defensive diagnostic. The packaged plist is checked
            # against the exact staging identity above.
            forbidden = ['1010956217112', 'scaled-circle.firebaseapp.com',
                         'scaled-circle.appspot.com', 'scaled-circle.firebasestorage.app',
                         'us-east1-scaled-circle.cloudfunctions.net', 'demo-scaledcircle',
                         '10.0.2.2', 'http://127.0.0.1:5000', 'http://127.0.0.1:5001']
            required = ['https://us-east1-scaledcircle-staging.cloudfunctions.net/',
                        'socialOAuthXCallbackV1']
        found = set()
        generic = set()
        for name in names:
            data = archive.read(name)
            for marker in forbidden:
                if any(marker.encode(enc) in data for enc in ['utf-8', 'utf-16le', 'utf-16be']):
                    raise ValueError('Nonproduction marker in archive: ' + name)
            if name == root + 'Frameworks/App.framework/App':
                found.update(marker for marker in required if marker.encode() in data)
            if b'localhost' in data or b'127.0.0.1' in data:
                generic.add(name)
        if found != set(required):
            raise ValueError('Production callback evidence missing from application binary')
    return {'environment': environment, 'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'content_gate': 'PASS', 'signature_gate': 'NOT_VERIFIED_REQUIRES_MACOS',
            'generic_loopback_entries_require_review': sorted(generic)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ipa', type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--environment', choices=['production', 'staging'], default='production')
    args = parser.parse_args()
    print(json.dumps(inspect(args.ipa, args.version, args.build, args.environment), indent=2))

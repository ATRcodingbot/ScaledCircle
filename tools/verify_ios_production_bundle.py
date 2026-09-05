"""Offline IPA content gate; Apple codesign/profile verification remains on macOS."""
import argparse
import hashlib
import json
import plistlib
from pathlib import Path
import zipfile


def inspect(path, version, build):
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
        info = plistlib.loads(archive.read(root + 'Info.plist'))
        config = plistlib.loads(archive.read(root + 'GoogleService-Info.plist'))
        expected = {'CFBundleIdentifier': 'com.scaledcircle.app',
                    'CFBundleShortVersionString': version, 'CFBundleVersion': build,
                    'CFBundleDisplayName': 'ScaledCircle'}
        for key, value in expected.items():
            if info.get(key) != value:
                raise ValueError('Application metadata mismatch: ' + key)
        for key, value in {'PROJECT_ID': 'scaled-circle', 'BUNDLE_ID': 'com.scaledcircle.app',
                           'GOOGLE_APP_ID': '1:1010956217112:ios:0c1a12a1424128b9e70c6d'}.items():
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
    return {'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'content_gate': 'PASS', 'signature_gate': 'NOT_VERIFIED_REQUIRES_MACOS',
            'generic_loopback_entries_require_review': sorted(generic)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ipa', type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--build', required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(args.ipa, args.version, args.build), indent=2))

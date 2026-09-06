"""Restore only the dedicated staging Firebase plist in an isolated CI checkout."""
import base64
import os
from pathlib import Path
import plistlib

VARIABLE = 'IOS_STAGING_GOOGLE_SERVICE_INFO_PLIST_B64'
EXPECTED = {
    'GOOGLE_APP_ID': '1:998249478055:ios:e3e282258d5750db352882',
    'PROJECT_ID': 'scaledcircle-staging',
    'GCM_SENDER_ID': '998249478055',
    'BUNDLE_ID': 'com.scaledcircle.app',
}


def validated_bytes(encoded, environment):
    if environment != 'staging':
        raise ValueError('This restore procedure requires APP_ENV=staging')
    data = base64.b64decode(encoded, validate=True)
    config = plistlib.loads(data)
    for key, expected in EXPECTED.items():
        if config.get(key) != expected:
            raise ValueError('Staging Firebase identity mismatch: ' + key)
    if b'scaled-circle' in data or b'1010956217112' in data:
        raise ValueError('Production Firebase configuration is not permitted')
    return data


if __name__ == '__main__':
    if not os.environ.get('CM_BUILD_DIR'):
        raise SystemExit('Run only in the isolated Codemagic checkout')
    data = validated_bytes(os.environ[VARIABLE], os.environ.get('APP_ENV'))
    destination = Path(os.environ['CM_BUILD_DIR']) / 'apps/mobile/ios/Runner/GoogleService-Info.plist'
    if not destination.parent.is_dir():
        raise SystemExit('Runner target directory is missing')
    destination.write_bytes(data)
    print('Dedicated staging Firebase iOS configuration restored and identity verified.')

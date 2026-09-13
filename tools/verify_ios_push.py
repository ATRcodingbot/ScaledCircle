"""Read-only push entitlement gate for the next signed iOS archive (macOS)."""
import argparse
import json
import platform
import plistlib
from pathlib import Path
import subprocess
import tempfile
import zipfile


def verify(ipa):
    if platform.system() != 'Darwin':
        raise RuntimeError('Signed push entitlement verification requires macOS')
    with zipfile.ZipFile(ipa) as archive:
        names = archive.namelist()
        if any(n.startswith('/') or '..' in n.split('/') for n in names):
            raise ValueError('Unsafe archive path')
        if any(n.lower().endswith('.p8') for n in names):
            raise ValueError('Private Apple keys must not be packaged')
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(['ditto', '-x', '-k', str(ipa), directory], check=True)
        apps = list((Path(directory) / 'Payload').glob('*.app'))
        assert len(apps) == 1, 'Expected one application'
        app = apps[0]
        info = plistlib.loads((app / 'Info.plist').read_bytes())
        assert info['CFBundleIdentifier'] == 'com.scaledcircle.app'
        assert set(info['UIBackgroundModes']) == {'location', 'fetch', 'remote-notification'}
        assert info.get('FirebaseMessagingAutoInitEnabled') is False
        assert info.get('FirebaseAppDelegateProxyEnabled') is not False
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
        signed = subprocess.run(['codesign', '-d', '--entitlements', ':-', str(app)], check=True, capture_output=True)
        entitlements = plistlib.loads(signed.stdout)
        profile = subprocess.run(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')], check=True, capture_output=True)
        provision = plistlib.loads(profile.stdout)
        for value in (entitlements, provision['Entitlements']):
            assert value.get('aps-environment') == 'production', 'Production APNs entitlement required'
            assert value.get('com.apple.developer.team-identifier') == '4RXFR4Q2SA'
            assert value.get('application-identifier') == '4RXFR4Q2SA.com.scaledcircle.app'
            assert value.get('get-task-allow') is False
        assert provision['TeamIdentifier'] == ['4RXFR4Q2SA']
        return {'signedPushEntitlement': 'PASS', 'provisioningPushEntitlement': 'PASS',
                'environment': 'production', 'team': '4RXFR4Q2SA',
                'bundle': 'com.scaledcircle.app', 'physicalDelivery': 'NOT_YET_TESTED'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ipa', type=Path)
    print(json.dumps(verify(parser.parse_args().ipa), indent=2))

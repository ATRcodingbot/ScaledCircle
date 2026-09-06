import plistlib
from pathlib import Path
import tempfile
import unittest
import zipfile
from verify_ios_production_bundle import inspect


class IpaGateTest(unittest.TestCase):
    def fixture(self, path, bad=None, environment='production'):
        info = dict(CFBundleIdentifier='com.scaledcircle.app', CFBundleShortVersionString='1.0.0',
                    CFBundleVersion='1', CFBundleDisplayName='ScaledCircle', UIBackgroundModes=['location'])
        for key in ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription',
                    'NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription']:
            info[key] = 'Fixture permission'
        if bad == 'permission':
            del info['NSCameraUsageDescription']
        config = dict(PROJECT_ID='scaled-circle', BUNDLE_ID='com.scaledcircle.app',
                      GOOGLE_APP_ID='1:1010956217112:ios:91c890b1ca2018a4e70c6d')
        host = 'https://us-east1-scaled-circle.cloudfunctions.net/'
        if environment == 'staging':
            config.update(PROJECT_ID='scaledcircle-staging',
                          GOOGLE_APP_ID='1:998249478055:ios:e3e282258d5750db352882')
            host = 'https://us-east1-scaledcircle-staging.cloudfunctions.net/'
        if bad == 'firebase':
            config['PROJECT_ID'] = 'wrong'
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('Payload/Runner.app/Info.plist', plistlib.dumps(info))
            archive.writestr('Payload/Runner.app/GoogleService-Info.plist', plistlib.dumps(config))
            archive.writestr('Payload/Runner.app/Frameworks/App.framework/App',
                             (host + 'socialOAuthXCallbackV1').encode())
            if bad == 'production_marker':
                archive.writestr('Payload/Runner.app/extra', b'1010956217112')
            if bad == 'staging':
                archive.writestr('Symbols/extra', 'scaledcircle-staging'.encode('utf-16le'))
            if bad == 'path':
                archive.writestr('../outside', 'invalid')
            if bad == 'duplicate':
                archive.writestr('Payload/Runner.app/Info.plist', plistlib.dumps(info))
            if bad == 'nested_firebase':
                archive.writestr('Payload/Runner.app/extra/GoogleService-Info.plist', plistlib.dumps(config))

    def test_gate_rejects_contamination_and_mismatches(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'fixture.ipa'
            self.fixture(path)
            self.assertEqual(inspect(path, '1.0.0', '1')['content_gate'], 'PASS')
            with self.assertRaises(ValueError):
                inspect(path, '1.0.0', '2')
            for bad in ['permission', 'firebase', 'staging', 'path', 'duplicate', 'nested_firebase']:
                self.fixture(path, bad)
                with self.assertRaises(ValueError):
                    inspect(path, '1.0.0', '1')

    def test_environment_guards_are_not_interchangeable(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'fixture.ipa'
            self.fixture(path, environment='staging')
            self.assertEqual(inspect(path, '1.0.0', '1', 'staging')['content_gate'], 'PASS')
            with self.assertRaises(ValueError):
                inspect(path, '1.0.0', '1')
            self.fixture(path)
            with self.assertRaises(ValueError):
                inspect(path, '1.0.0', '1', 'staging')
            self.fixture(path, bad='production_marker', environment='staging')
            with self.assertRaises(ValueError):
                inspect(path, '1.0.0', '1', 'staging')


if __name__ == '__main__':
    unittest.main()

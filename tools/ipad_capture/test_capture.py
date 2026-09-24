import importlib.util
from pathlib import Path
import unittest
import base64
import plistlib

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('capture', HERE / 'run.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def test_plist_rejects_wrong_project_before_build(self):
        config = {'PROJECT_ID': 'scaled-circle', 'BUNDLE_ID': 'com.scaledcircle.app',
                  'GOOGLE_APP_ID': '1:1010956217112:ios:91c890b1ca2018a4e70c6d'}
        encode = lambda value: base64.b64encode(plistlib.dumps(value))
        self.assertTrue(capture.firebase_plist(encode(config)))
        with self.assertRaises(RuntimeError):
            capture.firebase_plist(encode({**config, 'PROJECT_ID': 'scaledcircle-staging'}))

    def test_pinned_lock_is_fully_parsed(self):
        lock = HERE.parents[1] / 'apps/mobile/pubspec.lock'
        packages = capture.versions(lock.read_text())
        self.assertEqual(packages['firebase_auth'], '6.6.1')
        self.assertEqual(packages['flutter'], '0.0.0')
        self.assertGreater(len(packages), 50)

    def test_only_installed_ios_runtime_and_exact_ipad_model(self):
        runtimes = {'runtimes': [
            {'isAvailable': False, 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-27-0', 'version': '27.0'},
            {'isAvailable': True, 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-26-6', 'version': '26.6'},
        ]}
        devices = {'devicetypes': [{'name': 'iPad Pro 13-inch (M4)', 'identifier': 'ipad-m4'}]}
        self.assertEqual(capture.simulator(runtimes, devices),
                         ('ipad-m4', 'com.apple.CoreSimulator.SimRuntime.iOS-26-6'))
        with self.assertRaises(RuntimeError):
            capture.simulator({'runtimes': []}, devices)

    def test_no_release_publishing_or_credential_artifact_configuration(self):
        config = (HERE / 'codemagic.yaml').read_text()
        self.assertNotIn('publishing:', config)
        self.assertNotIn('integrations:', config)
        self.assertNotIn('.app', config)
        driver = (HERE / 'capture_driver.dart').read_text()
        self.assertIn('logCommunicationToFile: false', driver)
        self.assertIn('printCommunication: false', driver)
        self.assertNotIn('String.fromEnvironment', driver)


if __name__ == '__main__':
    unittest.main()

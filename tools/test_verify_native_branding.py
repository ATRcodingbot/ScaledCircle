import json
from pathlib import Path
import shutil
import tempfile
import unittest
from verify_native_branding import ROOT, verify_source


class NativeBrandGateTest(unittest.TestCase):
    def fixture(self, folder):
        root = Path(folder)
        for relative in ['assets/brand', 'ios/Runner/Assets.xcassets', 'ios/Runner/Base.lproj', 'android/app/src/main/res']:
            shutil.copytree(ROOT / 'apps/mobile' / relative, root / 'apps/mobile' / relative)
        shutil.copyfile(ROOT / 'apps/mobile/android/app/src/main/AndroidManifest.xml', root / 'apps/mobile/android/app/src/main/AndroidManifest.xml')
        return root

    def test_exact_native_assets_pass(self):
        self.assertEqual(len(verify_source()['files']), 33)

    def test_replaced_launcher_or_missing_launch_binding_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.fixture(tmp)
            icon = root / 'apps/mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png'
            original = icon.read_bytes()
            icon.write_bytes(b'placeholder')
            with self.assertRaisesRegex(ValueError, 'Native artwork changed'):
                verify_source(root)
            icon.write_bytes(original)
            styles = root / 'apps/mobile/android/app/src/main/res/values-night-v31/styles.xml'
            styles.write_text('<resources/>')
            with self.assertRaisesRegex(ValueError, 'light/dark splash'):
                verify_source(root)

    def test_replaced_ios_launch_artwork_and_wrong_name_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.fixture(tmp)
            launch = root / 'apps/mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png'
            original = launch.read_bytes()
            launch.write_bytes(b'empty Flutter launch image')
            with self.assertRaises(ValueError):
                verify_source(root)
            launch.write_bytes(original)
            manifest = root / 'apps/mobile/android/app/src/main/AndroidManifest.xml'
            manifest.write_text(manifest.read_text().replace('ScaledCircle', 'Flutter Demo'))
            with self.assertRaisesRegex(ValueError, 'app name'):
                verify_source(root)


if __name__ == '__main__':
    unittest.main()

import base64
import plistlib
import unittest
from restore_ios_staging_plist import EXPECTED, validated_bytes


class StagingPlistTests(unittest.TestCase):
    def encoded(self, **overrides):
        return base64.b64encode(plistlib.dumps({**EXPECTED, **overrides})).decode()

    def test_exact_staging_identity(self):
        self.assertEqual(plistlib.loads(validated_bytes(self.encoded(), 'staging')), EXPECTED)

    def test_other_environment_and_identity_fail_closed(self):
        for environment in [None, 'production', 'local']:
            with self.assertRaises(ValueError):
                validated_bytes(self.encoded(), environment)
        for key in EXPECTED:
            with self.assertRaises(ValueError):
                validated_bytes(self.encoded(**{key: 'wrong'}), 'staging')


if __name__ == '__main__':
    unittest.main()

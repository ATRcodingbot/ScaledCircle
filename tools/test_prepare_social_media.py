import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from prepare_social_media import prepare, verify_response


class MediaTest(unittest.TestCase):
    def test_canonical_only_and_repeatable(self):
        manifest = Path(__file__).resolve().parent.parent / 'docs/audit-media/meta-20260905/manifest.json'
        with tempfile.TemporaryDirectory() as folder:
            result = prepare(manifest, folder)
            self.assertEqual(result, prepare(manifest, folder))
            self.assertEqual(len(list(Path(folder).rglob('*.png'))), 5)
            for item in result['files']:
                data = (Path(folder) / item['path'].lstrip('/')).read_bytes()
                verify_response(data, item['mime'], item['sha256'])
                with self.assertRaises(ValueError):
                    verify_response(data, 'text/html', item['sha256'])
                with self.assertRaises(ValueError):
                    verify_response(data + b'x', item['mime'], item['sha256'])

    def test_html_with_success_status_is_not_an_image(self):
        data = b'<html>Flutter fallback</html>'
        with self.assertRaises(ValueError):
            verify_response(data, 'image/png', hashlib.sha256(data).hexdigest())


if __name__ == '__main__':
    unittest.main()

from pathlib import Path
import unittest
from prepare_marketing_metadata import ROUTES, render


class MetadataTest(unittest.TestCase):
    def test_distinct_metadata_preserves_existing_page_body(self):
        source = (Path(__file__).resolve().parent.parent / 'apps/mobile/web/index.html').read_text(encoding='utf-8')
        documents = [render(source, route) for route in ROUTES]
        self.assertEqual(len(set(documents)), 5)
        for route, document in zip(ROUTES, documents):
            self.assertEqual(document.split('<body>')[1], source.split('<body>')[1])
            self.assertIn('href="https://scaledcircle.com' + route + '"', document)
            self.assertEqual(document.count('rel="canonical"'), 1)
            self.assertNotIn('"offers"', document)
        with self.assertRaises(ValueError):
            render(source.replace('</head>', '<title>duplicate</title></head>'), '/')


if __name__ == '__main__':
    unittest.main()

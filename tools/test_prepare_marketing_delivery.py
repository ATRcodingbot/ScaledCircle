import unittest
from prepare_marketing_delivery import documents, content


class DeliveryTest(unittest.TestCase):
    def test_five_routes_have_visible_copy_and_distinct_canonicals(self):
        docs = documents()
        self.assertEqual(len(docs), 5)
        self.assertEqual(len(set(docs.values())), 5)
        for route, value in docs.items():
            self.assertEqual(value.count('<h1>'), 1)
            self.assertIn('href="https://scaledcircle.com' + route + '"', value)
            self.assertIn('<nav aria-label="Main">', value)
            self.assertNotIn('$FLUTTER_BASE_HREF', value)
            self.assertNotIn('src="flutter_bootstrap.js" async', value)
            self.assertIn("if (!location.hash.startsWith('#/') || appStarted) return;", value)
        self.assertEqual([x[1] for x in content()['/pricing'][1:]], ['$99/month', '$299/month', '$499/month', '$999/month'])

    def test_staging_indexing_and_truthful_conversion_paths(self):
        home = documents(staging=True)['/']
        self.assertIn('noindex,nofollow', home)
        self.assertIn('Build My First Campaign', home)
        self.assertIn('Create Business Account', home)
        self.assertIn('Social Manager — Beta', home)
        self.assertIn('Printing — Coming Soon', home)
        self.assertNotIn('checkout', home.split('<script>')[1])
        self.assertNotIn('noindex,nofollow', documents()['/'])


if __name__ == '__main__':
    unittest.main()

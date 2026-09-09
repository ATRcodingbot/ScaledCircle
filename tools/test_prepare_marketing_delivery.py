import unittest
import json
import re
import subprocess
from prepare_marketing_delivery import documents, content


class DeliveryTest(unittest.TestCase):
    def test_metadata_and_structured_data_are_complete_for_each_route(self):
        titles, descriptions = set(), set()
        for route, page in documents().items():
            titles.add(re.search(r'<title>(.*?)</title>', page).group(1))
            descriptions.add(re.search(r'<meta name="description" content="([^"]+)"', page).group(1))
            for key in ['og:title', 'og:description', 'og:url', 'og:image']:
                self.assertIn('property="' + key + '"', page)
            schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', page, re.S).group(1))
            self.assertEqual(schema['url'], 'https://scaledcircle.com' + route)
            self.assertEqual(schema['@type'], 'WebPage')
            self.assertNotIn('AggregateRating', page)
        self.assertEqual(len(titles), 5)
        self.assertEqual(len(descriptions), 5)

    def test_referral_and_hash_product_navigation_without_network_or_attribution(self):
        script = next(value for value in re.findall(r'<script>(.*?)</script>', documents()['/'], re.S) if 'function startProduct()' in value)
        harness = r'''
const vm=require('node:vm'), assert=require('node:assert/strict');
const script=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
for(const pathname of ['/','/pricing']) for(const ref of ['abc234','invalid-secret-value','']) {
 const anchors=['/#/businesses','/pricing','mailto:support@scaledcircle.com'].map(href=>({href,getAttribute(){return this.href},setAttribute(k,v){this.href=v}}));
 let appended=0,removed=0;const listeners={};
 const location={href:'https://scaledcircle.com'+pathname+'?ref='+ref,pathname,origin:'https://scaledcircle.com',search:'?ref='+ref,hash:''};
 const context={URL,URLSearchParams,location,setTimeout:()=>1,clearTimeout:()=>{},addEventListener:(k,v)=>listeners[k]=v,document:{querySelectorAll:()=>anchors,getElementById:()=>({remove:()=>removed++}),createElement:()=>({remove:()=>removed++}),body:{appendChild:()=>appended++}}};
 vm.runInNewContext(script,context);
 assert.equal(appended,pathname==='/'?2:0);
 assert.equal(anchors[0].href,ref==='abc234'? '/?ref=ABC234#/businesses':'/#/businesses');
 assert.equal(anchors[2].href,'mailto:support@scaledcircle.com');
 location.hash='#/job-room/example';listeners.hashchange();listeners.hashchange();
 assert.equal(appended,2);assert.equal(removed,1);listeners['flutter-first-frame']();assert.equal(removed,2);
}
'''
        result = subprocess.run(['node', '-e', harness], input=json.dumps(script), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

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
            self.assertIn("location.pathname !== '/' && location.pathname !== '/login'", value)
        self.assertEqual([x[1] for x in content()['/pricing'][1:5]], ['$99/month', '$299/month', '$499/month', '$999/month'])
        pricing = docs['/pricing']
        for text in ['Add more intelligence', 'Business Assistant - Beta', '+$399/month', 'Lead Generation Research - Beta', '+$699/month', 'Growth Department - $2,000/month', 'Save $97/month', '10 total users']:
            self.assertIn(text, pricing)
        self.assertIn('Research does not authorize contact', pricing)

    def test_staging_indexing_and_truthful_conversion_paths(self):
        home = documents(staging=True)['/']
        self.assertIn('noindex,nofollow', home)
        self.assertIn('Build My First Campaign', home)
        self.assertIn('Create Business Account', home)
        self.assertIn('Social Manager — Beta', home)
        self.assertIn('Printing — Coming Soon', home)
        self.assertIn('A flyer campaign for a local contractor.', home)
        self.assertIn('Know the work and pay before you apply.', home)
        self.assertIn('<h2>Pricing</h2>', home)
        self.assertNotIn('422 homes analyzed', home)
        self.assertNotIn('checkout', home.split('<script>')[1])
        self.assertNotIn('noindex,nofollow', documents()['/'])


if __name__ == '__main__':
    unittest.main()

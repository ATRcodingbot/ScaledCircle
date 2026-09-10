import unittest
import json
import re
import subprocess
import tempfile
from pathlib import Path
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
            self.assertEqual(len(re.findall(r'<h1(?:\s[^>]*)?>', value)), 1)
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

    def test_how_it_works_has_complete_truthful_story_without_image_dependency(self):
        page = documents(staging=True)['/how-it-works']
        for copy in ['Turn a local market into a measurable growth system.',
                     'Choose the market', 'Build the campaign', 'Real people execute it',
                     'Measure what happened', 'Smart Mapping +', 'Weather Intelligence',
                     'Tracking + Attribution', 'Growth Intelligence',
                     'A workflow example, not a case study', 'properly completed work',
                     'where recorded', 'platform fees before funding',
                     'Private Beta / Invite Only', 'Coming Soon']:
            self.assertIn(copy, page)
        body = page.split('<body', 1)[1].split('<script>', 1)[0]
        self.assertEqual(body.count('class="button primary"'), 2)
        self.assertIn('Grow My Business', body)
        self.assertIn('Find Work', body)
        self.assertIn('Start Growing', body)
        self.assertNotIn('<img', body)
        self.assertNotIn('Network Intelligence', body)
        self.assertNotIn('Master Agent', body)
        self.assertNotIn('checkout', body.lower())
        self.assertNotIn('Build My First Campaign', body)
        self.assertIn('<details class="mobile-menu">', body)
        self.assertIn('href="/how-it-works/#workflow"', body)
        self.assertIn('summary', body)
        ids = set(re.findall(r'\bid="([^"]+)"', body))
        for labelled_by in re.findall(r'aria-labelledby="([^"]+)"', body):
            for referenced in labelled_by.split():
                self.assertIn(referenced, ids)

    def test_narrow_overlay_preserves_existing_hosting_files(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            for name in ['index.html', 'robots.txt', 'sitemap.xml', 'main.dart.js']:
                (output / name).write_text('preserved ' + name)
            process = subprocess.run(['python', str(Path(__file__).with_name('prepare_marketing_delivery.py')),
                                      '--output', folder, '--route', '/how-it-works', '--staging'], capture_output=True, text=True)
            self.assertEqual(process.returncode, 0, process.stderr)
            for name in ['index.html', 'robots.txt', 'sitemap.xml', 'main.dart.js']:
                self.assertEqual((output / name).read_text(), 'preserved ' + name)
            self.assertIn('noindex,nofollow', (output / 'how-it-works/index.html').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()

"""Local progressive marketing delivery candidate; does not deploy Hosting."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
from prepare_marketing_metadata import ROUTES, render

ROOT = Path(__file__).resolve().parent.parent
SCREENS = ROOT / 'apps/mobile/lib/screens/public'


def funnel(name):
    source = (SCREENS / name).read_text(encoding='utf-8')
    pairs = re.findall(r"title:\s*'([^']+)',\s*body:\s*'([^']+)'", source)
    if len(pairs) < 7:
        raise ValueError('Funnel copy shape changed; review extraction')
    return pairs


def content():
    landing = (SCREENS / 'public_landing_screen.dart').read_text(encoding='utf-8')
    hero = 'Local marketing that actually gets executed.'
    intro = 'Plan practical territory, set fixed compensation and bonuses, and coordinate Scalers. Review recorded execution evidence and measure supported responses.'
    assert hero in landing and intro in landing
    how = landing.split('class _HowItWorks ')[1].split('\nclass ')[0]
    steps = re.findall(r"title:\s*'([^']+)',\s*body:\s*'([^']+)'", how)
    assert len(steps) == 3
    plans = (ROOT / 'apps/mobile/lib/services/subscription_plan_service.dart').read_text(encoding='utf-8')
    prices = re.findall(r"'name': '([^']+)',\s*'price': ([0-9.]+)", plans)
    assert len(prices) == 4
    pricing = [(name + (' - LIMITED BETA' if name == 'Managed Growth' else ''),
                '$' + format(float(price), '.0f') + '/month') for name, price in prices]
    return {'/': [(hero, intro), *steps], '/businesses': funnel('business_funnel_screen.dart'),
            '/scalers': funnel('scaler_funnel_screen.dart'),
            '/how-it-works': [('A simpler way to grow locally.', 'Start with your goal. ScaledCircle handles the complexity underneath.'), *steps],
            '/pricing': [('Choose how much help you want.', 'Software access is clear. Variable campaign costs are approved separately.'), *pricing]}


def documents(*, staging=False):
    template = (ROOT / 'apps/mobile/web/index.html').read_text(encoding='utf-8')
    navigation = ''.join('<a href="' + route + '">' + label + '</a>' for route, label in
                         [('/', 'ScaledCircle'), ('/businesses', 'Businesses'), ('/scalers', 'Scalers'),
                          ('/how-it-works', 'How it works'), ('/pricing', 'Pricing')])
    result = {}
    for route, sections in content().items():
        document = render(template, route).replace('$FLUTTER_BASE_HREF', '/')
        primary = ('Create Scaler Account', '/#/scalers') if route == '/scalers' else ('Grow My Business', '/#/businesses')
        cta = lambda label: f'<p><a class="cta" href="{primary[1]}">{label}</a></p>'
        blocks = []
        for index, (title, body) in enumerate(sections):
            tag = 'h1' if index == 0 else 'h2'
            blocks.append(f'<section><{tag}>{html.escape(title)}</{tag}><p>{html.escape(body)}</p></section>')
            if index == 0:
                blocks.append(cta(primary[0]))
                if route == '/':
                    blocks.append('<p><a href="/#/scalers">Become a Scaler</a> · <a href="/how-it-works">See How It Works</a></p>')
            if index == 2:
                blocks.append(cta('Find Local Work' if route == '/scalers' else 'Build My First Campaign'))
        if route in ('/', '/businesses', '/pricing'):
            capability_source = (ROOT / 'apps/mobile/lib/widgets/customer_capability_status.dart').read_text(encoding='utf-8')
            capabilities = re.findall(r"title:\s*'([^']+)',\s*description:\s*'([^']+)'", capability_source)
            if len(capabilities) != 6:
                raise ValueError('Capability copy changed; review static delivery')
            blocks.append('<section><h2>Availability at a glance</h2><div class="capabilities">' + ''.join(
                f'<article><h3>{html.escape(title)}</h3><p>{html.escape(description)}</p></article>'
                for title, description in capabilities) + '</div></section>')
        blocks.append(cta('Create Scaler Account' if route == '/scalers' else 'Create Business Account'))
        picture = '' if route == '/pricing' else '<img width="1200" height="630" loading="lazy" src="https://scaledcircle.com/social/2f453997dd7b59c24aa1246a2e197b3ba05b40817daa678428befeb11c1db28d.png" alt="ScaledCircle Smart Mapping: public Baltimore planning demo with estimated homes and an unverified route">'
        body = '<body><main id="marketing"><nav aria-label="Main">' + navigation + '<a class="cta" href="/#/businesses">Get Started</a></nav>' + ''.join(blocks) + picture + '''
<p><a href="/#/login">Log in</a> · <a href="/#/businesses">Open Business experience</a> · <a href="/#/scalers">Open Scaler experience</a></p>
<footer><a href="/#/privacy">Privacy</a> · <a href="/#/terms">Terms</a> · <a href="mailto:support@scaledcircle.com">Contact support</a></footer>
</main>
<script>
// Preserve only a valid existing referral code across same-site navigation.
// No attribution write, enrollment, or commission is created by this page.
const referral = new URLSearchParams(location.search).get('ref');
if (referral && /^[A-HJ-NP-Z2-9]{6,16}$/i.test(referral)) {
  for (const anchor of document.querySelectorAll('a[href]')) {
    const target = new URL(anchor.getAttribute('href'), location.href);
    if (target.origin === location.origin) {
      target.searchParams.set('ref', referral.toUpperCase());
      anchor.setAttribute('href', target.pathname + target.search + target.hash);
    }
  }
}
// Existing product hash URLs retain the Flutter shell. Marketing paths need no
// Flutter download. Do not change OAuth or Response Asset Hosting rewrites.
let appStarted = false;
function startProduct() {
  if (!location.hash.startsWith('#/') || appStarted) return;
  appStarted = true;
  document.getElementById('marketing').remove();
  const script = document.createElement('script');
  script.src = '/flutter_bootstrap.js'; script.async = true;
  document.body.appendChild(script);
}
addEventListener('hashchange', startProduct); startProduct();
</script></body>'''
        document = re.sub(r'<body>.*?</body>', lambda _: body, document, flags=re.S)
        document = document.replace('</head>', '''<style>
body{margin:0;background:#071525;color:#fff;font:18px/1.6 system-ui,sans-serif}
main{max-width:1040px;margin:auto;padding:28px}nav{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
a{color:#45dfbd}section{padding:24px 0;border-bottom:1px solid #29445b}
a:focus-visible{outline:3px solid white;outline-offset:5px}nav a,footer a{display:inline-block;padding:10px 0}
.cta{display:inline-block;background:#45dfbd;color:#071525;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700}
.capabilities{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}h3{font-size:20px}
h1{font-size:clamp(32px,5vw,58px);line-height:1.1}h2{font-size:27px}p{max-width:760px;color:#c6d5e1}
img{max-width:100%;height:auto;margin-top:30px;border-radius:18px}
</style></head>''')
        if staging:
            document = document.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>')
        result[route] = document
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--staging', action='store_true', help='Prevent staging indexing; retain future production canonicals')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for route, document in documents(staging=args.staging).items():
        target = args.output / ('index.html' if route == '/' else route.strip('/') + '/index.html')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(document, encoding='utf-8')
    (args.output / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(
        '<url><loc>https://scaledcircle.com' + route + '</loc></url>' for route in ROUTES) + '</urlset>', encoding='utf-8')
    (args.output / 'robots.txt').write_text('User-agent: *\nDisallow: /\n' if args.staging else 'User-agent: *\nAllow: /\nSitemap: https://scaledcircle.com/sitemap.xml\n', encoding='utf-8')
    sources = [SCREENS / f for f in ['public_landing_screen.dart', 'business_funnel_screen.dart', 'scaler_funnel_screen.dart']]
    sources += [ROOT / 'apps/mobile/lib/services/subscription_plan_service.dart']
    manifest = {'status': 'LOCAL_CANDIDATE_NOT_PRODUCTION_APPROVED',
                'copyScope': 'Existing hero and workflow copy; full visual/feature parity review remains',
                'sourceHashes': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
    (args.output / 'candidate-manifest.json').write_text(json.dumps(manifest, indent=2))
    print('Five visible HTML route candidates prepared; production promotion requires approval and full app-route regression.')

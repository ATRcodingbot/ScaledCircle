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
    hero = 'Put local marketing into motion.'
    intro = 'Choose the area. Set the work and pay. A Scaler carries out the campaign, and you review the tracked route before approving completed work.'
    assert hero in landing and intro in landing
    how = landing.split('class _HowItWorks ')[1].split('\nclass ')[0]
    steps = re.findall(r"title:\s*'([^']+)',\s*body:\s*'([^']+)'", how)
    assert len(steps) == 3
    plans = (ROOT / 'apps/mobile/lib/services/subscription_plan_service.dart').read_text(encoding='utf-8')
    prices = re.findall(r"'name': '([^']+)',\s*'price': ([0-9.]+)", plans)
    assert len(prices) == 4
    pricing = [(name + (' - LIMITED BETA' if name == 'Managed Growth' else ''),
                '$' + format(float(price), '.0f') + '/month') for name, price in prices]
    def heading(name):
        section = landing.split('class ' + name + ' ')[1].split('\nclass ')[0]
        match = re.search(r"title:\s*'([^']+)',\s*subtitle:\s*'([^']+)'", section)
        if not match:
            raise ValueError('Public heading extraction changed: ' + name)
        return match.groups()
    scaler = ('Know the work and pay before you apply.',
              'Choose from available local campaigns that fit your preferences. Work availability varies by area; creating a profile does not guarantee a job.')
    assert all(text in landing for text in scaler)
    return {'/': [(hero, intro), heading('_BusinessExperience'), *steps,
                  heading('_FieldCampaigns'), scaler, heading('_ManagedGrowth')], '/businesses': funnel('business_funnel_screen.dart'),
            '/scalers': funnel('scaler_funnel_screen.dart'),
            '/how-it-works': [('From a local campaign to work you can review.', 'One clear workflow for the Business and the Scaler.'), *steps],
            '/pricing': [('Choose your plan', 'One Business workspace. Total users including the owner: Starter 1, Growth 3, Scale 5, Managed Growth 10.'), *pricing,
                         ('Add more intelligence', 'Optional recurring add-ons; these never add seats.'),
                         ('Business Assistant - Beta', '+$399/month. Business state, recommendations and next actions; approval remains required.'),
                         ('Lead Generation Research - Beta', '+$699/month. Prospect research, evidence and drafts. Research does not authorize contact or automatic cold outreach.'),
                         ('Growth Department - $2,000/month', 'Managed Growth + Business Assistant Beta + Lead Generation Research Beta. 10 total users. Save $97/month ($1,164/year) versus $2,097 separately. One bundle replaces the three individual recurring charges. Included agent capabilities remain Beta.')]}


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
                    blocks.append('<img width="1200" height="630" loading="lazy" src="https://scaledcircle.com/social/2f453997dd7b59c24aa1246a2e197b3ba05b40817daa678428befeb11c1db28d.png" alt="ScaledCircle public Baltimore planning demo; estimated geography is not verified household coverage">')
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
        if route == '/':
            blocks.append('<section><h2>Pricing</h2><p>Subscription access and campaign costs are separate. Review compensation and platform fees before funding.</p><div class="capabilities">' + ''.join(
                f'<article><h3>{html.escape(name)}</h3><p>{html.escape(price)}</p></article>'
                for name, price in content()['/pricing'][1:5]) + '</div><p>Optional Business Assistant Beta +$399/month and Lead Generation Research Beta +$699/month. Growth Department bundles all three with Managed Growth for $2,000/month; save $97/month.</p><a href="/pricing">Compare plans and add-ons</a></section>')
        blocks.append(cta('Create Scaler Account' if route == '/scalers' else 'Create Business Account'))
        picture = '' if route in ('/', '/pricing') else '<img width="1200" height="630" loading="lazy" src="https://scaledcircle.com/social/2f453997dd7b59c24aa1246a2e197b3ba05b40817daa678428befeb11c1db28d.png" alt="ScaledCircle Smart Mapping: public Baltimore planning demo with estimated homes and an unverified route">'
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
  if (appStarted || (!location.hash.startsWith('#/') && location.pathname !== '/' && location.pathname !== '/login')) return;
  appStarted = true;
  document.getElementById('marketing')?.remove();
  const loading=document.createElement('main'); loading.id='product-loading';
  loading.textContent='Opening ScaledCircle…'; document.body.appendChild(loading);
  const deadline=setTimeout(()=>{if(document.querySelector('flutter-view,flt-glass-pane'))return; loading.textContent='ScaledCircle could not finish loading. ';const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>location.reload();loading.appendChild(retry);},30000);
  addEventListener('flutter-first-frame',()=>{clearTimeout(deadline);loading.remove();},{once:true});
  const script = document.createElement('script');
  script.src = '/flutter_bootstrap.js'; script.async = true;
  document.body.appendChild(script);
}
addEventListener('hashchange', startProduct); startProduct();
</script></body>'''
        if route == '/how-it-works':
            # Keep the same referral and authenticated product bootstrap below.
            # Only this public page receives the new presentation.
            presentation = (ROOT / 'apps/mobile/web/marketing/how-it-works.html').read_text(encoding='utf-8')
            body = '<body class="how-page"><div id="marketing">' + presentation + '</div>\n<script>' + body.split('<script>', 1)[1]
        document = re.sub(r'<body>.*?</body>', lambda _: body, document, flags=re.S)
        document = document.replace('</head>', '''<script>if(location.pathname==='/'||location.pathname==='/login'||location.hash.startsWith('#/')){document.documentElement.classList.add('resolving-session');}</script><style>
.resolving-session #marketing{display:none}
body{margin:0;background:#071525;color:#fff;font:18px/1.6 system-ui,sans-serif}
main{max-width:1040px;margin:auto;padding:28px}nav{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
a{color:#45dfbd}section{padding:24px 0;border-bottom:1px solid #29445b}
a:focus-visible{outline:3px solid white;outline-offset:5px}nav a,footer a{display:inline-block;padding:10px 0}
.cta{display:inline-block;background:#45dfbd;color:#071525;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700}
.capabilities{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}h3{font-size:20px}
h1{font-size:clamp(32px,5vw,58px);line-height:1.1}h2{font-size:27px}p{max-width:760px;color:#c6d5e1}
img{max-width:100%;height:auto;margin-top:30px;border-radius:18px}
</style></head>''')
        if route == '/how-it-works':
            styles = (ROOT / 'apps/mobile/web/marketing/how-it-works.css').read_text(encoding='utf-8')
            # Replace only the delivery stylesheet, never the maintained head,
            # structured metadata or auth-resolution script.
            document = re.sub(r'<style>\s*\.resolving-session #marketing.*?</style>',
                              lambda _: '<style>' + styles + '</style>', document, flags=re.S)
            document = document.replace('<html>', '<html lang="en">')
        if staging:
            document = document.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>')
        result[route] = document
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--staging', action='store_true', help='Prevent staging indexing; retain future production canonicals')
    parser.add_argument('--route', choices=list(ROUTES), help='Overlay only this route; preserve other Hosting files, robots and sitemap')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for route, document in documents(staging=args.staging).items():
        if args.route and route != args.route:
            continue
        target = args.output / ('index.html' if route == '/' else route.strip('/') + '/index.html')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(document, encoding='utf-8')
    if args.route:
        print(f'Prepared only {args.route}; other Hosting paths were not changed. No deployment performed.')
        raise SystemExit(0)
    (args.output / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(
        '<url><loc>https://scaledcircle.com' + route + '</loc></url>' for route in ROUTES) + '</urlset>', encoding='utf-8')
    (args.output / 'robots.txt').write_text('User-agent: *\nDisallow: /\n' if args.staging else 'User-agent: *\nAllow: /\nSitemap: https://scaledcircle.com/sitemap.xml\n', encoding='utf-8')
    sources = [SCREENS / f for f in ['public_landing_screen.dart', 'business_funnel_screen.dart', 'scaler_funnel_screen.dart']]
    sources += [ROOT / 'apps/mobile/lib/services/subscription_plan_service.dart']
    sources += [ROOT / 'apps/mobile/web/marketing' / name for name in ['how-it-works.html', 'how-it-works.css']]
    manifest = {'status': 'LOCAL_CANDIDATE_NOT_PRODUCTION_APPROVED',
                'copyScope': 'Existing hero and workflow copy; full visual/feature parity review remains',
                'sourceHashes': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
    (args.output / 'candidate-manifest.json').write_text(json.dumps(manifest, indent=2))
    print('Five visible HTML route candidates prepared; production promotion requires approval and full app-route regression.')

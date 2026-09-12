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
    pricing = [(name + (' — Private Beta / Invite Only' if name == 'Managed Growth' else ''),
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
            '/scalers': [*funnel('scaler_funnel_screen.dart'),
                         ('Canvassing with clear accepted pay', 'Review the fixed base compensation and any accepted coverage bonus before accepting. Automatic route tracking supports review; residential photos are not required. This is not pure-commission work or an employment offer.'),
                         ('Share work opportunities', 'Refer Businesses or Scalers under the referral program. Signup alone earns no cash reward, and a referral reward never reduces the referred Scaler’s earned pay.')],
            '/referrals': [('Refer Businesses. Refer Scalers.', 'Share ScaledCircle with people who may find it useful. Rewards require qualifying authoritative economic events.'),
                           ('Refer a Business', 'Earn 10% of qualifying retained recurring ScaledCircle subscription revenue. Single-level referrals only.'),
                           ('Refer a Scaler', "Earn 1% of final approved compensation from qualifying completed work. This does not come out of the Scaler's pay. ScaledCircle funds the reward separately."),
                           ('Honest reward states', 'Signing up alone does not create a cash reward. Earned, available and paid are different states. Payout availability remains subject to certification and eligibility; no immediate cash-out is promised.')],
            '/how-it-works': [('From a local campaign to work you can review.', 'One clear workflow for the Business and the Scaler.'), *steps],
            '/pricing': [('Choose your plan', 'One Business workspace. Total users including the owner: Starter 1, Growth 3, Scale 5, Managed Growth 10.'), *pricing,
                         ('Controlled premium access', 'These capabilities are not generally available for purchase. Access requires an invitation; add-ons never add seats.'),
                         ('Business Assistant — Beta / Coming Soon', 'Planned recurring price: $399/month. Business information and recommended next steps.'),
                         ('Lead Generation Research — Private Beta / Coming Soon', '$699/month when authorized. Prospect research, evidence and drafts. Research does not authorize outreach.'),
                         ('Email Marketing — Coming Soon', 'Business-owned marketing campaigns are not available at launch. Account messages, billing receipts and Growth reports remain active.'),
                         ('YouTube — Coming Soon', 'Customer YouTube management is not available at launch.'),
                         ('Supported Social channels', 'Facebook and Instagram support Business connection and permission review. Publishing requires separate approved content and execution authority. Customer X is Coming Soon.'),
                         ('Postcards — Private Beta', 'Choose an area, create and approve a design, and arrange fulfillment with ScaledCircle. General ordering is held until physical fulfillment certification.'),
                         ('Growth Department — Private Beta', '$2,000/month when authorized. Managed Growth, Business Assistant and Lead Generation Research; 10 total users. No public purchase is enabled.')]}


def documents(*, staging=False):
    template = (ROOT / 'apps/mobile/web/index.html').read_text(encoding='utf-8')
    links = ''.join('<a href="' + route + '">' + label + '</a>' for route, label in
                   [('/businesses', 'Businesses'), ('/scalers', 'Scalers'),
                    ('/how-it-works', 'How it works'), ('/pricing', 'Pricing'), ('/referrals', 'Referral Program'), ('/#/login', 'Log in')])
    navigation = ('<a class="brand" href="/" aria-label="ScaledCircle home"><img src="/assets/assets/brand/scaledcircle-lockup-dark-surface.png" alt="ScaledCircle" width="192" height="64"></a>'
                  '<div class="desktop-links">' + links + '</div><details class="mobile-menu"><summary>Menu</summary><div>' + links + '</div></details>')
    result = {}
    for route, sections in content().items():
        document = render(template, route).replace('$FLUTTER_BASE_HREF', '/')
        primary = ('Create Scaler Account', '/#/scalers') if route == '/scalers' else ('Grow My Business', '/#/businesses')
        cta = lambda label: f'<p><a class="cta" href="{primary[1]}">{label}</a></p>'
        blocks = []
        for index, (title, body) in enumerate(sections):
            if route == '/pricing' and 1 <= index <= 4:
                if index == 1:
                    blocks.append('<h2>Available now</h2><section class="plans" aria-label="Available Business plans">')
                if index == 4:
                    blocks.append('</section><h2>Private Beta / Invite Only</h2><section class="plans" aria-label="Private Beta plans">')
                seats = [1, 3, 5, 10][index - 1]
                blocks.append(f'<article><h2>{html.escape(title)}</h2><p class="price">{html.escape(body)}</p><p>{seats} total Business {"user" if seats == 1 else "users"}, including the owner.</p><p>Customers &amp; leads, schedule, jobs and tasks included.</p><p>{"Invite Only" if index == 4 else "Available"}</p></article>')
                if index == 4:
                    blocks.append('</section>')
                continue
            tag = 'h1' if index == 0 else 'h2'
            blocks.append(f'<section><{tag}>{html.escape(title)}</{tag}><p>{html.escape(body)}</p></section>')
            if index == 0:
                blocks.append(cta(primary[0]))
                if route == '/':
                    blocks.append('<p><a href="/#/scalers">Become a Scaler</a> · <a href="/how-it-works">See How It Works</a></p>')
                    blocks.append('<section class="example"><p class="eyebrow">A workflow example</p><h2>A contractor has a neighborhood in mind.</h2><p>Choose the area, define the work and accepted pay, then review the Scaler’s tracked route. Residents can respond through configured QR codes and landing pages. Recorded responses stay connected to their campaign.</p><p>This explains the workflow; it does not promise leads, conversions or revenue.</p></section>')
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
                for name, price in content()['/pricing'][1:5]) + '</div><p>Managed Growth and premium tools have controlled access. No add-on is included unless your plan or subscription explicitly includes it.</p><a href="/pricing">Compare plans and availability</a></section>')
        blocks.append(cta('Create Scaler Account' if route == '/scalers' else 'Create Business Account'))
        picture = ''
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
        if route in ('/how-it-works', '/businesses', '/scalers'):
            # Keep the same referral and authenticated product bootstrap below.
            # Only this public page receives the new presentation.
            shared = (ROOT / 'apps/mobile/web/marketing/how-it-works.html').read_text(encoding='utf-8')
            presentation = shared
            if route != '/how-it-works':
                header = shared.split('<div class="hero-band">', 1)[0]
                header = header.replace('href="/how-it-works/#workflow"', f'href="{route}/#workflow"').replace('Skip to how it works', 'Skip to the workflow')
                header = header.replace(' aria-current="page"', '')
                header = header.replace(f'href="{route}"', f'href="{route}" aria-current="page"')
                footer = '<footer' + shared.split('<footer', 1)[1]
                presentation = header + (ROOT / f'apps/mobile/web/marketing/{route[1:]}.html').read_text(encoding='utf-8') + footer
            body = '<body class="how-page"><div id="marketing">' + presentation + '</div>\n<script>' + body.split('<script>', 1)[1]
        document = re.sub(r'<body>.*?</body>', lambda _: body, document, flags=re.S)
        document = document.replace('</head>', '''<script>if(location.pathname==='/'||location.pathname==='/login'||location.hash.startsWith('#/')){document.documentElement.classList.add('resolving-session');}</script><style>
.resolving-session #marketing{display:none}
body{margin:0;background:#071525;color:#fff;font:18px/1.6 system-ui,sans-serif}
*{box-sizing:border-box}main{max-width:1160px;margin:auto;padding:28px}nav{display:flex;gap:24px;align-items:center;justify-content:space-between;padding-bottom:28px;border-bottom:1px solid #29445b}.desktop-links{display:flex;gap:18px;align-items:center}.mobile-menu{display:none}.brand img{width:192px;height:64px;object-fit:contain;margin:0;border-radius:0}nav>.cta{display:none}
a{color:#45dfbd}section{padding:24px 0;border-bottom:1px solid #29445b}
a:focus-visible{outline:3px solid white;outline-offset:5px}nav a,footer a{display:inline-block;padding:10px 0}
.cta{display:inline-block;background:#45dfbd;color:#071525;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700}
.capabilities{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}h3{font-size:20px}
h1{font-size:clamp(32px,5vw,58px);line-height:1.1}h2{font-size:27px}p{max-width:760px;color:#c6d5e1}
img{max-width:100%;height:auto;margin-top:30px;border-radius:18px}
.plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.plans article,.capabilities article{padding:24px;border:1px solid #29445b;border-radius:18px;background:#0b1d30}.plans h2{font-size:24px}.price{font-size:32px;font-weight:700;color:#fff}.example{margin-top:36px;padding:28px;background:#102b42;border-radius:20px}.eyebrow{text-transform:uppercase;letter-spacing:1px;font-size:14px}.mobile-menu summary{cursor:pointer;min-height:48px;padding:12px;list-style:none}.mobile-menu div{position:absolute;right:0;top:48px;z-index:5;padding:16px;background:#102b42;border:1px solid #29445b;border-radius:12px;min-width:220px}.mobile-menu a{display:block;padding:12px}summary:focus-visible{outline:3px solid white;outline-offset:4px}a{overflow-wrap:anywhere}section{padding-block:36px}
@media(max-width:1100px){.desktop-links{display:none}.mobile-menu{display:block;position:relative}main{padding:20px}nav{gap:12px}.brand img{width:160px}.plans{grid-template-columns:1fr}h1{font-size:38px}.example{padding:22px}}
</style></head>''')
        if route in ('/how-it-works', '/businesses', '/scalers'):
            styles = (ROOT / 'apps/mobile/web/marketing/how-it-works.css').read_text(encoding='utf-8')
            if route != '/how-it-works':
                styles += (ROOT / 'apps/mobile/web/marketing/audience-pages.css').read_text(encoding='utf-8')
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
    print('Six visible HTML route candidates prepared; production promotion requires approval and full app-route regression.')

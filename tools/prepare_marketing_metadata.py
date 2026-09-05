"""Generate route metadata candidates without changing Hosting or page content."""
import argparse
import html
import json
from pathlib import Path
import re

ROUTES = {
    '/': ('ScaledCircle: Local Marketing and Verified Field Work',
          'Plan local marketing and review verified field work. Explore ScaledCircle for Maryland businesses and local Scalers.'),
    '/businesses': ('Local Business Campaigns in Maryland — ScaledCircle',
                    'Plan local campaigns, coordinate Scalers, and review completion evidence for your Maryland business.'),
    '/scalers': ('Scaler Field Work in Maryland — ScaledCircle',
                 'Explore local field assignments, agreed compensation, job evidence, and earnings with ScaledCircle.'),
    '/how-it-works': ('How ScaledCircle Works',
                      'Follow the ScaledCircle workflow from campaign planning and assignment to completion evidence and Business review.'),
    '/pricing': ('ScaledCircle Pricing',
                 'Compare ScaledCircle Business tools and plans. Review subscription options separately from campaign fulfillment costs.'),
}


def render(template, route):
    title, description = ROUTES[route]
    canonical = 'https://scaledcircle.com' + route
    def replace(pattern, value):
        nonlocal template
        template, count = re.subn(pattern, lambda _: value, template, flags=re.S)
        if count != 1:
            raise ValueError('Expected exactly one maintained metadata field: ' + pattern)
    replace(r'<title>.*?</title>', '<title>' + html.escape(title) + '</title>')
    for attribute, key, value in [('name', 'description', description),
                                  ('property', 'og:title', title), ('property', 'og:description', description),
                                  ('property', 'og:url', canonical), ('name', 'twitter:title', title),
                                  ('name', 'twitter:description', description)]:
        replace(r'<meta ' + attribute + '="' + key + r'" content="[^"]*">',
                f'<meta {attribute}="{key}" content="{html.escape(value, quote=True)}">')
    replace(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{canonical}">')
    schema = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title,
              'description': description, 'url': canonical,
              'isPartOf': {'@type': 'WebSite', 'name': 'ScaledCircle', 'url': 'https://scaledcircle.com/'}}
    replace(r'<script type="application/ld\+json">.*?</script>',
            '<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False) + '</script>')
    return template


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    template = (root / 'apps/mobile/web/index.html').read_text(encoding='utf-8')
    documents = {route: render(template, route) for route in ROUTES}
    args.output.mkdir(parents=True, exist_ok=True)
    for route, document in documents.items():
        (args.output / ((route.strip('/') or 'home') + '.html')).write_text(document, encoding='utf-8')
    print('Five metadata candidates prepared. Not prerendered, built, routed, or deployed.')

"""Package the campaign-management web client on the retained GA4 release."""
import argparse
import urllib.request
import prepare_mapping_21061_hosting as base

base.STATE = base.ROOT / '.firebase/campaign-management/hosting'
base.BASE_STATE = base.ROOT / '.firebase/ga4-hosting-20260927'
base.BASE = base.BASE_STATE / 'public'
base.PUBLIC = base.STATE / 'public'
base.CONFIG = base.ROOT / 'firebase.campaign-management.private.json'
base.MAINTAINED = base.BASE_STATE / 'firebase.hosting.private.json'
base.MANIFEST = base.STATE / 'manifest.private.json'
base.EXPECTED_LIVE = 'sites/scaled-circle/versions/f70910ac1cd42499'

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha',required=True)
    parser.add_argument('--verify',action='store_true')
    args = parser.parse_args()
    if not args.verify:
        prior = base.read(base.BASE_STATE / 'manifest.private.json')['packageFiles']
        for name in sorted(base.EXTRA_PAGES | {'main.dart.js','index.html','analytics.js'}):
            with urllib.request.urlopen('https://scaledcircle.com/' + name,timeout=45) as response:
                if base.sha(response.read()) != prior[name]:
                    raise RuntimeError('Current served baseline differs: ' + name)
    manifest = base.verify(args.source_sha) if args.verify else base.prepare(args.source_sha)
    print({'source':manifest['sourceSha'],'mainDartJsSha256':manifest['mainDartJsSha256'],
           'retainedExtraFiles':list(manifest['retainedExtraFiles']),'deployed':False})

"""Assemble the reviewed cash-out overlay; never deploy or execute finance."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--archive', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--permit-file', required=True)
parser.add_argument('--function-inventory', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
out = Path(args.output).resolve()
if not out.is_relative_to(root / '.firebase'):
    raise ValueError('Private assembly output must remain inside .firebase')
archive = Path(args.archive)
expected = 'b9b0c84348d57fa27305719e71fddf40c396b20efa4eafea9a69dccad6175355'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
permit = json.loads(Path(args.permit_file).read_text(encoding='utf-8-sig'))
assert permit['version'] == 'FounderAuthorizedPhysicalWorkV1'
assert permit['baseCents'] == 300 and permit['bonusCents'] == 0 and permit['maximumChargeCents'] == 360
inventory = json.loads(Path(args.function_inventory).read_text(encoding='utf-8-sig'))
funding = next(f for f in inventory if f['name'].endswith('/createCampaignFundingCheckoutSession'))
assert funding['serviceConfig']['revision'] == 'createcampaignfundingcheckoutsession-00007-nov'
assert funding['serviceConfig']['environmentVariables']['LIVE_PAID_WORK_ACTIVATION_ENABLED'] == 'false'

cashout = out / 'cashout'
cashout.mkdir(parents=True, exist_ok=True)
for source in (root / 'functions-scaler-cashout').iterdir():
    if source.is_file() and (source.suffix == '.js' or source.name in ['package.json', 'package-lock.json']):
        shutil.copy2(source, cashout / source.name)
assert not (cashout / 'scaler_cashout.js').exists()  # TEST store must be absent.
for source in cashout.glob('*.js'):
    assert 'test_fixtures/' not in source.read_text(encoding='utf-8')
funding_dir = out / 'campaign-funding'
with zipfile.ZipFile(archive) as bundle:
    for name in bundle.namelist():
        assert (funding_dir / name).resolve().is_relative_to(funding_dir.resolve())
    bundle.extractall(funding_dir)
entry = (funding_dir / 'index.js').read_text(encoding='utf-8')
before = "require('./paid_work_launch_gate').assertNewPaidWork({\n      project: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT\n    });"
assert entry.count(before) == 1
entry = entry.replace(before, "await require('./live_work_certification_gate').assertFunding({db,input,quoteForCampaign:lifecycle.quoteForCampaign,project:process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT});", 1)
before = "await require('./market_work_geography').requireCampaign(db, {\n      ...input.campaign,\n      serviceArea: zones.flatMap(z => z.data().serviceArea || [])\n    });"
assert entry.count(before) == 1
entry = entry.replace(before, "await require('./live_work_certification_gate').requireWorkArea({db,quoteForCampaign:lifecycle.quoteForCampaign,input:{...input,campaign:{...input.campaign,serviceArea:zones.flatMap(z=>z.data().serviceArea||[])}},project:process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT});", 1)
(funding_dir / 'index.js').write_text(entry, encoding='utf-8')
for name in ['live_work_certification_gate.js', 'live_work_certification_policy.js', 'scaler_cashout_shared.js']:
    shutil.copy2(root / 'functions' / name, funding_dir / name)

def environment(folder, values):
    # JSON as a single-quoted dotenv value; no shell interpolation or secrets.
    assert all('\n' not in str(v) and "'" not in str(v) for v in values.values())
    (folder / '.env.scaled-circle').write_text('\n'.join(f"{k}='{v}'" for k, v in values.items())+'\n', encoding='utf-8')

permit_json = json.dumps(permit, separators=(',', ':'))
environment(cashout, {'APP_ENV':'production', 'SCALEDCIRCLE_CASHOUT_LIVE_ENABLED':'true',
    'SCALEDCIRCLE_STRIPE_PLATFORM_ID':'acct_1U328bI9d5xWNArH',
    'LIVE_PAID_WORK_ACTIVATION_ENABLED':'false', 'LIVE_WORK_CERTIFICATION_JSON':permit_json})
keep = ['APP_ENV', 'CANVASSING_NEW_CONTRACTS_ENABLED', 'CANVASSING_POLICY_EFFECTIVE_FROM_MS',
    'INTERNAL_SUBSCRIPTION_CERTIFICATION_ENABLED', 'LIVE_PAID_WORK_ACTIVATION_ENABLED',
    'RELEASE_SOURCE_SHA', 'UNUSED_WORK_REFUNDS_ENABLED']
values = {k: v for k, v in funding['serviceConfig']['environmentVariables'].items() if k in keep}
values['LIVE_WORK_CERTIFICATION_JSON'] = permit_json
environment(funding_dir, values)
config = {'functions':[
    {'source':str(cashout.relative_to(root)).replace('\\','/'), 'codebase':'scaler-cashout-live',
     'ignore':['node_modules','.git','*.log']},
    {'source':str(funding_dir.relative_to(root)).replace('\\','/'), 'codebase':'campaign-funding',
     'ignore':['node_modules','.git','*.log']},
]}
(root / 'firebase.live-cashout.private.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
manifest = {str(f.relative_to(out)):hashlib.sha256(f.read_bytes()).hexdigest()
    for folder in [cashout, funding_dir] for f in folder.rglob('*') if f.is_file() and 'node_modules' not in f.parts}
(out / 'manifest.private.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('Assembled exact funding overlay and isolated cash-out source. No deployment or financial execution.')

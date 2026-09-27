"""Promote the bounded campaign-management overlay on captured live sources.

No capture/retry loop or environment/IAM/provider-setting mutation. Every
existing target is checked against its retained generation, config and IAM.
"""
import argparse
import json
from pathlib import Path
import subprocess
import deploy_mapping_correction_overlay as base

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.firebase/campaign-management'
TARGETS = ('applyToCampaign', 'assignScalerToCampaignLocations', 'assignScalerToZone',
           'configureZoneGroupAssignment', 'acceptZoneGroupSlot', 'startTrackingSession',
           'initializeCampaignCompletion', 'startCampaignCompletion', 'publishFundedCampaign',
           'stripeWebhook', 'cancelUnassignedFundedCampaign', 'deleteDraftCampaign', 'businessOperationsV1')
base.STATE, base.TARGETS = STATE, TARGETS
# startAssignedZone has no deployed us-east1 service; do not create one here.


def prepare(source_sha):
    branch = base.candidate(source_sha)
    manifest_file = STATE / 'promotion-manifest.private.json'
    baseline_file = STATE / 'management-baselines.private.json'
    if manifest_file.exists() or baseline_file.exists():
        raise RuntimeError('Retained promotion evidence already exists')
    entries, baselines = [], []
    for name in TARGETS:
        directory = STATE / 'baselines' / name
        original = base.read(directory / 'metadata.private.json')
        live_source = base.validate_metadata(name, original)
        baseline = {'name': name, 'metadataFile': str(directory / 'metadata.private.json'),
                    'metadataSha256': base.sha(directory / 'metadata.private.json'),
                    'iamFile': str(directory / 'iam-baseline.private.json'),
                    'iamSha256': base.sha(directory / 'iam-baseline.private.json'),
                    'archive': str(directory / 'source.zip'), 'archiveSha256': base.sha(directory / 'source.zip'),
                    'base': str(directory / 'base'), 'files': base.source_hashes(directory / 'base'),
                    'liveSource': live_source}
        output = STATE / 'packages' / name
        result = subprocess.run(['node', str(ROOT / 'tools/prepare_campaign_management_overlay.cjs'),
                                 name, baseline['base'], str(output)], capture_output=True, cwd=ROOT)
        if result.returncode:
            (STATE / (name + '-prepare.private.log')).write_bytes(result.stdout + b'\n' + result.stderr)
            raise RuntimeError('Narrow overlay failed; inspect private diagnostic')
        changed = json.loads(result.stdout)['changed']
        files = base.source_hashes(output)
        actual = sorted(k for k in set(files) | set(baseline['files']) if files.get(k) != baseline['files'].get(k))
        if actual != sorted(changed) or not actual or files['package-lock.json'] != baseline['files']['package-lock.json']:
            raise RuntimeError('Unexpected package/lock delta')
        if not set(baseline['files']).issubset(files):
            raise RuntimeError('Existing deployed source was removed')
        entries.append({'name':name, 'output':str(output), 'files':files, 'changedFiles':actual, 'baseline':baseline})
        baselines.append(baseline)
    base.write_new(baseline_file, {'targets':TARGETS, 'entries':baselines})
    base.write_new(manifest_file, {'sourceSha':source_sha,'branch':branch,'entries':entries})
    print(json.dumps({'sourceSha':source_sha,'targets':[{'name':e['name'],'changedFiles':e['changedFiles']} for e in entries]}),flush=True)


def verified_baselines():
    manifest = base.read(STATE / 'management-baselines.private.json')
    if sorted(e['name'] for e in manifest['entries']) != sorted(TARGETS):
        raise RuntimeError('Unexpected target inventory')
    for e in manifest['entries']:
        for file_key, hash_key in [('metadataFile','metadataSha256'),('iamFile','iamSha256'),('archive','archiveSha256')]:
            if base.sha(Path(e[file_key])) != e[hash_key]:
                raise RuntimeError('Retained baseline changed')
        base.verify_source(Path(e['base']),e['files'])
        if base.validate_metadata(e['name'],base.read(Path(e['metadataFile']))) != e['liveSource']:
            raise RuntimeError('Generation mismatch')
    return manifest['entries']


base.baselines = verified_baselines
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','verify','deploy'])
    parser.add_argument('name',nargs='?',choices=TARGETS)
    parser.add_argument('--source-sha',required=True)
    args = parser.parse_args()
    if args.action == 'prepare':
        if args.name:
            parser.error('Prepare has no target argument')
        prepare(args.source_sha)
    else:
        if not args.name:
            parser.error('Choose one exact existing target')
        base.promote(args.name,args.source_sha,verify_only=args.action=='verify')

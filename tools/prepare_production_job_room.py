"""Build a narrowly patched production Job Room package from its pinned archive.

No network or deployment. The input is the verified deployed source archive;
the output must be private. Preserve the deployed handler with explicit privacy,
production evidence and workspace-authority adapters. Never includes QA authority.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ARCHIVE_SHA = 'c4af6705ff473cd7c4209362595149945909c4830b96fd23bea32b8d664106b8'

def prepare(archive, output):
    root = Path(__file__).resolve().parents[1]
    output = output.resolve()
    if not output.is_relative_to((root / '.firebase').resolve()):
        raise ValueError('Output must remain in private .firebase packaging storage')
    raw = archive.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA:
        raise ValueError('Deployed archive identity mismatch')
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            if entry.is_dir():
                continue
            target = (output / entry.filename).resolve()
            if not target.is_relative_to(output):
                raise ValueError('Invalid archive path')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bundle.read(entry))
    path = output / 'index.js'
    source = path.read_bytes().decode().replace('\r', '')
    start = source.index('exports.getJobRoom =')
    before, handler = source[:start], source[start:]
    handler = handler.replace('new Set(["zoneId"])', 'new Set(["zoneId", "privacyVersion"])', 1)
    marker = '  const zoneId = String(request.data?.zoneId || "").trim();'
    guard = '''  if (request.data?.privacyVersion !== require('./policy').VERSION) {
    throw new HttpsError('failed-precondition', 'Update ScaledCircle to open this Job Room. Refresh the web page or install the latest production app.');
  }
  const authRecord = await require('firebase-admin/auth').getAuth().getUser(request.auth.uid);
  if (authRecord.disabled || !authRecord.emailVerified ||
      (!context.isAdmin && context.user.active !== true)) {
    throw new HttpsError('permission-denied', 'An enabled, verified approved account is required.');
  }
'''
    if handler.count(marker) != 1:
        raise ValueError('Unexpected deployed handler structure')
    handler = handler.replace(marker, guard + marker, 1)
    marker = '  const zone = zoneSnapshot.data() || {};'
    identity = '''
  if (zone.campaignId !== room.campaignId || zone.businessId !== room.businessId || campaign.businessId !== room.businessId) {
    throw new HttpsError('permission-denied', 'Job Room assignment binding is unavailable.');
  }
  const privacy = require('./job_room_privacy');
  const privateAllowed = privacy.activeAssignment(context.uid, {...room,id:zoneId}, zone, campaign, participant);
'''
    handler = handler.replace(marker, marker + identity, 1)
    marker = '  return {\n    viewerRole:'
    if handler.count(marker) != 1:
        raise ValueError('Unexpected deployed response structure')
    handler = handler.replace(marker, '  const response = {\n    viewerRole:', 1)
    marker = '  };\n});'
    if handler.count(marker) != 1:
        raise ValueError('Unexpected deployed response tail')
    handler = handler.replace(marker, '''  };
  Object.assign(response, await require('./job_room_completion_summary').read({db,room,zone,zoneId,actor:context}));
  const evidence = await require('./production_job_room_evidence').read({db,zoneId,uid:context.uid,isAdmin:context.isAdmin});
  if (evidence) response.completionEvidence = evidence;
  const extras=await require('./production_job_room_extras').read({db,FieldValue,Timestamp,zoneId,uid:context.uid,isAdmin:context.isAdmin,evidence});
  Object.assign(response,extras);
  if (context.isAdmin || (context.role === 'business' && context.uid === campaign.businessId)) return response;
  if (context.role !== 'scaler') throw new HttpsError('permission-denied', 'Scaler authority required.');
  const safe = privacy.scalerResponse(response, privateAllowed);
  if (evidence) safe.completionEvidence = evidence;
  Object.assign(safe,extras);
  return safe;
});''', 1)
    path.write_text(before + handler, encoding='utf-8', newline='\n')
    import subprocess
    adapter = "const fs=require('fs');const p=process.argv[1];fs.writeFileSync(p,require('./tools/production_workspace_adapter.cjs').adapt(fs.readFileSync(p,'utf8'),'getJobRoom'));"
    subprocess.run(['node', '-e', adapter, str(path)], cwd=root, check=True)
    for name in ['policy.js', 'job_room_privacy.js']:
        (output / name).write_bytes((root / 'functions-logistics-access' / name).read_bytes())
    # Shared policy modules come from the deterministic production generator;
    # the current deployed Job Room and privacy adapter remain the base.
    candidate = root / '.firebase/production-engineering/tracking'
    import re
    copied = set()
    def policy_copy(name):
        if name in copied:
            return
        copied.add(name)
        source_path = root / 'functions' / name if name in ['production_job_room_evidence.js','production_job_room_extras.js'] else candidate / name
        content = source_path.read_text(encoding='utf-8')
        (output / name).write_text(content, encoding='utf-8', newline='\n')
        for relative in re.findall(r"require\(['\"]\./([\w_-]+)['\"]\)", content):
            policy_copy(relative + '.js')
    policy_copy('production_job_room_evidence.js')
    policy_copy('production_job_room_extras.js')
    for name in ['job_room_completion_summary.js', 'job_room_participant_labels.js']:
        (output / name).write_bytes((root / 'functions' / name).read_bytes())
    for name in ['workspace_access.js', 'business_workspace.js', 'subscription_entitlements.js', 'legal_consent.js']:
        (output / name).write_bytes((root / 'functions' / name).read_bytes())
    manifest = {p.relative_to(output).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                for p in output.rglob('*') if p.is_file() and 'node_modules' not in p.parts}
    (output.parent / 'job-room-package-manifest.private.json').write_text(json.dumps({
        'baseRevision':'getjobroom-00001-cib','baseArchiveSha256':ARCHIVE_SHA,
        'files':manifest}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.archive,args.output)

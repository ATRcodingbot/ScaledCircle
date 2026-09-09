"""Prepare the reviewed display-only overlay on the deployed production Job Room.

No network or deployment. All tracking, settlement, workspace and privacy
authorization code stays byte-identical to the accepted production archive.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ARCHIVE_SHA = 'f08272d22c430f25bff485ac6149ea5da9b13ff29af8f84c65ea27f46aeeb1ae'

def prepare(archive, output):
    root = Path(__file__).resolve().parents[1]
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA, 'Deployed archive mismatch'
    output = output.resolve()
    assert output.is_relative_to((root / '.firebase').resolve()), 'Private output required'
    output.mkdir(parents=True, exist_ok=True)
    before = {}
    with zipfile.ZipFile(archive) as bundle:
        for name in bundle.namelist():
            target = (output / name).resolve()
            assert target.is_relative_to(output)
            before[name] = bundle.read(name)
            target.write_bytes(before[name])
    index = before['index.js'].decode()
    marker = "  const evidence = await require('./production_job_room_evidence').read({"
    assert index.count(marker) == 1, 'Deployed handler shape changed'
    index = index.replace(marker,
        "  Object.assign(response, await require('./job_room_completion_summary').read({db,room,zone,zoneId,actor:context}));\n" + marker, 1)
    (output / 'index.js').write_bytes(index.encode())
    for name in ['job_room_completion_summary.js', 'job_room_participant_labels.js']:
        (output / name).write_bytes((root / 'functions' / name).read_bytes())
    privacy = (root / 'functions-logistics-access/job_room_privacy.js').read_bytes()
    # Approval and assignment gates must not change as a side effect of display work.
    old_gate = before['job_room_privacy.js'].decode().split('function scalerResponse')[0]
    new_gate = privacy.decode().split('function scalerResponse')[0]
    assert old_gate.replace('\r', '') == new_gate.replace('\r', '')
    (output / 'job_room_privacy.js').write_bytes(privacy)
    report = []
    for path in sorted(output.iterdir()):
        if not path.is_file():
            continue
        old = before.get(path.name)
        new = path.read_bytes()
        report.append({'file': path.name, 'beforeSha256': hashlib.sha256(old).hexdigest() if old else None,
            'afterSha256': hashlib.sha256(new).hexdigest(), 'changed': old != new})
    changed = [item['file'] for item in report if item['changed']]
    assert changed == ['index.js', 'job_room_completion_summary.js', 'job_room_participant_labels.js', 'job_room_privacy.js']
    (output.parent / 'job-room-overlay.private.json').write_text(json.dumps({
        'baseRevision': 'getjobroom-00002-niy', 'baseArchiveSha256': ARCHIVE_SHA,
        'changedFiles': changed, 'files': report}, indent=2))
    print('PASS: display overlay only; original authority/runtime files preserved.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.archive, args.output)

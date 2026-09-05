"""Prepare only canonical manifest-listed media; never deploy or convert images."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import urllib.request


def prepare(manifest_path, output):
    manifest_path, output = Path(manifest_path), Path(output)
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    verified = []
    for item in manifest['media']:
        source = manifest_path.parent / item['file']
        if source.resolve().parent != manifest_path.parent.resolve():
            raise ValueError('Media path escapes manifest directory')
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != item['sha256'] or len(data) != item['bytes']:
            raise ValueError('Canonical bytes mismatch')
        if data[:8] != b'\x89PNG\r\n\x1a\n' or len(data) < 24:
            raise ValueError('Expected canonical PNG')
        if list(struct.unpack('>II', data[16:24])) != item['dimensions']:
            raise ValueError('Canonical dimensions mismatch')
        path = '/social/' + digest + '.png'
        if item['proposedProductionPath'] != path:
            raise ValueError('Noncanonical hosting path')
        verified.append((path, data, digest))
    # Validate every input before writing; output is a merge candidate, not a
    # complete Hosting release (deploying this directory would remove the app).
    for path, data, digest in verified:
        target = output / path.lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != data:
            raise ValueError('Refusing to replace different immutable media')
        target.write_bytes(data)
    return {'files': [{'path': p, 'sha256': h, 'mime': 'image/png'} for p, _, h in verified],
            'deployment': 'NOT_DEPLOYED_MERGE_INTO_VERIFIED_FULL_HOSTING_ARTIFACT',
            'instagram': 'BLOCKED_REQUIRES_APPROVED_JPEG_DERIVATIVES'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Direct image must not redirect')


def verify_response(data, content_type, digest):
    if content_type.split(';')[0].strip().lower() != 'image/png' or data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not a direct PNG response')
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Hosted bytes mismatch')


def verify_live(result):
    opener = urllib.request.build_opener(NoRedirect)
    for item in result['files']:
        # Fixed production host, no caller-controlled URL or credentials.
        with opener.open('https://scaledcircle.com' + item['path'], timeout=20) as response:
            if response.status != 200:
                raise ValueError('Image response must be 200')
            verify_response(response.read(8 * 1024 * 1024 + 1), response.headers.get('Content-Type', ''), item['sha256'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--verify-live', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    result = prepare(root / 'docs/audit-media/meta-20260905/manifest.json', args.output)
    if args.verify_live:
        verify_live(result)
        result['live_verified'] = True
    print(json.dumps(result, indent=2))

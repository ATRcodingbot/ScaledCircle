"""Validate the original iOS39 IPA, then expose only identical bytes to publishing.

No build, application mutation, re-signing, credential output or upload API call.
Codemagic publishing consumes only the staged IPA after this process succeeds.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from verify_ios_production_bundle import inspect
from verify_ios_push import verify as verify_push
from verify_native_branding import verify_source, verify_ipa
from prepare_ios39_source import prepare_source

ROOT = Path(__file__).resolve().parent.parent
APP_SOURCE = 'd60920930c81253f9019c19bed47a3eaf184dd3e'
ORIGINAL_RUN = '6abe5d6c3250e73fa66ee5c9'
IPA_SHA256 = '845c80206f166e9aea4ea56dcdf7f79f768d23bdc9697a08d32cb1dd90cda021'
LOCK_SHA256 = '2d929b3279125c2a0732212aee86ebf51607aaff76f315c9a0ff51e0bbf8ea94'
ARTIFACT_URL = ('https://api.codemagic.io/artifacts/'
                'aac342ad-6408-48ec-91b2-e1b9ca2b1382/'
                '8285af97-4793-46ae-9718-46f6857df6a0/Scaled_Circle.ipa')
REQUIRED_CHECKS = ('provenance', 'content', 'branding', 'push', 'markers', 'signing')
REQUIRED_MARKERS = (
    '(local time)', 'Read your saved research summary.', 'Regional housing estimate',
    'Entered campaign material quantity', 'Notification preferences',
    'Retry device registration', 'Device messaging registration is pending',
    'Send a notification check', 'mobileNotificationsV1', 'getScalerEarningsV1',
    'getScalerCashoutV1', 'getMarketProfileV1', 'Customers', 'Schedule', 'People',
    'until_revoked', 'store_review', 'https://www.openstreetmap.org/copyright',
    'OpenStreetMap contributors', 'Could not open the map licence. Please try again.',
)
FORBIDDEN_MARKERS = ('Staging TEST orders only', 'TEST ROUTE:', 'Verified Earnings',
                     'Total Recorded', 'scaledcircle-staging', 'ios_physical_qa_v3',
                     'android_physical_qa_v3')


class ArtifactRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        if urllib.parse.urlparse(new_url).scheme != 'https':
            raise ValueError('Artifact redirect must use HTTPS')
        redirected = super().redirect_request(request, response, code, message, headers, new_url)
        if redirected is not None:
            # The download destination must never receive the Codemagic API token.
            redirected.remove_header('X-auth-token')
        return redirected


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require_original(path):
    if digest(path) != IPA_SHA256:
        raise ValueError('Original iOS39 artifact hash mismatch')


def fetch_original(destination):
    """One GET of the existing artifact link; no API token or browser credentials."""
    url = os.environ.get('IOS39_RECOVERY_ARTIFACT_URL', '')
    if not url:
        raise ValueError('Missing IOS39_RECOVERY_ARTIFACT_URL')
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'api.codemagic.io' or not parsed.path.lstrip('/').startswith('artifacts/.'):
        raise ValueError('Expected existing Codemagic artifact-specific HTTPS link')
    request = urllib.request.Request(url)
    try:
        opener = urllib.request.build_opener(ArtifactRedirectHandler())
        with opener.open(request, timeout=120) as response:
            data = response.read(50_000_001)
    except urllib.error.HTTPError as error:
        raise ValueError('Artifact retrieval HTTP status ' + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('Artifact retrieval connection failure') from None
    if len(data) > 50_000_000 or hashlib.sha256(data).hexdigest() != IPA_SHA256:
        raise ValueError('Retrieved artifact size/hash mismatch')
    Path(destination).write_bytes(data)


def verify_provenance(_ipa, app_dir):
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=app_dir, text=True).strip()
    if head != APP_SOURCE:
        raise ValueError('Application checkout must remain exact d609209')
    subprocess.run(['git', 'diff', '--exit-code', '--', 'apps/mobile'], cwd=app_dir, check=True)
    if digest(app_dir / 'apps/mobile/pubspec.lock') != LOCK_SHA256:
        raise ValueError('Dependency lock changed')
    return True


def verify_markers(ipa):
    with zipfile.ZipFile(ipa) as archive:
        binary = archive.read('Payload/Runner.app/Frameworks/App.framework/App')
    def contains(marker):
        return any(marker.encode(enc) in binary for enc in ('utf-8', 'utf-16-le', 'utf-16-be'))
    for marker in REQUIRED_MARKERS:
        if not contains(marker):
            raise ValueError('Missing maintained release marker: ' + marker)
    for marker in FORBIDDEN_MARKERS:
        if contains(marker):
            raise ValueError('Forbidden release marker: ' + marker)
    return True


def verify_distribution(ipa):
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run(['ditto', '-x', '-k', str(ipa), folder], check=True)
        apps = list((Path(folder) / 'Payload').glob('*.app'))
        if len(apps) != 1:
            raise ValueError('Expected exactly one application')
        app = apps[0]
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
        signature = subprocess.run(['codesign', '-dvv', str(app)], text=True,
                                   capture_output=True, check=True).stderr
        if 'TeamIdentifier=4RXFR4Q2SA' not in signature or 'Authority=Apple Distribution:' not in signature:
            raise ValueError('Apple Distribution signing identity mismatch')
        signed = subprocess.run(['codesign', '-d', '--entitlements', ':-', str(app)],
                                capture_output=True, check=True)
        entitlements = plistlib.loads(signed.stdout)
        if entitlements.get('get-task-allow') is not False or entitlements.get('com.apple.developer.team-identifier') != '4RXFR4Q2SA':
            raise ValueError('Distribution entitlements mismatch')
        profile = subprocess.run(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')],
                                 capture_output=True, check=True)
        provision = plistlib.loads(profile.stdout)
        if provision.get('ProvisionedDevices') or provision.get('ProvisionsAllDevices'):
            raise ValueError('App Store distribution profile required')
    return True


def production_checks(app_dir):
    def content(ipa):
        return inspect(ipa, '1.0.0', '39', 'production')['content_gate'] == 'PASS'
    def branding(ipa):
        return verify_ipa(ipa, verify_source(app_dir), app_dir).startswith('PASS:')
    def push(ipa):
        result = verify_push(ipa)
        return result['signedPushEntitlement'] == result['provisioningPushEntitlement'] == 'PASS'
    return dict(provenance=lambda ipa: verify_provenance(ipa, app_dir), content=content, branding=branding,
                push=push, markers=verify_markers, signing=verify_distribution)


def validate_and_stage(ipa, output, checks):
    """No publishing-path artifact is created unless every required guard passes."""
    ipa, output = Path(ipa), Path(output)
    if output.exists():
        raise ValueError('Publishing destination must be empty')
    if set(checks) != set(REQUIRED_CHECKS):
        raise ValueError('Missing or unexpected required artifact validation')
    require_original(ipa)
    results = {}
    for name in REQUIRED_CHECKS:
        if checks[name](ipa) is not True:
            raise ValueError('Artifact validation did not pass: ' + name)
        results[name] = 'PASS'
        print(name + ' guard PASS', flush=True)
    require_original(ipa)
    # Stage only byte-identical content after all checks, never an altered/re-signed IPA.
    with tempfile.TemporaryDirectory() as temporary:
        checked = Path(temporary) / 'checked.ipa'
        shutil.copyfile(ipa, checked)
        require_original(checked)
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(checked, output)
    require_original(output)
    return {'applicationSource': APP_SOURCE, 'originalRun': ORIGINAL_RUN,
            'sha256': IPA_SHA256, 'checks': results, 'artifactValidation': 'PASS',
            'rebuilt': False, 'resigned': False, 'upload': 'NOT_YET_ATTEMPTED'}


def recover(app_dir, ipa, download=False):
    app_dir = prepare_source(ROOT, app_dir)
    if download:
        fetch_original(ipa)
    return validate_and_stage(ipa, Path('validated/recovered-ios39.ipa'), production_checks(app_dir))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ipa', type=Path, default=Path('recovered-ios39.original.ipa'))
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--app-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        result = recover(args.app_dir, args.ipa, args.download)
    except (ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit('Recovery stopped before publishing: ' + str(error)) from None
    Path('ios39-validation.safe.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))

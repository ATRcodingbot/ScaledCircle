"""Prepare reviewed public-page spelling overlays; never deploy or regenerate copy.

Use a freshly verified production Hosting package, then the reviewed Flutter web
build. Only maintained public pages receive the spelling overlay. Customer landing
pages, stored artifacts and application data are outside this tool's scope.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil

PAGES = ('businesses/index.html', 'scalers/index.html', 'pricing/index.html',
         'how-it-works/index.html', 'referrals/index.html')


def spelling(data):
    # Preserve every attribute that carries a destination/source/identifier.
    parts = re.split(rb'((?:href|src|id|class|data-[\w-]+)\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27)|(?:https?://|mailto:)[^\s<>"\x27`]+)', data)
    for index in range(0, len(parts), 2):
        parts[index] = re.sub(rb'\bScaledCircle\b', b'Scaled Circle', parts[index])
    return b''.join(parts)


def prepare(baseline, build, output):
    if output.exists():
        raise ValueError('Use a new review output directory; retain prior evidence.')
    for page in PAGES:
        if not (baseline / page).is_file():
            raise ValueError('Required maintained public page missing: ' + page)
    if not (build / 'main.dart.js').is_file():
        raise ValueError('Reviewed Flutter web build is required.')
    shutil.copytree(baseline, output)
    shutil.copytree(build, output, dirs_exist_ok=True)
    changes = {}
    for page in PAGES:
        original = (baseline / page).read_bytes()
        updated = spelling(original)
        (output / page).write_bytes(updated)
        changes[page] = {'before': hashlib.sha256(original).hexdigest(),
                         'after': hashlib.sha256(updated).hexdigest()}
    return changes


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('baseline', 'build', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.baseline, args.build, args.output), indent=2))

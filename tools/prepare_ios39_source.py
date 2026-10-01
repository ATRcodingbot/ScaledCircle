"""Acquire only the frozen app ref via the CI checkout's existing authenticated origin.

Tooling stays checked out separately; no history beyond the exact ref is needed.
Git stderr is deliberately not exposed because authenticated remotes may contain secrets.
"""
from pathlib import Path
import subprocess

APP_SOURCE = 'd60920930c81253f9019c19bed47a3eaf184dd3e'
APP_REF = 'refs/tags/internal-native-parity-d609209'
TRUSTED_REMOTES = {
    'https://github.com/ATRcodingbot/ScaledCircle',
    'https://github.com/ATRcodingbot/ScaledCircle.git',
    'https://ATRcodingbot@github.com/ATRcodingbot/ScaledCircle',
    'https://ATRcodingbot@github.com/ATRcodingbot/ScaledCircle.git',
    'git@github.com:ATRcodingbot/ScaledCircle.git',
}


def git(cwd, *args):
    result = subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise ValueError('Source preparation Git operation failed: ' + args[0])
    return result.stdout.strip()


def acquire_exact_ref(tooling_dir, app_dir, expected=APP_SOURCE, ref=APP_REF):
    tooling_dir, app_dir = Path(tooling_dir).resolve(), Path(app_dir).resolve()
    if tooling_dir == app_dir or tooling_dir in app_dir.parents or app_dir in tooling_dir.parents:
        raise ValueError('TOOLING_DIR and APP_DIR must be separate checkout directories')
    if app_dir.exists():
        raise ValueError('APP_DIR must not already exist')
    tooling_head = git(tooling_dir, 'rev-parse', 'HEAD')
    git(tooling_dir, 'fetch', '--no-tags', '--depth=1', 'origin', ref)
    actual = git(tooling_dir, 'rev-parse', 'FETCH_HEAD^{commit}')
    if actual != expected:
        raise ValueError('Fetched application ref does not match the approved full SHA')
    git(tooling_dir, 'cat-file', '-e', expected + '^{commit}')
    git(tooling_dir, 'cat-file', '-e', expected + '^{tree}')
    git(tooling_dir, 'cat-file', '-e', expected + ':apps/mobile/pubspec.lock')
    git(tooling_dir, 'worktree', 'add', '--detach', str(app_dir), expected)
    if git(app_dir, 'rev-parse', 'HEAD') != expected:
        raise ValueError('Checked-out application HEAD mismatch')
    if git(app_dir, 'status', '--porcelain'):
        raise ValueError('Application checkout is not clean')
    if git(tooling_dir, 'rev-parse', 'HEAD') != tooling_head:
        raise ValueError('Tooling checkout changed')
    print('Exact application ref, commit, tree and separate checkout PASS', flush=True)
    return app_dir


def prepare_source(tooling_dir, app_dir):
    if git(tooling_dir, 'remote', 'get-url', 'origin') not in TRUSTED_REMOTES:
        raise ValueError('Source preparation requires the maintained trusted origin')
    return acquire_exact_ref(tooling_dir, app_dir)

"""Real Git depth-1 regression fixtures; file:// forces transport/shallow semantics."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import prepare_ios39_source as preparation


class ShallowSourceTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.run_git(self.source, 'init', '-b', 'main')
        self.run_git(self.source, 'config', 'user.email', 'fixture@example.invalid')
        self.run_git(self.source, 'config', 'user.name', 'Local Fixture')
        (self.source / 'apps/mobile').mkdir(parents=True)
        (self.source / 'apps/mobile/pubspec.lock').write_text('locked fixture')
        (self.source / 'tools').mkdir()
        (self.source / 'tools/validator.txt').write_text('old validator')
        self.run_git(self.source, 'add', '.')
        self.run_git(self.source, 'commit', '-m', 'frozen app')
        self.app_sha = self.run_git(self.source, 'rev-parse', 'HEAD')
        self.run_git(self.source, 'tag', 'frozen-app')
        (self.source / 'tools/validator.txt').write_text('corrected Scaled Circle validator')
        self.run_git(self.source, 'commit', '-am', 'correct tooling')
        self.tool_sha = self.run_git(self.source, 'rev-parse', 'HEAD')
        self.run_git(self.source, 'tag', 'tooling')
        self.remote = self.root / 'remote.git'
        self.run_git(self.root, 'clone', '--bare', str(self.source), str(self.remote))
        self.tooling = self.root / 'tooling'
        self.run_git(self.root, 'clone', '--depth=1', '--branch', 'tooling', self.remote.as_uri(), str(self.tooling))
        self.app = self.root / 'application'
        self.assertEqual(self.run_git(self.tooling, 'rev-parse', '--is-shallow-repository'), 'true')
        self.assertNotEqual(subprocess.run(['git','cat-file','-e',self.app_sha],cwd=self.tooling,capture_output=True).returncode,0)

    def run_git(self, cwd, *args):
        return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.DEVNULL, text=True).strip()

    def acquire(self, **kwargs):
        return preparation.acquire_exact_ref(self.tooling, self.app, kwargs.get('expected',self.app_sha), kwargs.get('ref','refs/tags/frozen-app'))

    def test_missing_commit_is_fetched_exactly_without_replacing_tooling(self):
        self.acquire()
        self.assertEqual(self.run_git(self.app,'rev-parse','HEAD'),self.app_sha)
        self.assertEqual(self.run_git(self.tooling,'rev-parse','HEAD'),self.tool_sha)
        self.assertEqual((self.tooling/'tools/validator.txt').read_text(),'corrected Scaled Circle validator')
        self.assertEqual((self.app/'tools/validator.txt').read_text(),'old validator')
        self.assertEqual((self.app/'apps/mobile/pubspec.lock').read_text(),'locked fixture')

    def test_wrong_ref_cannot_substitute_moving_or_other_source(self):
        with self.assertRaisesRegex(ValueError,'approved full SHA'):
            self.acquire(ref='refs/tags/tooling')
        self.assertFalse(self.app.exists())

    def test_unavailable_ref_stops_before_checkout(self):
        with self.assertRaisesRegex(ValueError,'fetch'):
            self.acquire(ref='refs/tags/absent')
        self.assertFalse(self.app.exists())

    def test_transport_fetch_failure_stops_before_checkout(self):
        self.run_git(self.tooling,'remote','set-url','origin',(self.root/'missing.git').as_uri())
        with self.assertRaisesRegex(ValueError,'fetch'):
            self.acquire()
        self.assertFalse(self.app.exists())

    def test_wrong_expected_sha_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'approved full SHA'):
            self.acquire(expected='0'*40)
        self.assertFalse(self.app.exists())

    def test_untrusted_origin_rejected_before_fetch(self):
        with self.assertRaisesRegex(ValueError,'trusted origin'):
            preparation.prepare_source(self.tooling,self.app)
        self.assertFalse(self.app.exists())

    def test_checkouts_must_remain_separate(self):
        with self.assertRaisesRegex(ValueError,'separate checkout'):
            preparation.acquire_exact_ref(self.tooling,self.tooling,self.app_sha,'refs/tags/frozen-app')

    def test_post_checkout_head_is_verified(self):
        real_git = preparation.git
        def changed_head(cwd,*args):
            if Path(cwd)==self.app and args==('rev-parse','HEAD'):
                return self.tool_sha
            return real_git(cwd,*args)
        with patch.object(preparation,'git',side_effect=changed_head):
            with self.assertRaisesRegex(ValueError,'HEAD mismatch'):
                self.acquire()


if __name__ == '__main__':
    unittest.main()

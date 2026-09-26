"""Pure/mock guard checks. No build, network request or deployment occurs."""
import unittest
from unittest import mock
import prepare_mapping_21061_hosting as hosting


class HostingCorrectionGuards(unittest.TestCase):
    sha = 'a' * 40

    def test_short_or_invalid_sha_fails_before_git(self):
        with mock.patch.object(hosting, 'git') as git:
            for source in ['a' * 7, 'z' * 40, '']:
                with self.assertRaisesRegex(RuntimeError, 'full pinned'):
                    hosting.verify_candidate(source)
            git.assert_not_called()

    def test_other_head_dirty_or_unpushed_branch_is_rejected(self):
        cases = [(['b' * 40], 'differs'), ([self.sha, ' M file'], 'clean'),
                 ([self.sha, '', 'codex/test', 'b' * 40 + '\trefs/heads/codex/test'], 'pushed')]
        for outputs, message in cases:
            with self.subTest(message=message), mock.patch.object(hosting, 'git', side_effect=outputs):
                with self.assertRaisesRegex(RuntimeError, message):
                    hosting.verify_candidate(self.sha)

    def test_exact_clean_pushed_source_is_accepted(self):
        with mock.patch.object(hosting, 'git', side_effect=[self.sha, '', 'codex/test',
                self.sha + '\trefs/heads/codex/test']):
            hosting.verify_candidate(self.sha)

    def test_live_version_and_configuration_are_both_pinned(self):
        config = {'headers': [], 'rewrites': [{'glob': '**', 'path': '/index.html'}]}
        state = {'versionName': hosting.EXPECTED_LIVE, 'config': config}
        hosting.validate_live(state, config)
        with self.assertRaisesRegex(RuntimeError, 'baseline'):
            hosting.validate_live({**state, 'versionName': 'other'}, config)
        with self.assertRaisesRegex(RuntimeError, 'configuration'):
            hosting.validate_live(state, {})

    def test_config_rejects_unrelated_scope(self):
        base = {'site': 'scaled-circle', 'public': 'reviewed', 'ignore': [],
                'headers': [], 'rewrites': []}
        self.assertEqual(hosting.api_config(base), {'headers': [], 'rewrites': []})
        for extra in [{'redirects': []}, {'site': 'other-site'}, {'predeploy': 'anything'}]:
            with self.assertRaisesRegex(RuntimeError, 'Unexpected'):
                hosting.api_config({**base, **extra})

    def test_prepared_command_is_only_hosting_and_never_a_build(self):
        command = hosting.deployment_command()
        self.assertEqual(command[command.index('--only') + 1], 'hosting')
        self.assertEqual(command[command.index('--project') + 1], 'scaled-circle')
        self.assertNotIn('--force', command)
        self.assertNotIn('functions', command)


if __name__ == '__main__':
    unittest.main()

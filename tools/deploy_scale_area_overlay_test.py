"""Offline tests: cloud and Git subprocesses are always mocked."""
import copy
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import deploy_scale_area_overlay as scale
from deploy_campaign_planner_overlay_test import metadata
from deploy_mapping_qa_overlay_test import policies

SHA = scale.APPROVED_CANDIDATE

def current(name='getSmartZonePlan'):
    value = metadata()
    value['name'] = 'projects/scaled-circle/locations/us-east1/functions/' + name
    value['buildConfig']['source']['storageSource'].update(bucket='source', object='source.zip')
    value['serviceConfig']['timeoutSeconds'] = 60
    return value

class ScalePromotionTests(unittest.TestCase):
    def test_candidate_requires_reviewed_ancestor_unchanged_app_and_pushed_head(self):
        result = lambda text: mock.Mock(returncode=0, stdout=text.encode(), stderr=b'')
        with self.assertRaisesRegex(RuntimeError, 'explicitly reviewed'):
            scale.candidate('b' * 40)
        for changed, untracked in [('functions/index.js',''),('', 'apps/new.js'),('tools/unreviewed.py','')]:
            with mock.patch.object(scale.subprocess,'run',side_effect=[result(x) for x in [SHA,'','',changed,untracked]]):
                with self.assertRaisesRegex(RuntimeError,'application source'):
                    scale.candidate(SHA)
        for status in [' M tools/deploy_scale_area_overlay.py', ' M docs/report.md', '?? tools/new.py']:
            with mock.patch.object(scale.subprocess,'run',side_effect=[result(SHA),result(status)]):
                with self.assertRaisesRegex(RuntimeError,'clean'):
                    scale.candidate(SHA)
        head='b'*40
        good=[head,'','','tools/deploy_scale_area_overlay.py','','codex/review',head+'\trefs/heads/codex/review']
        with mock.patch.object(scale.subprocess,'run',side_effect=[result(x) for x in good]) as run:
            self.assertEqual(scale.candidate(SHA),'codex/review')
            self.assertIn(['git','merge-base','--is-ancestor',SHA,head],[c.args[0] for c in run.call_args_list])
        with mock.patch.object(scale.subprocess,'run',side_effect=[result(x) for x in good[:-1]+['different']]):
            with self.assertRaisesRegex(RuntimeError,'pushed'):
                scale.candidate(SHA)

    def test_preflight_rejects_source_env_build_trigger_timeout_and_iam_drift(self):
        original=current()
        for change in ('source','env','build','trigger','timeout','iam','inactive'):
            after=copy.deepcopy(original);policy=policies()
            if change=='source': after['buildConfig']['source']['storageSource']['generation']='different'
            if change=='env': after['serviceConfig']['environmentVariables']={}
            if change=='build': after['buildConfig']['serviceAccount']='different'
            if change=='trigger': after['eventTrigger']['retryPolicy']='different'
            if change=='timeout': after['serviceConfig']['timeoutSeconds']=180
            if change=='iam': policy['servicePolicy']['bindings']=[]
            if change=='inactive': after['state']='DEPLOYING'
            with self.subTest(change=change),tempfile.TemporaryDirectory() as directory:
                file=Path(directory)/'iam.json';file.write_text(json.dumps(policies()))
                entry={'baseline':{'liveSource':original['buildConfig']['source']['storageSource'],'iamFile':str(file)}}
                with mock.patch.object(scale,'candidate'),mock.patch.object(scale,'load_entry',return_value=(entry,original)),\
                     mock.patch.object(scale,'describe',return_value=after),mock.patch.object(scale,'iam',return_value=policy),\
                     mock.patch.object(scale.subprocess,'run') as run:
                    with self.assertRaises(RuntimeError):scale.preflight('getSmartZonePlan',SHA,Path(directory))
                    run.assert_not_called()

    def invoke(self,name='getSmartZonePlan',change=None,verify=False):
        before=current(name);after=copy.deepcopy(before)
        after['buildConfig']['source']['storageSource']['generation']='new-generation'
        if name=='getSmartZonePlan':after['serviceConfig']['timeoutSeconds']=180
        policy=policies()
        if change=='timeout':after['serviceConfig']['timeoutSeconds']=181
        if change=='env':after['serviceConfig']['environmentVariables']={}
        if change=='iam':policy['servicePolicy']['bindings']=[]
        if change=='same-source':after['buildConfig']['source']['storageSource']=before['buildConfig']['source']['storageSource']
        if change=='inactive':after['state']='DEPLOYING'
        with tempfile.TemporaryDirectory() as directory:
            stream=io.StringIO()
            with mock.patch.object(scale,'STATE',Path(directory)),\
                 mock.patch.object(scale,'preflight',return_value=({'output':'approved-source','sourceTreeSha256':'hash'},before,policies())),\
                 mock.patch.object(scale,'describe',return_value=after),mock.patch.object(scale,'iam',return_value=policy),\
                 mock.patch.object(scale.subprocess,'run',return_value=mock.Mock(returncode=0,stdout=b'PRIVATE',stderr=b'')) as run,\
                 contextlib.redirect_stdout(stream):
                if change:
                    with self.assertRaisesRegex(RuntimeError,'do not continue'):scale.promote(name,SHA,verify_only=verify)
                else:scale.promote(name,SHA,verify_only=verify)
            self.assertNotIn('PRIVATE',stream.getvalue());self.assertNotIn('private-value',stream.getvalue())
            return run.call_args_list

    def test_get_deploy_only_source_and_explicit_approved_timeout(self):
        calls=self.invoke();self.assertEqual(len(calls),1)
        self.assertEqual(calls[0].args[0],[str(scale.GCLOUD),'functions','deploy','getSmartZonePlan','--gen2',
            '--project=scaled-circle','--region=us-east1','--source=approved-source','--timeout=180s','--quiet','--format=json'])

    def test_other_targets_remain_source_only_without_config_iam_or_environment_flags(self):
        for name in ['applySmartZonePlan','getBusinessWorkspaceContext']:
            command=self.invoke(name)[0].args[0]
            self.assertFalse(any(flag.startswith(('--timeout','--set-env','--update-env','--service-account','--allow-unauthenticated','--set-secrets'))for flag in command))
            self.assertIn('--source=approved-source',command)

    def test_read_only_verify_never_deploys(self):
        self.assertEqual(self.invoke(verify=True),[])

    def test_after_readback_only_allows_exact_get_timeout_and_requires_new_active_source(self):
        for change in ['timeout','env','iam','same-source','inactive']:
            with self.subTest(change=change):self.invoke(change=change)

    def test_exact_file_inventory_detects_changes_and_added_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'index.js').write_text('approved')
            hashes=scale.source_hashes(root);scale.verify_source(root,hashes)
            (root/'extra.js').write_text('unapproved')
            with self.assertRaisesRegex(RuntimeError,'inventory'):scale.verify_source(root,hashes)
            (root/'extra.js').unlink();(root/'index.js').write_text('changed')
            with self.assertRaisesRegex(RuntimeError,'contents'):scale.verify_source(root,hashes)

if __name__=='__main__':unittest.main()

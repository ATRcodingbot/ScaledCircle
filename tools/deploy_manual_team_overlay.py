"""Source-only promotion of one verified current-production overlay; no settings or IAM flags."""
import sys,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import deploy_mapping_correction_overlay as helper
from deploy_campaign_planner_overlay import changed_configuration_fields,verify_source
from deploy_mapping_qa_overlay import normalized_iam
STATE=ROOT/'.firebase/manual-team-promotion'
SPECS={'businessOperationsV1':('packages','businessOperationsV1-package.json'),
 'getSmartZonePlan':('packages-v2','getSmartZonePlan-package-v2.json'),
 'applySmartZonePlan':('packages-v2','applySmartZonePlan-package-v2.json'),
 'getCampaignZoneIntelligence':('packages-v3','getCampaignZoneIntelligence-package-v3.json'),
 'confirmCampaignZoneIntelligence':('packages-v2','confirmCampaignZoneIntelligence-package-v2.json')}
def main(name):
 if name not in SPECS:raise RuntimeError('Unexpected deployment target')
 if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT).strip():raise RuntimeError('Release checkout is not clean')
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()
 subprocess.run(['git','merge-base','--is-ancestor','7c32bdad879ba379e19d6ea16cb9ff36076e3d20',head],cwd=ROOT,check=True)
 changed=subprocess.check_output(['git','diff','--name-only','7c32bdad879ba379e19d6ea16cb9ff36076e3d20','HEAD','--','apps/mobile','functions','functions-discovery','functions-business-operations'],cwd=ROOT).strip()
 if changed:raise RuntimeError('Reviewed application changed')
 folder,filename=SPECS[name];package=STATE/folder/name;proof=helper.read(STATE/filename)
 verify_source(package,proof['files'])
 before=helper.read(STATE/'baselines'/name/'metadata.private.json')
 expected_iam=helper.read(STATE/'baselines'/name/'iam-baseline.private.json')
 out=STATE/'deploy'/name;out.mkdir(parents=True,exist_ok=False)
 current=helper.describe(name,out,'immediate-before')
 if current['buildConfig']['source']!=before['buildConfig']['source'] or changed_configuration_fields(before,current):raise RuntimeError('Production baseline changed')
 if normalized_iam(helper.iam(name,current,out,'immediate-iam'))!=normalized_iam(expected_iam):raise RuntimeError('Production IAM changed')
 print(json.dumps({'function':name,'stage':'deploying','source':head,'appSource':proof['candidate'],'configAndIamVerified':True}),flush=True)
 result=subprocess.run([str(helper.GCLOUD),'functions','deploy',name,'--gen2','--project=scaled-circle','--region=us-east1','--source='+str(package),'--quiet','--format=json'],capture_output=True)
 (out/'deployment.private.log').write_bytes(result.stdout+b'\n'+result.stderr)
 if result.returncode:raise RuntimeError('Deployment unconfirmed; inspect private evidence before any retry')
 after=helper.describe(name,out,'after');iam=helper.iam(name,after,out,'after-iam')
 changes=changed_configuration_fields(before,after);same=normalized_iam(iam)==normalized_iam(expected_iam)
 summary={'function':name,'state':after.get('state'),'revision':after['serviceConfig'].get('revision'),'source':head,
  'appSource':proof['candidate'],'changedConfigFields':changes,'iamUnchanged':same,'changedFiles':proof['changedFiles']}
 (out/'deployment.safe.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
 print(json.dumps(summary),flush=True)
 if summary['state']!='ACTIVE' or changes or not same:raise RuntimeError('Post-deployment verification needs review; stopped')
if __name__=='__main__':main(sys.argv[1])

'use strict';
// Rebuild only reviewed billing components into a fresh, private held package.
// No deployment, provider operation, or credential access occurs here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const parser=require(path.join(root,'functions/node_modules/@babel/parser'));
const generate=require(path.join(root,'functions/node_modules/@babel/generator')).default;
const {selectedProgram}=require('../functions/scripts/select_function_program');
const {prepareSource,replaceFunction}=require('./prepare_production_engineering.cjs');
const {productionModule}=require('./prepare_production_workspace.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const compile=(source,names)=>generate(selectedProgram(parser.parse(source),new Set(names)),{comments:true}).code.replaceAll('initializeApp();',"if(!require('firebase-admin/app').getApps().length)initializeApp();")+'\n';
const exported=(body,name)=>{const node=parser.parse(body).program.body.find(n=>n.type==='ExpressionStatement'&&n.expression?.left?.object?.name==='exports'&&n.expression.left.property?.name===name);if(!node)throw Error('Missing export '+name);return generate(node,{comments:false,compact:true}).code;};
function rebase(baseline,destination,legacyBaseline){
 baseline=path.resolve(baseline);destination=path.resolve(destination);legacyBaseline=path.resolve(legacyBaseline);
 if(fs.existsSync(destination)||baseline===destination)throw Error('A fresh private destination is required.');
 const seal=JSON.parse(fs.readFileSync(path.join(baseline,'sealed-package-hashes.private.json')));
 for(const [file,digest]of Object.entries(seal.files))if(hash(fs.readFileSync(path.join(baseline,file)))!==digest)throw Error('Baseline seal changed: '+file);
 fs.cpSync(baseline,destination,{recursive:true,filter:p=>!['node_modules','sealed-package-hashes.private.json'].includes(path.basename(p))});
 const out=path.join(destination,'package');
 let source=replaceFunction(prepareSource(),'publicAppBaseUrl',"function publicAppBaseUrl(){return 'https://scaledcircle.com';}");
 source=source.replace(/const STRIPE_SUBSCRIPTION_SECRET_KEY = defineSecret\([\s\S]*?\);/,'const STRIPE_SUBSCRIPTION_SECRET_KEY=defineSecret("STRIPE_SUBSCRIPTION_LIVE_SECRET_KEY");');
 const groups={default:['getBusinessMembership','previewBusinessMembershipChange','changeBusinessMembership','createSubscriptionCheckoutSession','createBillingPortalSession'],
  'business-profile-core':['prepareInvitedBusinessAccount','getBusinessTeam','inviteBusinessTeamMember','acceptBusinessTeamInvitation','updateBusinessTeamMember','getBusinessWorkspaceContext','selectBusinessWorkspace','listBusinessWorkspaceRecordIds','auditBusinessCampaignDraft']};
 const reviewed=new Set(['workspace_billing.js','workspace_billing_catalog.js','workspace_subscription_sync.js','subscription_contract.js','subscription_entitlements.js']);
 function dependencies(group,body,sourceDirectory=path.join(root,'functions'),seen=new Set()){
  for(const m of body.matchAll(/require\(['"]\.\/([A-Za-z0-9_-]+)['"]\)/g)){
   const name=m[1]+'.js';if(seen.has(name))continue;seen.add(name);
   const content=productionModule(name,fs.readFileSync(path.join(sourceDirectory,name),'utf8'));
   const target=path.join(out,group,name);
   if(fs.existsSync(target)&&!reviewed.has(name)&&fs.readFileSync(target,'utf8').replaceAll('\r','')!==content.replaceAll('\r',''))throw Error('Unreviewed dependency drift: '+group+'/'+name);
   fs.writeFileSync(target,content);dependencies(group,content,sourceDirectory,seen);
  }
 }
 for(const [group,names]of Object.entries(groups)){
  const body=compile(source,names),prior=fs.readFileSync(path.join(baseline,'package',group,'workspace-exports.js'),'utf8');
  if(group==='business-profile-core')for(const name of names.filter(n=>n!=='getBusinessWorkspaceContext'))if(exported(body,name)!==exported(prior,name))throw Error('Unreviewed team export drift: '+name);
  fs.writeFileSync(path.join(out,group,'workspace-exports.js'),body);dependencies(group,body);
 }
 // A previous rebase omitted three still-referenced legacy exports. Preserve
 // their previously reviewed implementations in a separate module; do not
 // merge newer shared-source campaign or Wallet semantics into this package.
 const legacyNames=['deleteDraftCampaign','fundCampaign','purchaseSubscription'];
 const legacyFolder=path.join(legacyBaseline,'package/default'),legacy=fs.readFileSync(path.join(legacyFolder,'workspace-exports.js'),'utf8');
 const legacyBody=compile(legacy,legacyNames);
 for(const name of legacyNames)if(exported(legacyBody,name)!==exported(legacy,name))throw Error('Legacy guard drift: '+name);
 fs.writeFileSync(path.join(out,'default/legacy-commerce-exports.js'),legacyBody);
 dependencies('default',legacyBody,legacyFolder);
 let index=fs.readFileSync(path.join(out,'default/index.js'),'utf8');
 for(const name of legacyNames){const anchor=`exports.${name}=require('./workspace-exports').${name};`;if(index.split(anchor).length!==2)throw Error('Legacy alias missing: '+name);index=index.replace(anchor,`exports.${name}=require('./legacy-commerce-exports').${name};`);}
 fs.writeFileSync(path.join(out,'default/index.js'),index);
 // Billing-only additions in the maintained funding adapter. Its publication,
 // reserve/refund and campaign Checkout exports must remain byte-equivalent ASTs.
 const funding=require('./prepare_production_funding.cjs').prepare().output;
 for(const name of ['index.js','workspace_subscription_sync.js','subscription_contract.js','subscription_entitlements.js'])fs.copyFileSync(path.join(funding,name),path.join(out,'campaign-funding',name));
 const preserved=['publishFundedCampaign','quoteCampaignFunding','createCampaignFundingCheckoutSession','reconcileUnusedWorkReservesV1'];
 for(const name of preserved)if(exported(fs.readFileSync(path.join(baseline,'package/campaign-funding/index.js'),'utf8'),name)!==exported(fs.readFileSync(path.join(out,'campaign-funding/index.js'),'utf8'),name))throw Error('Unreviewed funding export drift: '+name);
 const files={},changes=[];function walk(dir,prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(['node_modules','candidate-manifest.json'].includes(e.name))continue;const file=prefix+e.name,p=path.join(dir,e.name);if(e.isDirectory()){walk(p,file+'/');continue;}const bytes=fs.readFileSync(p);files[file]=hash(bytes);if(e.name.endsWith('.js')&&/scaledcircle-staging|stagingPhysicalQa|physical_qa_v[123]|StagingCanvassing|STRIPE_TEST_SECRET/.test(bytes.toString()))throw Error('Forbidden production marker: '+file);if(!fs.existsSync(path.join(baseline,'package',file))||hash(fs.readFileSync(path.join(baseline,'package',file)))!==files[file])changes.push(file);}}
 walk(out);
 if(changes.some(f=>!/^(default|business-profile-core|campaign-funding)\//.test(f)))throw Error('Unrelated package drift');
 const cfg=JSON.parse(fs.readFileSync(path.join(destination,'firebase.candidate.private.json')));for(const group of cfg.functions)group.source=path.join(out,group.codebase).replaceAll('\\','/');fs.writeFileSync(path.join(destination,'firebase.candidate.private.json'),JSON.stringify(cfg,null,2));
 const result={deployed:false,baseline,source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDirty:!!require('node:child_process').execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),changedFiles:changes,files,filesHash:hash(JSON.stringify(files)),preservedFundingExports:preserved,restoredLegacyExports:legacyNames,legacyBaseline,requiredArtifactRefresh:['Hosting/pricing and authenticated Billing client','iOS/Android presentation; native physical proof unchanged'],productionPromotion:'HELD'};
 fs.writeFileSync(path.join(destination,'billing-catalog-rebase.private.json'),JSON.stringify(result,null,2));return result;
}
if(require.main===module){const r=rebase(...process.argv.slice(2));console.log(JSON.stringify({changedFiles:r.changedFiles,filesHash:r.filesHash,deployed:false}));}
module.exports={rebase};

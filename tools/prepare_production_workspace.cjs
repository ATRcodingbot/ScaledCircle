'use strict';
// Builds a private, held promotion manifest. No network, deployment or data writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.firebase/production-engineering');
const parser=require(path.join(root,'functions/node_modules/@babel/parser'));
const generate=require(path.join(root,'functions/node_modules/@babel/generator')).default;
const {selectedProgram}=require('../functions/scripts/select_function_program');
const {ACTIONS}=require('../functions/workspace_access');
const {prepareSource,replaceFunction}=require('./prepare_production_engineering.cjs');
const added={
 'business-profile-core':['prepareInvitedBusinessAccount','getBusinessTeam','inviteBusinessTeamMember','acceptBusinessTeamInvitation','updateBusinessTeamMember','getBusinessWorkspaceContext','selectBusinessWorkspace','listBusinessWorkspaceRecordIds','auditBusinessCampaignDraft'],
 'default':['getBusinessMembership','previewBusinessMembershipChange','changeBusinessMembership','createSubscriptionCheckoutSession','createBillingPortalSession'],
 'job-room-core':['getBusinessLiveProgress','projectBusinessWorkProgress','projectSubmittedWorkProgress','addActiveWorkNote','pauseAssignedWorkV1','reviewPausedWorkV1','expirePausedWorkV1'],
 'wallet-core':['getScalerEarningsV1'],
 'legal-core':['getLegalConsentStatus'],
 'transactional-email':['sendTransactionalEmailJob'],
};
const forbidden=/scaledcircle-staging|stagingPhysicalQa|physical_qa_v[123]|StagingCanvassing|STRIPE_TEST_SECRET|STAGING_PHYSICAL|IOS_PHYSICAL_CERTIFICATION|ANDROID_PHYSICAL_CERTIFICATION/;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function productionModule(name,content){
 // Postcard fulfillment is a separately certified staging release. Preserve the
 // prior production material renderer until its own promotion is reviewed.
 if(name==='physical_marketing.js')content=require('node:child_process').execFileSync('git',
  ['show','35962c28fcf2fcef5383d7be87b40e2088432606:functions/physical_marketing.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
 content=require('./production_settlement_adapter.cjs').moduleSource(name,content);
 if(name==='canvassing_completion.js')content=content.replace("'StagingCanvassingLaunch80_95V1'","'CanvassingRoute80_95V1'").replace("project === 'scaledcircle-staging'","campaign.completionPolicyVersion === VERSION");
 if(name==='business_live_progress.js')content=content.replace("(process.env.GCLOUD_PROJECT==='scaledcircle-staging'||process.env.GOOGLE_CLOUD_PROJECT==='scaledcircle-staging'||contract.completionPolicyVersion==='CanvassingRoute80_95V1')","(contract.completionPolicyVersion==='CanvassingRoute80_95V1')");
 if(name==='transactional_email.js')content=content.replace(/const ACCOUNT_ORIGIN = [\s\S]*?;/,"const ACCOUNT_ORIGIN = 'https://scaledcircle.com';").replace(/https:\/\/scaledcircle-staging\.web\.app/g,'https://scaledcircle.com');
 if(name==='attribution_foundation.js')content=content.replace(/^.*"scaledcircle-staging":.*\r?\n/m,'').replace('hostname.startsWith("scaledcircle-staging.")','normalizedOrigin !== "https://scaledcircle.com"');
 if(name==='landing_page.js')content=content.replace(',"scaledcircle-staging":"https://scaledcircle-staging.web.app"','');
 if(forbidden.test(content))throw Error('Unreviewed environment marker in '+name);
 return content;
}
function prepare(){
 const configPath=path.join(root,'firebase.production-engineering.json');
 const config=JSON.parse(fs.readFileSync(configPath)),manifestPath=path.join(base,'promotion-manifest.private.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath)),metadata=JSON.parse(fs.readFileSync(path.join(root,'.firebase/production-launch/functions-current.private.json')));
 const existing=new Set(manifest.functions.map(f=>f.name)),grouped=new Map(Object.entries(added).map(([g,n])=>[g,new Set(n.filter(x=>!existing.has(x)))]));
 for(const f of metadata){const name=f.name.split('/').pop();if(!ACTIONS[name]||existing.has(name))continue;const group=f.labels?.['firebase-functions-codebase']||'default';if(!grouped.has(group))grouped.set(group,new Set());grouped.get(group).add(name);}
 let source=prepareSource();
 source=replaceFunction(source,'publicAppBaseUrl',"function publicAppBaseUrl(){return 'https://scaledcircle.com';}");
 source=source.replace(/const STRIPE_SECRET_KEY = defineSecret\([^;]+;/,'const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");');
 source=source.replace('["scaledcircle-staging", "scaled-circle"].includes(attributionProjectId)','attributionProjectId === "scaled-circle"');
 for(const [group,names]of grouped){if(!names.size)continue;
  const folder=path.join(base,'package',group);fs.mkdirSync(folder,{recursive:true});
  const hasBase=config.functions.some(g=>g.codebase===group);
  let selected=generate(selectedProgram(parser.parse(source),names),{comments:true}).code+'\n';
  if(group==='wallet-core')selected=selected.replace(/staging: \(process.env.GCLOUD_PROJECT \|\| process.env.GOOGLE_CLOUD_PROJECT\) === 'scaledcircle-staging'/,'staging: false');
  if(forbidden.test(selected))throw Error('Unreviewed production export dependency '+group);
  // Put separately compiled exports in a module to avoid shadowing the pinned
  // production handler helpers with shared-source declarations.
  selected=selected.replaceAll('initializeApp();',"if(!require('firebase-admin/app').getApps().length)initializeApp();");
  fs.writeFileSync(path.join(folder,'workspace-exports.js'),selected);
  const seen=new Set();
  function deps(text){for(const m of text.matchAll(/require\(['"]\.\/([A-Za-z0-9_-]+)['"]\)/g)){
   const name=m[1]+'.js';if(seen.has(name))continue;seen.add(name);
   const content=productionModule(name,fs.readFileSync(path.join(root,'functions',name),'utf8'));
   const target=path.join(folder,name);
   if(hasBase&&fs.existsSync(target)&&fs.readFileSync(target,'utf8').replaceAll('\r','')!==content.replaceAll('\r',''))throw Error('Shared dependency conflicts with pinned production '+group+'/'+name);
   fs.writeFileSync(target,content);deps(content);
  }}deps(selected);
  const index=hasBase?fs.readFileSync(path.join(folder,'index.js'),'utf8'):"if(!require('firebase-admin/app').getApps().length)require('firebase-admin/app').initializeApp();\n";
  fs.writeFileSync(path.join(folder,'index.js'),index+'\n'+[...names].map(n=>`exports.${n}=require('./workspace-exports').${n};`).join('\n')+'\n');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'functions/package.json')));delete pkg.scripts;pkg.name='scaledcircle-production-'+group;fs.writeFileSync(path.join(folder,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  const lock=JSON.parse(fs.readFileSync(path.join(root,'functions/package-lock.json')));lock.name=pkg.name;if(lock.packages?.[''])lock.packages[''].name=pkg.name;fs.writeFileSync(path.join(folder,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
  if(!hasBase)config.functions.push({source:path.relative(root,folder).replaceAll('\\','/'),codebase:group,ignore:['node_modules','.git','candidate-manifest.json']});
  fs.writeFileSync(path.join(folder,'.env.scaled-circle'),'APP_ENV=production\nCANVASSING_POLICY_EFFECTIVE_FROM_MS=1788825600000\nCANVASSING_NEW_CONTRACTS_ENABLED=false\nUNUSED_WORK_REFUNDS_ENABLED=false\n');
  if(!hasBase){
   const allowed=new Set(['index.js','workspace-exports.js','package.json','package-lock.json','.env.scaled-circle','candidate-manifest.json',...seen]);
   for(const entry of fs.readdirSync(folder,{withFileTypes:true}))if(entry.isFile()&&!allowed.has(entry.name))fs.unlinkSync(path.join(folder,entry.name));
  }
  for(const name of names){const current=metadata.find(f=>f.name.endsWith('/'+name));manifest.functions.push({name,codebase:group,currentRevision:current?.serviceConfig?.revision||null,currentState:current?.state||'ABSENT',disposition:'HELD FOR COORDINATED WORKSPACE/PERMISSION REVIEW',selector:`functions:${group}:${name}`,candidate:path.relative(root,folder).replaceAll('\\','/')});}
 }
 const files={};for(const group of config.functions){const folder=path.join(root,group.source);const groupFiles={};const walk=(dir,prefix='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','candidate-manifest.json'].includes(e.name))continue;const n=prefix+e.name;if(e.isDirectory())walk(path.join(dir,e.name),n+'/');else{const b=fs.readFileSync(path.join(dir,e.name));if(e.name.endsWith('.js')&&forbidden.test(b.toString()))throw Error('Forbidden production marker '+n);groupFiles[n]=hash(b);}}};walk(folder);files[group.codebase]=groupFiles;fs.writeFileSync(path.join(folder,'candidate-manifest.json'),JSON.stringify({files:groupFiles,hash:hash(JSON.stringify(groupFiles)),deployed:false},null,2));}
 manifest.keepCurrent=metadata.filter(f=>!manifest.functions.some(r=>f.name.endsWith('/'+r.name))).map(f=>({name:f.name.split('/').pop(),revision:f.serviceConfig?.revision,state:f.state,disposition:'KEEP CURRENT REVISION'}));
 manifest.deployed=false;manifest.releaseState='HELD: refreshed mobile artifacts, production billing bindings and Founder promotion review required';manifest.workspace={seats:{starter:1,growth:3,scale:5,managed_growth:10},productionMutations:false,filesHash:hash(JSON.stringify(files))};
 fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
 return {functions:manifest.functions.length,codebases:config.functions.length,hash:manifest.workspace.filesHash,deployed:false};
}
if(require.main===module)console.log(JSON.stringify(prepare()));module.exports={prepare,productionModule};

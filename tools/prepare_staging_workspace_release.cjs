'use strict';
// Prepare a bounded staging release; this tool never deploys or mutates data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),deps=path.join(root,'functions/node_modules');
const parser=require(path.join(deps,'@babel/parser')),generate=require(path.join(deps,'@babel/generator')).default;
const {selectedProgram}=require('../functions/scripts/select_function_program');
const {ACTIONS}=require('../functions/workspace_access');
const added={
 'business-profile-core':['prepareInvitedBusinessAccount','getBusinessTeam','inviteBusinessTeamMember','acceptBusinessTeamInvitation','updateBusinessTeamMember','getBusinessWorkspaceContext','selectBusinessWorkspace','listBusinessWorkspaceRecordIds','auditBusinessCampaignDraft'],
 'default':['getBusinessMembership','previewBusinessMembershipChange','changeBusinessMembership','createSubscriptionCheckoutSession','createBillingPortalSession'],
 'job-room-core':['getBusinessLiveProgress','projectBusinessWorkProgress','projectSubmittedWorkProgress','addActiveWorkNote'],
 'legal-core':['getLegalConsentStatus'],
 'transactional-email':['sendTransactionalEmailJob'],
 'campaign-funding':['stripeWebhook','quoteCampaignFunding','createCampaignFundingCheckoutSession','publishFundedCampaign','cancelUnassignedFundedCampaign','archiveCanceledCampaign'],
};
function prepare(){
 const destination=path.join(root,'.firebase/launch-workspace-release');fs.mkdirSync(destination,{recursive:true});
 const current=JSON.parse(fs.readFileSync(path.join(root,'.firebase/launch-ux-staging-functions-before.private.json'),'utf8').replace(/^\uFEFF/,''));
 const firebase=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
 const grouped=new Map(Object.entries(added).map(([g,n])=>[g,new Set(n)]));
 for(const f of current){const name=f.name.split('/').pop();if(!ACTIONS[name]&&name!=='notifyOnCampaignZoneUpdated')continue;const g=f.labels?.['firebase-functions-codebase'];if(!g)throw Error('Missing deployed ownership for '+name);if(!grouped.has(g))grouped.set(g,new Set());grouped.get(g).add(name);}
 const config={functions:[],firestore:{rules:'firestore.staging.rules',indexes:'firestore.indexes.json'}},rows=[];
 for(const [group,names]of grouped){
  const existing=firebase.functions.find(g=>g.codebase===group);if(!existing)throw Error('Unknown codebase '+group);
  const from=path.join(root,group==='campaign-funding'?'functions-campaign-funding':'functions'),out=path.join(destination,group);fs.mkdirSync(out,{recursive:true});
  const source=fs.readFileSync(path.join(from,'index.js'),'utf8'),program=selectedProgram(parser.parse(source),names),text=generate(program,{comments:true}).code+'\n';
  for(const name of names)if(!text.includes('exports.'+name+' =')&&!text.includes('exports.'+name+'='))throw Error('Missing prepared export '+name);
  fs.writeFileSync(path.join(out,'index.js'),text);const copied=new Set();
  function copy(text,base){for(const m of text.matchAll(/require\(['"](\.\/[A-Za-z0-9_./-]+)['"]\)/g)){const rel=m[1].slice(2).replace(/\.js$/,'')+'.js',src=path.resolve(base,rel),name=path.relative(from,src);if(name.startsWith('..'))throw Error('Dependency escape');if(copied.has(name))continue;copied.add(name);const content=fs.readFileSync(src,'utf8');fs.mkdirSync(path.dirname(path.join(out,name)),{recursive:true});fs.writeFileSync(path.join(out,name),content);copy(content,path.dirname(src));}}
  copy(text,from);const pkg=JSON.parse(fs.readFileSync(path.join(from,'package.json')));pkg.name='scaledcircle-staging-workspace-'+group;delete pkg.scripts;fs.writeFileSync(path.join(out,'package.json'),JSON.stringify(pkg,null,2)+'\n');fs.writeFileSync(path.join(out,'.env.scaledcircle-staging'),'APP_ENV=staging\nSCALEDCIRCLE_ENV=staging\n');
  config.functions.push({source:path.relative(root,out).replaceAll('\\','/'),codebase:group,ignore:['node_modules','.git','*.log']});
  for(const name of names){const old=current.find(f=>f.name.endsWith('/'+name));rows.push({name,codebase:group,selector:`functions:${group}:${name}`,priorRevision:old?.serviceConfig?.revision||null});}
 }
 fs.writeFileSync(path.join(root,'firebase.launch-workspace-staging.json'),JSON.stringify(config,null,2)+'\n');
 const result={project:'scaledcircle-staging',functions:rows,productionDeployment:false,sourceInputHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'functions/index.js'))).digest('hex')};fs.writeFileSync(path.join(destination,'manifest.private.json'),JSON.stringify(result,null,2));return {functions:rows.length,codebases:config.functions.length,config:'firebase.launch-workspace-staging.json'};
}
if(require.main===module)console.log(JSON.stringify(prepare()));module.exports={prepare};

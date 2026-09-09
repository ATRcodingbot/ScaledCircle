'use strict';
// Assemble reviewed candidates only. This tool never deploys or contacts Firebase.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),privateRoot=path.join(root,'.firebase/production-engineering');
const parser=require(path.join(root,'functions/node_modules/@babel/parser'));
const generate=require(path.join(root,'functions/node_modules/@babel/generator')).default;
const {selectedProgram}=require('../functions/scripts/select_function_program');
const TRACKING=require('./prepare_production_engineering.cjs').TRACKING;
const GROUPS=[
 {codebase:'logistics-access',from:path.join(root,'functions-logistics-access'),names:['projectCampaignDiscoveryV1','seedCampaignDiscoveryV1','listAssignedLocationIdsV1','getReputationCompletionCountV1']},
 {codebase:'job-room-core',from:path.join(root,'.firebase/production-launch/job-room'),names:['getJobRoom'],extra:{}},
 {codebase:'discovery-core',from:path.join(privateRoot,'tracking'),names:['getSmartZonePlan','applySmartZonePlan','analyzeCampaignZone']},
 {codebase:'application-core',from:path.join(privateRoot,'tracking'),names:['applyToCampaign']},
 {codebase:'assignment-core',from:path.join(privateRoot,'tracking'),names:['assignScalerToZone'],extra:{configureZoneGroupAssignment:'legacy-group'}},
 {codebase:'completion-authority-core',from:path.join(privateRoot,'tracking'),names:['initializeCampaignCompletion','submitZoneCompletion','reviewCampaignCompletion','finalizeZoneReview']},
 // startAssignedZone is a legacy source entry, explicitly unused by the mobile client.
 {codebase:'tracking-core',from:path.join(privateRoot,'tracking'),names:TRACKING.filter(n=>n!=='startAssignedZone')},
 {codebase:'campaign-funding',from:path.join(privateRoot,'funding'),names:['quoteCampaignFunding','createCampaignFundingCheckoutSession','publishFundedCampaign','stripeWebhook','reconcileUnusedWorkReservesV1']},
 {codebase:'default',from:path.join(privateRoot,'tracking/legacy-payout'),names:['approveZonePayout'],packageFrom:path.join(privateRoot,'tracking')},
];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function filesIn(dir,prefix='') {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 if(e.name==='node_modules'||e.name==='candidate-manifest.json')return [];
 const n=prefix+e.name;return e.isDirectory()?filesIn(path.join(dir,e.name),n+'/'):[n];});}
function prepare(){
 const destination=path.join(privateRoot,'package');fs.mkdirSync(destination,{recursive:true});
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'.firebase/production-launch/functions-current.private.json')));
 const rows=[],config={functions:[],firestore:{rules:'firestore.production.rules',indexes:'firestore.indexes.json'},storage:{rules:'storage.rules'}};
 for(const group of GROUPS){
  const out=path.join(destination,group.codebase);fs.mkdirSync(out,{recursive:true});
  let source=fs.readFileSync(path.join(group.from,'index.js'),'utf8');
  const ast=parser.parse(source),selected=selectedProgram(ast,new Set(group.names));
  selected.program.body=selected.program.body.filter(n=>!(n.type==='ExpressionStatement'&&n.expression?.type==='CallExpression'&&n.expression.callee?.name==='initializeApp'));
  source="if(!require('firebase-admin/app').getApps().length)require('firebase-admin/app').initializeApp();\n"+generate(selected,{comments:true}).code+'\n';
  for(const [name,module]of Object.entries(group.extra||{}))source+=`exports.${name}=require('./${module}').${name};\n`;
  fs.writeFileSync(path.join(out,'index.js'),source);
  const seen=new Set();
  function deps(text,base,relative=''){
   for(const m of text.matchAll(/require\(['"](\.\/[A-Za-z0-9_./-]+)['"]\)/g)){
    let original=path.resolve(base,m[1]);if(fs.existsSync(original)&&fs.statSync(original).isDirectory())original=path.join(original,'index.js');
    else if(!original.endsWith('.js'))original+='.js';
    const name=path.relative(group.from,original).replaceAll('\\','/');
    if(name.startsWith('..'))throw Error('Dependency escaped reviewed package');
    if(seen.has(name))continue;seen.add(name);
    const content=fs.readFileSync(original,'utf8');
    if(/scaledcircle-staging|stagingPhysicalQa|physical_qa_v[123]|StagingCanvassing/.test(content))throw Error('QA source in '+name);
    fs.mkdirSync(path.dirname(path.join(out,name)),{recursive:true});fs.writeFileSync(path.join(out,name),content);deps(content,path.dirname(original));
   }
  }
  deps(source,group.from);
  const pkg=JSON.parse(fs.readFileSync(path.join(group.packageFrom||group.from,'package.json')));pkg.name='scaledcircle-production-'+group.codebase;
  fs.writeFileSync(path.join(out,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  fs.writeFileSync(path.join(out,'.env.scaled-circle'),
    'APP_ENV=production\nCANVASSING_POLICY_EFFECTIVE_FROM_MS=1788825600000\nCANVASSING_NEW_CONTRACTS_ENABLED=false\nUNUSED_WORK_REFUNDS_ENABLED=false\n');
  // Avoid accidentally including stale files on a repeated preparation.
  const keep=new Set(['index.js','package.json','package-lock.json','.env.scaled-circle',...seen]);
  for(const n of filesIn(out))if(!keep.has(n))fs.unlinkSync(path.join(out,n));
  config.functions.push({source:path.relative(root,out).replaceAll('\\','/'),codebase:group.codebase,ignore:['node_modules','.git','candidate-manifest.json']});
  for(const name of [...group.names,...Object.keys(group.extra||{})]){
   const current=metadata.find(f=>f.name.endsWith('/'+name));
   if(current&&current.labels?.['firebase-functions-codebase']&&current.labels['firebase-functions-codebase']!==group.codebase)throw Error('Codebase drift '+name);
   rows.push({name,codebase:group.codebase,currentRevision:current?.serviceConfig?.revision||null,currentState:current?.state||'ABSENT',
    disposition:current?'RECONCILED WITH CURRENT PRODUCTION':'DEPLOY EXACT CANDIDATE',candidate:config.functions.at(-1).source,
    selector:`functions:${group.codebase}:${name}`,rollback:name==='projectCampaignDiscoveryV1'?'Retain privacy projection authority':
     'Disable prospective contracts; retain accepted-policy settlement and restrictive privacy. Restore a pinned revision only if no new contracts depend on it.'});
  }
 }
 config.functions.forEach(g=>{const dir=path.join(root,g.source),files={};for(const n of filesIn(dir))files[n]=digest(fs.readFileSync(path.join(dir,n)));fs.writeFileSync(path.join(dir,'candidate-manifest.json'),JSON.stringify({files,hash:digest(JSON.stringify(files)),deployed:false},null,2));});
 fs.writeFileSync(path.join(root,'firebase.production-engineering.json'),JSON.stringify(config,null,2)+'\n');
 fs.writeFileSync(path.join(privateRoot,'promotion-manifest.private.json'),JSON.stringify({deployed:false,functions:rows,excluded:['startAssignedZone: source compatibility only; absent in staging and unused by maintained mobile client'],keepCurrent:metadata.filter(f=>!rows.some(r=>f.name.endsWith('/'+r.name))).map(f=>({name:f.name.split('/').pop(),revision:f.serviceConfig?.revision,state:f.state,disposition:'KEEP CURRENT REVISION'}))},null,2));
 return {codebases:GROUPS.length,functions:rows.length,config:'firebase.production-engineering.json',deployed:false};
}
if(require.main===module)console.log(JSON.stringify(prepare()));
module.exports={prepare,GROUPS};

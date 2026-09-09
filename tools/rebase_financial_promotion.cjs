'use strict';
// Rebase only reviewed financial components. Never deploys or changes provider state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),parser=require(path.join(root,'functions/node_modules/@babel/parser')),
 generate=require(path.join(root,'functions/node_modules/@babel/generator')).default,
 {selectedProgram}=require('../functions/scripts/select_function_program'),
 {prepareSource,replaceFunction}=require('./prepare_production_engineering.cjs'),
 {productionModule}=require('./prepare_production_workspace.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Expected exactly one financial patch anchor');return s.replace(a,b);}
function rebase(baseline,destination){
 baseline=path.resolve(baseline);destination=path.resolve(destination);
 if(baseline===destination || fs.existsSync(destination))throw Error('Use a fresh private destination; never overwrite a sealed package');
 fs.mkdirSync(destination,{recursive:true});fs.cpSync(path.join(baseline,'package'),path.join(destination,'package'),{recursive:true,filter:p=>path.basename(p)!=='node_modules'});
 const out=path.join(destination,'package');
 const completion=path.join(out,'completion-authority-core/index.js');let text=fs.readFileSync(completion,'utf8');
 text=once(text,'const paymentRef = db.collection("campaignPayments").doc(cleanId(zone.fundingPaymentId) || "missing");',
  `const fundingBinding=require('./settlement_funding_binding');
    const binding=fundingBinding.resolve({campaignId:zone.campaignId,campaign:reviewCampaign.data(),zone});
    const paymentRef=db.collection('campaignPayments').doc(binding.paymentId);`);
 text=once(text,'const payment = paymentSnapshot.data() || {};',`const payment = paymentSnapshot.data() || {};
    fundingBinding.validate({paymentId:paymentSnapshot.id,payment,campaignId:zone.campaignId,campaign:reviewCampaign.data(),zoneId,zone,contract:contractSnapshot.data(),completion});`);
 fs.writeFileSync(completion,text);fs.copyFileSync(path.join(root,'functions/settlement_funding_binding.js'),path.join(out,'completion-authority-core/settlement_funding_binding.js'));
 let source=prepareSource();source=replaceFunction(source,'publicAppBaseUrl',"function publicAppBaseUrl(){return 'https://scaledcircle.com';}");
 source=source.replace(/const STRIPE_SUBSCRIPTION_SECRET_KEY = defineSecret\([\s\S]*?\);/,
  'const STRIPE_SUBSCRIPTION_SECRET_KEY=defineSecret("STRIPE_SUBSCRIPTION_LIVE_SECRET_KEY");');
 source=source.replace(/const STRIPE_SECRET_KEY = defineSecret\([^;]+;/,'const STRIPE_SECRET_KEY=defineSecret("STRIPE_SECRET_KEY");');
 const names=['getBusinessMembership','previewBusinessMembershipChange','changeBusinessMembership','createSubscriptionCheckoutSession','createBillingPortalSession'];
 let selected=generate(selectedProgram(parser.parse(source),new Set(names)),{comments:true}).code+'\n';
 selected=selected.replaceAll('initializeApp();',"if(!require('firebase-admin/app').getApps().length)initializeApp();");
 fs.writeFileSync(path.join(out,'default/workspace-exports.js'),selected);
 const seen=new Set();function deps(body){for(const m of body.matchAll(/require\(['"]\.\/([A-Za-z0-9_-]+)['"]\)/g)){
  const name=m[1]+'.js';if(seen.has(name))continue;seen.add(name);const content=productionModule(name,fs.readFileSync(path.join(root,'functions',name),'utf8'));
  const target=path.join(out,'default',name);if(!['workspace_billing.js','workspace_subscription_sync.js','subscription_contract.js'].includes(name)&&fs.existsSync(target)&&fs.readFileSync(target,'utf8').replaceAll('\r','')!==content.replaceAll('\r',''))throw Error('Unreviewed default dependency drift: '+name);
  fs.writeFileSync(target,content);deps(content);
 }}deps(selected);
 // Reuse the maintained production funding transformations, including its
 // existing publication predicate and disabled refund activation gate.
 const funding=require('./prepare_production_funding.cjs').prepare().output;
 for(const name of ['index.js','admin_revenue_notifications.js','workspace_subscription_sync.js','workspace_subscription_events.js','subscription_contract.js'])fs.copyFileSync(path.join(funding,name),path.join(out,'campaign-funding',name));
 const config=JSON.parse(fs.readFileSync(path.join(baseline,'firebase.candidate.private.json')));
 for(const group of config.functions)group.source=path.join(out,group.codebase).replaceAll('\\','/');
 fs.writeFileSync(path.join(destination,'firebase.candidate.private.json'),JSON.stringify(config,null,2));
 const files={},changes=[];function walk(dir,prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.name==='node_modules'||e.name==='candidate-manifest.json')continue;const rel=prefix+e.name,p=path.join(dir,e.name);
  if(e.isDirectory()){walk(p,rel+'/');continue;}const b=fs.readFileSync(p);files[rel]=sha(b);
  if(e.name.endsWith('.js')&&/scaledcircle-staging|stagingPhysicalQa|physical_qa_v[123]|StagingCanvassing|STRIPE_TEST_SECRET/.test(b.toString()))throw Error('Forbidden production marker: '+rel);
  const old=path.join(baseline,'package',rel);if(!fs.existsSync(old)||sha(fs.readFileSync(old))!==files[rel])changes.push(rel);
 }}walk(out);
 for(const file of changes)if(!/^(default|completion-authority-core|campaign-funding)\//.test(file))throw Error('Unexpected component change '+file);
 const affected=['finalizeZoneReview',...names,'stripeWebhook'];
 const unchangedExports=['publishFundedCampaign','quoteCampaignFunding','createCampaignFundingCheckoutSession','reconcileUnusedWorkReservesV1'];
 function exportCode(file,name){const a=parser.parse(fs.readFileSync(file,'utf8'));const n=a.program.body.find(n=>n.type==='ExpressionStatement'&&n.expression?.left?.object?.name==='exports'&&n.expression.left.property?.name===name);if(!n)throw Error('Missing comparison export '+name);return generate(n,{comments:false,compact:true}).code;}
 for(const name of unchangedExports)if(exportCode(path.join(baseline,'package/campaign-funding/index.js'),name)!==exportCode(path.join(out,'campaign-funding/index.js'),name))throw Error('Unreviewed retained funding export drift: '+name);
 const result={deployed:false,baseline,source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDirty:true,
  affectedFunctions:affected,changedFiles:changes,files,filesHash:sha(JSON.stringify(files)),unchangedFundingExports:unchangedExports,
  externalHolds:['Dedicated production subscription credential','Four LIVE plan prices','Production webhook subscription/invoice event configuration','Founder coordinated promotion authorization']};
 fs.writeFileSync(path.join(destination,'financial-rebase.private.json'),JSON.stringify(result,null,2));return {affectedFunctions:affected,changedFiles:changes,filesHash:result.filesHash,deployed:false};
}
if(require.main===module)console.log(JSON.stringify(rebase(process.argv[2],process.argv[3])));module.exports={rebase};

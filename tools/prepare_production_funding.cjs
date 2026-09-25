'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {once,section}=require('./production_policy_patches.cjs');
const {replaceFunction}=require('./prepare_production_engineering.cjs');
const root=path.resolve(__dirname,'..');
function prepare() {
 const output=path.join(root,'.firebase/production-engineering/funding');
 fs.mkdirSync(output,{recursive:true});
 let source=fs.readFileSync(path.join(root,'functions-campaign-funding/index.js'),'utf8').replaceAll('\r','');
 source=source.replace('const stagingPhysicalQa = require("./staging_physical_qa");',"const productionPolicy = require('./production_campaign_policy');");
 source=once(source,'    transaction.set(paymentRef, {...paymentUpdate, updatedAt: FieldValue.serverTimestamp()}, {merge: true});',
 `    const allocation=require('./campaign_fund_allocation');
    const merged={...currentPayment,...paymentUpdate};
    let next=currentPayment.fundingAllocation;
    if(paymentUpdate.status==='paid'&&!next)next=allocation.create(paymentId,merged);
    else if(next&&['disputed','refunded','refund_pending','refund_review_required'].includes(paymentUpdate.status))
      next=allocation.sourceState(paymentId,currentPayment,paymentUpdate.status==='disputed'?'disputed':paymentUpdate.status==='refunded'?'refunded':'held');
    if(next)allocation.persist(transaction,paymentRef,currentPayment.fundingAllocation,next,'signed_payment_reconciliation',FieldValue.serverTimestamp());
    transaction.set(paymentRef, {...paymentUpdate, updatedAt: FieldValue.serverTimestamp()}, {merge: true});`);
 source=once(source,'  if (!paymentId && typeof object.payment_intent === "string") {',
 `  let resolvedIntent=object.payment_intent;
  if(!paymentId&&!resolvedIntent&&typeof object.charge==='string') {
    const charge=await stripe.charges.retrieve(object.charge);
    lifecycle.assertStripeEvent(charge,PAYMENT_ENVIRONMENT.stripeMode);
    resolvedIntent=charge.payment_intent;
  }
  if (!paymentId && typeof resolvedIntent === "string") {`);
 source=once(source,'.where("stripePaymentIntentId", "==", object.payment_intent).limit(1).get();',
   '.where("stripePaymentIntentId", "==", resolvedIntent).limit(2).get();\n    if(matches.size>1)throw Error("ambiguous_campaign_payment_source");');
 const begin=source.indexOf('  if (stagingPhysicalQa.reserved(campaignId)) {');
 const end=source.indexOf('  const ref = db.collection("campaigns").doc(campaignId);',begin);
 if(begin<0||end<0)throw Error('Funding isolation anchor missing');
 source=source.slice(0,begin)+source.slice(end);
 source=once(source,'  const campaignId = cleanId(request.data?.campaignId);',
 `  const authRecord=await auth.getUser(request.auth.uid);
  if(authRecord.disabled||!authRecord.emailVerified)throw new HttpsError('permission-denied','An enabled approved Business is required.');
  const campaignId = cleanId(request.data?.campaignId);`);
 source=replaceFunction(source,'validatedCampaignZones',`async function validatedCampaignZones(input, {forPublication=false}={}) {
  const docs=(await db.collection('campaignZones').where('campaignId','==',input.campaignId).get()).docs;
  const valid=require('./production_publish_compatibility').productionValidZones(docs,input.campaignId,input.uid);
  if(!valid.length&&!forPublication)throw new HttpsError('failed-precondition','Map at least one valid campaign Zone before funding.');
  if(productionPolicy.applies(input.campaign))for(const doc of valid) {
    try { require('./canvassing_route_authority').assertReady({...doc.data(),id:doc.id},input.campaign); }
    catch(_) { throw new HttpsError('failed-precondition','Review the authoritative serviceable route before funding or publication.'); }
  }
  return valid;
}`);
 source=section(source,'quoteCampaignFunding',s=>once(s,'  await assertFundable(input);\n  try { return lifecycle.quoteForCampaign(input.campaign); }',
 `  const zones=await assertFundable(input);
  try { return productionPolicy.quote(lifecycle,input.campaignId,input.campaign,zones.map(d=>({...d.data(),id:d.id}))); }`));
 source=section(source,'createCampaignFundingCheckoutSession',s=>{
  s=once(s,'  const quote = lifecycle.quoteForCampaign(input.campaign);',
  `  const quote = productionPolicy.quote(lifecycle,input.campaignId,input.campaign,fundableZones.map(d=>({...d.data(),id:d.id})));`);
  s=once(s,'  const stripe = stripeClient();',
  `  if(!quote.acceptedOffer)throw new HttpsError('failed-precondition','This campaign type does not yet have supported immutable funding allocations. Your draft is saved.');
  if(quote.acceptedOffer)await db.runTransaction(async transaction=>{
    const fresh=(await transaction.get(input.ref)).data();
    const currentZones=await transaction.get(db.collection('campaignZones').where('campaignId','==',input.campaignId));
    const valid=require('./production_publish_compatibility').productionValidZones(currentZones.docs,input.campaignId,input.uid);
    const currentQuote=productionPolicy.quote(lifecycle,input.campaignId,fresh,valid.map(d=>({...d.data(),id:d.id})));
    if(currentQuote.quoteDigest!==quote.quoteDigest||fresh.status!=='draft')throw new HttpsError('failed-precondition','Review the changed funding quote.');
    transaction.update(input.ref,{acceptedOffer:quote.acceptedOffer,fundingStatus:'payment_pending',updatedAt:FieldValue.serverTimestamp()});
  });
  const stripe = stripeClient();`);
  return s;
 });
 source=section(source,'cancelUnassignedFundedCampaign',s=>once(s,'    const refund = await stripe.refunds.create({charge: charge.id,',
 `    if(payment.fundingAllocation) {
      const [balance,all]=await Promise.all([stripe.balance.retrieve(),db.collection('campaignPayments').limit(501).get()]);
      if(all.size>500)throw Error('campaign_allocation_inventory_review_required');
      require('./campaign_fund_protection').assertRefundCapacity({paymentId,amountCents:refundableCents,balance,workerReleaseCents:payment.workerAmountCents,
        records:all.docs.map(d=>({id:d.id,data:d.data()}))});
    }
    const refund = await stripe.refunds.create({charge: charge.id,`));
 // Publication is one transaction: exact legacy valid-zone filtering is retained;
 // prospective canvassing additionally verifies its funded immutable offer.
 source=section(source,'publishFundedCampaign',()=>`exports.publishFundedCampaign = onCall(OPTIONS, async request=>{
  const input=await ownedCampaign(request,'authorizeCampaigns');
  return db.runTransaction(async transaction=>{
    const campaign=(await transaction.get(input.ref)).data();
    const docs=(await transaction.get(db.collection('campaignZones').where('campaignId','==',input.campaignId))).docs;
    const zones=require('./production_publish_compatibility').productionValidZones(docs,input.campaignId,input.uid);
    const payment=(await transaction.get(db.doc('campaignPayments/'+(cleanId(campaign.fundingPaymentId)||'missing')))).data();
    if(campaign.status==='open')return {campaignId:input.campaignId,status:'open',replay:true};
    if(campaign.status!=='draft'||!zones.length||campaign.fundingStatus!=='funded'||payment?.status!=='paid'||
       payment.stripeMode!==PAYMENT_ENVIRONMENT.stripeMode||payment.campaignId!==input.campaignId||payment.businessUid!==input.uid) {
      throw new HttpsError('failed-precondition','Signed payment and a valid mapped Zone are required.');
    }
    productionPolicy.assertFundedOffer(input.campaignId,campaign,zones.map(d=>({...d.data(),id:d.id})),payment);
    transaction.update(input.ref,{status:'open',publishedByActorUid:input.actorUid,publishedAt:FieldValue.serverTimestamp(),zonesLockedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    for(const zone of zones)transaction.update(zone.ref,{mapLocked:true,mapLockedAt:FieldValue.serverTimestamp()});
    return {campaignId:input.campaignId,status:'open',zonesLocked:zones.length};
  });
});\n`);
 source=source.replace('const STRIPE_SECRET_KEY = defineSecret(PAYMENT_ENVIRONMENT.stripeMode === "live" ?\n  "STRIPE_LIVE_SECRET_KEY" : "STRIPE_TEST_SECRET_KEY");',
   'const STRIPE_SECRET_KEY = defineSecret("STRIPE_LIVE_SECRET_KEY");');
 source=source.replace('const STRIPE_WEBHOOK_SECRET = defineSecret(PAYMENT_ENVIRONMENT.stripeMode === "live" ?\n  "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_TEST_WEBHOOK_SECRET");',
   'const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_LIVE_WEBHOOK_SECRET");');
 // Export only the coordinated four funding authorities. Refund/cancellation
 // revisions remain separately pinned and are not included in this codebase.
 const parser=require(path.join(root,'functions/node_modules/@babel/parser'));
 source+=`\nexports.getCampaignFundingState=onCall(OPTIONS,async request=>{
   const input=await ownedCampaign(request,'payments');
   const campaign=input.campaign,paymentId=cleanId(campaign.fundingPaymentId);
   const payment=paymentId?(await db.doc('campaignPayments/'+paymentId).get()).data():null;
   const status=payment?.status||campaign.fundingStatus||'unfunded';
   const opened=process.env.LIVE_PAID_WORK_ACTIVATION_ENABLED==='true';
   const messages={payment_pending:'Payment processing. Work cannot start yet.',paid:'Funding confirmed. Assignment and work-start checks still apply.',
     refunded:'Payment refunded. This source cannot fund new work.',disputed:'Funding issue — action required.',refund_pending:'Refund pending. New work is blocked.'};
   const checkoutAllowed=opened&&campaign.status==='draft'&&['','unfunded','payment_failed','checkout_expired'].includes(status);
   let allocation=null;
   if(payment?.fundingAllocation)allocation=require('./campaign_fund_allocation').view(paymentId,payment);
   return {status,checkoutAllowed,message:!opened?'Campaign checkout is awaiting verified fund-retention controls. Your draft is saved.':
     messages[status]||'Review campaign requirements and the current quote before payment.',allocation};
 });\n`;
 const generate=require(path.join(root,'functions/node_modules/@babel/generator')).default;
 const {selectedProgram}=require('../functions/scripts/select_function_program');
 source=source.replace("if(project!=='scaledcircle-staging')return;",
   "require('./production_work_settlement_policy').environment(project);");
 source=generate(selectedProgram(parser.parse(source),new Set(['getCampaignFundingState','quoteCampaignFunding','createCampaignFundingCheckoutSession','publishFundedCampaign','cancelUnassignedFundedCampaign','stripeWebhook','reconcileUnusedWorkReservesV1']))).code;
 source=require('./production_payment_runtime.cjs').deferProductionPaymentEnvironment(source);
 fs.writeFileSync(path.join(output,'index.js'),source);
 const copied=new Set();
 function copyDependencies(text) {
  for(const m of text.matchAll(/require\(['"]\.\/([\w./-]+)['"]\)/g)) {
   const name=m[1].replace(/\.js$/,'')+'.js';if(copied.has(name))continue;copied.add(name);
   let filename=path.join(root,'functions-campaign-funding',name);
   if(!fs.existsSync(filename))filename=path.join(root,'functions',name);
   let content=fs.readFileSync(filename,'utf8');
   content=require('./production_settlement_adapter.cjs').moduleSource(name,content);
   if(name==='campaign_funding_lifecycle.js') {
    content=replaceFunction(content,'paymentEnvironment',`function paymentEnvironment(environment={}) {
      const project=environment.GCLOUD_PROJECT||environment.GOOGLE_CLOUD_PROJECT;
      const demo=project==='demo-production-engineering'&&/^(localhost|127\\.0\\.0\\.1):\\d+$/.test(environment.FIRESTORE_EMULATOR_HOST||'')&&/^(localhost|127\\.0\\.0\\.1):\\d+$/.test(environment.FIREBASE_AUTH_EMULATOR_HOST||'');
      if(!demo&&(project!=='scaled-circle'||environment.APP_ENV!=='production'))throw Error('production_environment_required');
      return Object.freeze({appEnv:'production',projectId:project,stripeMode:'live',returnBaseUrl:'https://scaledcircle.com'});
    }`);
   }
   if(name==='canvassing_completion.js')content=content.replace("'StagingCanvassingLaunch80_95V1'","'CanvassingRoute80_95V1'").replace("project === 'scaledcircle-staging'","campaign.completionPolicyVersion === VERSION");
   // The shared paid-work guard explicitly supports local/staging environments;
   // its production branch remains closed and is copied byte-for-byte.
   const checkedContent=['paid_work_launch_gate.js','billing_communications.js','transactional_email.js'].includes(name)?content.replaceAll('scaledcircle-staging',''):content;
   if(/stagingPhysicalQa|scaledcircle-staging|physical_qa_v[123]|STRIPE_TEST_SECRET/.test(checkedContent))throw Error('Forbidden production funding dependency '+name);
   fs.mkdirSync(path.dirname(path.join(output,name)),{recursive:true});fs.writeFileSync(path.join(output,name),content);copyDependencies(content);
  }
 }
 copyDependencies(source);
 const p=JSON.parse(fs.readFileSync(path.join(root,'functions-campaign-funding/package.json')));
 fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({...p,name:'scaledcircle-production-campaign-funding'},null,2));
 const files={};for(const n of ['index.js','package.json',...copied])files[n]=crypto.createHash('sha256').update(fs.readFileSync(path.join(output,n))).digest('hex');
 fs.writeFileSync(path.join(output,'candidate-manifest.json'),JSON.stringify({deployed:false,files},null,2));
 return {output,files:Object.keys(files).length};
}
if(require.main===module)console.log(JSON.stringify(prepare()));
module.exports={prepare};

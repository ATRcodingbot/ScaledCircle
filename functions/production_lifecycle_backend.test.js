'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {test,before,after}=require('node:test');
const {createRequire}=require('node:module');
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[key]||'',/^(localhost|127\.0\.0\.1):\d+$/);
process.env.GCLOUD_PROJECT='demo-production-engineering';
process.env.GOOGLE_CLOUD_PROJECT=process.env.GCLOUD_PROJECT;
process.env.APP_ENV='production';
process.env.CANVASSING_POLICY_EFFECTIVE_FROM_MS=String(Date.now()-86400000);
process.env.CANVASSING_NEW_CONTRACTS_ENABLED='true';
// These local signature fixtures are never credentials to a provider account.
process.env.STRIPE_LIVE_SECRET_KEY=['sk','live','LOCAL_EMULATOR_NOT_A_CREDENTIAL'].join('_');
process.env.STRIPE_LIVE_WEBHOOK_SECRET=['whsec','LOCAL_SIGNATURE_FIXTURE'].join('_');
const fft=require('firebase-functions-test')({projectId:process.env.GCLOUD_PROJECT});
const packaged=process.env.PRODUCTION_PACKAGE_TEST==='true';
const base='../.firebase/production-engineering/';
const runtime=packaged?Object.assign({},...['discovery-core','application-core','assignment-core','completion-authority-core','tracking-core'].map(n=>require(base+'package/'+n))):require(base+'tracking');
const rr=createRequire(require.resolve(base+(packaged?'package/completion-authority-core':'tracking')));
const fr=createRequire(require.resolve(base+(packaged?'package/campaign-funding':'funding')));
const {getFirestore,Timestamp}=rr('firebase-admin/firestore');
const db=getFirestore(),auth=rr('firebase-admin/auth').getAuth();
const actualStripe=fr('stripe');
const sessions=new Map();let creates=0;
class LocalStripe {
 constructor() {
  this.checkout={sessions:{
   create:async(data,options)=>{creates++;assert.ok(options.idempotencyKey);const id='cs_emulator_'+creates;
    const result={id,url:'https://checkout.invalid/'+id,livemode:true,status:'open',payment_status:'unpaid',
      expires_at:Math.floor(Date.now()/1000)+1800,client_reference_id:data.client_reference_id,
      metadata:data.metadata,currency:data.line_items[0].price_data.currency,
      amount_total:data.line_items[0].price_data.unit_amount,payment_intent:'pi_emulator_'+creates};
    sessions.set(id,result);return result;},
   retrieve:async id=>sessions.get(id)}};
  this.webhooks=actualStripe.webhooks;
 }
}
require.cache[fr.resolve('stripe')].exports=LocalStripe;
const funding=fr('./index.js');
const privacyPath=packaged?base+'package/logistics-access':'../functions-logistics-access';
const privacy=require(privacyPath);
const pr=createRequire(require.resolve(privacyPath));
const roomPath=packaged?base+'package/job-room-core':'../.firebase/production-launch/job-room';
const jobRoom=require(roomPath);
const jr=createRequire(require.resolve(roomPath));
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const invoke=(handlers,name,uid,data)=>fft.wrap(handlers[name])({data,auth:uid?{uid,token:{email_verified:true,email:uid+'@example.invalid'}}:undefined});
const call=(name,uid,data)=>invoke(runtime,name,uid,data);
const pcall=(name,uid,data)=>invoke(funding,name,uid,data);
const realFetch=global.fetch;
const geometry=[];
// Synthetic provider linework: ordinary public road, no private/address fixture.
for(let i=0;i<7;i++)geometry.push({lat:40-.0015+i*.0005,lon:-75-.0015});
for(let i=1;i<7;i++)geometry.push({lat:40+.0015,lon:-75-.0015+i*.0005});
for(let i=1;i<7;i++)geometry.push({lat:40+.0015-i*.0005,lon:-75+.0015});
for(let i=1;i<7;i++)geometry.push({lat:40-.0015,lon:-75+.0015-i*.0005});
global.fetch=async(url,options)=>{
 if(String(url)==='https://overpass-api.de/api/interpreter')return {ok:true,json:async()=>({elements:[{id:1,type:'way',tags:{highway:'residential',foot:'yes'},geometry}]})};
 if(/https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(String(url)))return realFetch(url,options);
 throw Error('External network denied in production lifecycle proof');
};
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:process.env.GCLOUD_PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.production.rules'),'utf8')}});
 for(const col of await db.listCollections())await db.recursiveDelete(col);
 for(const [uid,role]of [['business','business'],['scaler','scaler'],['other','scaler']]) {
  try{await auth.createUser({uid,email:uid+'@example.invalid',emailVerified:true});}catch(e){if(e.code!=='auth/uid-already-exists')throw e;}
  await db.doc('users/'+uid).set({role,active:true});
  for(const [type,agreementVersion]of Object.entries(require('./legal_consent').AGREEMENTS)) {
   await db.doc(`legalConsents/${uid}_${type}_${agreementVersion}`).set({uid,agreementType:type,agreementVersion,acceptedAt:Timestamp.now()});
  }
 }
 await db.doc('businessSubscriptions/business').set({plan:'starter',status:'active',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
 await auth.createUser({uid:'notification-admin',email:require('../functions-campaign-funding/admin_revenue_notifications').SUPPORT_EMAIL,emailVerified:true});
});
after(async()=>{
 global.fetch=realFetch;require.cache[fr.resolve('stripe')].exports=actualStripe;
 await env?.cleanup();fft.cleanup();
 for(const req of [rr,fr,pr,jr])for(const app of req('firebase-admin/app').getApps())await app.delete();
});
test('normal production-compatible create → map → signed mock funding → accept → track → review → one full earning',async()=>{
 const client=env.authenticatedContext('business',{email_verified:true}).firestore();
 const clientFV=require('firebase/compat/app').default.firestore.FieldValue;
 const boundary=require('./smart_zone_planning').rectangleAround({latitude:40,longitude:-75},600,600);
 await assertSucceeds(client.doc('campaigns/ordinary').set({campaignName:'Neighborhood route',campaignType:'neighborhoodCanvassing',
  businessId:'business',status:'draft',createdAt:clientFV.serverTimestamp(),updatedAt:clientFV.serverTimestamp(),
  basePay:150,bonus:25,serviceArea:boundary,materialsRequired:false,materialFulfillmentType:'no_materials_required',
  timeZone:'UTC',workWindowStart:'00:00',workWindowEnd:'23:59'}));
 const req={campaignId:'ordinary',desiredHours:5};
 const plan=await call('getSmartZonePlan','business',req);
 assert.ok(plan.routeReviewDigest);assert.equal(plan.zones.length,1);
 assert.deepEqual(await call('getSmartZonePlan','business',req),plan);
 await assert.rejects(call('applySmartZonePlan','business',{...req,planId:plan.planId}));
 const applied=await call('applySmartZonePlan','business',{...req,planId:plan.planId,routeReviewDigest:plan.routeReviewDigest});
 assert.equal(applied.zoneCount,1);
 const replay=await call('applySmartZonePlan','business',{...req,planId:plan.planId,routeReviewDigest:plan.routeReviewDigest});
 assert.equal(replay.replay,true);
 const zoneDoc=(await db.collection('campaignZones').where('campaignId','==','ordinary').get()).docs[0];
 const zoneId=zoneDoc.id,zone=zoneDoc.data();
 assert.ok(zone.executionRoute.uniqueRouteMeters>0);
 await assertFails(client.doc('campaignZones/'+zoneId).update({executionRoute:{...zone.executionRoute,denominatorMeters:1}}));
 await assertFails(client.doc('campaigns/ordinary').update({completionPolicyVersion:'forged'}));
 const quote=await pcall('quoteCampaignFunding','business',{campaignId:'ordinary'});
 assert.equal(quote.workerAmountCents,17500);assert.equal(quote.totalChargeCents,21000);
 const checkout=await pcall('createCampaignFundingCheckoutSession','business',{campaignId:'ordinary',approvedQuoteDigest:quote.quoteDigest});
 assert.equal(creates,1);
 await assertFails(client.doc('campaigns/ordinary').update({basePay:1}));
 await assert.rejects(pcall('publishFundedCampaign','business',{campaignId:'ordinary'}));
 const session=sessions.get(checkout.sessionId);session.status='complete';session.payment_status='paid';
 const event={id:'evt_emulator_completed',object:'event',livemode:true,type:'checkout.session.completed',data:{object:session}};
 const rawBody=Buffer.from(JSON.stringify(event));
 const signature=actualStripe.webhooks.generateTestHeaderString({payload:rawBody.toString(),secret:process.env.STRIPE_LIVE_WEBHOOK_SECRET});
 async function webhook(){let status;const response={status(code){status=code;return this;},send(){return this;},json(){return this;}};
  await funding.stripeWebhook({method:'POST',rawBody,headers:{'stripe-signature':signature}},response);assert.equal(status,200);}
 await webhook();await webhook();
 assert.equal((await db.doc('campaignPayments/'+checkout.paymentId).get()).data().status,'paid');
 assert.equal((await pcall('publishFundedCampaign','business',{campaignId:'ordinary'})).status,'open');
 assert.equal((await pcall('publishFundedCampaign','business',{campaignId:'ordinary'})).replay,true);
 await fft.wrap(privacy.projectCampaignDiscoveryV1)({params:{campaignId:'ordinary'}});
 const sc=env.authenticatedContext('scaler',{email_verified:true}).firestore();
 await assertFails(sc.doc('campaigns/ordinary').get());
 const discovery=await assertSucceeds(sc.doc('campaignDiscovery/ordinary').get());
 assert.equal(discovery.data().compensationOffer.offerDigest,quote.offerDigest);
 assert.equal(discovery.data().acceptedOffer,undefined);
 await assert.rejects(call('applyToCampaign','scaler',{campaignId:'ordinary'}));
 await call('applyToCampaign','scaler',{campaignId:'ordinary',acceptedOfferDigest:quote.offerDigest});
 await call('applyToCampaign','scaler',{campaignId:'ordinary',acceptedOfferDigest:quote.offerDigest});
 assert.equal((await db.collection('campaigns/ordinary/applications').get()).size,1);
 await call('assignScalerToZone','business',{campaignId:'ordinary',zoneId,applicationId:'scaler'});
 const contract=(await db.doc('assignmentCompensations/'+zoneId).get()).data();
 assert.equal(contract.completionPolicyVersion,'CanvassingRoute80_95V1');assert.equal(contract.baseAmountCents,15000);
 assert.equal(contract.bonusAmountCents,2500);assert.ok(contract.contractDigest);
 await assertSucceeds(sc.doc('assignmentCompensations/'+zoneId).get());
 await assertFails(env.authenticatedContext('other',{email_verified:true}).firestore().doc('assignmentCompensations/'+zoneId).get());
 await assert.rejects(call('startTrackingSession','other',{campaignId:'ordinary',zoneId}));
 const started=await call('startTrackingSession','scaler',{campaignId:'ordinary',zoneId});
 const line=zone.executionRoute.centerline,points=[],distance=require('./route_progress').distance;
 for(let i=1;i<line.length;i++) {
  const steps=Math.max(1,Math.ceil(distance(line[i-1],line[i])/10));
  for(let j=0;j<steps;j++)points.push({latitude:line[i-1].latitude+(line[i].latitude-line[i-1].latitude)*j/steps,
    longitude:line[i-1].longitude+(line[i].longitude-line[i-1].longitude)*j/steps});
 }
 points.push(line.at(-1));
 const startMs=Date.now()-(points.length+1)*10000;
 await db.doc('trackingSessions/'+started.sessionId).update({startedAt:Timestamp.fromMillis(startMs)});
 const upload=points.map((p,i)=>({...p,sequence:i+1,timestampMs:startMs+i*10000,horizontalAccuracy:5,speed:1,heading:0}));
 for(let i=0;i<upload.length;i+=100) {const chunk=upload.slice(i,i+100);
  await call('uploadTrackingChunk','scaler',{sessionId:started.sessionId,startSequence:chunk[0].sequence,endSequence:chunk.at(-1).sequence,points:chunk});}
 const finished=await call('completeTrackingSession','scaler',{sessionId:started.sessionId});
 assert.equal(finished.status,'completed');
 assert.equal((await call('completeTrackingSession','scaler',{sessionId:started.sessionId})).routeId,finished.routeId);
 assert.equal((await db.doc('activeTrackingSessions/scaler').get()).exists,false);
 const draft=await call('initializeCampaignCompletion','scaler',{campaignId:'ordinary',zoneId,routeId:finished.routeId});
 const submitted=await call('submitZoneCompletion','scaler',{completionId:draft.completionId,reviewMode:'ordinary'});
 assert.equal(submitted.calculatedTransferAmountCents,17500);
 await call('submitZoneCompletion','scaler',{completionId:draft.completionId,reviewMode:'ordinary'});
 await assert.rejects(call('reviewCampaignCompletion','business',{completionId:draft.completionId,decision:'reject',feedback:'Wrong review interface'}));
 assert.equal((await db.collection('walletTransactions').get()).size,0);
 const room=await invoke(jobRoom,'getJobRoom','business',{zoneId,privacyVersion:'logistics_privacy_v1'});
 assert.ok(room.completionEvidence.path.length>2);assert.ok(room.completionEvidence.estimate.coveragePercentage>=95);
 assert.equal(room.completionEvidence.policy.payableAmountCents,17500);
 assert.equal(room.completionEvidence.checkpoints.length,0);
 assert.equal(room.completionEvidence.estimate.householdCoverage,null);
 await assert.rejects(call('finalizeZoneReview','scaler',{zoneId,decision:'approve'}));
 const attempts=await Promise.all([call('finalizeZoneReview','business',{zoneId,decision:'approve'}),
   call('finalizeZoneReview','business',{zoneId,decision:'approve'})]);
 const approved=attempts.find(r=>!r.alreadyProcessed);
 assert.equal(attempts.filter(r=>r.alreadyProcessed).length,1);
 assert.equal(approved.payout.baseAmountCents,15000);assert.equal(approved.payout.bonusAmountCents,2500);
 assert.equal((await call('finalizeZoneReview','business',{zoneId,decision:'approve'})).alreadyProcessed,true);
 assert.equal((await db.collection('scalerTransfers').get()).size,1);
 assert.equal((await db.collection('walletTransactions').get()).size,1);
 assert.equal((await db.collection('wallets/scaler/transactions').get()).size,1);
 assert.equal((await db.doc('wallets/scaler').get()).data().availableBalance,175);
 assert.equal((await db.collection('campaignCompletions').get()).size,1);
 await assertFails(sc.doc('assignmentCompensations/'+zoneId).get());
 assert.equal(creates,1);
});
test('ordinary manual-zone analysis uses the same mapper and requires reviewed route before quote',async()=>{
 const client=env.authenticatedContext('business',{email_verified:true}).firestore();
 const fv=require('firebase/compat/app').default.firestore.FieldValue;
 await assertSucceeds(client.doc('campaigns/manual').set({businessId:'business',campaignName:'Manual territory',
  campaignType:'neighborhoodCanvassing',status:'draft',basePay:160,bonus:0,createdAt:fv.serverTimestamp()}));
 const corridor=require('./smart_zone_planning').rectangleAround({latitude:40,longitude:-75},600,600);
 // Draft geometry is client-selected; the payable route and denominator are not.
 await assertSucceeds(client.doc('campaignZones/manual-zone').set({campaignId:'manual',businessId:'business',zoneName:'Manual Zone',
  status:'unassigned',assignedScalerId:null,serviceArea:corridor,serviceAreaPointCount:4,shapeType:'polygon',serviceAreaType:'polygon',
  homeCountStatus:'pending',analysisStatus:'waiting',estimatedHomes:0,createdAt:fv.serverTimestamp(),updatedAt:fv.serverTimestamp()}));
 const preview=await call('analyzeCampaignZone','business',{zoneId:'manual-zone'});
 assert.equal(preview.routeReviewRequired,true);
 await assert.rejects(pcall('quoteCampaignFunding','business',{campaignId:'manual'}));
 const approved=await call('analyzeCampaignZone','business',{zoneId:'manual-zone',routeReviewDigest:preview.routeReviewDigest});
 assert.equal(approved.routeReviewRequired,false);
 const q=await pcall('quoteCampaignFunding','business',{campaignId:'manual'});
 assert.equal(q.acceptedOffer.bonusAmountCents,0);assert.equal(q.workerAmountCents,16000);
 const before=(await db.doc('campaignZones/manual-zone').get()).data();
 await assert.rejects(call('analyzeCampaignZone','other',{zoneId:'manual-zone'}));
 assert.deepEqual((await db.doc('campaignZones/manual-zone').get()).data(),before);
});

test('pinned legacy payout/group paths reject new policy, while settled legacy replays remain unchanged',async()=>{
 const payout=require(base+(packaged?'package/default':'tracking/legacy-payout'));
 const group=packaged?runtime:require(base+'tracking/legacy-group');
 const zone=(await db.collection('campaignZones').where('campaignId','==','ordinary').get()).docs[0];
 await db.doc('wallets/business').set({reservedCredits:500});
 await db.doc('payouts/legacy-interface').set({businessId:'business',scalerId:'scaler',campaignId:'ordinary',zoneId:zone.id,status:'pending_review',totalPayout:40});
 const before=(await db.doc('wallets/scaler').get()).data();
 await assert.rejects(invoke(payout,'approveZonePayout','business',{payoutId:'legacy-interface'}),/current Job Room/);
 await assert.rejects(invoke(group,'configureZoneGroupAssignment','business',{campaignId:'ordinary',zoneId:zone.id,requiredScalerCount:1}),/accepted application/);
 assert.deepEqual((await db.doc('wallets/scaler').get()).data(),before);
 assert.equal((await db.collection('zoneGroupAssignments').get()).size,0);
 await db.doc('campaigns/historical').set({businessId:'business',status:'completed'});
 await db.doc('campaignZones/historical-zone').set({businessId:'business',campaignId:'historical',reviewStatus:'approved',status:'completed'});
 await db.doc('payouts/historical-paid').set({businessId:'business',status:'paid',totalPayout:65});
 const history=(await db.doc('campaignZones/historical-zone').get()).data();
 assert.equal((await call('finalizeZoneReview','business',{zoneId:'historical-zone',decision:'approve'})).alreadyProcessed,true);
 assert.equal((await invoke(payout,'approveZonePayout','business',{payoutId:'historical-paid'})).alreadyPaid,true);
 assert.deepEqual((await db.doc('campaignZones/historical-zone').get()).data(),history);
 assert.equal((await db.collection('walletTransactions').get()).size,1);
 process.env.CANVASSING_NEW_CONTRACTS_ENABLED='false';
 await assert.rejects(pcall('quoteCampaignFunding','business',{campaignId:'manual'}));
 assert.equal((await call('finalizeZoneReview','business',{zoneId:zone.id,decision:'approve'})).alreadyProcessed,true);
 process.env.CANVASSING_NEW_CONTRACTS_ENABLED='true';
});

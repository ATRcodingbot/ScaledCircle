'use strict';
const assert=require('node:assert/strict');
const {test,before,beforeEach,after}=require('node:test');
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
process.env.GCLOUD_PROJECT='demo-production-engineering';
process.env.GOOGLE_CLOUD_PROJECT='demo-production-engineering';
const fft=require('firebase-functions-test')({projectId:'demo-production-engineering'});
const f=require('../.firebase/production-engineering/tracking');
const candidateRequire=require('node:module').createRequire(require.resolve('../.firebase/production-engineering/tracking'));
const {getFirestore,Timestamp}=candidateRequire('firebase-admin/firestore');
const {getAuth}=candidateRequire('firebase-admin/auth');
const {getApps}=candidateRequire('firebase-admin/app');
const {derive,POLICY}=require('./canvassing_route_authority');
const contracts=require('./production_canvassing_contract');
const db=getFirestore(),auth=getAuth();
const call=(name,uid,data)=>fft.wrap(f[name])({data,auth:uid?{uid,token:{email_verified:true,email:uid+'@test.invalid'}}:undefined});
let zone,contract;
before(async()=>{for(const uid of ['business','scaler','other']){
  try{await auth.createUser({uid,email:uid+'@test.invalid',emailVerified:true});}catch(e){if(e.code!=='auth/uid-already-exists')throw e;}
}});
beforeEach(async()=>{
 for(const col of await db.listCollections())await db.recursiveDelete(col);
 const a={latitude:40,longitude:-75},b={latitude:40.001,longitude:-75};
 const corridor=[{latitude:39.9999,longitude:-75.0001},{latitude:40.0011,longitude:-75.0001},
  {latitude:40.0011,longitude:-74.9999},{latitude:39.9999,longitude:-74.9999}];
 const route=derive({campaignId:'campaign',zoneId:'zone',corridor,accessAcknowledged:true,
  snapshot:{source:'openstreetmap_bounded_snapshot_v1',routeWays:[{id:'road',geometry:[a,b],highway:'residential'}],exclusionPolygons:[]}});
 zone={id:'zone',campaignId:'campaign',businessId:'business',zoneName:'Zone 1',status:'unassigned',serviceArea:corridor,...route};
 const offer=contracts.prepareOffer({project:'scaled-circle',campaign:{id:'campaign',businessId:'business',campaignType:'neighborhoodCanvassing',status:'draft',createdAtMs:2000},
  zones:[zone],routeAuthorities:{zone:zone.coverageAuthority},baseAmountCents:15000,bonusAmountCents:2500,effectiveFromMs:1000,createdAtMs:2000});
 contract=contracts.acceptOffer({offer,zone,routeAuthority:zone.coverageAuthority,serverAcceptedAtMs:3000,
  application:{campaignId:'campaign',zoneId:'zone',scalerId:'scaler',status:'pending',acceptedOfferDigest:offer.offerDigest},
  payment:{campaignId:'campaign',businessId:'business',status:'funded',currency:'usd',offerDigest:offer.offerDigest,workerAmountCents:17500}});
 await Promise.all([
  ...['scaler','other','business'].map(uid=>db.doc('users/'+uid).set({role:uid==='business'?'business':'scaler',active:true})),
  db.doc('campaigns/campaign').set({businessId:'business',campaignType:'neighborhoodCanvassing',completionPolicyVersion:POLICY,
    status:'open',fundingStatus:'funded',fundingPaymentId:'payment',acceptedOffer:offer,materialsRequired:false,timeZone:'UTC',workWindowStart:'00:00',workWindowEnd:'23:59'}),
  db.doc('campaignZones/zone').set({...zone,status:'assigned',assignedScalerId:'scaler',fundingPaymentId:'payment'}),
  db.doc('campaignPayments/payment').set({campaignId:'campaign',businessId:'business',status:'paid',paidAt:Timestamp.now(),
    stripeMode:'live',stripePaymentIntentId:'pi_fixture',currency:'usd',workerAmountCents:17500,platformFeeCents:3500,
    businessChargeCents:21000,offerDigest:offer.offerDigest,acceptedOffer:offer}),
  ...['terms','scaler_work'].map(type=>db.doc('legalConsents/scaler_'+type+'_'+require('./legal_consent').AGREEMENTS[type]).set({
    uid:'scaler',agreementType:type,agreementVersion:require('./legal_consent').AGREEMENTS[type]})),
  db.doc('assignmentCompensations/zone').set(contract),
  db.doc('legalConsents/scaler_location_notice_location-notice-2026-08-v1').set({uid:'scaler',userRole:'scaler',agreementType:'location_notice',
    agreementVersion:'location-notice-2026-08-v1',acceptedAt:Timestamp.now(),source:'scaler_tracking'})]);
 const funds=require('./campaign_fund_allocation'),ref=db.doc('campaignPayments/payment');
 const payment=(await ref.get()).data();payment.fundingAllocation=funds.create('payment',payment);
 payment.fundingAllocation=funds.reserve('payment',payment,contract);
 await ref.update({fundingAllocation:payment.fundingAllocation,fundingProtection:{version:funds.VERSION,
   paymentIntentId:payment.stripePaymentIntentId,withdrawalControl:'committed_funds_retained',sourceAvailable:true,
   providerBalanceTransactionId:'txn_fixture',verifiedAtMs:Date.now(),netAvailableCents:20000}});
 for(const type of require('./legal_consent').ROLE_REQUIREMENTS.business_funding) {
   const version=require('./legal_consent').AGREEMENTS[type];
   await db.doc('legalConsents/business_'+type+'_'+version).set({uid:'business',agreementType:type,agreementVersion:version});
 }
});
after(async()=>{fft.cleanup();for(const app of getApps())await app.delete();});
test('production-compatible start denies signed out/cross/wrong role and preserves one session',async()=>{
 for(const uid of [null,'other','business'])await assert.rejects(call('startTrackingSession',uid,{campaignId:'campaign',zoneId:'zone'}));
 await call('startAssignedZone','scaler',{campaignId:'campaign',zoneId:'zone'});
 const a=await call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'});
 const b=await call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'});
 assert.equal(a.sessionId,b.sessionId);assert.equal((await db.collection('trackingSessions').get()).size,1);
});
test('actual production start rejects funding invalidated after assignment without changing earned evidence',async()=>{
 const before=(await db.doc('assignmentCompensations/zone').get()).data();
 for(const patch of [{status:'refunded'},{status:'paid',disputeOpen:true},{disputeOpen:false,refundReservedWorkerAmountCents:1}]){
  await db.doc('campaignPayments/payment').update(patch);
  for(const name of ['startAssignedZone','startTrackingSession'])await assert.rejects(call(name,'scaler',{campaignId:'campaign',zoneId:'zone'}),e=>e.code==='failed-precondition');
 }
 assert.equal((await db.collection('trackingSessions').get()).size,0);
 assert.deepEqual((await db.doc('assignmentCompensations/zone').get()).data(),before);
 assert.equal((await db.doc('campaignZones/zone').get()).data().status,'assigned');
});
test('upload/finalize is queue-compatible, photo-free, duplicate-safe and creates no money',async()=>{
 const {sessionId}=await call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'});
 const start=Date.now()-120000;await db.doc('trackingSessions/'+sessionId).update({startedAt:Timestamp.fromMillis(start)});
 const points=Array.from({length:12},(_,i)=>({sequence:i+1,latitude:40+i*.001/11,longitude:-75,
  timestampMs:start+i*10000,horizontalAccuracy:5,speed:1.1,heading:0}));
 const payload={sessionId,startSequence:1,endSequence:12,points};
 await assert.rejects(call('uploadTrackingChunk','other',payload));
 await call('uploadTrackingChunk','scaler',payload);
 assert.equal((await call('uploadTrackingChunk','scaler',payload)).duplicate,true);
 const progress=await call('getTrackingSessionState','scaler',{sessionId,includeProgress:true});
 assert.ok(JSON.stringify(progress).includes('coveragePercentage'));
 const result=await call('completeTrackingSession','scaler',{sessionId});
 assert.equal(result.status,'completed');
 assert.equal((await call('completeTrackingSession','scaler',{sessionId})).routeId,result.routeId);
 assert.equal((await db.doc('activeTrackingSessions/scaler').get()).exists,false);
 assert.equal((await db.doc('campaignZones/zone').get()).data().gpsTracking,false);
 assert.equal((await db.collection('campaignRoutes').get()).size,1);
 assert.equal((await db.collection('walletTransactions').get()).size,0);
 assert.equal((await db.collection('wallets').get()).size,0);
 assert.equal((await db.collection('campaignCompletions').get()).size,0);
 assert.equal((await db.collection('trackingCheckpoints').get()).size,0);
});
test('missing route authority cannot start payable canvassing',async()=>{
 await db.doc('campaignZones/zone').update({executionRoute:null});
 await assert.rejects(call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'}),e=>e.code==='failed-precondition');
 assert.equal((await db.collection('trackingSessions').get()).size,0);
});
test('normal cancellation clears pointer and cross-user cancellation is denied',async()=>{
 const {sessionId}=await call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'});
 await assert.rejects(call('cancelTrackingSession','other',{sessionId}));
 await call('cancelTrackingSession','scaler',{sessionId});
 assert.equal((await db.doc('activeTrackingSessions/scaler').get()).exists,false);
 assert.equal((await db.doc('trackingSessions/'+sessionId).get()).data().status,'cancelled');
});
test('disabled, unverified and missing location consent cannot start',async()=>{
 for(const changes of [{disabled:true},{emailVerified:false}]) {
  await auth.updateUser('scaler',changes);
  await assert.rejects(call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'}));
  await auth.updateUser('scaler',{disabled:false,emailVerified:true});
 }
 await db.doc('legalConsents/scaler_location_notice_location-notice-2026-08-v1').delete();
 await assert.rejects(call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'}));
 assert.equal((await db.collection('trackingSessions').get()).size,0);
});
test('low-accuracy and teleport evidence cannot earn route credit; revoked assignment cannot upload',async()=>{
 const {sessionId}=await call('startTrackingSession','scaler',{campaignId:'campaign',zoneId:'zone'});
 const start=Date.now()-60000;await db.doc('trackingSessions/'+sessionId).update({startedAt:Timestamp.fromMillis(start)});
 const points=[{latitude:40,longitude:-75,horizontalAccuracy:5},
  {latitude:40.0001,longitude:-75,horizontalAccuracy:500},
  {latitude:42,longitude:-75,horizontalAccuracy:5}].map((p,i)=>({...p,sequence:i+1,timestampMs:start+i*10000}));
 await call('uploadTrackingChunk','scaler',{sessionId,startSequence:1,endSequence:3,points});
 const chunk=(await db.collection('trackingSessions/'+sessionId+'/chunks').get()).docs[0].data();
 assert.equal(chunk.points[0].accepted,true);assert.equal(chunk.points[1].accepted,false);assert.equal(chunk.points[2].accepted,false);
 await db.doc('campaignZones/zone').update({assignedScalerId:'other'});
 await assert.rejects(call('uploadTrackingChunk','scaler',{sessionId,startSequence:4,endSequence:4,
  points:[{...points[0],sequence:4,timestampMs:start+40000}]}));
 await assert.rejects(call('getTrackingSessionState','scaler',{sessionId,includeProgress:true}));
});
const readback=require('../.firebase/production-engineering/funding/campaign_state_readback');
async function presentation(scalerUid=null) {
 const ref=db.doc('campaigns/campaign'),campaign=(await ref.get()).data();
 const {HttpsError}=require('firebase-functions/v2/https');
 return readback.read({db,auth,Timestamp,HttpsError,input:{ref,campaign,campaignId:'campaign'},scalerUid,
   loadProvider:async p=>({account:{id:'acct_1U328bI9d5xWNArH'},balanceSettings:{payments:{payouts:{schedule:{interval:'manual'}}}},
     balance:{livemode:true,available:[{currency:'usd',amount:21000}]},
     intent:{id:p.stripePaymentIntentId,livemode:true,status:'succeeded',currency:'usd',amount_received:21000,
       latest_charge:{id:'ch_fixture',paid:true,livemode:true,disputed:false,refunded:false,amount_refunded:0,payment_intent:p.stripePaymentIntentId,amount:21000,currency:'usd',
         balance_transaction:{id:'txn_fixture',currency:'usd',amount:21000,source:'ch_fixture',status:'available',fee:1000,net:20000}}}})});
}
test('read-only readiness reuses live start gates without creating tracking or changing allocations',async()=>{
 const before=(await db.doc('campaignPayments/payment').get()).data();
 const result=await presentation();assert.equal(result.eligibility.state,'ready');assert.equal(result.eligibility.readyZoneCount,1);
 assert.deepEqual((await db.doc('campaignPayments/payment').get()).data(),before);
 assert.equal((await db.collection('trackingSessions').get()).size,0);
 await db.doc('legalConsents/scaler_location_notice_location-notice-2026-08-v1').delete();
 const blocked=await presentation();assert.equal(blocked.eligibility.state,'blocked');assert.equal(blocked.eligibility.zones[0].reason,'consent_required');
});
test('funded unassigned, processing, unsupported and reserve-less presentations never ready',async()=>{
 await db.doc('campaignZones/zone').update({assignedScalerId:null,status:'unassigned'});
 assert.equal((await presentation()).eligibility.state,'awaiting_scaler');
 await db.doc('campaignPayments/payment').update({status:'payment_pending',fundingAllocation:candidateRequire('firebase-admin/firestore').FieldValue.delete()});
 assert.equal((await presentation()).eligibility.state,'payment_processing');
 await db.doc('campaigns/campaign').update({campaignType:'postcardMailing'});
 assert.equal((await presentation()).eligibility.state,'unsupported');
});
test('readback retains earned unpaid obligation through dispute and restricts Scaler visibility',async()=>{
 const f=require('./campaign_fund_allocation'),ref=db.doc('campaignPayments/payment'),p=(await ref.get()).data();
 p.fundingAllocation=f.start('payment',p,contract);p.fundingAllocation=f.earn('payment',p,contract,15000);
 await ref.update({fundingAllocation:p.fundingAllocation,status:'disputed'});
 const result=await presentation('scaler');assert.equal(result.eligibility.state,'funding_issue');assert.equal(result.allocation.workerEarnedCents,15000);assert.equal(result.allocation.workerPaidCents,0);
 assert.equal(result.allocation.customerPaidCents,undefined);
 await assert.rejects(presentation('other'),e=>e.code==='permission-denied');
});

test('missing assignment reserve blocks read-only start readiness',async()=>{
 await db.doc('campaignPayments/payment').update({'fundingAllocation.assignments':{}});
 const result=await presentation();assert.equal(result.eligibility.state,'blocked');assert.equal(result.eligibility.readyZoneCount,0);
});

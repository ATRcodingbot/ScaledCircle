'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {initializeApp}=require('firebase-admin/app'),{getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-paused-work'},'paused-work-tests'),db=getFirestore(app);
const finance=require('./campaign_reserve_settlement'),pause=require('./paused_work'),route=require('./route_progress');
const project='scaledcircle-staging';let ticks=2000000;
const svc=()=>pause.createService({db,FieldValue,Timestamp,project,clock:()=>ticks});
let counter=0;
async function seed({fraction=1}={}) {
 const id='pause-'+(++counter),zoneId=id+'-z',sessionId=id+'-s',campaignId=id+'-c',paymentId=id+'-p',scalerId=id+'-worker',businessId=id+'-owner';
 const line=[{latitude:0,longitude:0},{latitude:.002,longitude:0}],corridor=[...line,{latitude:0,longitude:.0001}];
 const contract={zoneId,campaignId,businessId,scalerId,baseAmountCents:1500,bonusAmountCents:300,immutable:true};
 const points=Array.from({length:24},(_,i)=>({latitude:.002*fraction*i/23,longitude:0,sequence:i+1,accepted:true,horizontalAccuracy:5,timestampMs:1000+i*10000}));
 const zone={campaignId,businessId,assignedScalerId:scalerId,status:'in_progress',activeTrackingSessionId:sessionId,gpsTracking:true,fundingPaymentId:paymentId,
  serviceArea:corridor,executionRoute:{centerline:line,routeHash:route.hash(line),corridorHash:route.hash(corridor),denominatorMeters:route.distance(...line)}};
 await Promise.all([
  db.doc('campaignZones/'+zoneId).set(zone),db.doc('campaigns/'+campaignId).set({businessId,campaignType:'neighborhoodCanvassing',fundingPaymentId:paymentId}),
  db.doc('assignmentCompensations/'+zoneId).set(contract),
  db.doc('campaignPayments/'+paymentId).set({campaignId,businessId,status:'paid',paidAt:Timestamp.now(),stripeMode:'test',stripePaymentIntentId:'pi_'+id,currency:'usd',workerAmountCents:1800,platformFeeCents:360,businessChargeCents:2160}),
  db.doc('trackingSessions/'+sessionId).set({zoneId,campaignId,scalerId,status:'active',startedAt:Timestamp.now(),pointCount:24,chunkCount:1,currentSegmentId:'segment_1'}),
  db.doc(`trackingSessions/${sessionId}/chunks/one`).set({zoneId,sessionId,scalerId,startSequence:1,endSequence:24,payloadDigest:'test',points}),
  db.doc('activeTrackingSessions/'+scalerId).set({sessionId})]);
 return {zoneId,sessionId,campaignId,paymentId,scalerId,businessId,contract,zone};
}
const actor=f=>({uid:f.scalerId}),owner=f=>({uid:f.businessId});
const paused=f=>svc().pause({zoneId:f.zoneId,sessionId:f.sessionId,expectedPointCount:24},actor(f));
async function noMoney(f){assert.equal((await db.doc('wallets/'+f.scalerId).get()).exists,false);assert.equal((await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get()).size,0);}
after(()=>app.delete());
test('intentional pause saves same session, notifies once, stops pointer; resume is bounded and preserves evidence',async()=>{
 const f=await seed();await assert.rejects(svc().pause({...f,expectedPointCount:24},{uid:'other'}));
 await assert.rejects(svc().pause({...f,expectedPointCount:23},actor(f)));
 const [a,b]=await Promise.all([paused(f),paused(f)]);assert.equal(a.pauseId,b.pauseId);
 assert.equal(a.resumeByMs,ticks+86400000);assert.equal((await db.doc('activeTrackingSessions/'+f.scalerId).get()).exists,false);
 assert.equal((await db.doc('trackingSessions/'+f.sessionId).get()).data().pointCount,24);
 assert.equal((await db.collection('notifications').where('zoneId','==',f.zoneId).get()).size,1);await noMoney(f);
 await assert.rejects(svc().read(f.zoneId,{uid:'other'}));
 await db.runTransaction(async tx=>{const z=(await tx.get(db.doc('campaignZones/'+f.zoneId))).data();await svc().resume(tx,f.zoneId,z,f.sessionId,actor(f));});
 assert.equal((await db.doc('workPauses/'+a.pauseId).get()).data().state,'resumed');
 await assert.rejects(svc().review({zoneId:f.zoneId,action:'accept_current'},owner(f)));
});
test('24h expiry preserves secured pay and evidence, produces no economic effects',async()=>{
 const f=await seed(),p=await paused(f);ticks=p.resumeByMs;
 await assert.rejects(db.runTransaction(async tx=>{const z=(await tx.get(db.doc('campaignZones/'+f.zoneId))).data();await svc().resume(tx,f.zoneId,z,f.sessionId,actor(f));}));
 await svc().expire();await svc().expire();assert.equal((await db.doc('campaignZones/'+f.zoneId).get()).data().status,'incomplete_review');
 assert.equal((await svc().read(f.zoneId,owner(f))).securedBaseCents,1500);await noMoney(f);
});
test('partial offer requires explicit intended Scaler acceptance; decline/no response has zero economics',async()=>{
 const f=await seed({fraction:.4});await paused(f);
 const offer=await svc().review({zoneId:f.zoneId,action:'offer_partial',amountCents:1000,reason:'Saved accessible work accepted'},owner(f));
 await noMoney(f);
 await assert.rejects(svc().review({zoneId:f.zoneId,action:'accept_offer',offerId:offer.offerId},owner(f)));
 const [a,b]=await Promise.all([svc().review({zoneId:f.zoneId,action:'accept_offer',offerId:offer.offerId},actor(f)),svc().review({zoneId:f.zoneId,action:'accept_offer',offerId:offer.offerId},actor(f))]);
 assert.ok(a.alreadyProcessed||b.alreadyProcessed);
 const s=(await db.doc('campaignSettlements/'+f.zoneId).get()).data();assert.equal(s.earnedWorkerCents,1000);assert.equal(s.earnedFeeCents,200);assert.equal(s.businessReturnCents,960);
 assert.equal((await db.doc('wallets/'+f.scalerId).get()).data().availableBalance,10);
 assert.equal((await db.doc('assignmentCompensations/'+f.zoneId).get()).data().baseAmountCents,1500);
});
test('secured base cannot be reduced; full accepted bonus requires 95%; technical changes hold',async()=>{
 const f=await seed();await paused(f);
 await assert.rejects(svc().review({zoneId:f.zoneId,action:'offer_partial',amountCents:1000,reason:'Too little'},owner(f)));
 const r=await svc().review({zoneId:f.zoneId,action:'accept_current'},owner(f));assert.equal(r.payout.transferAmountCents,1800);
 const s=(await db.doc('campaignSettlements/'+f.zoneId).get()).data();assert.equal(s.returnStatus,'not_required');assert.equal(s.businessReturnCents,0);
 assert.equal((await db.collection('financialOperations').where('zoneId','==',f.zoneId).get()).size,0);
 const changed=await seed();await paused(changed);await db.doc('assignmentCompensations/'+changed.zoneId).update({baseAmountCents:1400});
 await assert.rejects(svc().review({zoneId:changed.zoneId,action:'accept_current'},owner(changed)));await noMoney(changed);
 await assert.rejects(pause.createService({db,FieldValue,Timestamp,project:'scaledcircle-prod'}).read(f.zoneId,owner(f)));
});
async function settleBase(){
 const f=await seed({fraction:.86});await paused(f);const r=await svc().review({zoneId:f.zoneId,action:'accept_current'},owner(f));assert.equal(r.payout.transferAmountCents,1500);return f;
}
function providerFor(f,{ambiguous=false,status='succeeded'}={}) {
 let calls=0,refund=null;
 return {get calls(){return calls;},get refund(){return refund;},api:{paymentIntents:{retrieve:async()=>({livemode:false,status:'succeeded',currency:'usd',amount_received:2160})},refunds:{
  create:async(data,options)=>{calls++;assert.ok(options.idempotencyKey);refund={...data,id:'re_test_'+f.zoneId,currency:'usd',livemode:false,status};if(ambiguous)throw Error('response lost');return refund;},
  retrieve:async()=>refund,list:async()=>({data:refund?[refund]:[],has_more:false})}}};
}
test('exactly one earning, Wallet effect and Stripe TEST refund; no stranded reserve or excess fee',async()=>{
 const f=await settleBase(),before=(await db.doc('campaignSettlements/'+f.zoneId).get()).data(),p=providerFor(f);
 assert.equal(before.businessReturnCents,360);assert.equal(before.returnStatus,'refund_pending');
 const service=finance.createService({db,FieldValue,project,stripe:()=>p.api});
 await Promise.all([service.reconcile(before.refundOperationId),service.reconcile(before.refundOperationId)]);await service.reconcile(before.refundOperationId);
 assert.equal(p.calls,1);const payment=(await db.doc('campaignPayments/'+f.paymentId).get()).data();
 assert.equal(payment.reservedWorkerAmountCents,1500);assert.equal(payment.platformFeeRecognizedCents,300);
 assert.equal(payment.refundedWorkerAmountCents,300);assert.equal(payment.platformFeeRefundedCents,60);assert.equal(payment.refundedTotalCents,360);
 assert.equal(payment.refundReservedWorkerAmountCents,0);assert.equal(payment.platformFeeRefundReservedCents,0);assert.equal(payment.platformFeePendingCents,0);
 assert.equal(payment.reservedWorkerAmountCents+payment.platformFeeRecognizedCents+payment.refundedTotalCents,2160);
 assert.equal((await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get()).size,1);
 assert.equal((await db.doc('wallets/'+f.scalerId).get()).data().availableBalance,15);
});
test('ambiguous create holds, then known provider reconciliation closes once without blind retry',async()=>{
 const f=await settleBase(),s=(await db.doc('campaignSettlements/'+f.zoneId).get()).data(),p=providerFor(f,{ambiguous:true});
 const service=finance.createService({db,FieldValue,project,stripe:()=>p.api});
 assert.equal((await service.reconcile(s.refundOperationId)).status,'hold_unknown_outcome');
 assert.equal((await db.doc('campaignSettlements/'+f.zoneId).get()).data().returnStatus,'refund_pending');
 assert.equal((await service.reconcile(s.refundOperationId)).status,'refunded');assert.equal(p.calls,1);
});
test('pending provider refund is not returned money; LIVE and mismatched amounts fail closed',async()=>{
 const f=await settleBase(),s=(await db.doc('campaignSettlements/'+f.zoneId).get()).data(),p=providerFor(f,{status:'pending'});
 const service=finance.createService({db,FieldValue,project,stripe:()=>p.api});await service.reconcile(s.refundOperationId);await service.reconcile(s.refundOperationId);assert.equal(p.calls,1);
 assert.equal((await db.doc('campaignSettlements/'+f.zoneId).get()).data().returnStatus,'refund_pending');
 assert.equal((await db.doc('campaignPayments/'+f.paymentId).get()).data().refundedTotalCents,undefined);
 await db.doc('campaignPayments/'+f.paymentId).update({stripeMode:'live'});await assert.rejects(service.reconcile(s.refundOperationId));assert.equal(p.calls,1);
});
test('late provider refund failure restores the Business return obligation exactly once, never revenue',async()=>{
 const f=await settleBase(),s=(await db.doc('campaignSettlements/'+f.zoneId).get()).data(),p=providerFor(f);
 const service=finance.createService({db,FieldValue,project,stripe:()=>p.api});
 await service.reconcile(s.refundOperationId);p.refund.status='failed';
 await service.reconcile(s.refundOperationId,{verifyProvider:true});await service.reconcile(s.refundOperationId,{verifyProvider:true});
 const payment=(await db.doc('campaignPayments/'+f.paymentId).get()).data();
 assert.equal(payment.refundedTotalCents,0);assert.equal(payment.refundReservedWorkerAmountCents,300);assert.equal(payment.platformFeeRefundReservedCents,60);
 assert.equal(payment.platformFeeRecognizedCents,300);assert.equal(p.calls,1);
 assert.equal((await db.doc('campaignSettlements/'+f.zoneId).get()).data().returnStatus,'refund_attention_required');
});

test('maintained funding webhook reconciles reserve refunds without freezing or canceling the campaign',async()=>{
 const f=await settleBase(),s=(await db.doc('campaignSettlements/'+f.zoneId).get()).data(),p=providerFor(f);
 const intent=(await db.doc('campaignPayments/'+f.paymentId).get()).data().stripePaymentIntentId;
 p.api.charges={retrieve:async()=>({id:'ch_test',livemode:false,payment_intent:intent,amount_refunded:360})};
 await db.doc('campaigns/'+f.campaignId).update({status:'open',fundingStatus:'funded'});
 await finance.createService({db,FieldValue,project,stripe:()=>p.api}).reconcile(s.refundOperationId);
 const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../functions-campaign-funding/index.js'),'utf8');
 const body=source.slice(source.indexOf('async function processEvent('),source.indexOf('exports.stripeWebhook ='));
 const processEvent=new Function('db','FieldValue','require','process',body+';return processEvent;')(
   db,FieldValue,()=>finance,{env:{GCLOUD_PROJECT:project}});
 const snapshot=(await db.doc('campaigns/'+f.campaignId).get()).data();
 await processEvent(p.api,{type:'refund.updated',data:{object:p.refund}});
 await processEvent(p.api,{type:'charge.refunded',data:{object:{id:'ch_test',payment_intent:intent}}});
 assert.deepEqual((await db.doc('campaigns/'+f.campaignId).get()).data(),snapshot);
 assert.equal((await db.doc('campaignPayments/'+f.paymentId).get()).data().status,'paid');
 assert.equal((await db.doc('campaignPayments/'+f.paymentId).get()).data().refundedTotalCents,360);
 assert.equal(p.calls,1);
});

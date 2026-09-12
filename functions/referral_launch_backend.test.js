'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),fs=require('node:fs'),path=require('node:path');
const app=admin.initializeApp({projectId:'demo-referral-authority'},'referral-launch-tests'),db=app.firestore();
const {createService,manualPresentation,launchEnvironment}=require('./referral_launch'),policy=require('./referral_liability');
let now,f,stripe,auth,service,readCalls;
const FieldValue=admin.firestore.FieldValue,Timestamp=admin.firestore.Timestamp;
const identity=uid=>({uid,email:uid+'@example.test',emailVerified:true,disabled:false,metadata:{creationTime:new Date(now-2000).toISOString()}});
const paths=['wallets/customer','walletTransactions/preserved','campaignPayments/preserved','assignmentCompensations/preserved','businessSubscriptions/customer','marketProfiles/customer'];
const snapshot=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,(await db.doc(p).get()).data()])));
beforeEach(async()=>{
 for(const c of await db.listCollections())for(const d of await c.listDocuments())await db.recursiveDelete(d);
 now=Date.parse('2026-09-12T19:00:00Z');readCalls=0;
 f=require('./test_fixtures/referral_invoice').invoiceFixture();
 for(const object of [f.invoice,f.subscription,...f.payments])object.livemode=true;
 f.invoice.created=Math.floor(now/1000)-2;f.invoice.status_transitions.paid_at=Math.floor(now/1000)-1;
 f.subscription.metadata={firebaseUid:'customer',plan:'growth'};f.payments[0].payment={payment_intent:'pi_one'};
 const price={id:'price_fixture',active:true,livemode:true,currency:'usd',unit_amount:29900,product:'scaledcircle_workspace_production_v1',
  metadata:{plan:'growth',purpose:'workspace_membership_production_v1'},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 stripe={events:{retrieve:async id=>{readCalls++;return {id,type:'invoice.paid',livemode:true,data:{object:{id:'in_fixture'}}};}},
  invoices:{retrieve:async()=>f.invoice},subscriptions:{retrieve:async()=>f.subscription},prices:{retrieve:async()=>price},
  products:{retrieve:async()=>({id:price.product,livemode:true,metadata:{purpose:price.metadata.purpose}})},
  invoicePayments:{list:async()=>({data:f.payments,has_more:false})},
  paymentIntents:{retrieve:async()=>({id:'pi_one',livemode:true,status:'succeeded',customer:'cus_fixture',amount_received:f.invoice.amount_paid,currency:'usd',latest_charge:'ch_one'})},
  charges:{retrieve:async()=>({id:'ch_one',livemode:true,paid:true,captured:true,payment_intent:'pi_one',customer:'cus_fixture'})},
  refunds:{list:async()=>({data:f.refunds,has_more:false})},disputes:{list:async()=>({data:f.disputes,has_more:false})},creditNotes:{list:async()=>({data:f.creditNotes,has_more:false})}};
 auth={getUser:async uid=>identity(uid)};
 for(const uid of ['referrer','outsider'])await db.doc('users/'+uid).set({role:'scaler',active:true});
 await db.doc('users/admin').set({role:'admin',active:true});await db.doc('users/customer').set({role:'business',active:true});
 await db.doc('scalerAffiliateProfiles/referrer').set({affiliateUid:'referrer',status:'active',referralCode:'ABCD234567',commissionRateBps:1000,acceptedLaunchPolicyVersion:policy.TERMS});
 await db.doc('scalerAffiliateCodes/ABCD234567').set({affiliateUid:'referrer',status:'active'});
 await db.doc('wallets/customer').set({stripeCustomerId:'cus_fixture',balance:75});
 for(const p of paths.filter(p=>p!=='wallets/customer'))await db.doc(p).set({preserved:true,state:'Maryland',marketStatus:'ACTIVE'});
 await db.doc('businessReferralAttributions/customer').set({businessUid:'customer',affiliateUid:'referrer',attributedAt:Timestamp.fromMillis(now-10000)});
 await db.doc('stripeCampaignEvents/evt_invoice').set({eventId:'evt_invoice',type:'invoice.paid',status:'processed',stripeMode:'live',livemode:true});
 await db.doc('subscriptionPaymentReceipts/in_fixture').set({invoiceId:'in_fixture',subscriptionId:'sub_fixture',businessId:'customer',eventId:'evt_invoice',stripeMode:'live'});
 service=createService({db,FieldValue,Timestamp,auth,project:'scaled-circle',environment:'production',stripe,planForPrice:id=>id==='price_fixture'?'growth':null,now:()=>now});
});
after(async()=>{await db.terminate();await app.delete();});

test('LIVE approved base and bonus produce one separate 1% liability; worker pay and Business cost are unchanged',async()=>{
 const at=Timestamp.fromMillis(now-10000),done=Timestamp.fromMillis(now-1000);
 const transferId=require('./marketplace_finance').operationId('scaler-transfer','job',1);
 const originals={
  'scalerReferralAttributions/worker':{scalerUid:'worker',affiliateUid:'referrer',policyVersion:'ScalerReferralOnePercentV1',attributedAt:at},
  'campaignSettlements/job':{policyVersion:'EarnedWorkReserveReturnV1',source:'ordinary_review',zoneId:'job',campaignId:'campaign',businessId:'customer',scalerId:'worker',paymentId:'payment',earnedWorkerCents:10000,earnedFeeCents:2000,createdAt:done},
  'campaignZones/job':{status:'completed',reviewStatus:'approved',campaignId:'campaign',businessId:'customer',assignedScalerId:'worker',approvedTransferAmountCents:10000,approvedBaseAmountCents:9000,approvedBonusAmountCents:1000},
  'campaignPayments/payment':{status:'paid',paidAt:at,stripeMode:'live',currency:'usd',stripePaymentIntentId:'pi_realfixture',campaignId:'campaign',businessId:'customer',platformFeeRecognizedCents:2000},
  ['scalerTransfers/'+transferId]:{status:'transfer_pending',zoneId:'job',scalerId:'worker',paymentId:'payment',campaignId:'campaign',businessId:'customer',amountCents:10000,baseAmountCents:9000,bonusAmountCents:1000},
  'assignmentCompensations/job':{immutable:true,zoneId:'job',scalerId:'worker',businessId:'customer',campaignId:'campaign',baseAmountCents:9000,bonusAmountCents:1000},
  'walletTransactions/earning_job_v1':{scalerId:'worker',zoneId:'job',amountCents:10000,baseAmountCents:9000,bonusAmountCents:1000,status:'available'},
  'wallets/worker':{availableBalance:100},
 };
 for(const [p,d] of Object.entries(originals))await db.doc(p).set(d);
 const read=async()=>Promise.all(Object.keys(originals).map(async p=>(await db.doc(p).get()).data()));
 const before=await read();await Promise.all([service.reconcileZone('job'),service.reconcileZone('job')]);
 const rewards=await db.collection('referralLiabilities').get();assert.equal(rewards.size,1);
 const row=rewards.docs[0];assert.equal(row.data().mode,'live');assert.equal(row.data().currentCents,100);assert.equal(row.data().paidCents,0);
 assert.equal((await row.ref.collection('journal').get()).size,1);assert.deepEqual(await read(),before);
 assert.equal((await db.collection('notifications').get()).size,1);assert.equal(readCalls,0);
 await db.doc('walletTransactions/earning_job_v1').update({bonusAmountCents:900,amountCents:9900});
 await service.reconcileZone('job');assert.equal((await row.ref.get()).data().currentCents,0);
 assert.deepEqual((await db.doc('assignmentCompensations/job').get()).data(),originals['assignmentCompensations/job']);
 assert.equal((await db.doc('wallets/worker').get()).data().availableBalance,100);
});

test('verified Business owner can intentionally enroll once; team member and missing terms are denied',async()=>{
 await db.doc('users/owner').set({role:'business',active:true});
 await db.doc('businessWorkspaces/owner').set({ownerId:'owner'});
 const input={termsVersion:policy.TERMS};
 await assert.rejects(service.join('owner',{}),/terms_required/);
 await Promise.all([service.join('owner',input),service.join('owner',input)]);
 const p=(await db.doc('scalerAffiliateProfiles/owner').get()).data();assert.equal(p.referrerRole,'business');assert.equal(p.acceptedLaunchPolicyVersion,policy.TERMS);
 assert.equal((await db.collection('referralPolicyAcceptances').get()).size,1);
 assert.equal((await db.collection('referralLiabilities').get()).size,0);
 await db.doc('users/member').set({role:'business',active:true,signupPurpose:'team_invitation',activeBusinessId:'owner'});
 await assert.rejects(service.join('member',input),{code:'permission-denied'});
 auth.getUser=async uid=>({...identity(uid),disabled:true});
 await assert.rejects(service.join('owner',input),{code:'permission-denied'});
});
test('production launch mode is explicit; the old TEST payout runtime remains staging-only',()=>{
 assert.throws(()=>launchEnvironment('scaled-circle','staging'));assert.throws(()=>launchEnvironment('scaledcircle-staging','production'));
 assert.throws(()=>policy.assertRuntime('scaled-circle'));policy.assertRuntime('scaled-circle',policy.MANUAL_LAUNCH_POLICY);
 assert.throws(()=>require('./referral_runtime').createRuntime({project:'scaled-circle',environment:'production'}),/staging/);
});
test('signed retained LIVE invoice produces one held 10% liability without changing production economic authorities',async()=>{
 const before=await snapshot();await service.event('evt_invoice');await service.event('evt_invoice');
 const all=await db.collection('referralLiabilities').get();assert.equal(all.size,1);const reward=all.docs[0].data();
 assert.equal(reward.mode,'live');assert.equal(reward.currentCents,2990);assert.equal(reward.released,false);assert.equal(reward.paidCents,0);
 const dashboard=await service.financials('referrer');assert.equal(dashboard.pendingCents,2990);assert.equal(dashboard.availableCents,0);assert.equal(dashboard.executionEnabled,false);
 assert.equal((await db.collection('referralMilestones').get()).size,1);assert.deepEqual(await snapshot(),before);
 now+=31*86400000;const later=await service.financials('referrer');assert.equal(later.heldCents,2990);assert.equal(later.history[0].status,'UNDER_REVIEW');
 const ledger=policy.createLedger({db,FieldValue,project:'scaled-circle',launchPolicy:policy.MANUAL_LAUNCH_POLICY});
 await assert.rejects(ledger.release(all.docs[0].id,{providerHealthy:true,authorityDigest:reward.authorityDigest}),/manual_payment/);
 assert.equal((await db.collection('financialOperations').get()).size,0);
});
test('refunds and disputes reverse held liability exactly once; stale signed event never restores refunded money',async()=>{
 await service.event('evt_invoice');f.refunds=[{id:'re_full',livemode:true,status:'succeeded',amount:31700}];
 await service.event('evt_invoice');await service.event('evt_invoice');
 const all=await db.collection('referralLiabilities').get(),reward=all.docs[0];assert.equal(reward.data().currentCents,0);
 assert.equal((await reward.ref.collection('journal').get()).size,2);assert.equal((await service.financials('referrer')).paidCents,0);
});
test('missing signed receipt, wrong LIVE mode, wrong provider event and allocation ambiguity never create a reward',async()=>{
 await db.doc('stripeCampaignEvents/evt_invoice').update({status:'processing'});
 await assert.rejects(service.event('evt_invoice'),/signed_event_required/);assert.equal(readCalls,0);
 await db.doc('stripeCampaignEvents/evt_invoice').update({status:'processed',livemode:false});
 await assert.rejects(service.event('evt_invoice'),/signed_event_required/);
 await db.doc('stripeCampaignEvents/evt_invoice').update({livemode:true});
 f.invoice.livemode=false;await assert.rejects(service.event('evt_invoice'),/mode/);
 assert.equal((await db.collection('referralLiabilities').get()).size,0);
 f.invoice.livemode=true;f.invoice.lines.data[0].proration=true;await assert.rejects(service.event('evt_invoice'),/allocation/);
 assert.equal((await db.collection('referralLiabilities').get()).size,0);
});
test('intro discount pays referral only on real collected revenue; signup and a zero invoice create no liability',async()=>{
 f.invoice.amount_paid=100;f.invoice.total_excluding_tax=100;f.invoice.total_taxes=[];f.payments[0].amount_paid=100;
 await service.event('evt_invoice');assert.equal((await service.financials('referrer')).pendingCents,10);
 const raw=await service.dashboard('referrer');assert.equal(raw.referralPayoutAvailable,false);
 const safe=JSON.stringify(raw);assert.doesNotMatch(safe,/cus_fixture|customer@example|stripeCustomerId/);
});
test('Admin review is audited, deduplicated and cannot set amounts, mark Paid, or alter the Scaler Wallet',async()=>{
 const before=await snapshot();await service.event('evt_invoice');const row=(await service.adminOverview('admin')).rewards[0];
 const input={rewardId:row.rewardId,expectedDigest:row.authorityDigest,action:'review',reason:'Verified the retained source economics.'};
 await assert.rejects(service.reviewAdmin('outsider',input),{code:'permission-denied'});
 await assert.rejects(service.reviewAdmin('admin',{...input,amountCents:10000}),/review_invalid/);
 await service.reviewAdmin('admin',input);await service.reviewAdmin('admin',input);
 assert.equal((await db.collection('referralAdminReviews').get()).size,1);
 assert.equal((await service.financials('referrer')).paidCents,0);assert.deepEqual(await snapshot(),before);
 assert.equal((await db.collection('financialOperations').get()).size,0);
 await assert.rejects(service.setRate('admin',{affiliateUid:'referrer',rateBps:2000,reason:'Cannot exceed launch policy.'}));
 await assert.rejects(service.setRate('outsider',{affiliateUid:'referrer',rateBps:1000,reason:'Unauthorized request.'}),{code:'permission-denied'});
});
test('new Scaler signup preserves first-touch attribution; signup never creates money and existing work is denied',async()=>{
 const input={referralCode:'ABCD234567',capturedAtMillis:now-3000};
 await service.attribute('outsider','scaler',input);await service.attribute('outsider','scaler',input);
 assert.equal((await db.collection('scalerReferralAttributions').get()).size,1);
 assert.equal((await db.collection('notifications').get()).size,1);assert.equal((await db.collection('referralLiabilities').get()).size,0);
 await assert.rejects(service.attribute('referrer','scaler',input),/self_referral/);
 await db.doc('users/worker').set({role:'scaler',active:true});await db.doc('scalerTransfers/prior').set({scalerId:'worker'});
 await assert.rejects(service.attribute('worker','scaler',input),/prior_work/);
});
test('disabled and unverified actors cannot read rewards or administer reviews; unrelated account sees no reward data',async()=>{
 await assert.rejects(service.dashboard(null),{code:'unauthenticated'});
 auth.getUser=async uid=>({...identity(uid),disabled:true});await assert.rejects(service.dashboard('referrer'),{code:'permission-denied'});
 auth.getUser=async uid=>({...identity(uid),emailVerified:false});await assert.rejects(service.adminOverview('admin'),{code:'permission-denied'});
 auth.getUser=async uid=>identity(uid);assert.equal((await service.dashboard('outsider')).joined,false);
});
test('existing Rules deny direct liability, signed proof, manual review and paid-state writes even to Admin clients',async()=>{
 const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
 const env=await initializeTestEnvironment({projectId:'demo-referral-rules',firestore:{rules:fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8')}});
 try{for(const uid of ['referrer','admin','stranger',null]){
  const client=uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
  for(const p of ['referralLiabilities/reward','referralBalances/referrer','referralAdminReviews/review','referralInvoiceSignatures/in_one','stripeCampaignEvents/evt_one','subscriptionPaymentReceipts/in_one']){
   await assertFails(client.doc(p).set({paidCents:10000,status:'processed',livemode:true}));await assertFails(client.doc(p).get());
  }
 }}finally{await env.cleanup();}
});

'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'') ||
  [process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(p=>p&&p!=='demo-referral-authority'))throw Error('local_referral_emulator_required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-referral-authority'},'referral-lifecycle');const db=app.firestore(),FieldValue=admin.firestore.FieldValue;
const {createLedger,DAY,hash}=require('./referral_liability');
const {createService}=require('./referral_payouts');
const {createStripeProvider}=require('./scaler_cashout_stripe');
const {runtime,mockStripe}=require('./test_fixtures/cashout');
let clock,options,ledger,mock,provider;
const uid='referrer',account={beneficiaryUid:uid,beneficiaryType:'business_owner',mode:'test',stripeAccountId:'acct_fixture'};
const economic=(sourceId='in_one',type='BUSINESS_SUBSCRIPTION_REFERRAL',basis=29900)=>({sourceId,type,beneficiaryUid:uid,referredId:'referred',relationshipId:'referred',
  grossBasisCents:basis,currentBasisCents:basis,paidAtMillis:clock,authorityDigest:hash(sourceId,basis)});
beforeEach(async()=>{
  for(const name of ['users','scalerAffiliateProfiles','businessWorkspaces','referralLiabilities','referralBalances','referralMilestones',
    'referralRecipients','financialOperations','referralPayoutEvents','outboundEmailJobs','notifications','wallets','walletTransactions','campaignPayments','stripeConnectedAccounts',
    'businessReferralAttributions','referralEconomicClaims','referralInvoiceSignatures'])
    for(const ref of await db.collection(name).listDocuments())await db.recursiveDelete(ref);
  clock=Date.now();options={db,FieldValue,project:'demo-referral-authority',now:()=>clock};ledger=createLedger(options);
  await db.doc('users/'+uid).set({role:'business',active:true});await db.doc('businessWorkspaces/'+uid).set({ownerId:uid});
  await db.doc('scalerAffiliateProfiles/'+uid).set({affiliateUid:uid,status:'active',acceptedLaunchPolicyVersion:'referral-launch-v2-2026-09-10'});
  await db.doc('referralRecipients/'+uid).set(account);
  mock=mockStripe();provider=createStripeProvider({stripe:mock.stripe,runtime});
});
after(async()=>{await db.terminate();await app.delete();});
const payout=proof=>createService({...options,provider,runtime,signedPayout:proof});
async function available(source='in_one',type='BUSINESS_SUBSCRIPTION_REFERRAL',basis=29900){
  const e=economic(source,type,basis);const result=await ledger.reconcile(e);clock+=(type==='BUSINESS_SUBSCRIPTION_REFERRAL'?30:7)*DAY;
  await ledger.reconcile(e);await ledger.release(result.id,{providerHealthy:true,authorityDigest:e.authorityDigest});return {e,id:result.id};
}
test('30/7 day holds, expected dates, below-minimum AVAILABLE and duplicate milestones are exact',async()=>{
  for(const type of ['BUSINESS_SUBSCRIPTION_REFERRAL','SCALER_COMPLETED_WORK_REFERRAL']){
    const e=economic(type,type,10000),result=await ledger.reconcile(e),days=type.startsWith('BUSINESS')?30:7;
    const stored=(await ledger.ref(result.id).get()).data();assert.equal(stored.holdUntilMillis,clock+days*DAY);
    clock+=days*DAY-1;await ledger.reconcile(e);assert.equal((await ledger.release(result.id,{providerHealthy:true,authorityDigest:e.authorityDigest})).released,false);
    clock++;await ledger.reconcile(e);await assert.rejects(ledger.release(result.id,{providerHealthy:false,authorityDigest:e.authorityDigest}));
    await Promise.all([ledger.release(result.id,{providerHealthy:true,authorityDigest:e.authorityDigest}),ledger.release(result.id,{providerHealthy:true,authorityDigest:e.authorityDigest})]);
  }
  assert.equal((await ledger.dashboard(uid)).availableCents,1100);
  assert.equal((await db.collection('referralMilestones').where('type','==','available').get()).size,2);
  await assert.rejects(payout().service.request(uid,{requestId:'minimum_request_001',amountCents:999},account),/minimum/);
});
test('concurrent reserve, duplicate request, signed paid-only recognition, no worker/Business money effects',async()=>{
  const {id}=await available();
  const request={requestId:'referral_request_001',amountCents:2990};
  const {store,service}=payout();
  const results=await Promise.allSettled([store.request(uid,request.requestId,2990,'acct_fixture'),store.request(uid,'second_request_001',2990,'acct_fixture')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const op=results.find(r=>r.status==='fulfilled').value;
  await service.run(op.id,uid);mock.payouts.values().next().value.status='paid';
  await service.run(op.id,uid,{readOnly:true});assert.equal((await ledger.dashboard(uid)).paidCents,0);
  const receipt=mock.payouts.values().next().value;
  const signed=payout({eventId:'evt_paid',payoutId:receipt.id,accountId:'acct_fixture'});
  await signed.store.event('evt_paid',()=>signed.service.run(op.id,uid,{readOnly:true}));
  await signed.store.event('evt_paid',()=>signed.service.run(op.id,uid,{readOnly:true}));
  assert.equal((await ledger.dashboard(uid)).paidCents,2990);assert.equal((await ledger.ref(id).get()).data().reservedCents,0);
  assert.equal(mock.transfers.size,1);assert.equal(mock.payouts.size,1);
  assert.equal((await db.collection('referralMilestones').where('type','==','paid').get()).size,1);
  for(const col of ['wallets','walletTransactions','campaignPayments'])assert.equal((await db.collection(col).get()).size,0);
});
test('definitive transfer failure releases once; payout failure/retry retains liability and never retransfers',async()=>{
  await available();mock.controls.transferFailure='hard';const {service}=payout();
  const failed=await service.request(uid,{requestId:'transfer_failure_001',amountCents:2990},account);
  assert.equal(failed.status,'failed');assert.equal((await ledger.dashboard(uid)).availableCents,2990);
  await service.run(failed.operationId,uid);assert.equal((await ledger.dashboard(uid)).availableCents,2990);
  mock.controls.transferFailure=null;mock.controls.payoutStatus='failed';
  const second=await service.request(uid,{requestId:'payout_failure_0001',amountCents:2990},account);
  assert.equal(second.status,'needs_attention');assert.equal((await ledger.dashboard(uid)).reservedCents,2990);
  mock.controls.payoutStatus='pending';await service.run(second.operationId,uid,{retryPayout:true});
  assert.equal(mock.transfers.size,1);assert.equal(mock.payouts.size,2);
});
test('lost provider responses reconcile before retry, with one transfer and one payout',async()=>{
  await available();mock.controls.transferFailure='lost';const {service}=payout();
  const first=await service.request(uid,{requestId:'lost_response_0001',amountCents:2990},account);
  assert.equal(first.status,'needs_attention');assert.equal(mock.transfers.size,1);
  mock.controls.payoutFailure='lost';await service.run(first.operationId,uid);
  await service.run(first.operationId,uid);assert.equal(mock.transfers.size,1);assert.equal(mock.payouts.size,1);
});
test('post-payout partial/full adjustments preserve paid receipt and offset future earnings',async()=>{
  const {e,id}=await available();const {service,store}=payout();
  const request=await service.request(uid,{requestId:'paid_then_refund_01',amountCents:2990},account);
  const receipt=mock.payouts.values().next().value;receipt.status='paid';
  await payout({eventId:'evt_paid',payoutId:receipt.id,accountId:'acct_fixture'}).service.run(request.operationId,uid,{readOnly:true});
  const before=await store.get(request.operationId,uid);
  await ledger.reconcile({...e,currentBasisCents:19900,authorityDigest:'refund100'});
  assert.equal((await ledger.dashboard(uid)).availableCents,-1000);
  await ledger.reconcile({...e,currentBasisCents:0,authorityDigest:'refundAll'});
  await ledger.reconcile({...e,currentBasisCents:0,authorityDigest:'refundAll'});
  assert.equal((await ledger.dashboard(uid)).availableCents,-2990);
  assert.deepEqual(await store.get(request.operationId,uid),before);
  await available('in_two','BUSINESS_SUBSCRIPTION_REFERRAL',39900);
  assert.equal((await ledger.dashboard(uid)).availableCents,1000);
  assert.equal((await ledger.ref(id).get()).data().paidCents,2990);
  await assert.rejects(payout().store.request(uid,'overdraw_request_01',1001,'acct_fixture'),/insufficient/);
});
test('both recipient types and held reversal preserve separate liabilities; removed beneficiary is denied',async()=>{
  await db.doc('users/'+uid).set({role:'scaler',active:true});await db.doc('referralRecipients/'+uid).set({...account,beneficiaryType:'scaler'});
  const {e}=await available('job','SCALER_COMPLETED_WORK_REFERRAL',100000);
  await payout().service.request(uid,{requestId:'scaler_referrer_001',amountCents:1000},{...account,beneficiaryType:'scaler'});
  assert.equal(mock.transfers.size,1);
  await db.doc('users/'+uid).update({disabled:true});await assert.rejects(ledger.dashboard(uid),/ineligible/);
  await ledger.reconcile({...e,currentBasisCents:0,authorityDigest:'reversed'});
  assert.equal((await db.collection('wallets').get()).size,0);
});

test('Business signed invoice reconciliation dedupes recurring invoices and current refunds despite old events',async()=>{
 const f=require('./test_fixtures/referral_invoice').invoiceFixture();
 f.invoice.created=Math.floor(clock/1000)-1;f.invoice.status_transitions.paid_at=Math.floor(clock/1000);
 f.subscription.metadata={firebaseUid:'referred',plan:'growth'};
 f.payments[0].payment={payment_intent:'pi_one'};
 await db.doc('users/referred').set({role:'business',active:true});await db.doc('wallets/referred').set({stripeCustomerId:'cus_fixture',balance:75});
 await db.doc('businessReferralAttributions/referred').set({businessUid:'referred',affiliateUid:uid,attributedAt:admin.firestore.Timestamp.fromMillis(clock-10000)});
 const price={id:'price_fixture',active:true,livemode:false,currency:'usd',unit_amount:29900,product:'scaledcircle_workspace_staging_v1',
   metadata:{plan:'growth',purpose:'workspace_membership_staging_v1'},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 const stripe={invoices:{retrieve:async()=>f.invoice},subscriptions:{retrieve:async()=>f.subscription},
   prices:{retrieve:async()=>price},products:{retrieve:async()=>({id:price.product,livemode:false,metadata:{purpose:price.metadata.purpose}})},
   invoicePayments:{list:async()=>({data:f.payments,has_more:false})},
   paymentIntents:{retrieve:async()=>({id:'pi_one',livemode:false,status:'succeeded',customer:'cus_fixture',amount_received:f.invoice.amount_paid,currency:'usd',latest_charge:'ch_one'})},
   charges:{retrieve:async()=>({id:'ch_one',livemode:false,paid:true,captured:true,payment_intent:'pi_one',customer:'cus_fixture'})},
   refunds:{list:async()=>({data:f.refunds,has_more:false})},disputes:{list:async()=>({data:f.disputes,has_more:false})},
   creditNotes:{list:async()=>({data:f.creditNotes,has_more:false})}};
 const service=require('./referral_business_reconciliation').createReconciler({...options,stripe,planForPrice:id=>id==='price_fixture'?'growth':null});
 await assert.rejects(service.reconcile('in_fixture'),/signed_invoice/);
 const event={id:'evt_invoice',type:'invoice.paid',livemode:false,data:{object:{id:'in_fixture'}}};
 await service.handleSignedEvent(event);await service.handleSignedEvent(event);
 assert.equal((await db.collection('referralLiabilities').get()).size,1);assert.equal((await ledger.dashboard(uid)).pendingCents,2990);
 f.refunds=[{id:'re_one',livemode:false,status:'succeeded',amount:31700}];
 await service.handleSignedEvent({id:'evt_refund',livemode:false,type:'charge.refunded',data:{object:{id:'ch_one'}}});
 await service.handleSignedEvent(event);assert.equal((await ledger.dashboard(uid)).pendingCents,0);
 assert.equal((await db.doc('wallets/referred').get()).data().balance,75);
 f.refunds=[];f.invoice={...f.invoice,id:'in_next'};f.payments[0].invoice='in_next';
 await service.handleSignedEvent({...event,id:'evt_next',data:{object:{id:'in_next'}}});
 assert.equal((await db.collection('referralLiabilities').get()).size,2);
 assert.equal((await db.collection('businessReferralAttributions').get()).size,1);
});

test('earned/available/paid/adjustment mail jobs are exactly once with Referrals CTA, no recipient details in portal',async()=>{
 const {e,id}=await available();const {service}=payout();
 const result=await service.request(uid,{requestId:'email_cashout_0001',amountCents:2990},account);
 const receipt=mock.payouts.values().next().value;receipt.status='paid';
 await payout({eventId:'evt_mailpaid',payoutId:receipt.id,accountId:'acct_fixture'}).service.run(result.operationId,uid,{readOnly:true});
 await ledger.reconcile({...e,currentBasisCents:19900,authorityDigest:'refundForEmail'});
 const milestones=await db.collection('referralMilestones').get();assert.equal(milestones.size,4);
 const send=require('./referral_communications').queue,auth={getUser:async id=>({uid:id,email:'fixture@example.com',disabled:false,emailVerified:true})};
 for(const m of milestones.docs)await Promise.all([send({...options,auth,milestoneId:m.id}),send({...options,auth,milestoneId:m.id})]);
 const jobs=await db.collection('outboundEmailJobs').get();assert.equal(jobs.size,4);
 for(const d of jobs.docs){assert.equal(require('./transactional_email').validateDeliveryJob(d.data()),true);
   assert.match(d.data().text,/View Referrals: https:\/\/scaledcircle-staging.web.app\/#\/referral-portal/);}
 const portal=JSON.stringify(await ledger.dashboard(uid));assert.doesNotMatch(portal,/fixture@example|cus_|acct_|referredId|beneficiaryUid|sourceId/);
 assert.equal((await ledger.ref(id).get()).data().paidCents,2990);
});

test('Scaler reuses verified Connect recipient; Business onboarding never uses subscription Customer',async()=>{
 const auth={getUser:async()=>({email:'fixture@example.com',emailVerified:true,disabled:false})};
 const recipients=require('./referral_recipient').createRecipientService({...options,auth,stripe:mock.stripe,provider});
 await db.doc('referralRecipients/'+uid).delete();await db.doc('users/'+uid).set({role:'scaler',active:true});
 await db.doc('stripeConnectedAccounts/'+uid).set({scalerId:uid,mode:'test',stripeAccountId:'acct_fixture'});
 assert.equal((await recipients.current(uid)).record.reusedMaintainedRecipient,true);assert.equal(mock.accounts.size,0);
 await db.doc('referralRecipients/'+uid).delete();await db.doc('users/'+uid).set({role:'business',active:true});
 await db.doc('wallets/'+uid).set({stripeCustomerId:'cus_buyer',balance:500});
 await available();await recipients.setup(uid);await recipients.setup(uid);
 assert.equal(mock.accounts.size,1);assert.equal((await db.doc('wallets/'+uid).get()).data().stripeCustomerId,'cus_buyer');
 assert.equal((await db.doc('referralRecipients/'+uid).get()).data().beneficiaryType,'business_owner');
});

test('in-flight duplicate webhook remains retryable and reserved-source reversal blocks provider work',async()=>{
 const {e}=await available();const {store}=payout();let unblock,started;const gate=new Promise(r=>unblock=r),ready=new Promise(r=>started=r);
 const first=store.event('evt_concurrent',async()=>{started();await gate;});await ready;
 await assert.rejects(store.event('evt_concurrent',async()=>{}),/event_busy/);unblock();await first;
 assert.deepEqual(await store.event('evt_concurrent',async()=>{throw Error('must not rerun')}),{duplicate:true});
 const op=await store.request(uid,'reserved_reversal_0001',2990,'acct_fixture');
 await ledger.reconcile({...e,currentBasisCents:0,authorityDigest:'refund_before_provider'});
 await assert.rejects(store.claim(op.id,uid),/adjustment|source_adjusted/);
 assert.equal(mock.transfers.size,0);assert.equal(mock.payouts.size,0);
});

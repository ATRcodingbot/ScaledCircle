const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const admin=require('firebase-admin');const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');const affiliate=require('./affiliate_program');
let env,db,service;before(async()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST);env=await initializeTestEnvironment({projectId:'demo-referral-authority',firestore:{rules:fs.readFileSync('../firestore.staging.rules','utf8')}});admin.initializeApp({projectId:'demo-referral-authority'});db=admin.firestore();service=affiliate.createAffiliateService({db,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp});});
after(async()=>{await env?.cleanup();await admin.app().delete()});
test('concurrent signup attribution creates one relationship and one notification with no monetary effect',async()=>{
 const profile=await service.join({uid:'referrer',user:{role:'scaler',active:true},acceptedTermsVersion:affiliate.TERMS_VERSION});
 const input={scalerUid:'referred',scalerUser:{role:'scaler'},code:profile.referralCode,capturedAtMillis:Date.now()};await Promise.all([service.attributeScaler(input),service.attributeScaler(input)]);
 assert.equal((await db.collection('affiliateScalerReferrals').get()).size,1);assert.equal((await db.collection('scalerReferralAttributions').get()).size,1);assert.equal((await db.collection('notifications').get()).size,1);
 assert.equal((await db.collection('walletTransactions').get()).size,0);assert.equal((await db.collection('scalerEarnings').get()).size,0);
 const d=await service.dashboard('referrer');assert.equal(d.referrals[0].status,'SIGNED_UP');assert.equal(d.scalerRewardRule.rateBps,100);
});
test('staging and production Rules both deny client referral writes and cross-user reads',async()=>{
 for(const file of ['../firestore.staging.rules','../firestore.production.rules']){
  const ruleEnv=await initializeTestEnvironment({projectId:file.includes('production')?'demo-referral-production':'demo-referral-staging',firestore:{rules:fs.readFileSync(file,'utf8')}});
  for(const uid of ['referrer','referred','unrelated']){
   const store=ruleEnv.authenticatedContext(uid,{email_verified:true}).firestore();
   for(const col of ['scalerReferralAttributions','affiliateScalerReferrals','businessReferralAttributions','scalerAffiliateProfiles','referralRewards','referralPolicyAcceptances']){
    await assertFails(store.doc(col+'/referred').set({affiliateUid:uid,commissionRateBps:1000}));
    await assertFails(store.doc(col+'/referred').get());
   }
  }
  await ruleEnv.cleanup();
 }
});
const rewards=require('./scaler_referral_rewards');
const {fixture}=require('./scaler_referral_rewards.test');
test('concurrent settlement notification creates one held referral liability; originals and Wallet credits remain intact',async()=>{
 const f=fixture(), ts=admin.firestore.Timestamp;
 f.attribution.attributedAt=ts.fromMillis(1);f.settlement.createdAt=ts.fromMillis(2);f.payment.paidAt=ts.fromMillis(1);
 const id=require('./marketplace_finance').operationId('scaler-transfer','job',1);
 const originals={
  'scalerReferralAttributions/worker':f.attribution,'scalerAffiliateProfiles/referrer':f.affiliate,
  'campaignSettlements/job':f.settlement,'campaignZones/job':f.zone,'campaignPayments/payment':f.payment,
  ['scalerTransfers/'+id]:f.transfer,'assignmentCompensations/job':f.contract,
  'wallets/worker':{availableBalance:100},'walletTransactions/worker-earning':{amountCents:10000,baseAmountCents:9000,bonusAmountCents:1000,status:'available'},
 };
 for(const [path,value] of Object.entries(originals))await db.doc(path).set(value);
 const snapshot=async()=>JSON.stringify(await Promise.all(Object.keys(originals).map(async p=>(await db.doc(p).get()).data())));
 await db.doc('scalerReferralAttributions/referrer').set({affiliateUid:'upstream',scalerUid:'referrer',policyVersion:rewards.VERSION,attributedAt:ts.fromMillis(1)});
 const before=await snapshot(),service=rewards.createService({db,FieldValue:admin.firestore.FieldValue,project:'demo-referral-authority'});
 await Promise.all([service.reconcile('job'),service.reconcile('job'),service.reconcilePayment('payment')]);
 const earned=await db.collection('referralRewards').get();assert.equal(earned.size,1);const reward=earned.docs[0];
 assert.equal(reward.data().affiliateUid,'referrer');assert.equal(reward.data().amountCents,100);assert.equal(reward.data().status,'EARNED');assert.equal(reward.data().fundingSource,'platform_economics');
 assert.equal(reward.data().availabilityStatus,'held_pending_release_authority');assert.equal(await snapshot(),before);
 assert.equal((await reward.ref.collection('journal').get()).size,1);
 assert.equal((await db.collection('notifications').where('type','==','referral_reward_earned').get()).size,1);
 const history=await service.reconcile('job');assert.equal(history.duplicate,true);
 // Client cannot label the held reward paid, nor debit the worker for it.
 const client=env.authenticatedContext('referrer',{email_verified:true}).firestore();
 await assertFails(client.doc('referralRewards/'+reward.id).update({status:'PAID'}));
 await assertFails(client.doc('wallets/worker').update({availableBalance:99}));
 assert.equal(await snapshot(),before);
 // A later signed economic reversal removes the referral liability once.
 await db.doc('campaignPayments/payment').update({status:'refunded'});
 await Promise.all([service.reconcile('job'),service.reconcilePayment('payment')]);
 assert.equal((await reward.ref.get()).data().status,'REVERSED');assert.equal((await reward.ref.collection('journal').get()).size,2);
 assert.equal((await db.doc('wallets/worker').get()).data().availableBalance,100);
 assert.deepEqual((await db.doc('assignmentCompensations/job').get()).data(),f.contract);
});

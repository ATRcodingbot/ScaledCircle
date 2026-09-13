'use strict';
// Synthetic data is restricted to the local emulator, never hosted evidence.
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('local_emulator_required');
const {test, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {createService, IDS, QUOTE} = require('./staging_payment_certification');
const {MANUAL_LAUNCH_POLICY, TERMS, createLedger} = require('./referral_liability');
const app = admin.initializeApp({projectId: 'demo-referral-authority'}, 'non-gps-certification');
const db = app.firestore(), {FieldValue, Timestamp} = admin.firestore;
const config = {project: 'scaledcircle-staging', appEnv: 'staging', enabled: 'true', liveEnabled: 'false',
  adminUid: 'admin', businessUid: 'business', scalerUid: 'worker', referrerUid: 'referrer'};
const collections = ['stagingPaymentCertifications','internalCertificationAuthorities','users','legalConsents',
  'scalerReferralAttributions','scalerAffiliateProfiles','campaigns','campaignPayments','assignmentCompensations',
  'campaignZones','campaignCompletions','campaignSettlements','scalerTransfers','wallets','walletTransactions',
  'referralLiabilities','referralBalances','referralMilestones','notifications','financialOperations',
  'trackingSessions','activeTrackingSessions','campaignRoutes','campaignCheckpoints'];
let service, provider, authUsers, requests, sessions, time;
function make(overrides = {}) {
  return createService({db, auth: {getUser: async uid => authUsers[uid]}, FieldValue, Timestamp,
    config: {...config, ...overrides}, stripe: () => provider, now: () => Math.max(time, Date.now())});
}
beforeEach(async () => {
  for (const c of collections) for (const r of await db.collection(c).listDocuments()) await db.recursiveDelete(r);
  time = Date.now(); requests = []; sessions = new Map();
  authUsers = Object.fromEntries(['admin','business','worker','referrer'].map(uid => [uid,{emailVerified: true, disabled: false}]));
  for (const [uid,role] of [['admin','admin'],['business','business'],['worker','scaler'],['referrer','scaler']]) {
    await db.doc('users/' + uid).set({role, active: true});
    for (const [type,version] of Object.entries({terms:'terms-2026-08-v1',privacy:'privacy-2026-08-v1',scaler_work:'scaler-work-2026-08-v1'})) {
      await db.doc(`legalConsents/${uid}_${type}_${version}`).set({uid, agreementType: type, agreementVersion: version, acceptedAt: Timestamp.now()});
    }
  }
  await db.doc('scalerReferralAttributions/worker').set({scalerUid:'worker',affiliateUid:'referrer',
    attributedAt: Timestamp.fromMillis(time - 10000), policyVersion:'ScalerReferralOnePercentV1'});
  await db.doc('scalerAffiliateProfiles/referrer').set({affiliateUid:'referrer',status:'active',acceptedLaunchPolicyVersion:TERMS});
  provider = {
    checkout: {sessions: {create: async (args, options) => {
      requests.push({args,options});
      if (sessions.has(options.idempotencyKey)) {
        assert.deepEqual(sessions.get(options.idempotencyKey).args, args);
      } else sessions.set(options.idempotencyKey, {args, response:{id:'cs_test_local',livemode:false,
        client_reference_id:IDS.payment,amount_total:600,currency:'usd',url:'https://checkout.stripe.com/c/pay/cs_test_local'}});
      return sessions.get(options.idempotencyKey).response;
    }}},
    paymentIntents: {retrieve: async () => ({id:'pi_local',livemode:false,status:'succeeded',amount_received:600,
      currency:'usd',metadata:{paymentId:IDS.payment},latest_charge:'ch_local'})},
    charges: {retrieve: async () => ({id:'ch_local',livemode:false,paid:true,amount:600,amount_refunded:0,payment_intent:'pi_local'})},
  };
  service = make();
});
after(async () => {await db.terminate(); await app.delete();});
const run = (uid,action,rest = {}) => service.run(uid,{action,...rest});
async function fund() {
  await run('admin','create'); await run('business','checkout');
  // Emulates the maintained signed webhook only inside this localhost suite.
  await db.doc('campaignPayments/'+IDS.payment).update({status:'paid',stripePaymentIntentId:'pi_local',paidAt:Timestamp.now()});
  await db.doc('campaigns/'+IDS.campaign).update({fundingStatus:'funded',fundingPaymentId:IDS.payment});
}
async function accepted() {await fund(); await run('worker','apply'); await run('business','assign'); await run('worker','accept',{attested:true});}
const notes = 'I checked the assigned task, accepted the fixed terms and inspected my pre-approval Wallet. No bank payout has occurred.';

test('production, missing staging environment and LIVE enabled reject before any Auth/provider access', async () => {
  for (const override of [{project:'scaled-circle'},{appEnv:'production'},{enabled:'false'},{liveEnabled:'true'},{scalerUid:'business'}]) {
    await assert.rejects(make(override).run('admin',{action:'create'}), /staging_only|binding_unavailable/);
  }
  assert.equal((await db.collection('campaigns').get()).size,0); assert.equal(requests.length,0);
  assert.deepEqual(QUOTE, {currency:'usd',workerAmountCents:500,platformFeeRateBasisPoints:2000,platformFeeCents:100,
    businessChargeCents:600,workerCompensationCents:500,totalChargeCents:600,platformFeeBasisPoints:2000,quoteVersion:2});
});
test('only exact real roles with current consent can use the private path; client amount/GPS injection rejected', async () => {
  await assert.rejects(run('outsider','get'),/actor_not_authorized/);
  await assert.rejects(run('business','create'),/action_not_authorized/);
  await assert.rejects(run('admin','create',{baseAmountCents:1}),/unexpected_input/);
  await assert.rejects(run('admin','create',{gpsPoints:[]}),/unexpected_input/);
  await db.doc('legalConsents/worker_scaler_work_scaler-work-2026-08-v1').delete();
  await assert.rejects(run('admin','create'),/consent_required/);
  authUsers.worker.disabled = true;
  await assert.rejects(run('worker','get'),/verified_account_required/);
  assert.equal((await db.collection('campaigns').get()).size,0);
});
test('concurrent creation/checkout uses one immutable task/payment/provider object and no earnings', async () => {
  await Promise.all([run('admin','create'),run('admin','create')]);
  await Promise.all([run('business','checkout'),run('business','checkout')]);
  assert.equal(sessions.size,1);
  assert.equal((await db.collection('campaignPayments').get()).size,1);
  assert.equal((await db.collection('stagingPaymentCertifications/'+IDS.task+'/audit').get()).size,1);
  assert.equal((await db.collection('walletTransactions').get()).size,0);
  await assert.rejects(run('worker','apply'),/verified_test_funding_required/);
  assert.equal((await db.doc('campaignZones/'+IDS.zone).get()).exists,false);
});
test('unknown checkout response reuses exact request/key; expired recovery cannot create another payment', async () => {
  await run('admin','create'); const create = provider.checkout.sessions.create;
  provider.checkout.sessions.create = async (...args) => {await create(...args); throw Error('response_lost');};
  await assert.rejects(run('business','checkout'),/checkout_outcome_pending/);
  provider.checkout.sessions.create = create;
  await run('business','checkout'); assert.equal(sessions.size,1);
  await db.doc('campaignPayments/'+IDS.payment).update({stripeCheckoutSessionId:FieldValue.delete(),status:'checkout_unknown'});
  time += 21 * 60 * 1000;
  await assert.rejects(run('business','checkout'),/checkout_requires_review/); assert.equal(sessions.size,1);
});
test('early webhook reconciliation is not overwritten by delayed checkout persistence', async () => {
  await run('admin','create'); const create = provider.checkout.sessions.create;
  provider.checkout.sessions.create = async (...args) => {
    const result = await create(...args);
    await db.doc('campaignPayments/'+IDS.payment).update({status:'paid',paidAt:Timestamp.now(),stripePaymentIntentId:'pi_local'});
    await db.doc('campaigns/'+IDS.campaign).update({fundingStatus:'funded',fundingPaymentId:IDS.payment});
    return result;
  };
  await run('business','checkout');
  assert.equal((await service.get('business')).fundingStatus,'funded');
  assert.equal((await service.get('business')).paymentStatus,'paid');
});
test('funding needs real TEST provider evidence and is held if refunded/disputed', async () => {
  await fund(); const original = provider.charges.retrieve;
  for (const changes of [{livemode:true},{amount_refunded:1},{disputed:true},{paid:false}]) {
    provider.charges.retrieve = async () => ({...await original(),...changes});
    await assert.rejects(run('worker','apply'),/provider_funding_mismatch/);
  }
  assert.equal((await service.get('worker')).applicationState,'none');
});
test('real actor sequence, written evidence and Business approval produce one full earning plus separate held referral', async () => {
  await accepted();
  const original = (await db.doc('assignmentCompensations/'+IDS.zone).get()).data();
  await assert.rejects(run('business','submit',{attested:true,notes}),/action_not_authorized/);
  await assert.rejects(run('worker','submit',{notes}),/explicit_confirmation_required/);
  await assert.rejects(run('worker','submit',{attested:true,notes:'ok'}),/describe_actual_checks_required/);
  await run('worker','submit',{attested:true,notes});
  assert.equal((await service.get('business')).notes,notes);
  assert.equal((await db.collection('walletTransactions').get()).size,0);
  await assert.rejects(run('worker','approve',{attested:true}),/action_not_authorized/);
  await Promise.all([run('business','approve',{attested:true}),run('business','approve',{attested:true})]);
  await run('business','approve',{attested:true});
  assert.equal((await db.doc('wallets/worker').get()).data().availableBalance,5);
  assert.equal((await db.collection('walletTransactions').get()).size,1);
  assert.equal((await db.collection('scalerTransfers').get()).size,1);
  assert.equal((await db.collection('campaignSettlements').get()).size,1);
  const rewards = await db.collection('referralLiabilities').get();
  assert.equal(rewards.size,1); assert.equal(rewards.docs[0].data().currentCents,5);
  assert.equal(rewards.docs[0].data().paidCents,0); assert.equal(rewards.docs[0].data().released,false);
  assert.deepEqual((await db.doc('assignmentCompensations/'+IDS.zone).get()).data(),original);
  const payment = (await db.doc('campaignPayments/'+IDS.payment).get()).data();
  assert.equal(payment.businessChargeCents,600); assert.equal(payment.platformFeeRecognizedCents,100);
  assert.equal(payment.reservedWorkerAmountCents,500);
  for (const c of ['trackingSessions','activeTrackingSessions','campaignRoutes','campaignCheckpoints','financialOperations'])
    assert.equal((await db.collection(c).get()).size,0,c);
  const ledger = createLedger({db,FieldValue,project:config.project,launchPolicy:MANUAL_LAUNCH_POLICY,now:()=>time});
  await assert.rejects(ledger.release(rewards.docs[0].id,{providerHealthy:true,authorityDigest:rewards.docs[0].data().authorityDigest}),/manual_payment_authority/);
});
test('changed accepted contract fails closed with no proration or earning', async () => {
  await accepted();
  await db.doc('assignmentCompensations/'+IDS.zone).update({baseAmountCents:495});
  await assert.rejects(run('worker','submit',{attested:true,notes}),/contract_changed/);
  assert.equal((await db.collection('campaignCompletions').get()).size,0);
  assert.equal((await db.collection('walletTransactions').get()).size,0);
});

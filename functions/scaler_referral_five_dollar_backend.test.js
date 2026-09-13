'use strict';

// Local accounting regression only. These synthetic source records must never
// be used to certify or seed a hosted staging/production completed job.
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
    [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT]
      .some(project => project && project !== 'demo-referral-authority')) {
  throw Error('local_referral_emulator_required');
}
const {test, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {operationId} = require('./marketplace_finance');
const policy = require('./referral_liability');
const {createReconciler} = require('./referral_scaler_reconciliation');
const app = admin.initializeApp({projectId: 'demo-referral-authority'}, 'five-dollar-referral');
const db = app.firestore();
const {FieldValue, Timestamp} = admin.firestore;
const zoneId = 'five_dollar_local_job', worker = 'local_worker', referrer = 'local_referrer';
const transferPath = 'scalerTransfers/' + operationId('scaler-transfer', zoneId, 1);
const earningPath = 'walletTransactions/earning_' + zoneId + '_v1';
const paths = ['users/' + worker, 'campaignSettlements/' + zoneId,
  'campaignZones/' + zoneId, 'assignmentCompensations/' + zoneId,
  'campaignPayments/local_payment', transferPath, earningPath, 'wallets/' + worker];
const protectedSnapshot = async () => Object.fromEntries(await Promise.all(paths.map(async path => {
  const doc = await db.doc(path).get();
  return [path, {data: doc.data(), updateTime: doc.updateTime?.toMillis()}];
})));
let now, service, ledger;
beforeEach(async () => {
  for (const collection of ['users', 'scalerAffiliateProfiles', 'scalerReferralAttributions',
    'campaignSettlements', 'campaignZones', 'assignmentCompensations', 'campaignPayments',
    'scalerTransfers', 'walletTransactions', 'wallets', 'referralRewards', 'referralLiabilities', 'referralBalances',
    'referralMilestones', 'notifications', 'financialOperations']) {
    for (const ref of await db.collection(collection).listDocuments()) await db.recursiveDelete(ref);
  }
  now = Date.now();
  const options = {db, FieldValue, project: 'demo-referral-authority',
    launchPolicy: policy.MANUAL_LAUNCH_POLICY, now: () => now};
  service = createReconciler(options);
  ledger = policy.createLedger(options);
  const binding = {zoneId, campaignId: 'local_campaign', businessId: 'local_business', scalerId: worker};
  const rows = {
    ['users/' + referrer]: {role: 'scaler', active: true},
    ['users/' + worker]: {role: 'scaler', active: true},
    ['scalerAffiliateProfiles/' + referrer]: {affiliateUid: referrer, status: 'active', acceptedLaunchPolicyVersion: policy.TERMS},
    ['scalerReferralAttributions/' + worker]: {scalerUid: worker, affiliateUid: referrer,
      policyVersion: 'ScalerReferralOnePercentV1', attributedAt: Timestamp.fromMillis(now - 10000)},
    ['campaignSettlements/' + zoneId]: {...binding, paymentId: 'local_payment',
      policyVersion: 'EarnedWorkReserveReturnV1', source: 'ordinary_review',
      earnedWorkerCents: 500, earnedFeeCents: 100, createdAt: Timestamp.fromMillis(now - 1000)},
    ['campaignZones/' + zoneId]: {...binding, assignedScalerId: worker,
      status: 'completed', reviewStatus: 'approved', approvedBaseAmountCents: 500,
      approvedBonusAmountCents: 0, approvedTransferAmountCents: 500},
    ['assignmentCompensations/' + zoneId]: {...binding, immutable: true, baseAmountCents: 500, bonusAmountCents: 0},
    'campaignPayments/local_payment': {campaignId: binding.campaignId, businessId: binding.businessId,
      status: 'paid', paidAt: Timestamp.fromMillis(now - 5000), stripeMode: 'test', currency: 'usd',
      stripePaymentIntentId: 'pi_local_fixture', platformFeeRecognizedCents: 100, businessChargeCents: 600},
    [transferPath]: {...binding, paymentId: 'local_payment', status: 'waiting_for_account',
      amountCents: 500, baseAmountCents: 500, bonusAmountCents: 0},
    [earningPath]: {...binding, status: 'available', amountCents: 500},
    ['wallets/' + worker]: {ownerId: worker, ownerType: 'scaler', availableBalanceCents: 500, totalEarnedCents: 500},
  };
  const batch = db.batch();
  for (const [path, data] of Object.entries(rows)) batch.set(db.doc(path), data);
  await batch.commit();
});
after(async () => {await db.terminate(); await app.delete();});

test('$5 approved work creates exactly one held $0.05 liability; worker retains $5 and Business cost stays $6', async () => {
  const before = await protectedSnapshot();
  const results = await Promise.all([service.reconcile(zoneId), service.reconcile(zoneId)]);
  assert.equal(results[0].id, results[1].id);
  await service.reconcile(zoneId);
  const rewards = await db.collection('referralLiabilities').get();
  assert.equal(rewards.size, 1);
  const record = rewards.docs[0], reward = record.data();
  assert.equal(reward.beneficiaryUid, referrer);
  assert.equal(reward.referredId, worker);
  assert.equal(reward.sourceId, zoneId);
  assert.equal(reward.grossBasisCents, 500);
  assert.equal(reward.rateBps, 100);
  assert.equal(reward.currentCents, 5);
  assert.equal(reward.paidCents, 0);
  assert.equal(reward.released, false);
  assert.equal(reward.mode, 'test');
  assert.equal(reward.fundingSource, 'scaledcircle_platform_economics');
  assert.equal((await record.ref.collection('journal').get()).size, 1);
  assert.equal((await db.collection('referralMilestones').get()).size, 1);
  assert.equal((await db.collection('notifications').get()).size, 1);
  assert.equal((await db.collection('financialOperations').get()).size, 0);
  assert.deepEqual(await protectedSnapshot(), before);
  assert.equal((await ledger.dashboard(referrer)).pendingCents, 5);
  await assert.rejects(ledger.release(record.id, {providerHealthy: true,
    authorityDigest: reward.authorityDigest}), /manual_payment_authority/);
});

test('submitted work and an unposted earning do not produce the five-cent reward', async () => {
  await db.doc('campaignZones/' + zoneId).update({status: 'submitted'});
  assert.equal((await service.reconcile(zoneId)).status, 'not_qualified');
  await db.doc('campaignZones/' + zoneId).update({status: 'completed'});
  await db.doc(earningPath).update({status: 'pending'});
  assert.equal((await service.reconcile(zoneId)).reason, 'worker_earning_not_settled');
  assert.equal((await db.collection('referralLiabilities').get()).size, 0);
});

test('deducting the referral from the worker transfer or posted earning fails closed', async () => {
  await db.doc(transferPath).update({amountCents: 495});
  assert.equal((await service.reconcile(zoneId)).reason, 'worker_pay_protection');
  await db.doc(transferPath).update({amountCents: 500});
  await db.doc(earningPath).update({amountCents: 495});
  assert.equal((await service.reconcile(zoneId)).reason, 'worker_earning_not_settled');
  assert.equal((await db.collection('referralLiabilities').get()).size, 0);
  assert.equal((await db.doc('wallets/' + worker).get()).data().availableBalanceCents, 500);
});

test('reversed work reverses only the held reward once and retains its original source history', async () => {
  const first = await service.reconcile(zoneId);
  const original = (await ledger.ref(first.id).get()).data();
  await db.doc(transferPath).update({status: 'reversed', reversedAmountCents: 500});
  const before = await protectedSnapshot();
  await service.reconcile(zoneId);
  await service.reconcile(zoneId);
  const reversed = (await ledger.ref(first.id).get()).data();
  assert.equal(reversed.currentCents, 0);
  assert.equal(reversed.grossCents, 5);
  for (const key of ['beneficiaryUid', 'referredId', 'sourceId', 'grossBasisCents', 'paidAtMillis']) {
    assert.deepEqual(reversed[key], original[key]);
  }
  assert.equal((await ledger.ref(first.id).collection('journal').get()).size, 2);
  assert.equal((await db.collection('referralMilestones').get()).size, 2);
  assert.equal((await ledger.dashboard(referrer)).paidCents, 0);
  assert.deepEqual(await protectedSnapshot(), before);
});

test('a lost posted-earning proof leaves a truthful held-liability adjustment reason', async () => {
  const first = await service.reconcile(zoneId);
  await db.doc(earningPath).update({status: 'pending'});
  const before = await protectedSnapshot();
  await service.reconcile(zoneId);
  const adjusted = (await ledger.ref(first.id).get()).data();
  assert.equal(adjusted.currentCents, 0);
  assert.equal(adjusted.grossCents, 5);
  assert.equal(adjusted.reason, 'worker_earning_not_settled');
  assert.deepEqual(await protectedSnapshot(), before);
});

for (const order of ['liability first','source first','concurrent']) {
  test(`source reward and payable ledger announce one reward when ${order}`, async () => {
    const source = require('./scaler_referral_rewards').createService({db,FieldValue,project:'demo-referral-authority'});
    const before = await protectedSnapshot();
    if (order === 'liability first') {await service.reconcile(zoneId); await source.reconcile(zoneId);}
    if (order === 'source first') {await source.reconcile(zoneId); await service.reconcile(zoneId);}
    if (order === 'concurrent') {
      const attempts = await Promise.allSettled([service.reconcile(zoneId),source.reconcile(zoneId)]);
      for (const result of attempts) if (result.status === 'rejected') assert.match(result.reason.message,/referral_stale_economic_read/);
    }
    await source.reconcile(zoneId); await service.reconcile(zoneId);
    assert.equal((await db.collection('referralRewards').get()).size,1);
    assert.equal((await db.collection('referralLiabilities').get()).size,1);
    const notices=await db.collection('notifications').get();assert.equal(notices.size,1);
    assert.equal(notices.docs[0].data().amountCents,5);
    assert.equal(notices.docs[0].data().userId,referrer);
    assert.deepEqual(notices.docs[0].data().deepLink,{destination:'referrals'});
    assert.equal((await ledger.dashboard(referrer)).pendingCents,5);
    assert.deepEqual(await protectedSnapshot(),before);
  });
}

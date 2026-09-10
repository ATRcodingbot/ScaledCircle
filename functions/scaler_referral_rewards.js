'use strict';

// Referral liabilities are separate from worker earnings, campaign reserves and
// Wallets. This module has no provider client, payout executor or client mutation.
const crypto = require('node:crypto');
const VERSION = 'ScalerReferralOnePercentV1';
const RATE_BPS = 100;
const key = value => crypto.createHash('sha256').update(value).digest('hex');
const cents = value => Number.isSafeInteger(value) && value >= 0;
const millis = value => value?.toMillis?.() || 0;
const money = value => `$${(value / 100).toFixed(2)}`;

function rewardAmount(approvedCents) {
  if (!cents(approvedCents)) throw new Error('referral_amount_invalid');
  // Integer cents, nearest cent; no floating point percentage arithmetic.
  return Number((BigInt(approvedCents) + 50n) / 100n);
}

function qualify({zoneId, settlement: s, zone: z, payment: p, transfer: t, contract: c,
  attribution: a, affiliate: f, refund, mode}) {
  const hold = reason => ({qualifies: false, reason});
  if (!s || !a || !f || !z || !p || !t || !c) return hold('incomplete_authority');
  if (a.policyVersion !== VERSION || a.scalerUid !== s.scalerId || !a.affiliateUid ||
      a.affiliateUid === s.scalerId || f.affiliateUid !== a.affiliateUid || f.status !== 'active' || f.acceptedLaunchPolicyVersion !== 'referral-launch-v2-2026-09-10' ||
      millis(a.attributedAt) <= 0 || millis(s.createdAt) <= millis(a.attributedAt)) return hold('referral_not_eligible');
  if (s.policyVersion !== 'EarnedWorkReserveReturnV1' || s.source !== 'ordinary_review' ||
      s.zoneId !== zoneId || z.status !== 'completed' || z.reviewStatus !== 'approved' ||
      z.redoRequired === true || z.disputeOpen === true || z.settlementBlocked === true ||
      z.activeTrackingSessionId || z.gpsTracking === true) return hold('work_not_qualified');
  if (p.status === 'refunded' || t.status === 'reversed' || Number(t.reversedAmountCents || 0) > 0)
    return hold('economic_reversal');
  if (!['paid', 'funded'].includes(p.status) || !p.paidAt || p.settlementFrozen === true ||
      !/^pi_/.test(p.stripePaymentIntentId || '') || p.stripeMode !== mode ||
      p.currency !== 'usd' || Number(p.disputedAmountCents || 0) > 0) return hold('funding_not_qualified');
  if (![ 'transfer_pending', 'transferred_to_connected_account', 'waiting_for_account', 'transfer_submitted' ].includes(t.status) ||
      t.zoneId !== zoneId || t.scalerId !== s.scalerId || t.paymentId !== s.paymentId ||
      t.campaignId !== s.campaignId || t.businessId !== s.businessId ||
      z.assignedScalerId !== s.scalerId || z.campaignId !== s.campaignId || z.businessId !== s.businessId ||
      p.campaignId !== s.campaignId || p.businessId !== s.businessId || c.immutable !== true ||
      c.zoneId !== zoneId || c.scalerId !== s.scalerId || c.businessId !== s.businessId || c.campaignId !== s.campaignId)
    return hold('binding_mismatch');
  if (![s.earnedWorkerCents, s.earnedFeeCents, c.baseAmountCents, c.bonusAmountCents || 0,
    z.approvedBaseAmountCents, z.approvedBonusAmountCents, t.amountCents].every(cents) ||
      s.earnedWorkerCents <= 0 || s.earnedWorkerCents !== t.amountCents ||
      z.approvedTransferAmountCents !== s.earnedWorkerCents ||
      z.approvedBaseAmountCents + z.approvedBonusAmountCents !== s.earnedWorkerCents ||
      t.baseAmountCents !== z.approvedBaseAmountCents || t.bonusAmountCents !== z.approvedBonusAmountCents ||
      z.approvedBaseAmountCents > c.baseAmountCents || z.approvedBonusAmountCents > (c.bonusAmountCents || 0))
    return hold('worker_pay_protection');
  if (!cents(p.refundedTotalCents || 0) || !cents(p.platformFeeRecognizedCents) ||
      p.platformFeeRecognizedCents < s.earnedFeeCents) return hold('platform_funding_unreconciled');
  // A certified unused-reserve refund is not a refund of earned compensation.
  // Other/shared partial refunds require review, never an inferred allocation.
  if (Number(p.refundedTotalCents || 0) > 0 && !(refund?.type === 'unused_work_reserve_refund' &&
      refund.status === 'processed' && refund.paymentId === s.paymentId && refund.zoneId === zoneId &&
      refund.amountCents === p.refundedTotalCents && refund.amountCents === s.businessReturnCents &&
      refund.workerRefundCents === s.unusedWorkerCents && refund.platformFeeRefundCents === s.unusedFeeCents &&
      s.returnStatus === 'refunded')) return hold('refund_requires_review');
  const amountCents = rewardAmount(s.earnedWorkerCents);
  if (amountCents > s.earnedFeeCents) return hold('platform_funding_insufficient');
  return {qualifies: true, amountCents, basisCents: s.earnedWorkerCents, reason: 'approved_settled_work'};
}

function createService({db, FieldValue, project}) {
  const allowed = project === 'scaledcircle-staging' ||
    (project === 'demo-referral-authority' && /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''));
  function environment() { if (!allowed) throw new Error('referral_rewards_staging_only'); }
  const now = () => FieldValue.serverTimestamp();
  async function reconcile(zoneId) {
    environment();
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(zoneId || '')) throw new Error('invalid_zone_reference');
    return db.runTransaction(async tx => {
      const read = async path => (await tx.get(db.doc(path))).data();
      const s = await read('campaignSettlements/' + zoneId);
      if (!s?.scalerId || !s.paymentId) return {status: 'not_qualified'};
      const id = key(VERSION + ':' + zoneId), ref = db.doc('referralRewards/' + id);
      const [priorDoc, a, z, p, c] = await Promise.all([
        tx.get(ref), read('scalerReferralAttributions/' + s.scalerId), read('campaignZones/' + zoneId),
        read('campaignPayments/' + s.paymentId), read('assignmentCompensations/' + zoneId),
      ]);
      const prior = priorDoc.data();
      if (!a?.affiliateUid) return {status: 'no_referral'};
      const transferId = require('./marketplace_finance').operationId('scaler-transfer', zoneId, 1);
      const [f, t, refund] = await Promise.all([
        read('scalerAffiliateProfiles/' + a.affiliateUid), read('scalerTransfers/' + transferId),
        s.refundOperationId ? read('financialOperations/' + s.refundOperationId) : null,
      ]);
      const result = qualify({zoneId, settlement: s, zone: z, payment: p, contract: c,
        transfer: t, attribution: a, affiliate: f, refund, mode: 'test'});
      if (prior) {
        if (prior.affiliateUid !== a.affiliateUid || prior.basisCents !== s.earnedWorkerCents ||
            !cents(s.earnedWorkerCents) || prior.amountCents !== rewardAmount(s.earnedWorkerCents)) {
          result.qualifies = false;
          result.reason = 'referral_authority_changed';
        }
        if (!result.qualifies && prior.status === 'EARNED') {
          // Held liability is reversed once; history and worker pay are untouched.
          tx.update(ref, {status: 'REVERSED', reason: result.reason, reversedAt: now()});
          tx.create(ref.collection('journal').doc('reversed'), {action: 'reversed', amountCents: prior.amountCents,
            debit: 'referralHeldLiability', credit: 'platformReferralExpense', reason: result.reason, at: now()});
        }
        return {status: !result.qualifies ? 'REVERSED' : prior.status, duplicate: true};
      }
      if (!result.qualifies || result.amountCents === 0) return {status: 'not_qualified', reason: result.reason};
      tx.create(ref, {policyVersion: VERSION, kind: 'scaler_completed_work', mode: 'test', currency: 'usd',
        affiliateUid: a.affiliateUid, referredScalerUid: s.scalerId, zoneId, paymentId: s.paymentId,
        campaignId: s.campaignId, rateBps: RATE_BPS, basisCents: result.basisCents, amountCents: result.amountCents,
        fundingSource: 'platform_economics', status: 'EARNED', availabilityStatus: 'held_pending_release_authority',
        createdAt: now()});
      tx.create(ref.collection('journal').doc('earned'), {action: 'earned', amountCents: result.amountCents,
        debit: 'platformReferralExpense', credit: 'referralHeldLiability', at: now()});
      tx.create(db.doc('notifications/referral_earned_' + id), {userId: a.affiliateUid,
        type: 'referral_reward_earned', title: 'Referral reward earned', referralState: 'EARNED',
        message: `You earned ${money(result.amountCents)} from qualifying completed work by a Scaler you referred. This does not come out of the Scaler's pay.`,
        amountCents: result.amountCents, read: false, createdAt: now()});
      return {status: 'EARNED', amountCents: result.amountCents};
    });
  }
  async function reconcilePayment(paymentId) {
    environment();
    const found = await db.collection('campaignSettlements').where('paymentId', '==', paymentId).get();
    for (const doc of found.docs) await reconcile(doc.id);
  }
  return {reconcile, reconcilePayment};
}
module.exports = {VERSION, RATE_BPS, rewardAmount, qualify, createService};

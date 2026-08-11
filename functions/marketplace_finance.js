"use strict";

const crypto = require("node:crypto");

const PLATFORM_FEE_BASIS_POINTS = 2000;
const BASIS_POINTS_DENOMINATOR = 10000;
const CURRENCY = "usd";
const REVIEW_WINDOW_HOURS = 48;
const DEFAULT_REDO_LIMIT = 1;

const PAYMENT_STATES = Object.freeze({
  pending: "payment_pending",
  funded: "funded",
  failed: "payment_failed",
  refundPending: "refund_pending",
  refunded: "refunded",
  disputed: "disputed",
});

const TRANSFER_STATES = Object.freeze({
  pending: "transfer_pending",
  waitingForAccount: "waiting_for_account",
  submitted: "transferred_to_connected_account",
  failed: "transfer_failed",
  reversed: "transfer_reversed",
});

function assertSafeCents(value, field = "amount") {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) {
    throw new Error(`${field} must be integer cents within policy limits.`);
  }
  return value;
}

function feeForWorkerAmount(workerAmountCents, basisPoints = PLATFORM_FEE_BASIS_POINTS) {
  assertSafeCents(workerAmountCents, "workerAmountCents");
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new Error("platformFeeRateBasisPoints is invalid.");
  }
  // Round half-up to the nearest cent. Multiplication remains a safe integer
  // because worker amounts are bounded above.
  return Math.floor(
    (workerAmountCents * basisPoints + BASIS_POINTS_DENOMINATOR / 2) /
      BASIS_POINTS_DENOMINATOR,
  );
}

function quoteCampaignFunding(workerAmountCents) {
  const worker = assertSafeCents(workerAmountCents, "workerAmountCents");
  if (worker === 0) throw new Error("workerAmountCents must be greater than zero.");
  const platformFeeCents = feeForWorkerAmount(worker);
  return Object.freeze({
    currency: CURRENCY,
    workerAmountCents: worker,
    platformFeeRateBasisPoints: PLATFORM_FEE_BASIS_POINTS,
    platformFeeCents,
    businessChargeCents: worker + platformFeeCents,
  });
}

function payoutForCompletion(contract, completionBasisPoints, releaseOptionalBonus = false) {
  const base = assertSafeCents(contract.baseAmountCents, "baseAmountCents");
  const bonus = assertSafeCents(contract.bonusAmountCents || 0, "bonusAmountCents");
  if (!Number.isSafeInteger(completionBasisPoints) ||
      completionBasisPoints < 0 || completionBasisPoints > 10000) {
    throw new Error("completionBasisPoints is invalid.");
  }
  const payableBaseCents = completionBasisPoints < 1000 ? 0 :
    Math.floor((base * Math.min(completionBasisPoints, 10000)) / 10000);
  const automaticBonus = completionBasisPoints >= 9500;
  const bonusAmountCents = automaticBonus || releaseOptionalBonus ? bonus : 0;
  return Object.freeze({
    completionBasisPoints,
    baseAmountCents: payableBaseCents,
    bonusAmountCents,
    transferAmountCents: payableBaseCents + bonusAmountCents,
    bonusReason: automaticBonus ? "automatic_95_percent" :
      releaseOptionalBonus ? "business_released" : "not_released",
  });
}

function deterministicId(...parts) {
  const input = parts.map((part) => String(part || "")).join("|");
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 40);
}

function operationId(kind, ...parts) {
  return `${kind}_${deterministicId(kind, ...parts)}`;
}

function stripeIdempotencyKey(kind, ...parts) {
  return `scaledcircle:${kind}:${deterministicId(kind, ...parts)}`;
}

function campaignWorkerAmountCents(campaign) {
  const direct = campaign.workerAmountCents ?? campaign.maximumWorkerBudgetCents;
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  const legacyDollars = Number(campaign.maximumWorkerBudget || campaign.workerBudget || 0);
  if (!Number.isFinite(legacyDollars) || legacyDollars <= 0) {
    throw new Error("Campaign worker budget is not configured.");
  }
  const cents = Math.round(legacyDollars * 100);
  return assertSafeCents(cents, "workerAmountCents");
}

function sanitizedConnectedAccount(account) {
  const recipient = account?.configuration?.recipient;
  const balance = recipient?.capabilities?.stripe_balance;
  const transferStatus = balance?.stripe_transfers?.status || "pending";
  const payoutStatus = balance?.payouts?.status || "pending";
  return {
    stripeAccountId: String(account?.id || ""),
    accountApi: "accounts_v2",
    onboardingStatus: transferStatus === "active" ? "complete" : "requirements_pending",
    transfersStatus: transferStatus,
    payoutsStatus: payoutStatus,
    detailsSubmitted: transferStatus === "active",
    requirementsStatus: Array.isArray(account?.requirements?.summary) ?
      account.requirements.summary.map((item) => String(item || "")).slice(0, 20) : [],
  };
}

function validatePaymentAgainstRecord(session, record) {
  if (session.client_reference_id !== record.id) throw new Error("payment_record_mismatch");
  if (session.customer !== record.stripeCustomerId) throw new Error("customer_mismatch");
  if (session.amount_total !== record.businessChargeCents) throw new Error("amount_mismatch");
  if (String(session.currency || "").toLowerCase() !== record.currency) {
    throw new Error("currency_mismatch");
  }
  if (session.payment_status !== "paid") throw new Error("payment_not_paid");
  return true;
}

function assertAllocationAvailable(payment, transferCents, refundWorkerCents = 0) {
  const worker = assertSafeCents(payment.workerAmountCents, "workerAmountCents");
  const transferred = assertSafeCents(payment.transferredWorkerAmountCents || 0);
  const refunded = assertSafeCents(payment.refundedWorkerAmountCents || 0);
  const reserved = assertSafeCents(payment.reservedWorkerAmountCents || 0);
  assertSafeCents(transferCents, "transferAmountCents");
  assertSafeCents(refundWorkerCents, "refundWorkerAmountCents");
  if (transferred + refunded + reserved + transferCents + refundWorkerCents > worker) {
    throw new Error("campaign_worker_allocation_exceeded");
  }
}

module.exports = {
  BASIS_POINTS_DENOMINATOR,
  CURRENCY,
  DEFAULT_REDO_LIMIT,
  PAYMENT_STATES,
  PLATFORM_FEE_BASIS_POINTS,
  REVIEW_WINDOW_HOURS,
  TRANSFER_STATES,
  assertAllocationAvailable,
  assertSafeCents,
  campaignWorkerAmountCents,
  deterministicId,
  feeForWorkerAmount,
  operationId,
  payoutForCompletion,
  quoteCampaignFunding,
  sanitizedConnectedAccount,
  stripeIdempotencyKey,
  validatePaymentAgainstRecord,
};

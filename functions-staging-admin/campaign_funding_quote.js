"use strict";

const PLATFORM_FEE_BASIS_POINTS = 2000;
const BASIS_POINTS_DENOMINATOR = 10000;
const CURRENCY = "usd";

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

module.exports = {
  BASIS_POINTS_DENOMINATOR,
  CURRENCY,
  PLATFORM_FEE_BASIS_POINTS,
  assertSafeCents,
  feeForWorkerAmount,
  quoteCampaignFunding,
};

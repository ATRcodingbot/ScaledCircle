"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const {
  PLATFORM_FEE_BASIS_POINTS,
  assertAllocationAvailable,
  feeForWorkerAmount,
  operationId,
  payoutForCompletion,
  quoteCampaignFunding,
  stripeIdempotencyKey,
  validatePaymentAgainstRecord,
} = require("./marketplace_finance");

for (const [workerAmountCents, fee, total] of [
  [5000, 1000, 6000],
  [10000, 2000, 12000],
  [50000, 10000, 60000],
  [100000, 20000, 120000],
]) {
  test(`20% platform fee for ${workerAmountCents} cents`, () => {
    assert.deepEqual(quoteCampaignFunding(workerAmountCents), {
      currency: "usd",
      workerAmountCents,
      platformFeeRateBasisPoints: PLATFORM_FEE_BASIS_POINTS,
      platformFeeCents: fee,
      businessChargeCents: total,
    });
  });
}

test("fee rounding is deterministic integer half-up", () => {
  assert.equal(feeForWorkerAmount(1), 0);
  assert.equal(feeForWorkerAmount(3), 1);
  assert.throws(() => feeForWorkerAmount(10, 2000.5));
});

test("payout policy is backend deterministic", () => {
  const contract = {baseAmountCents: 10000, bonusAmountCents: 2500};
  assert.equal(payoutForCompletion(contract, 999).transferAmountCents, 0);
  assert.deepEqual(payoutForCompletion(contract, 5000), {
    completionBasisPoints: 5000,
    baseAmountCents: 5000,
    bonusAmountCents: 0,
    transferAmountCents: 5000,
    bonusReason: "not_released",
  });
  assert.equal(payoutForCompletion(contract, 5000, true).transferAmountCents, 7500);
  assert.equal(payoutForCompletion(contract, 9500).transferAmountCents, 12000);
});

test("payout boundaries follow the authoritative 10 and 95 percent policy", () => {
  const contract = {baseAmountCents: 10001, bonusAmountCents: 999};
  assert.equal(payoutForCompletion(contract, 999).transferAmountCents, 0);
  assert.equal(payoutForCompletion(contract, 1000).baseAmountCents, 1000);
  assert.equal(payoutForCompletion(contract, 9499).baseAmountCents, 9499);
  assert.equal(payoutForCompletion(contract, 9499).bonusAmountCents, 0);
  assert.equal(payoutForCompletion(contract, 9499, true).bonusAmountCents, 999);
  assert.equal(payoutForCompletion(contract, 9500).baseAmountCents, 9500);
  assert.equal(payoutForCompletion(contract, 9500).bonusAmountCents, 999);
});

test("allocation cannot be over-transferred or over-refunded", () => {
  const payment = {
    workerAmountCents: 10000,
    transferredWorkerAmountCents: 4000,
    refundedWorkerAmountCents: 3000,
  };
  assert.doesNotThrow(() => assertAllocationAvailable(payment, 2000, 1000));
  assert.throws(() => assertAllocationAvailable(payment, 2001, 1000));
});

test("operation and Stripe idempotency keys are deterministic", () => {
  assert.equal(operationId("transfer", "campaign", "zone"),
    operationId("transfer", "campaign", "zone"));
  assert.notEqual(operationId("transfer", "campaign", "zone"),
    operationId("transfer", "campaign", "other"));
  assert.match(stripeIdempotencyKey("checkout", "payment-v1"), /^scaledcircle:checkout:/);
});

test("checkout webhook must match authoritative record", () => {
  const record = {
    id: "payment-one",
    stripeCustomerId: "cus_test",
    businessChargeCents: 12000,
    currency: "usd",
  };
  const session = {
    client_reference_id: "payment-one",
    customer: "cus_test",
    amount_total: 12000,
    currency: "usd",
    payment_status: "paid",
  };
  assert.equal(validatePaymentAgainstRecord(session, record), true);
  assert.throws(() => validatePaymentAgainstRecord({...session, amount_total: 11999}, record));
  assert.throws(() => validatePaymentAgainstRecord({...session, currency: "eur"}, record));
  assert.throws(() => validatePaymentAgainstRecord({...session, customer: "cus_other"}, record));
  assert.throws(() => validatePaymentAgainstRecord({...session, payment_status: "unpaid"}, record));
});

test("campaign quote accepts only the server worker amount and policy", () => {
  const quote = quoteCampaignFunding(12345);
  assert.deepEqual(quote, {
    currency: "usd",
    workerAmountCents: 12345,
    platformFeeRateBasisPoints: 2000,
    platformFeeCents: 2469,
    businessChargeCents: 14814,
  });
  assert.throws(() => quoteCampaignFunding(0));
  assert.throws(() => quoteCampaignFunding(12.34));
});

test("completion bonus is quoted once as part of the worker pool", () => {
  const baseAmountCents = 5000;
  const completionBonusCents = 2500;
  assert.deepEqual(quoteCampaignFunding(baseAmountCents + completionBonusCents), {
    currency: "usd",
    workerAmountCents: 7500,
    platformFeeRateBasisPoints: 2000,
    platformFeeCents: 1500,
    businessChargeCents: 9000,
  });
});

test("Crew participant count does not multiply the authoritative worker pool", () => {
  const authoritativeCrewPoolCents = 15000;
  const quote = quoteCampaignFunding(authoritativeCrewPoolCents);
  assert.equal(quote.workerAmountCents, authoritativeCrewPoolCents);
  assert.equal(quote.platformFeeCents, 3000);
  assert.equal(quote.businessChargeCents, 18000);
});

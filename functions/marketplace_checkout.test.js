"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const marketplace = require("./marketplace_finance");
const {evaluateFundingCheckout, nextFundingVersion} = require("./marketplace_checkout");
const {createMemoryOperationStore, runFinancialOperation} = require("./marketplace_operations");

function campaign(overrides = {}) {
  return {
    id: "local-campaign-checkout",
    businessId: "local-business",
    status: "draft",
    fundingStatus: "unfunded",
    fundingVersion: 0,
    workerAmountCents: 10000,
    ...overrides,
  };
}

function payment(overrides = {}) {
  return {
    id: marketplace.operationId("campaign-payment", "local-campaign-checkout", 1),
    businessId: "local-business",
    campaignId: "local-campaign-checkout",
    fundingVersion: 1,
    status: marketplace.PAYMENT_STATES.pending,
    ...overrides,
  };
}

function evaluate(campaignValue = campaign(), paymentValue = null, overrides = {}) {
  return evaluateFundingCheckout({
    campaign: campaignValue,
    payment: paymentValue,
    businessId: "local-business",
    expectedFundingVersion: 1,
    ...overrides,
  });
}

test("draft unfunded campaign is eligible with authoritative 20 percent quote", () => {
  assert.deepEqual(evaluate(), {decision: "claim", fundingVersion: 1});
  assert.deepEqual(marketplace.quoteCampaignFunding(
    marketplace.campaignWorkerAmountCents(campaign({clientAmountCents: 1, platformFeeCents: 1})),
  ), {
    workerAmountCents: 10000,
    platformFeeRateBasisPoints: 2000,
    platformFeeCents: 2000,
    businessChargeCents: 12000,
    currency: "usd",
  });
});

test("wrong business and invalid client-selected funding version are rejected", () => {
  assert.equal(evaluate(campaign(), null, {businessId: "other-business"}).code,
    "campaign_not_owned");
  assert.equal(evaluateFundingCheckout({campaign: campaign(), payment: null,
    businessId: "local-business", expectedFundingVersion: 2}).code,
  "funding_version_changed");
  assert.equal(nextFundingVersion(campaign()), 1);
});

test("funded settled cancelled assigned and in-progress campaigns fail closed", () => {
  for (const value of [
    campaign({fundingStatus: "funded"}),
    campaign({fundingStatus: "settled"}),
    campaign({status: "cancelled"}),
    campaign({status: "assigned"}),
    campaign({status: "in_progress"}),
    campaign({status: "completed"}),
  ]) {
    assert.equal(evaluate(value).decision, "reject");
  }
});

test("successful same-version payment cannot be charged twice", () => {
  for (const status of ["funded", "paid", "captured", "succeeded"]) {
    assert.equal(evaluate(campaign(), payment({status})).code,
      "funding_version_already_paid");
  }
});

test("refund dispute and chargeback states do not imply recharge permission", () => {
  for (const status of ["refund_pending", "refunded", "disputed", "chargeback"]) {
    assert.equal(evaluate(campaign(), payment({status})).code,
      "payment_financial_exception");
  }
});

test("same-version pending Checkout is recovered and not duplicated", () => {
  const result = evaluate(
    campaign({fundingStatus: "payment_pending",
      fundingCheckoutVersion: 1, fundingCheckoutOperationId: "operation-one"}),
    payment({stripeCheckoutSessionId: "cs_test_existing",
      stripeCheckoutUrl: "https://checkout.stripe.test/existing"}),
  );
  assert.equal(result.decision, "recover");
  assert.deepEqual(result.result, {
    sessionId: "cs_test_existing",
    url: "https://checkout.stripe.test/existing",
    recovered: true,
  });
});

test("pending claim marker must match the authoritative funding version", () => {
  assert.equal(evaluate(campaign({fundingStatus: "payment_pending",
    fundingCheckoutVersion: 2, fundingCheckoutOperationId: "operation-one"})).code,
  "campaign_payment_claim_mismatch");
});

test("failed retryable deterministic operation is reclaimed without a new version", async () => {
  const store = createMemoryOperationStore();
  const operationId = marketplace.operationId(
    "campaign-checkout", "local-campaign-checkout", 1,
  );
  let calls = 0;
  const invoke = () => runFinancialOperation({
    store, operationId, kind: "campaign_checkout_creation",
    trustedInput: {campaignId: "local-campaign-checkout", businessId: "local-business",
      fundingVersion: 1, businessChargeCents: 12000},
    execute: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("temporary"), {code: "ETIMEDOUT"});
      return {sessionId: "cs_test_retry", url: "https://checkout.stripe.test/retry"};
    },
  });
  await assert.rejects(invoke(), /temporary/);
  const recovered = await invoke();
  assert.equal(recovered.sessionId, "cs_test_retry");
  assert.equal(calls, 2);
  assert.equal((await store.get(operationId)).attempt, 2);
});

test("concurrent same-version requests execute one deterministic operation", async () => {
  const store = createMemoryOperationStore();
  const operationId = marketplace.operationId(
    "campaign-checkout", "local-campaign-checkout", 1,
  );
  let checkoutCreations = 0;
  const invoke = () => runFinancialOperation({
    store, operationId, kind: "campaign_checkout_creation",
    trustedInput: {campaignId: "local-campaign-checkout", businessId: "local-business",
      fundingVersion: 1, businessChargeCents: 12000},
    execute: async () => {
      checkoutCreations += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {sessionId: "cs_test_one", url: "https://checkout.stripe.test/one"};
    },
  });
  const results = await Promise.all([invoke(), invoke()]);
  assert.equal(checkoutCreations, 1);
  assert.deepEqual(results.map((result) => result.sessionId), ["cs_test_one", "cs_test_one"]);
  assert.equal(store.records.size, 1);
});

test("a campaign changing to funded during contention is no longer eligible", () => {
  assert.equal(evaluate(campaign()).decision, "claim");
  assert.equal(evaluate(campaign({fundingStatus: "funded", fundingVersion: 1}),
    payment({status: "funded"})).decision, "reject");
});

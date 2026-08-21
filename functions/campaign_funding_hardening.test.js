"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const lifecycle = require("../functions-campaign-funding/campaign_funding_lifecycle");
const fs = require("node:fs");
const path = require("node:path");
const fundingSource = fs.readFileSync(path.join(__dirname, "..", "functions-campaign-funding", "index.js"), "utf8");

test("TEST Checkout is fail-closed to staging or the demo emulator", () => {
  assert.match(fundingSource, /projectId === "scaledcircle-staging"/);
  assert.match(fundingSource, /projectId === "demo-scaledcircle" && process\.env\.FIRESTORE_EMULATOR_HOST/);
  assert.doesNotMatch(fundingSource, /https:\/\/scaledcircle\.com\/#\/campaign-funding-return/);
  assert.match(fundingSource, /Stripe TEST campaign funding is available only/);
});

test("authoritative worker pool includes bonus once and applies 20 percent half-up", () => {
  const quote = lifecycle.quoteForCampaign({basePay: 100, bonus: 23.45, requestedScalerCount: 9});
  assert.equal(quote.workerCompensationCents, 12345);
  assert.equal(quote.platformFeeBasisPoints, 2000);
  assert.equal(quote.platformFeeCents, 2469);
  assert.equal(quote.totalChargeCents, 14814);
});

test("explicit authoritative worker pool is never multiplied by participant count", () => {
  assert.equal(lifecycle.quoteForCampaign({workerCompensationCents: 50000, requestedScalerCount: 20})
    .workerCompensationCents, 50000);
});

test("invalid compensation is rejected", () => {
  for (const campaign of [{basePay: -1}, {workerCompensationCents: 1.2}, {workerCompensationCents: -1}]) {
    assert.throws(() => lifecycle.quoteForCampaign(campaign));
  }
});

test("mapped Zone must belong to campaign and owner", () => {
  assert.equal(lifecycle.mappedZoneIsValid({campaignId: "c", businessId: "b", serviceAreaPointCount: 3}, "c", "b"), true);
  assert.equal(lifecycle.mappedZoneIsValid({campaignId: "other", serviceAreaPointCount: 3}, "c", "b"), false);
  assert.equal(lifecycle.mappedZoneIsValid({campaignId: "c", businessId: "other", mapped: true}, "c", "b"), false);
  assert.equal(lifecycle.mappedZoneIsValid({campaignId: "c", serviceAreaPointCount: 2}, "c", "b"), false);
});

test("test-only secrets and events fail closed", () => {
  assert.equal(lifecycle.assertTestSecret("sk_test_fixture"), "sk_test_fixture");
  assert.equal(lifecycle.assertTestSecret("  sk_test_fixture\r\n"), "sk_test_fixture");
  assert.throws(() => lifecycle.assertTestSecret("sk_live_forbidden"));
  assert.equal(lifecycle.assertTestWebhookSecret("  whsec_fixture\r\n"), "whsec_fixture");
  assert.throws(() => lifecycle.assertTestWebhookSecret("not_a_webhook_secret"));
  assert.equal(lifecycle.assertTestEvent({livemode: false}).livemode, false);
  assert.throws(() => lifecycle.assertTestEvent({livemode: true}));
});

test("checkout recovery never returns an expired or closed URL", () => {
  const payment = {stripeCheckoutSessionId: "cs_test_1"};
  assert.equal(lifecycle.checkoutRecoveryDecision(payment, {id: "cs_test_1", status: "expired",
    url: "https://stale", expires_at: 200}, 100).action, "expire_and_replace");
  assert.equal(lifecycle.checkoutRecoveryDecision(payment, {id: "cs_test_1", status: "open",
    url: "https://stale", expires_at: 99}, 100).action, "expire_and_replace");
  assert.equal(lifecycle.checkoutRecoveryDecision(payment, {id: "cs_test_1", status: "open",
    url: "https://valid", expires_at: 101}, 100).action, "recover");
  assert.equal(lifecycle.checkoutRecoveryDecision(payment, {id: "cs_test_1", status: "complete",
    expires_at: 101}, 100).action, "await_webhook");
});

test("post-webhook expiration increments attempt and freezes exhausted retries", () => {
  assert.match(fundingSource, /if \(existing\?\.stripeCheckoutSessionId\)/);
  assert.match(fundingSource, /existing\.status === "payment_pending" && decision\.action === "recover"/);
  assert.match(fundingSource, /checkoutAttempt \+= 1/);
  assert.match(fundingSource, /status: "checkout_retry_exhausted"/);
  assert.match(fundingSource, /status: "funding_review_required"/);
  assert.match(fundingSource, /new HttpsError\("resource-exhausted"/);
});

test("checkout and Stripe idempotency identifiers are deterministic", () => {
  assert.equal(lifecycle.paymentId("campaign", 1), lifecycle.paymentId("campaign", 1));
  assert.notEqual(lifecycle.paymentId("campaign", 1), lifecycle.paymentId("campaign", 2));
  assert.match(lifecycle.stripeIdempotencyKey("payment"), /^scaledcircle:test:/);
});

test("expiration and failure restore truthful non-funded states", () => {
  assert.deepEqual(lifecycle.campaignStateForPaymentEvent("checkout.session.expired", "draft"),
    {paymentStatus: "checkout_expired", fundingStatus: "unfunded"});
  assert.deepEqual(lifecycle.campaignStateForPaymentEvent("payment_intent.payment_failed", "draft"),
    {paymentStatus: "payment_failed", fundingStatus: "payment_failed"});
});

test("refund and dispute reconcile campaign authority", () => {
  assert.deepEqual(lifecycle.campaignStateForPaymentEvent("charge.refunded", "open"), {
    paymentStatus: "refunded", fundingStatus: "refunded", campaignStatus: "funding_review_required",
    settlementFrozen: true,
  });
  assert.deepEqual(lifecycle.campaignStateForPaymentEvent("charge.dispute.created", "open"), {
    paymentStatus: "disputed", fundingStatus: "disputed", campaignStatus: "funding_review_required",
    settlementFrozen: true,
  });
});

test("quote digest changes whenever authoritative money changes", () => {
  assert.notEqual(lifecycle.quoteForCampaign({workerCompensationCents: 10000}).quoteDigest,
    lifecycle.quoteForCampaign({workerCompensationCents: 10001}).quoteDigest);
});

test("out-of-order events cannot revive refunded or disputed funding", () => {
  assert.equal(lifecycle.transitionAllowed("payment_pending", "paid"), true);
  assert.equal(lifecycle.transitionAllowed("paid", "refunded"), true);
  assert.equal(lifecycle.transitionAllowed("refunded", "paid"), false);
  assert.equal(lifecycle.transitionAllowed("disputed", "paid"), false);
  assert.equal(lifecycle.transitionAllowed("paid", "refund_pending"), true);
  assert.equal(lifecycle.transitionAllowed("refund_pending", "refunded"), true);
  assert.equal(lifecycle.transitionAllowed("refund_pending", "disputed"), true);
});

test("signed raw-body webhook is the only campaign payment authority", () => {
  assert.match(fundingSource, /webhooks\.constructEvent\(request\.rawBody/);
  assert.match(fundingSource, /assertTestWebhookSecret\(STRIPE_TEST_WEBHOOK_SECRET\.value\(\)\)/);
  assert.doesNotMatch(fundingSource, /success_url[\s\S]{0,300}fundingStatus:\s*["']funded/);
  assert.doesNotMatch(fundingSource, /stripeThinWebhook|customer\.subscription|payout\.|transfer\./);
});

test("client totals, legacy credits, payouts, and fundCampaign are absent", () => {
  assert.doesNotMatch(fundingSource, /request\.data\?\.(worker|platform|total|amount)/);
  assert.doesNotMatch(fundingSource, /fundCampaign|wallet|credits|scalerTransfers/);
  assert.match(fundingSource, /approvedQuoteDigest/);
});

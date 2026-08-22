"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const lifecycle = require("../functions-campaign-funding/campaign_funding_lifecycle");
const fs = require("node:fs");
const path = require("node:path");
const fundingSource = fs.readFileSync(path.join(__dirname, "..", "functions-campaign-funding", "index.js"), "utf8");
const fundingRoot = path.join(__dirname, "..", "functions-campaign-funding");
const maintainedBackendSource = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");

test("campaign funding environments are explicit and fail closed", () => {
  assert.equal(lifecycle.paymentEnvironment({APP_ENV: "local", GCLOUD_PROJECT: "demo-scaledcircle",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080"}).stripeMode, "test");
  assert.equal(lifecycle.paymentEnvironment({APP_ENV: "staging", GCLOUD_PROJECT: "scaledcircle-staging"})
    .stripeMode, "test");
  assert.equal(lifecycle.paymentEnvironment({APP_ENV: "production", GCLOUD_PROJECT: "scaled-circle"})
    .stripeMode, "live");
  assert.throws(() => lifecycle.paymentEnvironment({APP_ENV: "production", GCLOUD_PROJECT: "scaledcircle-staging"}));
  assert.throws(() => lifecycle.paymentEnvironment({APP_ENV: "staging", GCLOUD_PROJECT: "scaled-circle"}));
  assert.throws(() => lifecycle.paymentEnvironment({APP_ENV: "unknown", GCLOUD_PROJECT: "scaled-circle"}));
  assert.equal(lifecycle.paymentEnvironment({FUNCTIONS_CONTROL_API: "true",
    FIREBASE_CONFIG: JSON.stringify({projectId: "scaled-circle"})}).stripeMode, "live");
  assert.equal(lifecycle.paymentEnvironment({FUNCTIONS_MANIFEST_OUTPUT_PATH: "manifest.json",
    FIREBASE_CONFIG: JSON.stringify({projectId: "scaledcircle-staging"})}).stripeMode, "test");
  assert.throws(() => lifecycle.paymentEnvironment({FIREBASE_CONFIG:
    JSON.stringify({projectId: "scaled-circle"})}));
  assert.throws(() => lifecycle.paymentEnvironment({FUNCTIONS_CONTROL_API: "true",
    FIREBASE_CONFIG: JSON.stringify({projectId: "unknown-project"})}));
  assert.equal(fs.readFileSync(path.join(fundingRoot, ".env.scaled-circle"), "utf8").trim(),
    "APP_ENV=production");
  assert.equal(fs.readFileSync(path.join(fundingRoot, ".env.scaledcircle-staging"), "utf8").trim(),
    "APP_ENV=staging");
  assert.match(fundingSource, /STRIPE_LIVE_SECRET_KEY/);
  assert.match(fundingSource, /STRIPE_LIVE_WEBHOOK_SECRET/);
  assert.match(fundingSource, /PAYMENT_ENVIRONMENT\.stripeMode === "live"/);
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

test("Stripe secrets and events must match the authoritative environment mode", () => {
  assert.equal(lifecycle.assertStripeSecret("  sk_test_fixture\r\n", "test"), "sk_test_fixture");
  assert.equal(lifecycle.assertStripeSecret("  sk_live_fixture\r\n", "live"), "sk_live_fixture");
  assert.throws(() => lifecycle.assertStripeSecret("sk_live_forbidden", "test"));
  assert.throws(() => lifecycle.assertStripeSecret("sk_test_forbidden", "live"));
  assert.equal(lifecycle.assertWebhookSecret("  whsec_fixture\r\n"), "whsec_fixture");
  assert.throws(() => lifecycle.assertWebhookSecret("not_a_webhook_secret"));
  assert.equal(lifecycle.assertStripeEvent({livemode: false}, "test").livemode, false);
  assert.equal(lifecycle.assertStripeEvent({livemode: true}, "live").livemode, true);
  assert.throws(() => lifecycle.assertStripeEvent({livemode: true}, "test"));
  assert.throws(() => lifecycle.assertStripeEvent({livemode: false}, "live"));
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
  assert.match(lifecycle.stripeIdempotencyKey("payment", "live"), /^scaledcircle:live:/);
  assert.equal(lifecycle.stripeRefundIdempotencyKey("payment", "live"),
    lifecycle.stripeRefundIdempotencyKey("payment", "live"));
  assert.match(lifecycle.stripeRefundIdempotencyKey("payment", "live"),
    /^scaledcircle:live:campaign-refund:/);
});

test("only paid, unassigned, unstarted campaigns qualify for self-service refund", () => {
  const campaign = {status: "open", fundingStatus: "funded", assignedScalerCount: 0};
  const payment = {status: "paid"};
  assert.deepEqual(lifecycle.cancelRefundEligibility({campaign, payment}),
    {eligible: true, blockers: []});
  assert.equal(lifecycle.cancelRefundEligibility({campaign, payment, applicantCount: 3}).eligible, true);
  for (const blocker of [
    {hasAssignedZone: true}, {hasAcceptedApplication: true}, {hasAssignedScalerRecord: true},
    {hasTrackingSession: true}, {hasCompletionEvidence: true}, {hasMaterialHandoff: true},
    {hasWorkerEarning: true}, {hasSettlement: true}, {hasPayout: true}, {hasDispute: true},
  ]) assert.equal(lifecycle.cancelRefundEligibility({campaign, payment, ...blocker}).eligible, false);
});

test("refund lifecycle closes canceling campaigns without erasing financial history", () => {
  assert.deepEqual(lifecycle.campaignStateForPaymentEvent("charge.refunded", "canceling"), {
    paymentStatus: "refunded", fundingStatus: "refunded", campaignStatus: "canceled",
    settlementFrozen: true,
  });
  assert.match(fundingSource, /exports\.cancelUnassignedFundedCampaign\s*=\s*onCall/);
  assert.match(fundingSource, /status: "canceling"/);
  assert.match(fundingSource, /marketplaceVisible: false, acceptingApplications: false/);
  assert.match(fundingSource, /stripe\.refunds\.create/);
  assert.match(fundingSource, /stripeRefundIdempotencyKey/);
  assert.match(fundingSource, /exports\.archiveCanceledCampaign\s*=\s*onCall/);
  assert.match(fundingSource, /hiddenFromBusinessHistory: true/);
  assert.doesNotMatch(fundingSource, /campaignPayments[^\n]*\.delete\(/);
});

test("cancellation lock wins assignment races in every maintained assignment path", () => {
  const assignmentGuard = /This campaign is no longer accepting Scaler assignments\./g;
  assert.equal([...maintainedBackendSource.matchAll(assignmentGuard)].length, 3);
  assert.match(maintainedBackendSource,
    /exports\.assignScalerToZone[\s\S]*String\(campaign\.status \|\| ""\) !== "open"/);
  assert.match(maintainedBackendSource,
    /exports\.configureZoneGroupAssignment[\s\S]*String\(campaign\.status \|\| ""\) !== "open"/);
  assert.match(maintainedBackendSource,
    /exports\.acceptZoneGroupSlot[\s\S]*String\(campaign\.status \|\| ""\) !== "open"/);
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
  assert.match(fundingSource, /assertWebhookSecret\(STRIPE_WEBHOOK_SECRET\.value\(\)\)/);
  assert.match(fundingSource, /assertStripeEvent\(event, PAYMENT_ENVIRONMENT\.stripeMode\)/);
  assert.doesNotMatch(fundingSource, /success_url[\s\S]{0,300}fundingStatus:\s*["']funded/);
  assert.doesNotMatch(fundingSource, /stripeThinWebhook|customer\.subscription|payout\.|transfer\./);
});

test("client totals, legacy credits, payouts, and fundCampaign are absent", () => {
  assert.doesNotMatch(fundingSource, /request\.data\?\.(worker|platform|total|amount)/);
  assert.doesNotMatch(fundingSource, /fundCampaign|wallet|credits|scalerTransfers/);
  assert.match(fundingSource, /approvedQuoteDigest/);
});

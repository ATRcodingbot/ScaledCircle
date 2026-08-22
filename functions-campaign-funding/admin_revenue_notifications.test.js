"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const notifications = require("./admin_revenue_notifications");

function input(kind = "payment") {
  return notifications.financialEvent({
    kind,
    paymentId: "campaign-payment_authority-1",
    occurredAt: "2026-08-22T23:02:27Z",
    campaign: {id: "campaign-1", campaignName: "Live Cancel Refund QA 2"},
    payment: {
      campaignId: "campaign-1",
      businessUid: "business-1",
      totalChargeCents: 960,
      workerCompensationCents: 800,
      platformFeeCents: 160,
      refundableAmountCents: 960,
      currency: "usd",
      stripeMode: "live",
    },
  });
}

test("paid campaign notification reports gross, worker compensation, and revenue separately", () => {
  const event = input();
  assert.equal(event.stableId, "admin-revenue-payment_campaign-payment_authority-1");
  assert.equal(event.notification.amountCents, 960);
  assert.equal(event.notification.revenueCents, 160);
  assert.match(event.email.text, /Customer payment: USD 9\.60/);
  assert.match(event.email.text, /Worker compensation: USD 8\.00/);
  assert.match(event.email.text, /ScaledCircle platform fee: USD 1\.60/);
  assert.match(event.email.text, /Stripe mode: LIVE/);
  assert.doesNotMatch(event.email.text, /card|secret key|payment method/i);
});

test("full refund is a distinct deterministic event and reports zero retained", () => {
  const event = input("refund");
  assert.equal(event.stableId, "admin-revenue-refund_campaign-payment_authority-1");
  assert.equal(event.notification.amountCents, 960);
  assert.match(event.email.text, /Original payment: USD 9\.60/);
  assert.match(event.email.text, /Refund: USD 9\.60/);
  assert.match(event.email.text, /retained from campaign charge: USD 0\.00/);
});

test("stable identities make webhook replay idempotent", () => {
  assert.equal(input().stableId, input().stableId);
  assert.equal(input("refund").stableId, input("refund").stableId);
  assert.notEqual(input().stableId, input("refund").stableId);
});

test("revenue is explicit and independent from pass-through gross", () => {
  const event = notifications.financialEvent({
    kind: "payment",
    paymentId: "future-pass-through-1",
    campaign: {id: "future-service", name: "Future service"},
    payment: {campaignId: "future-service", totalChargeCents: 30000,
      workerCompensationCents: 0, platformFeeCents: 0, currency: "usd", stripeMode: "live"},
  });
  assert.equal(event.notification.amountCents, 30000);
  assert.equal(event.notification.revenueCents, 0);
});

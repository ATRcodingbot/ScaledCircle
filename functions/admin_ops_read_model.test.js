"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const model = require("./admin_ops_read_model");

const now = Date.parse("2026-08-23T20:00:00.000Z");
const record = (id, data) => ({id, data});

test("normal payments and completed refunds are not operational exceptions", () => {
  assert.deepEqual(model.paymentIssues([
    record("paid", {status: "paid", updatedAt: now - 1000}),
    record("refunded", {status: "refunded", refundedAt: now - 1000}),
  ], now), []);
});

test("stuck and review-required payment states are surfaced without raw provider data", () => {
  const issues = model.paymentIssues([
    record("pending", {status: "pending", campaignId: "campaign-one",
      updatedAt: now - model.STALE_PAYMENT_MS - 1, clientSecret: "never-return"}),
    record("refund", {status: "refund_review_required", campaignId: "campaign-two",
      paymentMethod: {card: "never-return"}, updatedAt: now}),
  ], now);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((item) => item.severity).sort(), ["action_required", "attention"]);
  assert.doesNotMatch(JSON.stringify(issues), /clientSecret|paymentMethod|never-return/);
});

test("completion exceptions require staleness or approved work without an earning", () => {
  const records = [
    record("fresh", {status: "submitted", submittedAt: now - 1000}),
    record("stale", {status: "review_pending", submittedAt: now - model.STALE_COMPLETION_MS - 1}),
    record("approved", {status: "approved", approvedAt: now - 1000}),
    record("earned", {status: "approved", approvedAt: now - 1000}),
  ];
  const issues = model.completionIssues(records, new Set(["earned"]), now);
  assert.deepEqual(issues.map((item) => item.id).sort(), ["completion_stale", "earning_approved"]);
});

test("transactional email failures and long-pending jobs are visible", () => {
  const issues = model.emailIssues([
    record("sent", {status: "sent", updatedAt: now}),
    record("failed", {status: "failed", updatedAt: now}),
    record("queued", {status: "queued", updatedAt: now - model.STALE_EMAIL_MS - 1}),
  ], now);
  assert.deepEqual(issues.map((item) => item.id).sort(), ["email_failed", "email_queued"]);
});

test("open support is actionable and resolved support is absent", () => {
  const issues = model.supportIssues([
    record("open", {status: "open", priority: "high", summary: "Materials issue"}),
    record("resolved", {status: "resolved", summary: "Done"}),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "action_required");
  assert.equal(issues[0].detailKind, "support_case");
});

test("support workflow permits only Open, In Progress, and Resolved transitions", () => {
  assert.deepEqual(model.assertSupportStatusTransition("open", "in_progress"),
    {current: "open", next: "in_progress", replay: false});
  assert.equal(model.assertSupportStatusTransition("resolved", "resolved").replay, true);
  assert.throws(() => model.assertSupportStatusTransition("resolved", "open"),
    /invalid_support_status_transition/);
  assert.throws(() => model.assertSupportStatusTransition("open", "deleted"),
    /invalid_support_status_update/);
});

test("timeline orders real events and separates gross payment, fee, earning, and refund", () => {
  const events = model.timelineEvents({
    campaign: record("campaign", {createdAt: now - 5000, publishedAt: now - 4000}),
    paymentRecords: [record("payment-secret-long-reference", {paidAt: now - 3000,
      campaignId: "campaign",
      businessChargeCents: 960, workerAmountCents: 800, platformFeeCents: 160,
      paymentIntentId: "pi_sensitive_reference_123456789", refundedAt: now - 1000,
      refundedTotalCents: 960, refundId: "re_sensitive_reference_123456789"})],
    eventRecords: [record("gps", {type: "tracking.gps_chunk", createdAt: now - 2500})],
    completionRecords: [record("completion", {submittedAt: now - 2200, approvedAt: now - 2000})],
    earningRecords: [record("earning", {earnedAt: now - 1900, totalEarnedCents: 264})],
    supportRecords: [],
  });
  assert.equal(events[0].type, "refund_completed");
  assert.equal(events.some((item) => item.type === "tracking.gps_chunk"), false);
  const payment = events.find((item) => item.type === "payment_received");
  assert.deepEqual(payment.detail, {grossCents: 960, workerCents: 800,
    platformFeeCents: 160, reference: "pi_sen…6789"});
  assert.equal(payment.campaignId, "campaign");
  assert.equal(events.find((item) => item.type === "worker_earning_established")
    .detail.totalEarnedCents, 264);
});

test("health is categorical and reports partial source failures", () => {
  const states = model.healthFromIssues([], ["outboundEmailJobs"]);
  assert.equal(states.find((item) => item.metric === "payments").state, "healthy");
  assert.equal(states.find((item) => item.metric === "email").state, "degraded");
  assert.equal(states.some((item) => Object.hasOwn(item, "percentage")), false);
});

test("Admin Ops callables require trusted Admin authority and expose no secrets", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  for (const name of ["getAdminOperationsOverview", "getAdminCampaignTimeline",
    "updateAdminSupportCaseStatus"]) {
    const start = source.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    assert.match(source.slice(start, start + 650), /requireTrustedAdmin\(request\)/);
  }
  const readModel = fs.readFileSync(path.join(__dirname, "admin_ops_read_model.js"), "utf8");
  assert.doesNotMatch(readModel, /STRIPE_(?:LIVE|TEST|SECRET)|SMTP_PASSWORD|OPENAI_API_KEY|CENSUS_API_KEY/);
  assert.doesNotMatch(readModel, /cardNumber|client_secret|password|token/);
});

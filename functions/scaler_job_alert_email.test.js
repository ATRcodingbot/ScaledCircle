"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const alerts = require("./scaler_job_alert_email");

test("matching job email identity is deterministic for a Scaler and campaign", () => {
  const first = alerts.createJob({campaignId: "campaign-a", scalerUid: "scaler-a",
    recipient: "scaler@example.com", campaignName: "Flyer Distribution"});
  const repeated = alerts.createJob({campaignId: "campaign-a", scalerUid: "scaler-a",
    recipient: "scaler@example.com", campaignName: "Flyer Distribution"});
  assert.equal(first.id, repeated.id);
  assert.equal(first.bodyHash, repeated.bodyHash);
  assert.equal(alerts.validateJob(first), true);
  assert.match(first.text, /not an assignment/i);
  assert.match(first.text, /My Work Areas & Alerts/);
});

test("job alert is single-recipient and fails closed for malformed jobs", () => {
  assert.throws(() => alerts.createJob({campaignId: "c", scalerUid: "s",
    recipient: "one@example.com,two@example.com"}), /invalid_recipient/);
  const valid = alerts.createJob({campaignId: "c", scalerUid: "s", recipient: "one@example.com"});
  assert.equal(alerts.validateJob({...valid, template: "bulk_marketing"}), false);
});

test("daily email policy is versioned, conservative, and per Scaler", () => {
  assert.equal(alerts.POLICY_VERSION, "ScalerJobAlertEmailPolicyV1");
  assert.equal(alerts.DAILY_LIMIT, 5);
  const now = new Date("2026-08-17T18:00:00Z");
  assert.equal(alerts.rateLimitId("scaler-a", now), "scaler-a_2026-08-17");
  assert.notEqual(alerts.rateLimitId("scaler-a", now), alerts.rateLimitId("scaler-b", now));
  assert.equal(alerts.canQueue({jobExists: false, dailyCount: 4}), true);
  assert.equal(alerts.canQueue({jobExists: false, dailyCount: 5}), false);
  assert.equal(alerts.canQueue({jobExists: true, dailyCount: 0}), false);
});

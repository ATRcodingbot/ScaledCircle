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
});

test("job alert is single-recipient and fails closed for malformed jobs", () => {
  assert.throws(() => alerts.createJob({campaignId: "c", scalerUid: "s",
    recipient: "one@example.com,two@example.com"}), /invalid_recipient/);
  const valid = alerts.createJob({campaignId: "c", scalerUid: "s", recipient: "one@example.com"});
  assert.equal(alerts.validateJob({...valid, template: "bulk_marketing"}), false);
});

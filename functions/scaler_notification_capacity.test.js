"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("./scaler_notification_capacity");
const fs = require("node:fs");

test("capacity policy warns at 80 percent and reaches at 400", () => {
  assert.equal(policy.SUPPORTED_POPULATION, 400);
  assert.equal(policy.WARNING_POPULATION, 320);
  assert.equal(policy.capacityAssessment(319), null);
  assert.equal(policy.capacityAssessment(320).level, "warning");
  assert.equal(policy.capacityAssessment(400).level, "reached");
  assert.equal(policy.capacityAssessment(401).level, "reached");
});

test("campaign producer records a deduplicated Admin Issue without an email job", () => {
  const source = fs.readFileSync("index.js", "utf8");
  const start = source.indexOf("exports.notifyScalersOnCampaignOpened");
  const trigger = source.slice(start, start + 4200);
  assert.match(trigger, /candidateQuery\.count\(\)\.get\(\)/);
  assert.match(trigger, /collection\("adminIssues"\)/);
  assert.match(trigger, /transaction\.create\(issueRef/);
  assert.match(trigger, /SUPPORTED_POPULATION/);
  assert.doesNotMatch(trigger, /outboundEmailJobs|emailQueued/);
});

test("capacity issue identity is deterministic per level and day", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  assert.equal(policy.issueIdentity("warning", now), "scaler_matching_capacity_warning_2026-08-15");
  assert.equal(policy.issueIdentity("warning", now), policy.issueIdentity("warning", now));
  assert.notEqual(policy.issueIdentity("warning", now), policy.issueIdentity("reached", now));
});

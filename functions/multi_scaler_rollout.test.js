"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const rollout = require("./multi_scaler_rollout");

const production = Object.freeze({
  GCLOUD_PROJECT: "scaled-circle",
  APP_ENV: "production",
});
const local = Object.freeze({
  FUNCTIONS_EMULATOR: "true",
  APP_ENV: "local",
  GCLOUD_PROJECT: "demo-scaledcircle",
});

test("production normal Business count one succeeds", () => {
  assert.equal(rollout.assertAllowedScalerCount(1, production).count, 1);
});

test("production rejects two and twelve Scalers", () => {
  for (const count of [2, 12]) {
    assert.throws(() => rollout.assertAllowedScalerCount(count, production),
      /multi_scaler_production_rollout_locked/);
  }
});

test("local demo permits four Scalers", () => {
  const result = rollout.assertAllowedScalerCount(4, local);
  assert.equal(result.count, 4);
  assert.equal(result.policy.version, "MultiScalerRolloutPolicyV1");
});

test("Firebase demo emulator identity permits local testing without client input", () => {
  const result = rollout.assertAllowedScalerCount(4, {
    FUNCTIONS_EMULATOR: "true",
    GCLOUD_PROJECT: "demo-scaledcircle",
  });
  assert.equal(result.count, 4);
});

test("an explicit production environment fails closed even in an emulator", () => {
  assert.throws(() => rollout.assertAllowedScalerCount(4, {
    FUNCTIONS_EMULATOR: "true",
    APP_ENV: "production",
    GCLOUD_PROJECT: "demo-scaledcircle",
  }), /multi_scaler_production_rollout_locked/);
});

test("client-looking environment fields cannot enable the rollout", () => {
  assert.throws(() => rollout.assertAllowedScalerCount(4, {
    ...production, requestEnvironment: "local", projectId: "demo-scaledcircle",
  }), /multi_scaler_production_rollout_locked/);
});

test("authoritative group, funding, and publish paths enforce the policy", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  for (const name of ["configureZoneGroupAssignment",
    "createCampaignFundingCheckoutSession", "publishFundedCampaign"]) {
    const start = source.indexOf(`exports.${name}`);
    assert.ok(start >= 0, `${name} exists`);
    const next = source.indexOf("\nexports.", start + 10);
    const body = source.slice(start, next > start ? next : undefined);
    assert.match(body, /assertProductionScalerCount/);
  }
});

test("no clone or relaunch callable can bypass the gate", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.doesNotMatch(source, /exports\.(clone|copy|relaunch).*Campaign/i);
});

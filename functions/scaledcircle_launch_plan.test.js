"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const launchPlan = require("../functions-social-operations/scaledcircle_launch_plan");

test("the existing ScaledCircle launch plan preserves its canonical lineage", () => {
  const result = launchPlan.buildScaledCircleLaunchPlan({businessUid: "scaled-circle-business",
    now: Date.parse("2026-09-02T16:00:00.000Z")});
  assert.equal(result.planId, "sc_plan_2026_09_launch_readiness_v1");
  assert.equal(result.planVersionId, "sc_plan_2026_09_launch_readiness_v1:v1");
  assert.equal(result.campaignId, "sc_campaign_brand_launch_md_2026_09");
  assert.equal(result.planRecord.businessUid, "scaled-circle-business");
  assert.equal(result.planRecord.automationMode, "manual");
  assert.equal(result.planRecord.status, "ready_for_review");
  assert.equal(result.planRecord.immutableOriginal, true);
  assert.equal(result.planRecord.sourceAuthority, "local_evidence_artifact");
});

test("the canonical import contains sixteen items and eighteen platform versions", () => {
  const result = launchPlan.buildScaledCircleLaunchPlan({businessUid: "scaled-circle-business"});
  assert.equal(result.content.length, 16);
  assert.equal(result.content.reduce((count, entry) =>
    count + entry.versionRecord.variants.length, 0), 18);
  assert.equal(new Set(result.content.map((entry) => entry.itemId)).size, 16);
  assert.equal(result.content.flatMap((entry) => entry.versionRecord.variants)
    .filter((variant) => variant.responseAssetId).length, 0);
});

test("original drafts, schedules, media requirements, and provider intent are retained", () => {
  const result = launchPlan.buildScaledCircleLaunchPlan({businessUid: "scaled-circle-business"});
  const mapping = result.content.find((entry) => entry.itemId === "sc_x_20260903_mapping_v1");
  assert.equal(mapping.itemRecord.scheduledFor, "2026-09-03T14:00:00.000Z");
  assert.match(mapping.versionRecord.variants[0].copy,
    /A bigger service area is not automatically a better campaign/);
  assert.match(mapping.versionRecord.variants[0].mediaRequirement, /Smart Mapping/);
  const meta = result.content.find((entry) =>
    entry.itemId === "sc_meta_20260913_local_campaign_v1");
  assert.equal(meta.itemRecord.status, "pending_connection");
  assert.deepEqual(meta.versionRecord.variants.map((variant) => variant.provider),
    ["facebook", "instagram"]);
  assert.equal(meta.versionRecord.versionId, "v1");
});

test("the import is deterministic except for audit timestamps", () => {
  const left = launchPlan.buildScaledCircleLaunchPlan({businessUid: "scaled-circle-business", now: 1});
  const right = launchPlan.buildScaledCircleLaunchPlan({businessUid: "scaled-circle-business", now: 2});
  assert.equal(left.planRecord.contentHash, right.planRecord.contentHash);
  assert.deepEqual(left.content.map((entry) => entry.itemId),
    right.content.map((entry) => entry.itemId));
});

test("missing Business authority fails closed", () => {
  assert.throws(() => launchPlan.buildScaledCircleLaunchPlan(),
    /scaledcircle_business_uid_required/);
});

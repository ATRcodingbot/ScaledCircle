"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(require.resolve("./index"), "utf8");

test("Smart Zone entry keeps role, ownership, entitlement, and draft gates", () => {
  const start = source.indexOf("async function smartZoneCampaign");
  const end = source.indexOf("function smartZonePlanArguments", start);
  const contract = source.slice(start, end);
  assert.match(contract, /context\.role !== "business"/);
  assert.match(contract, /campaign\.businessId !== context\.uid/);
  assert.match(contract, /hasActivePaidBusinessEntitlement/);
  assert.match(contract, /campaign\.status \|\| "draft"/);
});

test("explicit area is server resolved and client geometry is never read", () => {
  const start = source.indexOf("async function smartZoneSelectedArea");
  const end = source.indexOf("function smartZonePlanArguments", start);
  const contract = source.slice(start, end);
  assert.match(contract, /serviceAreaResolution\.resolvePlace/);
  assert.match(contract, /selectResolvedArea/);
  assert.match(contract, /rectangleAround\(selected\.center/);
  assert.doesNotMatch(contract, /request\.data\?\.(geometry|serviceArea|selectedBoundary)/);
});

test("apply stores only the server-selected boundary and its provenance", () => {
  const start = source.indexOf("exports.applySmartZonePlan");
  const end = source.indexOf("analyzePropertyIntelligence", start);
  const contract = source.slice(start, end);
  assert.match(contract, /serviceArea: input\.selectedBoundary/);
  assert.match(contract, /serviceAreaResolutionSource/);
  assert.doesNotMatch(contract, /serviceArea: request\.data/);
});

test("compensation guidance uses base pay before optional bonuses", () => {
  const start = source.indexOf("function smartZonePlanArguments");
  const end = source.indexOf("async function generateSmartZonePlan", start);
  const contract = source.slice(start, end);
  assert.match(contract, /workerBasePayCents: Math\.round\(Number\(input\.campaign\.basePay/);
  assert.match(contract, /completionBonusCents: Math\.round\(Number\(input\.campaign\.bonus/);
  assert.match(contract, /qualityBonusCents: Math\.round\(Number\(input\.campaign\.qualityBonus/);
  assert.doesNotMatch(contract, /basePay \|\| 0\) \+\s*Number\(input\.campaign\.bonus/);
});

test("recommended pay is applied only after the Business explicitly selects it", () => {
  const start = source.indexOf("exports.applySmartZonePlan");
  const end = source.indexOf("analyzePropertyIntelligence", start);
  const contract = source.slice(start, end);
  assert.match(contract, /request\.data\?\.useRecommendedPay === true/);
  assert.match(contract, /basePay: plan\.compensation\.recommendedBasePayCents \/ 100/);
  assert.match(contract, /compensationRecommendationAccepted: true/);
});

test("apply converts authoritative geometry rejection into a product-safe error", () => {
  const start = source.indexOf("exports.applySmartZonePlan");
  const end = source.indexOf("analyzePropertyIntelligence", start);
  const contract = source.slice(start, end);
  assert.match(contract, /assertZoneDuration/);
  assert.match(contract, /Smart Zone plan failed authoritative geometry validation/);
  assert.match(contract, /We couldn't apply this Smart Zone plan/);
  assert.doesNotMatch(contract, /throw new HttpsError\("internal",\s*"INTERNAL"/);
});

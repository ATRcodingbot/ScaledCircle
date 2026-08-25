"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const entitlement = require("./subscription_entitlements");
const fs = require("node:fs");

const nowMillis = Date.parse("2026-08-13T12:00:00Z");
const timestamp = (value) => ({toMillis: () => Date.parse(value)});

test("only an active unexpired Scale record grants Property Intelligence", () => {
  assert.equal(entitlement.hasActiveScaleEntitlement({
    planId: "scale", status: "active", expiresAt: timestamp("2026-09-13T12:00:00Z"),
  }, {nowMillis}), true);
  assert.equal(entitlement.hasActiveScaleEntitlement({
    planId: "growth", status: "active", expiresAt: timestamp("2026-09-13T12:00:00Z"),
  }, {nowMillis}), false);
});

test("expired, cancelled, and inactive Scale records are denied", () => {
  for (const record of [
    {plan: "scale", status: "active", expiresAt: timestamp("2026-08-13T11:59:59Z")},
    {plan: "scale", status: "cancelled", expiresAt: timestamp("2026-09-13T12:00:00Z")},
    {plan: "scale", status: "inactive", expiresAt: timestamp("2026-09-13T12:00:00Z")},
  ]) assert.equal(entitlement.hasActiveScaleEntitlement(record, {nowMillis}), false);
});

test("Smart Zone access includes every active paid Business tier", () => {
  for (const planId of ["starter", "growth", "scale", "managed_growth"]) {
    assert.equal(entitlement.hasActivePaidBusinessEntitlement({
      planId, status: "active", expiresAt: timestamp("2026-09-13T12:00:00Z"),
    }, {nowMillis}), true, planId);
  }
  for (const record of [
    null,
    {planId: "free", status: "active", expiresAt: timestamp("2026-09-13T12:00:00Z")},
    {planId: "starter", status: "cancelled", expiresAt: timestamp("2026-09-13T12:00:00Z")},
    {planId: "starter", status: "active", expiresAt: timestamp("2026-08-13T11:59:59Z")},
  ]) assert.equal(entitlement.hasActivePaidBusinessEntitlement(record, {nowMillis}), false);
});

test("client-looking fields cannot spoof the authoritative record", () => {
  assert.equal(entitlement.hasActiveScaleEntitlement({
    requestedPlan: "scale", clientEntitlement: true, status: "active",
    expiresAt: timestamp("2026-09-13T12:00:00Z"),
  }, {nowMillis}), false);
});

test("callable checks trusted entitlement before zone, cache, secret, or provider work", () => {
  const source = fs.readFileSync(require.resolve("./index"), "utf8");
  const start = source.indexOf("exports.analyzePropertyIntelligence");
  const end = source.indexOf("exports.", start + 40);
  const callable = source.slice(start, end < 0 ? undefined : end);
  const entitlementRead = callable.indexOf('collection("businessSubscriptions")');
  assert.ok(entitlementRead >= 0);
  for (const marker of [
    'collection("campaignZones")',
    'collection(PROPERTY_INTELLIGENCE_CACHE_COLLECTION)',
    "new propertyIntelligence.MarylandPropertyProvider",
    "CENSUS_API_KEY.value()",
  ]) assert.ok(entitlementRead < callable.indexOf(marker), marker);
  assert.doesNotMatch(callable, /request\.data\?.*(subscription|entitlement|plan)/i);
});

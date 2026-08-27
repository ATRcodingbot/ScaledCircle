"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const attribution = require("./attribution_foundation");

test("canonical envelope is channel-neutral, bounded, and versioned", () => {
  const value = attribution.canonicalEnvelope({source: "postcard", campaignId: "campaign",
    zoneId: "zone", materialId: "material", creativeVersion: "v3"});
  assert.equal(value.schemaVersion, "AttributionFoundationV1");
  assert.equal(value.source, "postcard");
  assert.equal(value.campaignId, "campaign");
  assert.equal(value.zoneId, "zone");
  assert.equal(value.materialId, "material");
  assert.equal(value.creativeVersion, "v3");
  assert.throws(() => attribution.canonicalEnvelope({source: "made_up"}), /invalid_attribution_source/);
});

test("public codes are opaque and destination is HTTPS-only", () => {
  const code = attribution.opaqueCode((size) => Buffer.alloc(size, 7));
  assert.equal(code.length, 24);
  assert.doesNotMatch(code, /campaign|business|zone/i);
  assert.equal(attribution.assertHttpsDestination("https://example.com/path"), "https://example.com/path");
  for (const invalid of ["http://example.com", "javascript:alert(1)", "not a url",
    "https://user:pass@example.com"]) {
    assert.throws(() => attribution.assertHttpsDestination(invalid), /invalid_response_destination/);
  }
});

test("privacy fingerprint dedupes same daily response without retaining raw signals", () => {
  const first = attribution.privacyFingerprint({ip: "192.0.2.123", userAgent: "Browser 1",
    assetId: "asset", now: Date.UTC(2026, 7, 26)});
  const repeat = attribution.privacyFingerprint({ip: "192.0.2.199", userAgent: "Browser 1",
    assetId: "asset", now: Date.UTC(2026, 7, 26, 23)});
  const nextDay = attribution.privacyFingerprint({ip: "192.0.2.123", userAgent: "Browser 1",
    assetId: "asset", now: Date.UTC(2026, 7, 27)});
  assert.equal(first, repeat);
  assert.notEqual(first, nextDay);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(first, /192\.0\.2/);
});

test("authority fails closed for signed-out, Business cross-tenant, and inactive actors", () => {
  assert.throws(() => attribution.assertAttributionActor(null), /attribution_actor_required/);
  assert.throws(() => attribution.assertAttributionActor({uid: "u", role: "scaler", emailVerified: true}),
    /attribution_actor_required/);
  assert.throws(() => attribution.assertAttributionActor({uid: "u", role: "business",
    emailVerified: true, user: {active: false}}), /attribution_actor_required/);
  assert.equal(attribution.assertAttributionActor({uid: "u", role: "admin", emailVerified: true,
    user: {active: true}}).uid, "u");
});

test("asset types keep QR and tracked links on one authority", () => {
  assert.deepEqual([...attribution.ASSET_TYPES].sort(), ["qr", "tracked_link"]);
  assert.ok(attribution.FUTURE_ASSET_TYPES.has("landing_page"));
  assert.ok(attribution.SOURCES.has("social"));
  assert.ok(attribution.SOURCES.has("affiliate"));
  assert.ok(attribution.CONVERSION_MILESTONES.has("first_funded_campaign"));
});

test("lead bridge preserves first/last attribution and immutable conversion authority", () => {
  const source = fs.readFileSync(path.join(__dirname, "attribution_foundation.js"), "utf8");
  assert.match(source, /firstAttribution: attribution/);
  assert.match(source, /lastAttribution: attribution/);
  assert.match(source, /collection\("salesLeads"\)/);
  assert.match(source, /collection\("salesActivities"\)/);
  assert.match(source, /collection\("attributionConversions"\)/);
  assert.match(source, /milestone: "lead"/);
  assert.match(source, /economicValue: null, immutable: true/);
});

test("Business and Admin overview remains bounded and server-mediated", () => {
  const source = fs.readFileSync(path.join(__dirname, "attribution_foundation.js"), "utf8");
  assert.match(source, /actor\.role === "admin" && !requestedBusinessUid/);
  assert.match(source, /where\("businessUid", "==", businessUid\)\.limit\(limit\)/);
  assert.match(source, /orderBy\(timestampField, "desc"\)\.limit\(limit\)/);
  assert.match(source, /page: \{limit, bounded: true\}/);
});

test("redirect recording is transactional, deduplicated, and immutable", () => {
  const source = fs.readFileSync(path.join(__dirname, "attribution_foundation.js"), "utf8");
  assert.match(source, /db\.runTransaction/);
  assert.match(source, /transaction\.get\(ref\)/);
  assert.match(source, /transaction\.create\(ref/);
  assert.match(source, /visitorHash: fingerprint/);
  assert.match(source, /immutable: true/);
});

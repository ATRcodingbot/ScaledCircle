"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const attribution = require("./attribution_foundation");

function fakeFirestore(seed = {}) {
  const records = new Map();
  let nextId = 1;
  for (const [pathName, value] of Object.entries(seed)) records.set(pathName, value);
  const snapshot = (pathName) => ({exists: records.has(pathName), id: pathName.split("/").at(-1),
    data: () => records.get(pathName)});
  const refFor = (collectionName, id = `id-${nextId++}`) => ({
    id,
    path: `${collectionName}/${id}`,
    get: async () => snapshot(`${collectionName}/${id}`),
    create: async (value) => {
      const pathName = `${collectionName}/${id}`;
      if (records.has(pathName)) throw new Error("already_exists");
      records.set(pathName, value);
    },
  });
  return {
    records,
    collection(collectionName) {
      return {
        doc: (id) => refFor(collectionName, id),
        where(field, operator, expected) {
          assert.equal(operator, "==");
          return {limit: (limit) => ({get: async () => ({docs: [...records.entries()]
            .filter(([pathName, value]) => pathName.startsWith(`${collectionName}/`) &&
              value[field] === expected).slice(0, limit)
            .map(([pathName]) => snapshot(pathName))})})};
        },
      };
    },
    async runTransaction(callback) {
      return callback({
        get: async (ref) => snapshot(ref.path),
        create: (ref, value) => {
          if (records.has(ref.path)) throw new Error("already_exists");
          records.set(ref.path, value);
        },
        set: (ref, value, options = {}) => records.set(ref.path,
          options.merge ? {...(records.get(ref.path) || {}), ...value} : value),
      });
    },
  };
}

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

test("public response origin is project-derived and fails closed", () => {
  assert.equal(attribution.publicResponseOrigin("scaledcircle-staging"),
    "https://scaledcircle-staging.web.app");
  assert.equal(attribution.publicResponseOrigin("scaled-circle"), "https://scaledcircle.com");
  assert.equal(attribution.publicResponseOrigin("demo-scaledcircle"), "http://127.0.0.1:5000");
  assert.equal(attribution.publicResponseOrigin("unknown-project"), null);
  assert.throws(() => attribution.assertPublicResponseOrigin(null), /response_origin_unavailable/);
  assert.throws(() => attribution.assertPublicResponseOrigin("https://evil.example/path"),
    /response_origin_unavailable/);
});

test("resolver diagnostics are privacy-safe and internally specific", () => {
  assert.equal(attribution.responseCodeFingerprint("abcdefghijklmnopqrstuvwx").length, 16);
  assert.equal(attribution.resolverFailureCategory(new Error("response_code_malformed")),
    "malformed_code");
  assert.equal(attribution.resolverFailureCategory(new Error("response_asset_not_found")),
    "unknown_code");
  assert.equal(attribution.resolverFailureCategory(new Error("response_asset_inactive")),
    "inactive_asset");
  assert.equal(attribution.resolverFailureCategory(new Error("invalid_response_destination")),
    "invalid_destination");
});

test("staging asset resolves end to end and production rendering stays isolated", async () => {
  const db = fakeFirestore({"users/business-1": {role: "business"}});
  const FieldValue = {serverTimestamp: () => 1234, increment: (value) => value};
  const actor = {uid: "business-1", role: "business", emailVerified: true, user: {active: true}};
  const staging = attribution.createAttributionService({db, FieldValue, now: () => 2000,
    randomBytes: (size) => Buffer.alloc(size, 7),
    publicBaseUrl: attribution.publicResponseOrigin("scaledcircle-staging")});
  const created = await staging.createResponseAsset({type: "tracked_link", label: "Internal QA",
    destination: "https://scaledcircle-staging.web.app/#/business"}, actor);
  assert.equal(created.trackedUrl,
    `https://scaledcircle-staging.web.app/r?code=${created.publicCode}`);
  assert.match(created.publicCode, /^[A-Za-z0-9_-]{24}$/);

  const first = await staging.resolveAndRecord({code: created.publicCode, ip: "192.0.2.10",
    userAgent: "QA browser", requestIdentity: "trace-one"});
  assert.equal(first.destination, "https://scaledcircle-staging.web.app/#/business");
  assert.equal(first.created, true);
  const replay = await staging.resolveAndRecord({code: created.publicCode, ip: "192.0.2.99",
    userAgent: "QA browser", requestIdentity: "trace-one"});
  assert.equal(replay.created, false);
  assert.equal([...db.records.keys()].filter((key) => key.startsWith("responseInteractions/")).length, 1);

  const qr = await staging.createResponseAsset({type: "qr", label: "Internal QA QR",
    destination: "https://scaledcircle-staging.web.app/#/business"}, actor);
  assert.match(qr.trackedUrl, /^https:\/\/scaledcircle-staging\.web\.app\/r\?code=/);
  const production = attribution.safeAsset("asset", {type: "tracked_link", publicCode: "a".repeat(24),
    destination: "https://scaledcircle.com", attribution: {}},
  attribution.publicResponseOrigin("scaled-circle"));
  assert.equal(production.trackedUrl, `https://scaledcircle.com/r?code=${"a".repeat(24)}`);
});

test("interaction events are request-idempotent while unique responders stay deduplicated", async () => {
  const code = "abcdefghijklmnopqrstuvwx";
  const db = fakeFirestore({
    "users/business-1": {role: "business"},
    "campaigns/campaign-1": {businessId: "business-1", status: "open"},
    "responseAssets/asset-1": {businessUid: "business-1", publicCode: code, status: "active",
      destination: "https://scaledcircle-staging.web.app/#/business", type: "tracked_link",
      attribution: {source: "tracked_link", campaignId: "campaign-1"}},
  });
  const FieldValue = {serverTimestamp: () => 1234, increment: (value) => value};
  const service = attribution.createAttributionService({db, FieldValue, now: () => 2000,
    publicBaseUrl: attribution.publicResponseOrigin("scaledcircle-staging")});

  const first = await service.resolveAndRecord({code, ip: "192.0.2.10", userAgent: "Browser A",
    requestIdentity: "request-one"});
  const retry = await service.resolveAndRecord({code, ip: "192.0.2.10", userAgent: "Browser A",
    requestIdentity: "request-one"});
  const secondVisit = await service.resolveAndRecord({code, ip: "192.0.2.10", userAgent: "Browser A",
    requestIdentity: "request-two"});
  const otherVisitor = await service.resolveAndRecord({code, ip: "198.51.100.10", userAgent: "Browser B",
    requestIdentity: "request-three"});

  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(secondVisit.created, true);
  assert.equal(otherVisitor.created, true);
  const events = [...db.records.entries()].filter(([key]) => key.startsWith("responseInteractions/"));
  assert.equal(events.length, 3);
  assert.equal(new Set(events.map(([, value]) => value.visitorHash)).size, 2);
  const actor = {uid: "business-1", role: "business", emailVerified: true, user: {active: true}};
  const overview = await service.getOverview({}, actor);
  assert.equal(overview.metrics.trackedInteractions, 3);
  assert.equal(overview.metrics.uniqueResponses, 2);
  assert.equal(overview.metrics.testInteractions, 0);
});

test("campaign state classifies permanent-link activity without polluting live KPIs", async () => {
  assert.equal(attribution.responseActivityClass({status: "active", attribution: {}}, null),
    "prelaunch");
  assert.equal(attribution.responseActivityClass({status: "active",
    attribution: {campaignId: "c"}}, {status: "draft"}), "prelaunch");
  assert.equal(attribution.responseActivityClass({status: "active",
    attribution: {campaignId: "c"}}, {status: "open"}), "live");
  assert.equal(attribution.responseActivityClass({status: "active",
    attribution: {campaignId: "c"}}, {status: "paused"}), "paused");
  assert.equal(attribution.responseActivityClass({status: "active",
    attribution: {campaignId: "c"}}, {status: "completed"}), "post_campaign");
  assert.equal(attribution.responseActivityClass({status: "active",
    attribution: {campaignId: "c"}}, {status: "cancelled"}), "cancelled");
  assert.equal(attribution.responseActivityClass({status: "retired",
    attribution: {campaignId: "c"}}, {status: "open"}), "retired");

  const code = "zyxwvutsrqponmlkjihgfedc";
  const db = fakeFirestore({
    "users/business-1": {role: "business"},
    "campaigns/campaign-1": {businessId: "business-1", status: "draft"},
    "responseAssets/asset-1": {businessUid: "business-1", publicCode: code, status: "active",
      destination: "https://scaledcircle-staging.web.app/#/business", type: "tracked_link",
      attribution: {source: "tracked_link", campaignId: "campaign-1"}},
  });
  const FieldValue = {serverTimestamp: () => 1234, increment: (value) => value};
  const service = attribution.createAttributionService({db, FieldValue, now: () => 2000,
    publicBaseUrl: attribution.publicResponseOrigin("scaledcircle-staging")});
  const result = await service.resolveAndRecord({code, ip: "192.0.2.10", userAgent: "Browser",
    requestIdentity: "prelaunch-request"});
  assert.equal(result.analyticsClass, "prelaunch");
  const actor = {uid: "business-1", role: "business", emailVerified: true, user: {active: true}};
  const overview = await service.getOverview({}, actor);
  assert.equal(overview.metrics.trackedInteractions, 0);
  assert.equal(overview.metrics.uniqueResponses, 0);
  assert.equal(overview.metrics.testInteractions, 1);
  assert.equal(overview.metrics.uniqueTestResponses, 1);
  assert.equal(overview.metrics.totalInteractions, 1);
  assert.equal(overview.assets[0].analyticsClass, "prelaunch");
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
  assert.match(source, /interactionEventId\(assetDoc\.id, requestIdentity\)/);
  assert.match(source, /analyticsClass/);
  assert.match(source, /immutable: true/);
});

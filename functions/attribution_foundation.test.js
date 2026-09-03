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
      const queryDocs = (field, expected, limit) => [...records.entries()]
        .filter(([pathName, value]) => pathName.startsWith(`${collectionName}/`) &&
          (field === null || value[field] === expected)).slice(0, limit)
        .map(([pathName]) => snapshot(pathName));
      return {
        doc: (id) => refFor(collectionName, id),
        where(field, operator, expected) {
          assert.equal(operator, "==");
          return {limit: (limit) => ({get: async () => ({docs: queryDocs(field, expected, limit)})})};
        },
        orderBy() {
          return {limit: (limit) => ({get: async () => ({docs: queryDocs(null, null, limit)})})};
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
  assert.equal(value.landingPageId, null);
  assert.equal(value.landingPageVersionId, null);
  assert.throws(() => attribution.canonicalEnvelope({source: "made_up"}), /invalid_attribution_source/);
});

test("landing response snapshots immutable page and version context across republish", async () => {
  const code="abcdefghijklmnopqrstuvwx";
  const db=fakeFirestore({"responseAssets/asset-page":{businessUid:"business-1",publicCode:code,
    status:"active",destination:"https://scaledcircle-staging.web.app/p/PAGE",type:"landing_page",
    attribution:{source:"landing_page",landingPageId:"page-a",landingPageVersionId:"version-a"}}});
  const FieldValue={serverTimestamp:()=>1234,increment:(value)=>value};
  const contexts=[Buffer.alloc(18,7),Buffer.alloc(18,8)];
  const service=attribution.createAttributionService({db,FieldValue,now:()=>2000,
    randomBytes:()=>contexts.shift(),publicBaseUrl:"https://scaledcircle-staging.web.app"});
  const first=await service.resolveAndRecord({code,ip:"192.0.2.1",userAgent:"Browser",
    requestIdentity:"visit-a"});
  assert.equal(first.attributionComplete,true);
  assert.match(first.destination,/\/p\/PAGE\?sc_response=/);
  const firstInteraction=[...db.records.entries()].find(([path])=>path.startsWith("responseInteractions/"))[1];
  assert.equal(firstInteraction.landingPageId,"page-a");
  assert.equal(firstInteraction.landingPageVersionId,"version-a");
  assert.equal(firstInteraction.attribution.landingPageVersionId,"version-a");
  db.records.get("responseAssets/asset-page").attribution.landingPageVersionId="version-b";
  await service.resolveAndRecord({code,ip:"192.0.2.2",userAgent:"Browser",requestIdentity:"visit-b"});
  const interactions=[...db.records.values()].filter((value)=>value.interactionId===undefined&&
    value.responseAssetId==="asset-page"&&value.immutable===true);
  assert.equal(interactions.length,2);
  assert.deepEqual(new Set(interactions.map((value)=>value.landingPageVersionId)),
    new Set(["version-a","version-b"]));
  assert.equal(firstInteraction.landingPageVersionId,"version-a");
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

test("one-time ScaledCircle production campaign import is exact and idempotent", async () => {
  const db = fakeFirestore();
  const service = attribution.createAttributionService({db,
    FieldValue: {serverTimestamp: () => "server-time"}, runtimeProjectId: "scaled-circle",
    adminSelfDogfoodBusinessUid: "FF1bfDuvtdNjuuC4mc7NdGtk3LC3"});
  const created = await service.importScaledCircleDogfoodCampaign();
  const replay = await service.importScaledCircleDogfoodCampaign();
  assert.equal(created.campaignId, "sc_campaign_brand_launch_md_2026_09");
  assert.equal(created.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal([...db.records.keys()].filter((key) =>
    key === "campaigns/sc_campaign_brand_launch_md_2026_09").length, 1);
  assert.deepEqual(db.records.get("campaigns/sc_campaign_brand_launch_md_2026_09"), {
    schemaVersion: "SocialCampaignAttributionV1",
    businessId: "FF1bfDuvtdNjuuC4mc7NdGtk3LC3",
    campaignName: "ScaledCircle Maryland brand launch — September 2026",
    campaignType: "social_brand_launch",
    status: "draft",
    socialPlanId: "sc_plan_2026_09_launch_readiness_v1",
    socialPlanVersionId: "sc_plan_2026_09_launch_readiness_v1:v1",
    providerMutationEnabled: false,
    financialAuthorityEnabled: false,
    createdAt: "server-time",
    updatedAt: "server-time",
  });
  assert.deepEqual(db.records.get("campaignImportReceipts/scaledcircle_social_launch_2026_09_v1"), {
    schemaVersion: "CanonicalCampaignImportReceiptV1",
    importAuthority: "SCALED_CIRCLE_SELF_DOGFOOD_ONLY",
    projectId: "scaled-circle",
    ownerUid: "FF1bfDuvtdNjuuC4mc7NdGtk3LC3",
    campaignId: "sc_campaign_brand_launch_md_2026_09",
    sourcePlanId: "sc_plan_2026_09_launch_readiness_v1",
    sourcePlanVersionId: "sc_plan_2026_09_launch_readiness_v1:v1",
    immutable: true,
    result: "created",
    createdAt: "server-time",
  });
  assert.deepEqual([...db.records.keys()].sort(), [
    "campaignImportReceipts/scaledcircle_social_launch_2026_09_v1",
    "campaigns/sc_campaign_brand_launch_md_2026_09",
  ]);
});

test("one-time campaign import accepts only POST with an empty fixed request", () => {
  assert.equal(attribution.assertCampaignImportHttpRequest({method: "POST", body: {}, query: {}}), true);
  for (const request of [
    {method: "GET", body: {}, query: {}},
    {method: "POST", body: null, query: {}},
    {method: "POST", body: [], query: {}},
    {method: "POST", body: {ownerUid: "caller-selected"}, query: {}},
    {method: "POST", body: {}, query: {campaignId: "caller-selected"}},
  ]) assert.throws(() => attribution.assertCampaignImportHttpRequest(request), /campaign_import_/);
});

test("production campaign import rejects other projects, authorities, and conflicting records", async () => {
  const ownerUid = "FF1bfDuvtdNjuuC4mc7NdGtk3LC3";
  const options = {FieldValue: {serverTimestamp: () => "server-time"},
    adminSelfDogfoodBusinessUid: ownerUid};
  await assert.rejects(attribution.createAttributionService({...options, db: fakeFirestore(),
    runtimeProjectId: "scaledcircle-staging"}).importScaledCircleDogfoodCampaign(),
  /campaign_import_wrong_environment/);
  await assert.rejects(attribution.createAttributionService({...options, db: fakeFirestore(),
    runtimeProjectId: "scaled-circle", adminSelfDogfoodBusinessUid: "another-business"})
    .importScaledCircleDogfoodCampaign(),
  /campaign_import_forbidden/);
  const conflict = fakeFirestore({"campaigns/sc_campaign_brand_launch_md_2026_09": {
    businessId: ownerUid, campaignName: "Different campaign"}});
  await assert.rejects(attribution.createAttributionService({...options, db: conflict,
    runtimeProjectId: "scaled-circle"}).importScaledCircleDogfoodCampaign(),
  /campaign_import_conflict/);
  const ownershipConflict = fakeFirestore({"campaigns/sc_campaign_brand_launch_md_2026_09": {
    businessId: "another-business", campaignName: "ScaledCircle Maryland brand launch — September 2026",
    campaignType: "social_brand_launch", status: "draft",
    socialPlanId: "sc_plan_2026_09_launch_readiness_v1",
    socialPlanVersionId: "sc_plan_2026_09_launch_readiness_v1:v1",
    providerMutationEnabled: false, financialAuthorityEnabled: false}});
  await assert.rejects(attribution.createAttributionService({...options, db: ownershipConflict,
    runtimeProjectId: "scaled-circle"}).importScaledCircleDogfoodCampaign(),
  /campaign_import_conflict/);
  const receiptConflict = fakeFirestore({
    "campaigns/sc_campaign_brand_launch_md_2026_09": {
      schemaVersion: "SocialCampaignAttributionV1", businessId: ownerUid,
      campaignName: "ScaledCircle Maryland brand launch — September 2026",
      campaignType: "social_brand_launch", status: "draft",
      socialPlanId: "sc_plan_2026_09_launch_readiness_v1",
      socialPlanVersionId: "sc_plan_2026_09_launch_readiness_v1:v1",
      providerMutationEnabled: false, financialAuthorityEnabled: false,
    },
    "campaignImportReceipts/scaledcircle_social_launch_2026_09_v1": {
      schemaVersion: "CanonicalCampaignImportReceiptV1", ownerUid: "another-business",
    },
  });
  await assert.rejects(attribution.createAttributionService({...options, db: receiptConflict,
    runtimeProjectId: "scaled-circle"}).importScaledCircleDogfoodCampaign(),
  /campaign_import_conflict/);
});

test("public-publish origins are production-authoritative and staging remains internal", () => {
  const production = attribution.responseOriginPolicy("scaled-circle");
  assert.deepEqual(production, {
    projectId: "scaled-circle", origin: "https://scaledcircle.com",
    defaultExposure: "public_publish", permitsPublicPublish: true,
  });
  const staging = attribution.responseOriginPolicy("scaledcircle-staging");
  assert.equal(staging.defaultExposure, "internal_qa");
  assert.equal(staging.permitsPublicPublish, false);
  assert.deepEqual(attribution.assertResponseOriginPolicy({
    origin: production.origin, exposure: "public_publish", permitsPublicPublish: true,
  }), {origin: "https://scaledcircle.com", exposure: "public_publish"});
  for (const origin of ["http://127.0.0.1:5000", "https://scaledcircle-staging.web.app",
    "https://project.firebaseapp.com", "https://unknown.example"]) {
    assert.throws(() => attribution.assertResponseOriginPolicy({origin,
      exposure: "public_publish", permitsPublicPublish: true}), /public_publish_origin_forbidden/);
  }
  assert.throws(() => attribution.assertResponseOriginPolicy({
    origin: "https://scaledcircle.com", exposure: "public_publish", permitsPublicPublish: false,
  }), /public_publish_origin_forbidden/);
});

test("response asset origin and exposure are immutable and public staging creation fails closed", async () => {
  const db = fakeFirestore({"users/business-1": {role: "business"}});
  const FieldValue = {serverTimestamp: () => 1234, increment: (value) => value};
  const actor = {uid: "business-1", role: "business", emailVerified: true, user: {active: true}};
  const staging = attribution.createAttributionService({db, FieldValue,
    randomBytes: (size) => Buffer.alloc(size, 7),
    publicBaseUrl: "https://scaledcircle-staging.web.app",
    defaultExposure: "internal_qa", permitsPublicPublish: false});
  await assert.rejects(staging.createResponseAsset({type: "tracked_link",
    exposure: "public_publish", requestId: "public-post-v1",
    destination: "https://scaledcircle.com/#/businesses"}, actor),
  /public_publish_origin_forbidden/);
  const production = attribution.createAttributionService({db, FieldValue,
    randomBytes: (size) => Buffer.alloc(size, 8), publicBaseUrl: "https://scaledcircle.com",
    defaultExposure: "public_publish", permitsPublicPublish: true});
  const request = {type: "tracked_link", exposure: "public_publish",
    requestId: "public-post-v1", destination: "https://scaledcircle.com/#/businesses"};
  const created = await production.createResponseAsset(request, actor);
  assert.match(created.trackedUrl, /^https:\/\/scaledcircle\.com\/r\?code=/);
  const stored = db.records.get(`responseAssets/${created.responseAssetId}`);
  assert.equal(stored.publicOrigin, "https://scaledcircle.com");
  assert.equal(stored.exposure, "public_publish");
  stored.publicOrigin = "https://scaledcircle-staging.web.app";
  await assert.rejects(production.createResponseAsset(request, actor));
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

test("only the exact Admin self-dogfood UID receives the configured attribution bridge", async () => {
  const uid = "FF1bfDuvtdNjuuC4mc7NdGtk3LC3";
  const db = fakeFirestore({[`users/${uid}`]: {role: "admin"}});
  const FieldValue = {serverTimestamp: () => 1234, increment: (value) => value};
  const service = attribution.createAttributionService({db, FieldValue, now: () => 2000,
    randomBytes: (size) => Buffer.alloc(size, 7),
    publicBaseUrl: attribution.publicResponseOrigin("scaledcircle-staging"),
    adminSelfDogfoodBusinessUid: uid});
  const actor = {uid, role: "admin", isAdmin: true, emailVerified: true,
    user: {active: true}};
  const created = await service.createResponseAsset({businessUid: uid, type: "tracked_link",
    destination: "https://scaledcircle.com/#/businesses"}, actor);
  assert.match(created.trackedUrl, /^https:\/\/scaledcircle-staging\.web\.app\/r\?code=/);
  await assert.rejects(service.createResponseAsset({businessUid: "other", type: "tracked_link",
    destination: "https://scaledcircle.com/#/businesses"}, actor), /business_identity_required/);

  const policy = attribution.responseOriginPolicy("scaled-circle");
  const production = attribution.createAttributionService({db, FieldValue,
    publicBaseUrl: policy.origin, defaultExposure: policy.defaultExposure,
    permitsPublicPublish: policy.permitsPublicPublish,
    adminSelfDogfoodBusinessUid: uid});
  const publicAsset = await production.createResponseAsset({businessUid: uid,
    requestId: "scaledcircle-x-v3-production-link", type: "tracked_link",
    exposure: "public_publish", destination: "https://scaledcircle.com/#/businesses"}, actor);
  assert.match(publicAsset.trackedUrl, /^https:\/\/scaledcircle\.com\/r\?code=/);
  const unrelatedAdmin = {uid: "unrelated-admin", role: "admin", isAdmin: true,
    emailVerified: true, user: {active: true}};
  await assert.rejects(production.createResponseAsset({businessUid: uid,
    type: "tracked_link", exposure: "public_publish",
    destination: "https://scaledcircle.com/#/businesses"}, unrelatedAdmin),
  /business_identity_required/);
});

test("response-asset creation is request-idempotent and conflicts fail closed", async () => {
  const db = fakeFirestore({"users/business-1": {role: "business"}});
  const FieldValue = {serverTimestamp: () => 1234, increment: (value) => value};
  const actor = {uid: "business-1", role: "business", emailVerified: true, user: {active: true}};
  const service = attribution.createAttributionService({db, FieldValue, now: () => 2000,
    randomBytes: (size) => Buffer.alloc(size, 7),
    publicBaseUrl: attribution.publicResponseOrigin("scaledcircle-staging")});
  const request = {type: "qr", requestId: "material-version-a", label: "Door hanger QR",
    destination: "https://scaledcircle-staging.web.app/p/QA",
    attribution: {source: "qr", materialId: "material-a", creativeVersion: "version-a"}};
  const created = await service.createResponseAsset(request, actor);
  assert.equal(created.idempotentReplay, false);
  const replay = await service.createResponseAsset(request, actor);
  assert.equal(replay.responseAssetId, created.responseAssetId);
  assert.equal(replay.publicCode, created.publicCode);
  assert.equal(replay.idempotentReplay, true);
  assert.equal([...db.records.keys()].filter((key) => key.startsWith("responseAssets/")).length, 1);
  await assert.rejects(service.createResponseAsset({...request,
    destination: "https://scaledcircle-staging.web.app/p/DIFFERENT"}, actor), /already_exists/);
});

test("interaction events are request-idempotent while unique responders stay deduplicated", async () => {
  const code = "abcdefghijklmnopqrstuvwx";
  const db = fakeFirestore({
    "users/business-1": {role: "business"},
    "campaigns/campaign-1": {businessId: "business-1", campaignName: "Launch campaign",
      status: "open"},
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
  assert.deepEqual(overview.campaigns,
    [{campaignId: "campaign-1", name: "Launch campaign", status: "open"}]);
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
    isAdmin: true, user: {active: false}}).uid, "u");
  assert.throws(() => attribution.assertAttributionActor({uid: "u", role: "admin",
    emailVerified: true, isAdmin: false, user: {active: true}}), /attribution_actor_required/);
});

test("production-shaped prelaunch data is valid for Business and trusted Admin overview", async () => {
  const seed = {
    "users/business-founder": {role: "business", active: true},
    "responseAssets/general-testing": {businessUid: "business-founder", type: "tracked_link",
      publicCode: "abcdefghijklmnopqrstuvwx", status: "active", label: "Internal QA",
      destination: "https://scaledcircle.com/#/business",
      attribution: {source: "tracked_link", campaignId: null}, createdAt: 1000, updatedAt: 1000},
    "responseInteractions/visit-one": {businessUid: "business-founder",
      responseAssetId: "general-testing", visitorHash: "visitor-one", analyticsClass: "prelaunch",
      attribution: {source: "tracked_link", campaignId: null}, occurredAt: 1100, immutable: true},
    "responseInteractions/visit-two": {businessUid: "business-founder",
      responseAssetId: "general-testing", visitorHash: "visitor-two", analyticsClass: "prelaunch",
      attribution: {source: "tracked_link", campaignId: null}, occurredAt: 1200, immutable: true},
    "featureHealth/attribution": {status: "enabled", successfulEvents: 2, updatedAt: 1200},
  };
  const service = attribution.createAttributionService({db: fakeFirestore(seed), FieldValue: {},
    now: () => 1300, publicBaseUrl: attribution.publicResponseOrigin("scaled-circle")});
  const business = await service.getOverview({}, {uid: "business-founder", role: "business",
    emailVerified: true, user: {active: true}});
  const admin = await service.getOverview({}, {uid: "production-admin", role: "admin",
    isAdmin: true, emailVerified: true, user: {active: false}});
  for (const overview of [business, admin]) {
    assert.deepEqual(overview.metrics, {responseAssets: 1, trackedInteractions: 0,
      uniqueResponses: 0, testInteractions: 2, uniqueTestResponses: 2,
      testLeads: 0, testConversions: 0,
      nonLiveInteractions: 0, totalInteractions: 2, leads: 0, conversions: 0});
    assert.equal(overview.assets[0].analyticsClass, "prelaunch");
    assert.equal(overview.dataStatus, "available");
    assert.equal(overview.page.bounded, true);
  }
  assert.equal(business.scope, "business-founder");
  assert.equal(admin.scope, "admin_bounded");
});

test("classified outcomes expose complete prelaunch funnel without changing live metrics", async () => {
  const seed = {
    "users/business-a": {role: "business", active: true},
    "responseAssets/test-a": {businessUid: "business-a", type: "landing_page",
      publicCode: "aaaaaaaaaaaaaaaaaaaaaaaa", status: "active", destination: "https://a.example",
      attribution: {source: "landing_page", landingPageId: "page-a",
        landingPageVersionId: "version-a"}, createdAt: 1},
    "responseAssets/test-b": {businessUid: "business-a", type: "tracked_link",
      publicCode: "bbbbbbbbbbbbbbbbbbbbbbbb", status: "active", destination: "https://b.example",
      attribution: {source: "tracked_link"}, createdAt: 2},
    "responseAssets/live-c": {businessUid: "business-a", type: "tracked_link",
      publicCode: "cccccccccccccccccccccccc", status: "active", destination: "https://c.example",
      attribution: {source: "tracked_link", campaignId: "campaign-live"}, createdAt: 3},
    "campaigns/campaign-live": {businessId: "business-a", status: "open"},
    "responseInteractions/test-a-1": {businessUid: "business-a", responseAssetId: "test-a",
      visitorHash: "test-visitor-a", analyticsClass: "prelaunch", occurredAt: 10},
    "responseInteractions/test-a-2": {businessUid: "business-a", responseAssetId: "test-a",
      visitorHash: "test-visitor-a", analyticsClass: "prelaunch", occurredAt: 11},
    "responseInteractions/test-b-1": {businessUid: "business-a", responseAssetId: "test-b",
      visitorHash: "test-visitor-b", analyticsClass: "prelaunch", occurredAt: 12},
    "responseInteractions/live-c-1": {businessUid: "business-a", responseAssetId: "live-c",
      visitorHash: "live-visitor", analyticsClass: "live", occurredAt: 13},
    "attributionConversions/test-lead": {businessUid: "business-a", leadId: "lead-test",
      responseAssetId: "test-b", milestone: "lead", analyticsClass: "prelaunch",
      attribution: {landingPageId: "page-a", landingPageVersionId: "version-a"}, occurredAt: 14},
    "attributionConversions/live-lead": {businessUid: "business-a", leadId: "lead-live",
      responseAssetId: "live-c", milestone: "lead", analyticsClass: "live", occurredAt: 15},
    "attributionConversions/live-conversion": {businessUid: "business-a", leadId: "lead-live",
      responseAssetId: "live-c", milestone: "customer_conversion", analyticsClass: "live",
      occurredAt: 16},
  };
  const service = attribution.createAttributionService({db: fakeFirestore(seed), FieldValue: {},
    now: () => 20, publicBaseUrl: attribution.publicResponseOrigin("scaled-circle")});
  const actor = {uid: "business-a", role: "business", emailVerified: true, user: {active: true}};
  const business = await service.getOverview({}, actor);
  const admin = await service.getOverview({businessUid: "business-a"}, {uid: "admin", role: "admin",
    isAdmin: true, emailVerified: true, user: {active: false}});
  for (const overview of [business, admin]) {
    assert.equal(overview.metrics.trackedInteractions, 1);
    assert.equal(overview.metrics.uniqueResponses, 1);
    assert.equal(overview.metrics.leads, 1);
    assert.equal(overview.metrics.conversions, 1);
    assert.equal(overview.metrics.testInteractions, 3);
    assert.equal(overview.metrics.uniqueTestResponses, 2);
    assert.equal(overview.metrics.testLeads, 1);
    assert.equal(overview.metrics.testConversions, 1);
    const testA = overview.assets.find((asset) => asset.responseAssetId === "test-a");
    const testB = overview.assets.find((asset) => asset.responseAssetId === "test-b");
    assert.deepEqual(testA.metrics, {trackedInteractions: 0, uniqueResponses: 0, leads: 0,
      conversions: 0, testInteractions: 2, uniqueTestResponses: 1, testLeads: 0,
      testConversions: 0});
    assert.equal(testB.metrics.testInteractions, 1);
    assert.equal(testB.metrics.testLeads, 1);
    assert.equal(testB.metrics.testConversions, 1);
  }
});

test("Admin aggregation is bounded across tracking and non-tracking Businesses", async () => {
  const seed = {
    "users/business-a": {role: "business", active: true},
    "users/business-b": {role: "business", active: true},
    "users/business-c": {role: "business", active: true},
    "users/business-d": {role: "business", active: true},
    "responseAssets/a-test": {businessUid: "business-a", type: "tracked_link",
      publicCode: "aaaaaaaaaaaaaaaaaaaaaaaa", status: "active", destination: "https://a.example",
      attribution: {source: "tracked_link"}, createdAt: 1},
    "responseAssets/b-live": {businessUid: "business-b", type: "qr",
      publicCode: "bbbbbbbbbbbbbbbbbbbbbbbb", status: "active", destination: "https://b.example",
      attribution: {source: "qr", campaignId: "campaign-b"}, createdAt: 2},
    "responseAssets/d-mixed": {businessUid: "business-d", type: "tracked_link",
      publicCode: "dddddddddddddddddddddddd", status: "active", destination: "https://d.example",
      attribution: {source: "tracked_link", campaignId: "campaign-d"}, createdAt: 3},
    "campaigns/campaign-b": {businessId: "business-b", status: "open"},
    "campaigns/campaign-d": {businessId: "business-d", status: "open"},
    "responseInteractions/a-visit": {businessUid: "business-a", responseAssetId: "a-test",
      visitorHash: "a", analyticsClass: "prelaunch", occurredAt: 10},
    "responseInteractions/b-visit": {businessUid: "business-b", responseAssetId: "b-live",
      visitorHash: "b", analyticsClass: "live", occurredAt: 11},
    "responseInteractions/d-test": {businessUid: "business-d", responseAssetId: "d-mixed",
      visitorHash: "d-test", analyticsClass: "prelaunch", occurredAt: 12},
    "responseInteractions/d-live": {businessUid: "business-d", responseAssetId: "d-mixed",
      visitorHash: "d-live", analyticsClass: "live", occurredAt: 13},
    "attributionConversions/b-lead": {businessUid: "business-b", leadId: "lead-b",
      milestone: "lead", analyticsClass: "live", occurredAt: 14},
    "attributionConversions/d-conversion": {businessUid: "business-d", leadId: "lead-d",
      milestone: "customer_conversion", analyticsClass: "live", occurredAt: 15},
  };
  const service = attribution.createAttributionService({db: fakeFirestore(seed), FieldValue: {},
    now: () => 20, publicBaseUrl: attribution.publicResponseOrigin("scaled-circle")});
  const admin = await service.getOverview({limit: 25}, {uid: "admin", role: "admin", isAdmin: true,
    emailVerified: true, user: {active: false}});
  assert.equal(admin.metrics.testInteractions, 2);
  assert.equal(admin.metrics.trackedInteractions, 2);
  assert.equal(admin.metrics.uniqueResponses, 2);
  assert.equal(admin.metrics.leads, 2);
  assert.equal(admin.metrics.conversions, 1);
  assert.equal(admin.assets.length, 3);
  assert.deepEqual(admin.campaigns, []);
  assert.deepEqual(admin.page, {limit: 25, bounded: true});

  const tenant = await service.getOverview({}, {uid: "business-a", role: "business",
    emailVerified: true, user: {active: true}});
  assert.equal(tenant.metrics.testInteractions, 1);
  assert.equal(tenant.metrics.trackedInteractions, 0);
  assert.equal(tenant.assets.length, 1);
  await assert.rejects(service.getOverview({businessUid: "business-b"}, {uid: "business-a",
    role: "business", emailVerified: true, user: {active: true}}),
  /cross_business_attribution_forbidden/);
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

test("phone interaction bridges into canonical attribution without becoming a lead", async () => {
  const db = fakeFirestore({"campaigns/campaign-phone": {businessId: "business-1", status: "active"}});
  const FieldValue = {serverTimestamp: () => 1234, increment: (value) => value};
  const service = attribution.createAttributionService({db, FieldValue, now: () => 2000,
    publicBaseUrl: attribution.publicResponseOrigin("scaledcircle-staging")});
  const input = {businessUid: "business-1", callSessionId: "call-session-a",
    callerIdentityHash: "a".repeat(64), attribution: {source: "phone",
      campaignId: "campaign-phone", materialId: "material-a", creativeVersion: "version-a"}};
  const first = await service.recordPhoneInteraction(input);
  const replay = await service.recordPhoneInteraction(input);
  assert.equal(first.created, true); assert.equal(replay.created, false);
  const record = db.records.get(`responseInteractions/${first.interactionId}`);
  assert.equal(record.attribution.source, "phone"); assert.equal(record.analyticsClass, "live");
  assert.equal(record.leadId, null); assert.equal(record.conversionId, null);
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

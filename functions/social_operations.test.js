"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const social = require("./social_operations");

const now = Date.parse("2030-01-01T12:00:00Z");
const baseItem = {itemKey: "education_1", scheduledFor: "2030-01-02T14:00:00Z",
  goal: "Explain the product", pillar: "education", variants: [
    {provider: "facebook", copy: "A useful explanation.", callToAction: "Learn more"},
    {provider: "x", copy: "One useful product insight."}]};

test("automation modes preserve customer control", () => {
  assert.equal(social.validateAutomationMode({mode: "manual", planId: "scale"}), "manual");
  assert.equal(social.validateAutomationMode({mode: "approve_plan", planId: "scale"}), "approve_plan");
  assert.throws(() => social.validateAutomationMode({mode: "managed", planId: "scale",
    managedAuthorization: true}), /managed_social_authorization_required/);
  assert.throws(() => social.validateAutomationMode({mode: "managed", planId: "managed_growth"}),
    /managed_social_authorization_required/);
  assert.equal(social.validateAutomationMode({mode: "managed", planId: "managed_growth",
    managedAuthorization: true}), "managed");
});

test("30-day plan creates platform-specific immutable content", () => {
  const plan = social.createContentPlan({businessUid: "biz", planId: "managed_growth",
    businessName: "ScaledCircle", goal: "Educate local businesses", pillars: ["education"],
    items: [baseItem], startsOn: "2030-01-01T00:00:00Z", now});
  assert.equal(plan.record.items[0].variants.length, 2);
  assert.notEqual(plan.record.items[0].variants[0].copy, plan.record.items[0].variants[1].copy);
  assert.equal(plan.record.status, "ready_for_review");
  assert.equal(plan.record.contentHash.length, 64);
  assert.throws(() => social.createContentPlan({businessUid: "biz", planId: "scale",
    businessName: "Business", items: [{...baseItem, scheduledFor: "2030-02-15T00:00:00Z"}],
    startsOn: "2030-01-01T00:00:00Z", now}), /outside_plan_window/);
});

test("edits create new versions and approval is exact", () => {
  const one = social.contentItemVersion({businessUid: "biz", planId: "plan", item: baseItem, now});
  const two = social.contentItemVersion({businessUid: "biz", planId: "plan",
    item: {...baseItem, variants: [{provider: "facebook", copy: "Edited copy."}]},
    previousVersion: one.version, now: now + 1});
  assert.equal(one.version, 1); assert.equal(two.version, 2);
  assert.notEqual(one.contentHash, two.contentHash);
  assert.throws(() => social.approveContentVersion({businessUid: "biz", record: two,
    version: 1}), /version_mismatch/);
  assert.equal(social.approveContentVersion({businessUid: "biz", record: two,
    version: 2}).status, "approved");
});

test("plan approval binds one exact immutable plan version", () => {
  const plan = social.createContentPlan({businessUid: "biz", planId: "scale",
    businessName: "Business", goal: "Educate", items: [baseItem], now,
    startsOn: "2030-01-01T00:00:00Z"});
  assert.throws(() => social.approvePlan({businessUid: "biz", record: plan.record,
    planVersion: 2}), /version_mismatch/);
  const approved = social.approvePlan({businessUid: "biz", record: plan.record,
    planVersion: 1, now});
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedVersion, 1);
});

test("publish jobs fail closed and are replay safe", () => {
  const version = social.approveContentVersion({businessUid: "biz",
    record: social.contentItemVersion({businessUid: "biz", planId: "plan", item: baseItem, now}),
    version: 1, now});
  assert.throws(() => social.publishJob({businessUid: "biz", contentItemId: "item",
    versionRecord: version, provider: "facebook", scheduledFor: "2030-01-02T00:00:00Z",
    connection: {provider: "facebook", status: "not_connected"}, now}), /connection_required/);
  const input = {businessUid: "biz", contentItemId: "item", versionRecord: version,
    provider: "facebook", scheduledFor: "2030-01-02T00:00:00Z",
    connection: {provider: "facebook", status: "connected_write", writeScopesGranted: true,
      capabilities: {publishText: true}}, now};
  assert.equal(social.publishJob(input).id, social.publishJob(input).id);
});

test("read-only OAuth connections can never create publish jobs", () => {
  const version = social.approveContentVersion({businessUid: "biz",
    record: social.contentItemVersion({businessUid: "biz", planId: "plan", item: baseItem, now}),
    version: 1, now});
  assert.throws(() => social.publishJob({businessUid: "biz", contentItemId: "item",
    versionRecord: version, provider: "facebook", scheduledFor: "2030-01-02T00:00:00Z",
    connection: {provider: "facebook", status: "connected_read_only",
      capabilities: {publishText: false, analytics: true}}, now}), /connection_required/);
});

test("published requires provider evidence and unknown outcome reconciles", () => {
  const record = {status: "publishing"};
  assert.throws(() => social.transitionPublishJob({record, nextStatus: "published"}),
    /provider_evidence_required/);
  assert.equal(social.transitionPublishJob({record, nextStatus: "unknown_provider_outcome"})
    .reconciliationRequired, true);
  assert.equal(social.transitionPublishJob({record, nextStatus: "published",
    providerEvidence: {providerPostId: "post_1"}}).providerPostId, "post_1");
});

test("performance uses unavailable rather than false zero", () => {
  const snapshot = social.normalizePerformance({businessUid: "biz", provider: "youtube",
    contentItemId: "item", metrics: {views: 12, clicks: 0}, unavailable: ["reach"]});
  assert.deepEqual(snapshot.metrics.views, {status: "available", value: 12});
  assert.deepEqual(snapshot.metrics.clicks, {status: "available", value: 0});
  assert.deepEqual(snapshot.metrics.reach, {status: "unavailable", value: null});
  assert.deepEqual(snapshot.metrics.leads, {status: "unavailable", value: null});
});

test("weekly learning refuses to invent insight from tiny samples", () => {
  assert.equal(social.weeklyLearning({businessUid: "biz", snapshots: []}).status,
    "insufficient_evidence");
  const snapshots = [1, 2, 3].map((index) => social.normalizePerformance({businessUid: "biz",
    provider: "facebook", contentItemId: `item_${index}`, metrics: {engagements: index}}));
  const learning = social.weeklyLearning({businessUid: "biz", snapshots});
  assert.equal(learning.status, "evidence_available");
  assert.equal(learning.strongestContentItemId, "item_3");
});

test("email plan creates content only and cannot send", () => {
  const plan = social.createEmailContentPlan({businessUid: "biz", businessName: "ScaledCircle",
    goal: "Educate", startsOn: "2030-01-01", entries: [{day: 2, theme: "education",
      subject: "A useful idea", body: "Useful content", callToAction: "Learn more"}], now});
  assert.equal(plan.record.deliveryEnabled, false);
  assert.equal(plan.record.complianceStatus, "delivery_not_certified");
});

test("ad health is read-only and exact balance needs authoritative evidence", () => {
  const unavailable = social.adAccountHealth({provider: "meta_ads", status: "attention_required",
    balanceMinor: 1200, balanceAuthoritative: false});
  assert.equal(unavailable.balance.status, "unavailable");
  assert.equal(unavailable.mutationsEnabled, false);
  const available = social.adAccountHealth({provider: "google_ads", status: "connected",
    balanceMinor: 1200, balanceAuthoritative: true});
  assert.deepEqual(available.balance, {status: "available", amountMinor: 1200});
});

test("mock provider records exactly one explicit operation", async () => {
  const adapter = new social.MockSocialProviderAdapter({providerPostId: "post"});
  const result = await adapter.publish({jobId: "job"});
  assert.equal(result.providerPostId, "post");
  assert.equal(adapter.calls.length, 1);
});

test("mock adapters cover every organic provider without external traffic", () => {
  const adapters = social.mockProviderAdapters();
  assert.deepEqual(Object.keys(adapters), ["facebook", "instagram", "x", "youtube"]);
  assert.equal(Object.values(adapters).every((adapter) => adapter.calls.length === 0), true);
});

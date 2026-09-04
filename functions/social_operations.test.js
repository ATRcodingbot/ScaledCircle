"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const social = require("../functions-social-operations/social_operations");

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

test("X read and write capabilities compose without a second connection", () => {
  const identity = {provider: "x", providerUserId: "2090731921177210880",
    providerAccountId: "x_user_2090731921177210880", tokenHealth: "healthy"};
  const readOnly = social.xConnectionCapabilities({...identity,
    status: "connected_read_only", grantedScopes: ["users.read", "tweet.read",
      "offline.access"], writeScopesGranted: false});
  assert.equal(readOnly.canReadInsights, true);
  assert.equal(readOnly.canWrite, false);
  assert.equal(readOnly.separateReadConnectionRequired, false);

  const write = social.xConnectionCapabilities({...identity, status: "connected_write",
    grantedScopes: ["users.read", "tweet.read", "offline.access", "tweet.write",
      "media.write"], writeScopesGranted: true},
  {expectedProviderUserId: "2090731921177210880"});
  assert.equal(write.canReadInsights, true);
  assert.equal(write.canWrite, true);
  assert.equal(write.canRefresh, true);
  assert.equal(write.separateReadConnectionRequired, false);
});

test("X insight capability fails closed for missing read scope, identity, or health", () => {
  const base = {provider: "x", status: "connected_write", tokenHealth: "healthy",
    providerUserId: "2090731921177210880", providerAccountId: "x_user_2090731921177210880",
    grantedScopes: ["users.read", "tweet.read", "offline.access", "tweet.write", "media.write"],
    writeScopesGranted: true};
  assert.equal(social.xConnectionCapabilities({...base,
    grantedScopes: base.grantedScopes.filter((scope) => scope !== "tweet.read")})
    .canReadInsights, false);
  assert.equal(social.xConnectionCapabilities(base,
    {expectedProviderUserId: "different-user"}).canReadInsights, false);
  assert.equal(social.xConnectionCapabilities({...base, status: "reauth_required",
    tokenHealth: "needs_attention"}).canReadInsights, false);
  assert.equal(social.xConnectionCapabilities({...base, provider: "facebook"})
    .canReadInsights, false);
});

test("quality optimization policy never auto-deletes published content", () => {
  const manual = social.optimizationPolicy({mode: "manual", planId: "scale"});
  assert.equal(manual.unpublishedMinorOptimizationEnabled, false);
  assert.equal(manual.publishedDeletionAutomatic, false);
  const approvedPlan = social.optimizationPolicy({mode: "approve_plan", planId: "scale"});
  assert.equal(approvedPlan.unpublishedReschedulingEnabled, true);
  assert.equal(approvedPlan.unpublishedReplacementEnabled, false);
  const managed = social.optimizationPolicy({mode: "managed", planId: "managed_growth",
    managedAuthorization: true});
  assert.equal(managed.unpublishedReplacementEnabled, true);
  assert.equal(managed.materialReplacementVisible, true);
  assert.equal(managed.providerMutationsEnabled, false);
});

test("scheduled quality review is deterministic, evidence-aware, and never publishes", () => {
  const version = social.contentItemVersion({businessUid: "biz", planId: "plan",
    item: {...baseItem, variants: [{provider: "facebook", format: "feed",
      copy: "ScaledCircle helps Maryland local businesses connect maps, Landing Pages, and tracked QR response.",
      callToAction: "See the workflow", destinationUrl: "https://scaledcircle.com"}]}, now});
  const assessment = social.assessScheduledContent({businessUid: "biz",
    contentItemId: "item", versionRecord: version,
    businessContext: {businessName: "ScaledCircle", services: ["Landing Pages"],
      geography: ["Maryland"]}, performanceEvidence: [], now});
  assert.equal(assessment.schemaVersion, "SocialContentQualityAssessmentV1");
  assert.equal(assessment.variantAssessments[0].evidenceStatus, "initial_experiment");
  assert.equal(assessment.variantAssessments[0].timing.confidence, "low");
  assert.equal(Object.hasOwn(assessment, "providerMutationRequested"), false);
});

test("repetition detection flags repeated copy, CTA, and media before scheduling", () => {
  const variant = {provider: "instagram", copy: "A useful local marketing workflow",
    callToAction: "Learn more", mediaRevisionId: "media_v1"};
  const result = social.repetitionAssessment({variant, recentVariants: [variant]});
  assert.equal(result.repeated, true);
  assert.equal(result.score, 0);
});

test("discovery guidance remains bounded and platform-specific", () => {
  const instagram = social.discoveryRecommendation({variant: {provider: "instagram",
    copy: "Maryland contractors can connect landing pages to tracked QR response.",
    hashtags: Array.from({length: 18}, (_, index) => `tag${index}`)},
  services: ["Landing Pages"], geography: ["Maryland"], brandTerms: ["ScaledCircle"]});
  assert.equal(instagram.presentKeywords.includes("maryland"), true);
  assert.equal(instagram.hashtagGuidance, "reduce_spammy_hashtag_block");
  const facebook = social.discoveryRecommendation({variant: {provider: "facebook",
    copy: "A useful explanation."}});
  assert.equal(facebook.hashtagScore, null);
});

test("best-time recommendations label generic or missing evidence as low confidence", () => {
  const insufficient = social.bestTimeRecommendation({provider: "x",
    scheduledFor: "2030-01-02T14:00:00Z", now});
  assert.equal(insufficient.confidence, "low");
  assert.equal(insufficient.basis, "insufficient_evidence");
  assert.equal(insufficient.shouldReschedule, false);
  const evidenced = social.bestTimeRecommendation({provider: "x",
    scheduledFor: "2030-01-02T14:00:00Z",
    firstPartyWindows: [{startsAt: "2030-01-03T18:00:00Z", sampleSize: 12, score: 9}], now});
  assert.equal(evidenced.confidence, "high");
  assert.equal(evidenced.basis, "business_history");
  assert.equal(evidenced.shouldReschedule, true);
});

test("provider post actions come only from authoritative per-post capability evidence", () => {
  const unknown = social.postCapabilityProjection({provider: "x", providerPostId: "post"});
  assert.deepEqual(social.availablePostActions({capability: unknown}).actions,
    ["keep", "no_provider_mutation_available"]);
  const editable = social.postCapabilityProjection({provider: "instagram", providerPostId: "post",
    evidence: {authoritative: true, canEdit: true, canDelete: true, canReplace: true,
      editWindowExpiresAt: "2030-01-02T12:00:00Z"}, now});
  assert.deepEqual(social.availablePostActions({capability: editable}).actions,
    ["keep", "edit", "improve", "replace", "create_follow_up", "delete",
      "delete_and_replace"]);
});

test("expired edit windows never misrepresent delete and repost as edit", () => {
  const expired = social.postCapabilityProjection({provider: "x", providerPostId: "post",
    evidence: {authoritative: true, canEdit: true, canDelete: true, canReplace: true,
      editWindowExpiresAt: "2029-12-31T12:00:00Z"}, now});
  const actions = social.availablePostActions({capability: expired}).actions;
  assert.equal(actions.includes("edit"), false);
  assert.equal(actions.includes("delete_and_replace"), true);
  assert.equal(actions.includes("create_follow_up"), true);
});

test("past-post rating separates creative quality from insufficient performance", () => {
  const rating = social.ratePastPost({businessUid: "biz", provider: "youtube",
    contentItemId: "video", creativeEvidence: {copyQuality: 80},
    performanceSnapshot: {metrics: {views: {status: "unavailable", value: null}}}, now});
  assert.equal(rating.creativeScore, 80);
  assert.equal(rating.performanceScore, null);
  assert.equal(rating.performanceEvidenceStatus, "insufficient_evidence");
  assert.equal(rating.explicitBusinessApprovalRequired, true);
  assert.equal(rating.providerMutationRequested, false);
});

test("past-post rating preserves deleted provider state and historical evidence", () => {
  const rating = social.ratePastPost({businessUid: "biz", provider: "x",
    contentItemId: "deleted-post", creativeEvidence: {copyQuality: 55},
    performanceSnapshot: {metrics: {views: {status: "available", value: 14},
      engagements: {status: "available", value: 2}}},
    capability: social.postCapabilityProjection({provider: "x", providerPostId: "p1",
      providerState: "deleted", evidence: {authoritative: true, canEdit: false,
        canDelete: false, canReplace: true}, now}), now});
  assert.equal(rating.providerState, "deleted");
  assert.equal(rating.performanceEvidenceStatus, "available");
  assert.equal(rating.providerMutationRequested, false);
});

test("replacement proposal is replay-safe and preserves immutable source evidence", () => {
  const source = social.contentItemVersion({businessUid: "biz", planId: "plan",
    item: baseItem, now});
  const input = {businessUid: "biz", contentItemId: "item", sourceVersion: source,
    replacementItem: {...baseItem, variants: [{provider: "x",
      copy: "A stronger evidence-aware replacement."}]}, reason: "Weak generic hook",
    providerPostId: "original-post", originalMetricsSnapshotId: "metrics-1", now};
  const first = social.replacementProposal(input);
  const second = social.replacementProposal(input);
  assert.equal(first.id, second.id);
  assert.equal(first.record.replacementVersion.version, 2);
  assert.equal(first.record.providerPostId, "original-post");
  assert.equal(first.record.originalMetricsSnapshotId, "metrics-1");
  assert.equal(first.record.providerMutationRequested, false);
  assert.equal(first.record.supersedesOnlyAfterApproval, true);
});

test("content health projection never enables provider cleanup mutations", () => {
  const projection = social.contentHealthProjection({assessments: [
    {qualityBand: "weak"}, {qualityBand: "strong"}], ratings: []});
  assert.equal(projection.needsAttentionCount, 1);
  assert.equal(projection.strongCount, 1);
  assert.equal(projection.providerMutationsEnabled, false);
});

test("quality learning is tenant-isolated and refuses tiny samples", () => {
  const result = social.qualityLearningComparison({businessUid: "biz",
    assessments: [{businessUid: "biz", contentItemId: "one", score: 90},
      {businessUid: "other", contentItemId: "two", score: 10}],
    snapshots: [{businessUid: "biz", contentItemId: "one", metrics: {}},
      {businessUid: "other", contentItemId: "two", metrics: {}}], now});
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.sampleSize, 1);
  assert.equal(result.crossTenantTrainingEnabled, false);
});

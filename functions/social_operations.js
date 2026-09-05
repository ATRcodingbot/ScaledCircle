"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "SocialOperationsV1";
const PLAN_VERSION = "SocialContentPlanV1";
const CONTENT_VERSION = "SocialContentItemVersionV1";
const PERFORMANCE_VERSION = "SocialPerformanceSnapshotV1";
const LEARNING_VERSION = "SocialWeeklyLearningV1";
const EMAIL_PLAN_VERSION = "EmailContentPlanV1";
const AD_HEALTH_VERSION = "AdAccountHealthV1";

const PROVIDERS = Object.freeze(["facebook", "instagram", "x", "youtube"]);
const AD_PROVIDERS = Object.freeze(["meta_ads", "google_ads"]);
const AUTOMATION_MODES = Object.freeze(["manual", "approve_plan", "managed"]);
const PUBLISH_STATUSES = Object.freeze(["draft", "ready_for_review", "approved",
  "scheduled", "publishing", "published", "partial_failure", "failed",
  "canceled", "unknown_provider_outcome"]);

function text(value, maximum = 2400) {
  return value == null ? "" : String(value).trim().slice(0, maximum);
}

function list(value, maximumItems = 30, maximumLength = 400) {
  return Array.isArray(value) ? value.slice(0, maximumItems)
    .map((item) => text(item, maximumLength)).filter(Boolean) : [];
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizePlanId(value) {
  const plan = text(value, 60).toLowerCase();
  return ["starter", "growth", "scale", "managed_growth"].includes(plan) ? plan : null;
}

function validateAutomationMode({mode, planId, managedAuthorization = false}) {
  const normalized = text(mode, 40).toLowerCase();
  if (!AUTOMATION_MODES.includes(normalized)) throw new Error("invalid_social_automation_mode");
  if (normalized === "managed" &&
      (normalizePlanId(planId) !== "managed_growth" || managedAuthorization !== true)) {
    throw new Error("managed_social_authorization_required");
  }
  return normalized;
}

function connectionProjection(input = {}) {
  const provider = text(input.provider, 40).toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new Error("unsupported_social_provider");
  const status = ["disconnected", "not_connected", "authorizing", "identity_pending",
    "connected_read_only", "connected_write", "reauth_required", "expired", "revoked",
    "error", "attention_required", "write_scope_pending"]
    .includes(input.status) ? input.status : "disconnected";
  return {schemaVersion: SCHEMA_VERSION, provider, status,
    accountDisplayName: text(input.accountDisplayName, 180) || null,
    accountType: text(input.accountType, 80) || null,
    handle: text(input.handle, 180) || null,
    providerAccountId: text(input.providerAccountId, 240) || null,
    pendingAttemptId: text(input.pendingAttemptId, 128) || null,
    grantedScopes: list(input.grantedScopes, 20, 180),
    writeScopesGranted: status === "connected_write" && input.writeScopesGranted === true,
    readOnly: status === "connected_read_only",
    requiresReconnect: ["reauth_required", "expired", "revoked", "error",
      "attention_required"].includes(status),
    capabilities: {
      profile: input.capabilities?.profile === true,
      publishText: input.capabilities?.publishText === true,
      publishImage: input.capabilities?.publishImage === true,
      publishVideo: input.capabilities?.publishVideo === true,
      schedule: input.capabilities?.schedule === true,
      analytics: input.capabilities?.analytics === true,
    },
    // Tokens, provider secrets, and raw credential records never enter this projection.
    authorizationUpdatedAt: input.authorizationUpdatedAt || null};
}

function platformVariant(input = {}) {
  const provider = text(input.provider, 40).toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new Error("unsupported_social_provider");
  const copy = text(input.copy, 5000);
  if (!copy) throw new Error("social_copy_required");
  return {provider, format: text(input.format, 60) || "feed", copy,
    mediaAssetId: text(input.mediaAssetId, 180) || null,
    mediaRevisionId: text(input.mediaRevisionId, 180) || null,
    callToAction: text(input.callToAction, 300) || null,
    destinationUrl: text(input.destinationUrl, 1200) || null,
    responseAssetId: text(input.responseAssetId, 180) || null,
    hashtags: list(input.hashtags, 30, 80)};
}

function createContentPlan({businessUid, planId, businessName, goal, pillars,
  items, automationMode = "manual", managedAuthorization = false,
  startsOn, now = Date.now()}) {
  const uid = text(businessUid, 180);
  const name = text(businessName, 240);
  const normalizedPlan = normalizePlanId(planId);
  if (!uid || !name || !normalizedPlan) throw new Error("social_plan_context_required");
  const mode = validateAutomationMode({mode: automationMode, planId: normalizedPlan,
    managedAuthorization});
  const start = new Date(startsOn || now);
  if (Number.isNaN(start.getTime())) throw new Error("invalid_social_plan_start");
  const normalizedItems = (Array.isArray(items) ? items : []).slice(0, 60).map((item, index) => {
    const scheduled = new Date(item.scheduledFor);
    if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < start.getTime() - 86400000 ||
        scheduled.getTime() >= start.getTime() + 31 * 86400000) {
      throw new Error("social_item_outside_plan_window");
    }
    const variants = (Array.isArray(item.variants) ? item.variants : []).map(platformVariant);
    if (!variants.length) throw new Error("social_item_variants_required");
    return {itemKey: text(item.itemKey, 100) || `item_${index + 1}`,
      scheduledFor: scheduled.toISOString(), goal: text(item.goal, 240) || text(goal, 240),
      pillar: text(item.pillar, 160), status: "ready_for_review", currentVersion: 1,
      variants};
  });
  if (!normalizedItems.length) throw new Error("social_plan_items_required");
  const canonical = {businessUid: uid, planId: normalizedPlan, businessName: name,
    goal: text(goal, 600), pillars: list(pillars, 12, 180), automationMode: mode,
    startsOn: start.toISOString(), items: normalizedItems};
  const id = `social_plan_${digest(canonical).slice(0, 40)}`;
  return {id, record: {schemaVersion: PLAN_VERSION, ...canonical, status: "ready_for_review",
    planVersion: 1, approvedVersion: null, approvedAt: null,
    createdAt: now, updatedAt: now, contentHash: digest(canonical)}};
}

function contentItemVersion({businessUid, planId, item, previousVersion = 0, now = Date.now()}) {
  const variants = (Array.isArray(item?.variants) ? item.variants : []).map(platformVariant);
  if (!variants.length) throw new Error("social_item_variants_required");
  const version = Number(previousVersion) + 1;
  const snapshot = {businessUid: text(businessUid, 180), planId: text(planId, 180),
    itemKey: text(item.itemKey, 100), version, scheduledFor: new Date(item.scheduledFor).toISOString(),
    goal: text(item.goal, 240), pillar: text(item.pillar, 160), variants};
  return {schemaVersion: CONTENT_VERSION, ...snapshot, status: "ready_for_review",
    contentHash: digest(snapshot), approvedAt: null, createdAt: now};
}

function approvePlan({businessUid, record, planVersion, now = Date.now()}) {
  if (!record || record.businessUid !== businessUid) throw new Error("social_record_not_owned");
  if (record.status !== "ready_for_review" || Number(planVersion) !== Number(record.planVersion)) {
    throw new Error("social_approval_version_mismatch");
  }
  return {...record, status: "approved", approvedVersion: record.planVersion,
    approvedAt: now, approvedByUid: businessUid};
}

function approveContentVersion({businessUid, record, version, now = Date.now()}) {
  if (!record || record.businessUid !== businessUid) throw new Error("social_record_not_owned");
  if (record.status !== "ready_for_review" || Number(version) !== Number(record.version)) {
    throw new Error("social_approval_version_mismatch");
  }
  return {...record, status: "approved", approvedVersion: record.version,
    approvedAt: now, approvedByUid: businessUid};
}

function publishJob({businessUid, contentItemId, versionRecord, provider,
  scheduledFor, connection, now = Date.now()}) {
  if (!versionRecord || versionRecord.businessUid !== businessUid ||
      versionRecord.status !== "approved" ||
      versionRecord.approvedVersion !== versionRecord.version) {
    throw new Error("social_approval_required");
  }
  const normalizedProvider = text(provider, 40).toLowerCase();
  const projection = connectionProjection(connection || {provider: normalizedProvider});
  if (projection.status !== "connected_write" || projection.requiresReconnect ||
      !(projection.capabilities.publishText || projection.capabilities.publishImage ||
        projection.capabilities.publishVideo)) throw new Error("social_connection_required");
  const scheduled = new Date(scheduledFor);
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < now - 60000) {
    throw new Error("invalid_social_schedule");
  }
  const identity = {businessUid, contentItemId, version: versionRecord.version,
    provider: normalizedProvider, scheduledFor: scheduled.toISOString()};
  return {id: `social_publish_${digest(identity)}`, record: {schemaVersion: SCHEMA_VERSION,
    ...identity, status: "scheduled", providerReceiptId: null, providerPostId: null,
    providerPostUrl: null, attemptCount: 0, reconciliationRequired: false,
    createdAt: now, updatedAt: now}};
}

function transitionPublishJob({record, nextStatus, providerEvidence = null, now = Date.now()}) {
  if (!PUBLISH_STATUSES.includes(nextStatus)) throw new Error("invalid_social_publish_status");
  if (!record || !PUBLISH_STATUSES.includes(record.status)) {
    throw new Error("invalid_social_publish_record");
  }
  if (["published", "canceled"].includes(record.status)) {
    if (nextStatus === record.status && (!providerEvidence ||
        providerEvidence.providerPostId === record.providerPostId)) return {...record};
    throw new Error("social_publish_terminal");
  }
  // An ambiguous send may already exist at the provider. Never authorize a retry
  // through a label change; only an adapter's matching receipt can close it.
  if (["unknown_provider_outcome", "partial_failure"].includes(record.status) &&
      ![record.status, "published"].includes(nextStatus)) {
    throw new Error("social_reconciliation_required");
  }
  const allowed = {
    draft: ["ready_for_review", "canceled"],
    ready_for_review: ["approved", "canceled"],
    approved: ["scheduled", "canceled"],
    scheduled: ["publishing", "canceled"],
    publishing: ["published", "unknown_provider_outcome", "partial_failure", "failed"],
    failed: ["canceled"],
    unknown_provider_outcome: ["published"], partial_failure: ["published"],
  };
  if (nextStatus !== record.status && !allowed[record.status]?.includes(nextStatus)) {
    throw new Error("invalid_social_publish_transition");
  }
  if (nextStatus === "published" && (!providerEvidence || !text(providerEvidence.providerPostId, 240))) {
    throw new Error("social_provider_evidence_required");
  }
  return {...record, status: nextStatus,
    providerPostId: providerEvidence ? text(providerEvidence.providerPostId, 240) : record.providerPostId,
    providerPostUrl: providerEvidence ? text(providerEvidence.providerPostUrl, 1200) || null : record.providerPostUrl,
    providerReceiptId: providerEvidence ? text(providerEvidence.providerReceiptId, 240) || null : record.providerReceiptId,
    reconciliationRequired: nextStatus === "unknown_provider_outcome", updatedAt: now};
}

const METRIC_FIELDS = Object.freeze(["reach", "impressions", "views", "engagements",
  "reactions", "comments", "shares", "saves", "clicks", "profileActions",
  "followers", "subscribers", "videoWatchSeconds", "landingPageVisits", "calls",
  "forms", "leads", "conversions", "attributedRevenueMinor"]);

function normalizePerformance({businessUid, provider, contentItemId, observedAt,
  metrics = {}, unavailable = []}) {
  const normalizedProvider = text(provider, 40).toLowerCase();
  if (!PROVIDERS.includes(normalizedProvider)) throw new Error("unsupported_social_provider");
  const values = {};
  const unavailableSet = new Set(list(unavailable, METRIC_FIELDS.length, 80));
  for (const field of METRIC_FIELDS) {
    const raw = metrics[field];
    values[field] = unavailableSet.has(field) || raw == null || !Number.isFinite(Number(raw)) ?
      {status: "unavailable", value: null} : {status: "available", value: Number(raw)};
  }
  return {schemaVersion: PERFORMANCE_VERSION, businessUid: text(businessUid, 180),
    provider: normalizedProvider, contentItemId: text(contentItemId, 180),
    observedAt: new Date(observedAt || Date.now()).toISOString(), metrics: values};
}

function weeklyLearning({businessUid, snapshots = [], minimumSample = 3, now = Date.now()}) {
  const latest = new Map();
  for (const item of snapshots.filter((value) => value?.businessUid === businessUid && value.contentItemId &&
    Object.values(value.metrics || {}).some((metric) => metric?.status === "available" &&
      typeof metric.value === "number" && Number.isFinite(metric.value) && metric.value >= 0))) {
    const key = `${item.provider}:${item.contentItemId}`;
    if (!latest.has(key) || Date.parse(item.observedAt) > Date.parse(latest.get(key).observedAt)) latest.set(key, item);
  }
  const owned = [...latest.values()];
  if (owned.length < minimumSample) return {schemaVersion: LEARNING_VERSION, businessUid,
    status: "insufficient_evidence", sampleSize: owned.length,
    summary: "More published-content evidence is needed before ScaledCircle recommends changes.",
    recommendations: [], createdAt: now};
  const scored = owned.map((item) => ({item,
    score: ["engagements", "clicks", "landingPageVisits", "leads", "conversions"]
      .reduce((sum, key) => sum + (item.metrics?.[key]?.status === "available" ?
        Number(item.metrics[key].value || 0) : 0), 0)})).sort((a, b) => b.score - a.score);
  const strongest = scored[0];
  return {schemaVersion: LEARNING_VERSION, businessUid, status: "evidence_available",
    sampleSize: owned.length, strongestContentItemId: strongest.item.contentItemId,
    summary: "This item has the highest observed score in this sample; this is not a strategy winner or proof of causation.",
    recommendations: ["Create one follow-up variation on the strongest evidenced topic.",
      "Collect a comparable next-week sample before changing cadence or declaring a winning strategy."], createdAt: now};
}

function createEmailContentPlan({businessUid, businessName, goal, entries, startsOn,
  now = Date.now()}) {
  const start = new Date(startsOn || now);
  if (Number.isNaN(start.getTime())) throw new Error("invalid_email_plan_start");
  const clean = (Array.isArray(entries) ? entries : []).slice(0, 30).map((entry) => ({
    day: Number(entry.day), theme: text(entry.theme, 120), subject: text(entry.subject, 180),
    previewText: text(entry.previewText, 300), body: text(entry.body, 6000),
    callToAction: text(entry.callToAction, 300), destinationUrl: text(entry.destinationUrl, 1200) || null,
    segmentIntent: text(entry.segmentIntent, 300), status: "draft"}));
  if (!clean.length || clean.some((entry) => !Number.isInteger(entry.day) || entry.day < 1 ||
      entry.day > 30 || !entry.subject || !entry.body)) throw new Error("invalid_email_content_plan");
  const snapshot = {businessUid: text(businessUid, 180), businessName: text(businessName, 240),
    goal: text(goal, 600), startsOn: start.toISOString(), entries: clean,
    deliveryEnabled: false, complianceStatus: "delivery_not_certified"};
  return {id: `email_plan_${digest(snapshot).slice(0, 40)}`, record: {
    schemaVersion: EMAIL_PLAN_VERSION, ...snapshot, contentHash: digest(snapshot),
    createdAt: now, updatedAt: now}};
}

function adAccountHealth(input = {}) {
  const provider = text(input.provider, 40).toLowerCase();
  if (!AD_PROVIDERS.includes(provider)) throw new Error("unsupported_ad_provider");
  const status = ["not_connected", "connected", "attention_required", "restricted", "expired"]
    .includes(input.status) ? input.status : "not_connected";
  const exactBalance = Number.isFinite(Number(input.balanceMinor)) && input.balanceAuthoritative === true;
  return {schemaVersion: AD_HEALTH_VERSION, provider, status,
    accountDisplayName: text(input.accountDisplayName, 180) || null,
    campaignCount: Number.isFinite(Number(input.campaignCount)) ? Number(input.campaignCount) : null,
    monthSpendMinor: Number.isFinite(Number(input.monthSpendMinor)) ? Number(input.monthSpendMinor) : null,
    currency: text(input.currency, 10) || null,
    billingStatus: text(input.billingStatus, 80) || "unavailable",
    balance: exactBalance ? {status: "available", amountMinor: Number(input.balanceMinor)} :
      {status: "unavailable", amountMinor: null}, mutationsEnabled: false};
}

class SocialProviderAdapter {
  async connect() { throw new Error("social_provider_not_configured"); }
  async publish() { throw new Error("social_provider_not_configured"); }
  async reconcile() { throw new Error("social_provider_not_configured"); }
  async collectPerformance() { throw new Error("social_provider_not_configured"); }
}

class MockSocialProviderAdapter extends SocialProviderAdapter {
  constructor(result = {}) { super(); this.result = result; this.calls = []; }
  async publish(request) { this.calls.push({operation: "publish", request}); return {...this.result}; }
  async reconcile(request) { this.calls.push({operation: "reconcile", request}); return {...this.result}; }
}

function mockProviderAdapters(result = {}) {
  return Object.fromEntries(PROVIDERS.map((provider) =>
    [provider, new MockSocialProviderAdapter({provider, ...result})]));
}

module.exports = {SCHEMA_VERSION, PLAN_VERSION, CONTENT_VERSION, PERFORMANCE_VERSION,
  LEARNING_VERSION, EMAIL_PLAN_VERSION, AD_HEALTH_VERSION, PROVIDERS, AD_PROVIDERS,
  AUTOMATION_MODES, PUBLISH_STATUSES, normalizePlanId, validateAutomationMode,
  connectionProjection, platformVariant, createContentPlan, contentItemVersion, approvePlan,
  approveContentVersion, publishJob, transitionPublishJob, normalizePerformance,
  weeklyLearning, createEmailContentPlan, adAccountHealth, SocialProviderAdapter,
  MockSocialProviderAdapter, mockProviderAdapters};

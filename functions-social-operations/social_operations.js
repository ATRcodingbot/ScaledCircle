"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "SocialOperationsV1";
const PLAN_VERSION = "SocialContentPlanV1";
const CONTENT_VERSION = "SocialContentItemVersionV1";
const PERFORMANCE_VERSION = "SocialPerformanceSnapshotV1";
const LEARNING_VERSION = "SocialWeeklyLearningV1";
const EMAIL_PLAN_VERSION = "EmailContentPlanV1";
const AD_HEALTH_VERSION = "AdAccountHealthV1";
const CONTENT_QUALITY_VERSION = "SocialContentQualityAssessmentV1";
const POST_CAPABILITY_VERSION = "SocialPostCapabilitySnapshotV1";
const PAST_POST_RATING_VERSION = "SocialPastPostRatingV1";
const REPLACEMENT_PROPOSAL_VERSION = "SocialContentReplacementProposalV1";

const PROVIDERS = Object.freeze(["facebook", "instagram", "x", "youtube"]);
const AD_PROVIDERS = Object.freeze(["meta_ads", "google_ads"]);
const AUTOMATION_MODES = Object.freeze(["manual", "approve_plan", "managed"]);
const PUBLISH_STATUSES = Object.freeze(["draft", "ready_for_review", "approved",
  "scheduled", "publishing", "published", "partial_failure", "failed",
  "canceled", "unknown_provider_outcome"]);
const QUALITY_RECOMMENDATIONS = Object.freeze(["keep", "improve", "reschedule",
  "replace", "remove"]);
const POST_ACTIONS = Object.freeze(["keep", "edit", "improve", "replace", "delete",
  "delete_and_replace", "create_follow_up", "no_provider_mutation_available"]);
const QUALITY_DIMENSIONS = Object.freeze(["businessRelevance", "serviceRelevance",
  "localRelevance", "hookStrength", "copyQuality", "ctaQuality", "visualQuality",
  "repetition", "platformFit", "discoveryLanguage", "keywordQuality", "hashtagQuality"]);

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

function clampScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : null;
}

function qualityBand(score) {
  if (score == null) return "unrated";
  if (score >= 85) return "strong";
  if (score >= 70) return "good";
  if (score >= 50) return "needs_attention";
  return "weak";
}

function tokenSet(value) {
  return new Set(text(value, 6000).toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter((part) => part.length > 2));
}

function similarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((value) => b.has(value)).length;
  return overlap / new Set([...a, ...b]).size;
}

function repetitionAssessment({variant, recentVariants = []}) {
  const comparisons = recentVariants.map((recent) => ({
    copy: similarity(variant?.copy, recent?.copy),
    sameCta: Boolean(variant?.callToAction &&
      text(variant.callToAction, 300).toLowerCase() === text(recent?.callToAction, 300).toLowerCase()),
    sameMedia: Boolean(variant?.mediaRevisionId &&
      variant.mediaRevisionId === recent?.mediaRevisionId),
  }));
  const strongest = comparisons.reduce((best, item) => Math.max(best,
    item.copy + (item.sameCta ? 0.12 : 0) + (item.sameMedia ? 0.18 : 0)), 0);
  const risk = Math.min(1, strongest);
  return {score: clampScore((1 - risk) * 100), risk: Number(risk.toFixed(3)),
    repeated: risk >= 0.72};
}

function discoveryRecommendation({variant, services = [], geography = [], brandTerms = []}) {
  const naturalTerms = [...new Set([...list(brandTerms, 6, 80), ...list(services, 8, 80),
    ...list(geography, 6, 100)].map((item) => item.toLowerCase()))];
  const copy = text(variant?.copy, 5000).toLowerCase();
  const present = naturalTerms.filter((term) => copy.includes(term));
  const hashtagCount = list(variant?.hashtags, 30, 80).length;
  const provider = text(variant?.provider, 40).toLowerCase();
  const hashtagUseful = provider === "instagram" || provider === "x" || provider === "youtube";
  const keywordScore = naturalTerms.length ? clampScore(45 +
    Math.min(55, (present.length / Math.min(naturalTerms.length, 4)) * 55)) : null;
  const hashtagScore = !hashtagUseful ? null : clampScore(hashtagCount === 0 ? 55 :
    hashtagCount <= 8 ? 90 : hashtagCount <= 15 ? 65 : 30);
  return {keywords: naturalTerms.slice(0, 12), presentKeywords: present.slice(0, 12),
    keywordScore, hashtagScore, hashtagGuidance: !hashtagUseful ? "not_platform_priority" :
      hashtagCount > 15 ? "reduce_spammy_hashtag_block" : "bounded_platform_specific_set"};
}

function bestTimeRecommendation({provider, scheduledFor, firstPartyWindows = [],
  providerAudienceWindows = [], now = Date.now()}) {
  const valid = (value) => (Array.isArray(value) ? value : []).map((item) => ({
    startsAt: text(item.startsAt, 80), sampleSize: Number(item.sampleSize || 0),
    score: Number(item.score || 0)})).filter((item) => item.startsAt &&
      !Number.isNaN(new Date(item.startsAt).getTime())).sort((a, b) => b.score - a.score);
  const own = valid(firstPartyWindows);
  const audience = valid(providerAudienceWindows);
  const evidence = own[0] || audience[0] || null;
  if (!evidence) return {provider: text(provider, 40), recommendedFor: null,
    currentScheduledFor: scheduledFor || null, confidence: "low", basis: "insufficient_evidence",
    shouldReschedule: false, evaluatedAt: now};
  const basis = own[0] ? "business_history" : "provider_audience_activity";
  const confidence = own[0] && evidence.sampleSize >= 10 ? "high" :
    evidence.sampleSize >= 4 ? "medium" : "low";
  const current = scheduledFor ? new Date(scheduledFor).getTime() : null;
  const recommended = new Date(evidence.startsAt).getTime();
  return {provider: text(provider, 40), recommendedFor: evidence.startsAt,
    currentScheduledFor: scheduledFor || null, confidence, basis,
    shouldReschedule: confidence !== "low" && current != null &&
      Math.abs(current - recommended) > 60 * 60 * 1000, evaluatedAt: now};
}

function postCapabilityProjection({provider, providerPostId, providerState = "published",
  evidence = {}, observedAt = Date.now(), now = Date.now()}) {
  const normalizedProvider = text(provider, 40).toLowerCase();
  if (!PROVIDERS.includes(normalizedProvider)) throw new Error("unsupported_social_provider");
  const editWindowExpiresAt = evidence.editWindowExpiresAt ?
    new Date(evidence.editWindowExpiresAt).toISOString() : null;
  const editWindowOpen = !editWindowExpiresAt || new Date(editWindowExpiresAt).getTime() > now;
  const explicit = evidence.authoritative === true;
  return {schemaVersion: POST_CAPABILITY_VERSION, provider: normalizedProvider,
    providerPostId: text(providerPostId, 240) || null, providerState: text(providerState, 60),
    canEdit: explicit && evidence.canEdit === true && editWindowOpen,
    canDelete: explicit && evidence.canDelete === true,
    canReplace: explicit && evidence.canReplace === true,
    editWindowExpiresAt, canSchedule: explicit && evidence.canSchedule === true,
    canReschedule: explicit && evidence.canReschedule === true,
    evidenceStatus: explicit ? "provider_confirmed" : "unavailable",
    observedAt: new Date(observedAt).toISOString()};
}

function availablePostActions({capability, published = true}) {
  if (!capability) throw new Error("social_post_capability_required");
  const actions = ["keep"];
  if (!published) {
    actions.push("improve", "replace", "delete");
    return {actions, scheduleActions: capability.canReschedule ? ["reschedule"] : [],
      explicitBusinessApprovalRequired: true};
  }
  if (capability.canEdit) actions.push("edit", "improve");
  if (capability.canReplace) actions.push("replace", "create_follow_up");
  if (capability.canDelete) actions.push("delete");
  if (capability.canDelete && capability.canReplace) actions.push("delete_and_replace");
  if (actions.length === 1) actions.push("no_provider_mutation_available");
  return {actions: actions.filter((item) => POST_ACTIONS.includes(item)), scheduleActions: [],
    explicitBusinessApprovalRequired: true};
}

function assessScheduledContent({businessUid, contentItemId, versionRecord, businessContext = {},
  recentVariants = [], performanceEvidence = [], timingEvidence = {}, now = Date.now()}) {
  if (!versionRecord || versionRecord.businessUid !== businessUid) {
    throw new Error("social_record_not_owned");
  }
  if (["published", "canceled"].includes(versionRecord.status)) {
    throw new Error("social_unpublished_content_required");
  }
  const variants = (versionRecord.variants || []).map(platformVariant);
  const variantAssessments = variants.map((variant) => {
    const copy = text(variant.copy, 5000);
    const discovery = discoveryRecommendation({variant,
      services: businessContext.services, geography: businessContext.geography,
      brandTerms: [businessContext.businessName].filter(Boolean)});
    const repetition = repetitionAssessment({variant,
      recentVariants: recentVariants.filter((item) => item.provider === variant.provider)});
    const scores = {
      businessRelevance: businessContext.businessName &&
        copy.toLowerCase().includes(text(businessContext.businessName, 240).toLowerCase()) ? 95 : 70,
      serviceRelevance: list(businessContext.services, 12, 120)
        .some((service) => copy.toLowerCase().includes(service.toLowerCase())) ? 95 : 62,
      localRelevance: list(businessContext.geography, 8, 120)
        .some((area) => copy.toLowerCase().includes(area.toLowerCase())) ? 92 : 65,
      hookStrength: clampScore(copy.split(/\s+/).slice(0, 16).join(" ").length >= 35 ? 82 : 58),
      copyQuality: clampScore(copy.length >= 55 && copy.length <= 1800 ? 85 : 62),
      ctaQuality: variant.callToAction && variant.destinationUrl ? 92 :
        variant.callToAction ? 70 : 45,
      visualQuality: variant.mediaRevisionId ? 82 : null,
      repetition: repetition.score,
      platformFit: variant.format && variant.format !== "feed" ? 88 : 76,
      discoveryLanguage: discovery.keywordScore,
      keywordQuality: discovery.keywordScore,
      hashtagQuality: discovery.hashtagScore,
    };
    const available = Object.values(scores).filter((value) => value != null);
    const score = clampScore(available.reduce((sum, value) => sum + value, 0) / available.length);
    const timing = bestTimeRecommendation({provider: variant.provider,
      scheduledFor: versionRecord.scheduledFor,
      firstPartyWindows: timingEvidence[variant.provider]?.firstPartyWindows,
      providerAudienceWindows: timingEvidence[variant.provider]?.providerAudienceWindows, now});
    let recommendation = score >= 75 ? "keep" : score >= 50 ? "improve" : "replace";
    if (repetition.repeated && score < 75) recommendation = "replace";
    if (timing.shouldReschedule && recommendation === "keep") recommendation = "reschedule";
    return {provider: variant.provider, score, qualityBand: qualityBand(score), scores,
      recommendation, discovery, repetition, timing,
      evidenceStatus: performanceEvidence.length ? "limited_first_party_evidence" :
        "initial_experiment"};
  });
  const score = clampScore(variantAssessments.reduce((sum, item) => sum + item.score, 0) /
    Math.max(1, variantAssessments.length));
  const recommendation = variantAssessments.some((item) => item.recommendation === "replace") ?
    "replace" : variantAssessments.some((item) => item.recommendation === "improve") ?
      "improve" : variantAssessments.some((item) => item.recommendation === "reschedule") ?
        "reschedule" : "keep";
  return {schemaVersion: CONTENT_QUALITY_VERSION, businessUid, contentItemId,
    contentVersion: Number(versionRecord.version), score, qualityBand: qualityBand(score),
    recommendation, readyToPublish: score >= 75 && recommendation === "keep",
    variantAssessments, immutableSourceHash: text(versionRecord.contentHash, 64) || null,
    assessedAt: now};
}

function ratePastPost({businessUid, provider, contentItemId, creativeEvidence = {},
  performanceSnapshot = null, capability = null, now = Date.now()}) {
  const creativeScores = QUALITY_DIMENSIONS.map((key) => clampScore(creativeEvidence[key]))
    .filter((value) => value != null);
  const creativeScore = creativeScores.length ? clampScore(creativeScores.reduce((a, b) => a + b, 0) /
    creativeScores.length) : null;
  const metricValues = Object.values(performanceSnapshot?.metrics || {})
    .filter((metric) => metric?.status === "available").map((metric) => Number(metric.value || 0));
  const performanceScore = metricValues.length >= 2 ?
    clampScore(Math.min(100, Math.log10(1 + metricValues.reduce((a, b) => a + b, 0)) * 32)) : null;
  let recommendation = "keep";
  if (creativeScore != null && creativeScore < 50) recommendation = capability?.canDelete ?
    "recommend_removal" : "create_better_follow_up";
  else if (creativeScore != null && creativeScore < 70) recommendation = "improve_future_version";
  const actions = availablePostActions({capability: capability || postCapabilityProjection({provider}),
    published: true});
  return {schemaVersion: PAST_POST_RATING_VERSION, businessUid, provider,
    contentItemId: text(contentItemId, 180), creativeScore,
    creativeQualityBand: qualityBand(creativeScore), performanceScore,
    providerState: text(capability?.providerState, 60) || "published",
    performanceEvidenceStatus: performanceScore == null ? "insufficient_evidence" : "available",
    overallRecommendation: recommendation, availableActions: actions.actions,
    explicitBusinessApprovalRequired: true, providerMutationRequested: false, ratedAt: now};
}

function replacementProposal({businessUid, contentItemId, sourceVersion, replacementItem,
  reason, providerPostId = null, originalMetricsSnapshotId = null, now = Date.now()}) {
  if (!sourceVersion || sourceVersion.businessUid !== businessUid) {
    throw new Error("social_record_not_owned");
  }
  const replacement = contentItemVersion({businessUid, planId: sourceVersion.planId,
    item: replacementItem, previousVersion: sourceVersion.version, now});
  const identity = {businessUid, contentItemId, sourceVersion: sourceVersion.version,
    replacementHash: replacement.contentHash};
  return {id: `social_replacement_${digest(identity).slice(0, 40)}`, record: {
    schemaVersion: REPLACEMENT_PROPOSAL_VERSION, ...identity,
    providerPostId: text(providerPostId, 240) || null,
    originalMetricsSnapshotId: text(originalMetricsSnapshotId, 180) || null,
    reason: text(reason, 600), replacementVersion: replacement,
    status: "ready_for_review", supersedesOnlyAfterApproval: true,
    providerMutationRequested: false, externalPublishingEnabled: false,
    createdAt: now, updatedAt: now}};
}

function contentHealthProjection({assessments = [], ratings = []}) {
  const all = [...assessments, ...ratings];
  return {schemaVersion: CONTENT_QUALITY_VERSION,
    assessedCount: all.length,
    needsAttentionCount: all.filter((item) => ["weak", "needs_attention"]
      .includes(item.qualityBand || item.creativeQualityBand)).length,
    strongCount: all.filter((item) => (item.qualityBand || item.creativeQualityBand) === "strong").length,
    scheduled: assessments,
    pastPosts: ratings,
    providerMutationsEnabled: false,
    customerReadyQuestion: "Would a professional Business be proud to have this represent them publicly?"};
}

function qualityLearningComparison({businessUid, assessments = [], snapshots = [],
  minimumSample = 3, now = Date.now()}) {
  const ownedAssessments = assessments.filter((item) => item?.businessUid === businessUid);
  const ownedSnapshots = snapshots.filter((item) => item?.businessUid === businessUid);
  const byItem = new Map(ownedAssessments.map((item) => [item.contentItemId, item]));
  const paired = ownedSnapshots.filter((item) => byItem.has(item.contentItemId));
  if (paired.length < minimumSample) return {schemaVersion: "SocialQualityLearningV1",
    businessUid, status: "insufficient_evidence", sampleSize: paired.length,
    summary: "More same-Business predicted-quality and performance pairs are required.",
    crossTenantTrainingEnabled: false, createdAt: now};
  const comparisons = paired.map((snapshot) => {
    const quality = byItem.get(snapshot.contentItemId);
    const performanceValues = Object.values(snapshot.metrics || {})
      .filter((metric) => metric?.status === "available")
      .map((metric) => Number(metric.value || 0));
    return {contentItemId: snapshot.contentItemId, predictedQuality: quality.score,
      observedMetricTotal: performanceValues.reduce((sum, value) => sum + value, 0)};
  });
  return {schemaVersion: "SocialQualityLearningV1", businessUid,
    status: "evidence_available", sampleSize: comparisons.length, comparisons,
    crossTenantTrainingEnabled: false, createdAt: now};
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

function optimizationPolicy({mode, planId, managedAuthorization = false}) {
  const normalized = validateAutomationMode({mode, planId, managedAuthorization});
  return {mode: normalized, recommendationsEnabled: true,
    unpublishedMinorOptimizationEnabled: normalized !== "manual",
    unpublishedReschedulingEnabled: normalized !== "manual",
    unpublishedReplacementEnabled: normalized === "managed",
    materialReplacementVisible: true,
    publishedDeletionAutomatic: false,
    providerMutationsEnabled: false};
}

// Provider-neutral health; adapter scope policies remain separate.
function connectionHealth(input = {}) {
  const status = text(input.status, 60).toLowerCase();
  const tokenHealth = text(input.tokenHealth, 60).toLowerCase();
  const connected = ["connected_read_only", "connected_write"].includes(status);
  const requiresReconnect = ["reauth_required", "reauthorization_required", "expired",
    "token_expired", "revoked", "error", "attention_required"].includes(status) ||
    ["needs_attention", "revoked", "expired", "error"].includes(tokenHealth);
  // Empty health supports legacy projections; an explicit unknown health fails closed.
  const healthy = connected && !requiresReconnect && ["", "healthy"].includes(tokenHealth);
  return {connected, healthy, requiresReconnect};
}

function connectionProjection(input = {}) {
  const provider = text(input.provider, 40).toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new Error("unsupported_social_provider");
  const health = connectionHealth(input);
  const status = health.requiresReconnect ? "attention_required" : ["disconnected", "not_connected", "authorizing", "identity_pending",
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
    requiresReconnect: health.requiresReconnect,
    capabilities: {
      profile: health.healthy && input.capabilities?.profile === true,
      publishText: health.healthy && input.capabilities?.publishText === true,
      publishImage: health.healthy && input.capabilities?.publishImage === true,
      publishVideo: health.healthy && input.capabilities?.publishVideo === true,
      schedule: health.healthy && input.capabilities?.schedule === true,
      analytics: health.healthy && input.capabilities?.analytics === true,
    },
    // Tokens, provider secrets, and raw credential records never enter this projection.
    authorizationUpdatedAt: input.authorizationUpdatedAt || null};
}

const X_READ_SCOPES = Object.freeze(["users.read", "tweet.read"]);
const X_WRITE_SCOPES = Object.freeze(["tweet.write", "media.write"]);

function xConnectionCapabilities(input = {}, {expectedProviderUserId = null} = {}) {
  const status = text(input.status, 60).toLowerCase();
  const scopes = new Set(list(input.grantedScopes, 20, 180));
  const providerUserId = text(input.providerUserId, 240) || null;
  const providerAccountId = text(input.providerAccountId, 240) || null;
  const connected = ["connected_read_only", "connected_write"].includes(status);
  const unhealthy = !connectionHealth(input).healthy || ["reauth_required", "expired", "revoked", "error",
    "attention_required"].includes(status) ||
    ["needs_attention", "revoked", "expired", "error"].includes(
      text(input.tokenHealth, 60).toLowerCase());
  const identityPresent = text(input.provider, 40).toLowerCase() === "x" &&
    Boolean(providerUserId || providerAccountId);
  const identityMatches = identityPresent && (!expectedProviderUserId ||
    providerUserId === text(expectedProviderUserId, 240));
  const hasReadScopes = X_READ_SCOPES.every((scope) => scopes.has(scope));
  const hasWriteScopes = X_WRITE_SCOPES.every((scope) => scopes.has(scope));
  const canReadInsights = connected && !unhealthy && identityMatches && hasReadScopes;
  const canWrite = canReadInsights && hasWriteScopes &&
    input.writeScopesGranted === true;
  const canRefresh = canReadInsights && scopes.has("offline.access") &&
    !["needs_attention", "revoked", "expired", "error"].includes(
      text(input.tokenHealth, 60).toLowerCase());
  return {canReadInsights, canWrite, canRefresh, connected, healthy: connected && !unhealthy,
    identityMatches, hasReadScopes, hasWriteScopes,
    separateReadConnectionRequired: false};
}

function platformVariant(input = {}) {
  const provider = text(input.provider, 40).toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new Error("unsupported_social_provider");
  const copy = text(input.copy, 5000);
  if (!copy) throw new Error("social_copy_required");
  return {provider, format: text(input.format, 60) || "feed", copy,
    mediaAssetId: text(input.mediaAssetId, 180) || null,
    mediaRevisionId: text(input.mediaRevisionId, 180) || null,
    mediaRequirement: text(input.mediaRequirement, 1200) || null,
    altText: text(input.altText, 1000) || null,
    callToAction: text(input.callToAction, 300) || null,
    destinationUrl: text(input.destinationUrl, 1200) || null,
    responseAssetId: text(input.responseAssetId, 180) || null,
    responseAssetRequirement: text(input.responseAssetRequirement, 600) || null,
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
  if (projection.provider !== normalizedProvider ||
      projection.status !== "connected_write" || projection.requiresReconnect ||
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
  const owned = snapshots.filter((item) => item?.businessUid === businessUid);
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
    summary: "The strongest observed item earned the most combined engagement and attributable response.",
    recommendations: ["Create one follow-up variation on the strongest evidenced topic.",
      "Reduce frequency for topics that repeatedly receive no attributable response."], createdAt: now};
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
  CONTENT_QUALITY_VERSION, POST_CAPABILITY_VERSION, PAST_POST_RATING_VERSION,
  REPLACEMENT_PROPOSAL_VERSION, AUTOMATION_MODES, PUBLISH_STATUSES,
  QUALITY_RECOMMENDATIONS, POST_ACTIONS, QUALITY_DIMENSIONS,
  normalizePlanId, validateAutomationMode, optimizationPolicy,
  connectionHealth, connectionProjection, xConnectionCapabilities, platformVariant, createContentPlan,
  contentItemVersion, approvePlan,
  approveContentVersion, publishJob, transitionPublishJob, normalizePerformance,
  weeklyLearning, createEmailContentPlan, adAccountHealth, repetitionAssessment,
  discoveryRecommendation, bestTimeRecommendation, postCapabilityProjection,
  availablePostActions, assessScheduledContent, ratePastPost, replacementProposal,
  contentHealthProjection, qualityLearningComparison, qualityBand,
  SocialProviderAdapter, MockSocialProviderAdapter,
  mockProviderAdapters};

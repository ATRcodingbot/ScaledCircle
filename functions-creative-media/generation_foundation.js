"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "GeneratedServiceVisualV1";
const DISCLOSURE = "Service concept image — not a photo of this Business's completed work, team, customers, or property.";
const PAGE_SIZE = 20;
const MAX_ACTIVE_JOBS = 2;
const MAX_REQUESTS_PER_DAY = 8;
const MAX_AUTHORIZED_BUSINESSES = 20;
const MAX_BETA_COHORT_BUSINESSES = 10;
const ROLLOUT_MODES = new Set(["founder_only", "beta_cohort", "plan_entitled"]);
const BETA_COHORT_STAGES = new Set(["initial_5", "expanded_10"]);
const PLAN_MONTHLY_ALLOWANCES = Object.freeze({starter: 5, growth: 15, scale: 30,
  managed_growth: 60});
const CAPABILITIES = new Set(["disabled", "test_only", "enabled"]);
const DIRECTIONS = new Set(["clean", "friendly", "premium", "practical", "modern"]);
const PURPOSES = new Set(["service_visual", "hero"]);
const MATERIAL_SLOTS = new Set(["landing_page_hero", "door_hanger_service_hero"]);
const TERMINAL = new Set(["approved", "rejected", "failed", "blocked", "unknown_provider_outcome"]);
const FAILURE_CATEGORIES = new Set(["provider_unavailable", "rate_limited", "budget_disabled",
  "moderation_blocked", "invalid_output", "invalid_request", "processing_failed", "timeout",
  "monthly_limit_reached", "global_budget_exhausted", "unknown_provider_outcome", "internal",
  "wif_config_missing", "google_metadata_unavailable", "google_subject_token_invalid",
  "google_claim_mismatch", "openai_wif_exchange_failed", "openai_auth_rejected",
  "provider_client_initialization_failed"]);

function normalizeAuthorizedBusinessUids(value) {
  if (!Array.isArray(value) || value.length > MAX_AUTHORIZED_BUSINESSES) return null;
  const result = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const uid = entry.trim();
    if (uid.length < 1 || uid.length > 128 || /\s|[\u0000-\u001F\u007F]/.test(uid)) return null;
    if (!result.includes(uid)) result.push(uid);
  }
  return result;
}
function normalizeRolloutMode(value) {
  const normalized = clean(value, 30).toLowerCase();
  return ROLLOUT_MODES.has(normalized) ? normalized : "founder_only";
}
function normalizeBetaCohortStage(value) {
  const normalized = clean(value, 30).toLowerCase();
  return BETA_COHORT_STAGES.has(normalized) ? normalized : "initial_5";
}
function betaCohortMaximum(stage) {
  return normalizeBetaCohortStage(stage) === "expanded_10" ? 10 : 5;
}
function planMonthlyAllowance(plan) {
  return Number(PLAN_MONTHLY_ALLOWANCES[clean(plan, 40).toLowerCase()] || 0);
}
function generationAuthorizationPolicy(value, businessUid, entitlement = {}) {
  const config = Array.isArray(value) || value == null ? {authorizedBusinessUids: value} : value;
  const founder = normalizeAuthorizedBusinessUids(Object.hasOwn(config || {}, "authorizedBusinessUids") ?
    config.authorizedBusinessUids : []);
  const beta = normalizeAuthorizedBusinessUids(Object.hasOwn(config || {}, "betaCohortBusinessUids") ?
    config.betaCohortBusinessUids : []);
  const rolloutMode = normalizeRolloutMode(config?.rolloutMode);
  const betaCohortStage = normalizeBetaCohortStage(config?.betaCohortStage);
  const betaCohortLimit = betaCohortMaximum(betaCohortStage);
  const authorizedBusinessCount = founder === null ? 0 : founder.length;
  const betaCohortCount = beta === null ? 0 : beta.length;
  const plan = clean(entitlement.plan, 40).toLowerCase();
  const monthlyAllowance = planMonthlyAllowance(plan);
  const commerciallyEligible = entitlement.eligible === true && monthlyAllowance > 0;
  const uid = String(businessUid || "");
  const configurationValid = founder !== null && beta !== null && beta.length <= betaCohortLimit;
  const authorized = configurationValid && (rolloutMode === "founder_only" ? founder.includes(uid) :
    rolloutMode === "beta_cohort" ? beta.includes(uid) && commerciallyEligible :
    rolloutMode === "plan_entitled" ? commerciallyEligible : false);
  return Object.freeze({
    authorized,
    rolloutMode,
    betaCohortStage,
    betaCohortLimit,
    plan,
    monthlyAllowance,
    commerciallyEligible,
    betaAvailable: rolloutMode === "beta_cohort" && authorized,
    qaAllowlistEnabled: founder !== null && authorizedBusinessCount > 0,
    betaCohortEnabled: rolloutMode === "beta_cohort" && configurationValid && betaCohortCount > 0,
    founderOnlyMode: rolloutMode === "founder_only",
    authorizedBusinessCount,
    betaCohortCount,
    configurationValid,
  });
}

function clean(value, maximum = 160) {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ").slice(0, maximum);
}
function stableId(prefix, uid, requestId) {
  return `${prefix}_${crypto.createHash("sha256").update(`${uid}\n${requestId}`).digest("hex").slice(0, 40)}`;
}
function normalizeCapability(value) {
  const result = clean(value, 20).toLowerCase();
  return CAPABILITIES.has(result) ? result : "disabled";
}
function assertTestAdapterEnvironment({projectId, emulator, nodeEnv}) {
  const localProject = /^demo-|^local-/.test(clean(projectId, 120));
  const testRuntime = nodeEnv === "test" || emulator === true;
  if (!localProject || !testRuntime) throw new Error("test_adapter_forbidden");
}
function sanitizeRequest(input, approvedServices = []) {
  const requestId = clean(input?.requestId, 128);
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(requestId)) throw new Error("invalid_generation_request");
  const serviceCategory = clean(input?.serviceCategory, 80);
  if (!serviceCategory || !approvedServices.map((v) => clean(v, 80).toLowerCase())
    .includes(serviceCategory.toLowerCase())) throw new Error("unsupported_service_category");
  const visualDirection = clean(input?.visualDirection, 24).toLowerCase();
  if (!DIRECTIONS.has(visualDirection)) throw new Error("invalid_visual_direction");
  const requestedPurpose = clean(input?.requestedPurpose || "service_visual", 30).toLowerCase();
  if (!PURPOSES.has(requestedPurpose) || requestedPurpose === "logo") throw new Error("invalid_generated_purpose");
  const campaignId = clean(input?.campaignId, 160) || null;
  if (campaignId && !/^[A-Za-z0-9_-]{3,160}$/.test(campaignId)) throw new Error("invalid_generation_campaign");
  const materialSlot = clean(input?.materialSlot || "landing_page_hero", 40).toLowerCase();
  if (!MATERIAL_SLOTS.has(materialSlot)) throw new Error("invalid_generation_material_slot");
  return {requestId, serviceCategory, visualDirection, requestedPurpose, campaignId, materialSlot};
}

function serviceLanguage(value) {
  const canonical = clean(value, 80);
  const lower = canonical.toLowerCase();
  const singular = lower.replace(/^build\s+/, "").replace(/^install\s+/, "")
    .replace(/\bdecks\b/g, "deck").replace(/\bfences\b/g, "fence")
    .replace(/\bpatios\b/g, "patio").replace(/\bservices\b/g, "service");
  const subject = /seasonal cleanup/.test(lower) ? "seasonal cleanup" :
    /landscap/.test(lower) ? "landscaping" : singular;
  const customerProject = /deck/.test(lower) ? "deck project" :
    /fence/.test(lower) ? "fence project" : /patio/.test(lower) ? "patio project" :
      /seasonal cleanup/.test(lower) ? "seasonal cleanup" :
        /landscap/.test(lower) ? "landscaping project" : `${subject} project`;
  const visualSubject = /deck/.test(lower) ? "a pristine, professionally constructed residential deck" :
    /fence/.test(lower) ? "a straight, professionally installed residential fence with a proper gate" :
      /patio/.test(lower) ? "a clean, professionally built patio with believable grading and drainage" :
        /landscap/.test(lower) ? "polished, region-appropriate residential landscaping" :
          /seasonal cleanup/.test(lower) ? "a professionally completed seasonal yard cleanup" :
            `a professionally completed ${subject} project`;
  return Object.freeze({canonical, subject, customerProject, visualSubject});
}

function sanitizeServiceAreaVisualContext(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_service_area_visual_context");
  }
  const allowed = {
    areaLabel: 120, city: 80, county: 80, postalZone: 20, propertyStyle: 100,
    lotCharacter: 100, terrain: 80, vegetation: 100, climateSeason: 100,
    settlementContext: 40, source: 60,
  };
  const forbidden = /(address|resident|recipient|person|email|phone|name|race|ethnic|relig|income|wealth|gender|age|disab|politic)/i;
  const derived = new Set(["schemaVersion", "contextDigest"]);
  for (const key of Object.keys(value)) {
    if (derived.has(key)) continue;
    if (!Object.hasOwn(allowed, key) || forbidden.test(key)) {
      throw new Error("invalid_service_area_visual_context");
    }
  }
  const result = {};
  for (const [key, maximum] of Object.entries(allowed)) {
    const normalized = clean(value[key], maximum);
    if (normalized) result[key] = normalized;
  }
  if (!Object.keys(result).length) return null;
  result.schemaVersion = "ServiceAreaVisualContextV1";
  result.contextDigest = crypto.createHash("sha256")
    .update(JSON.stringify(Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))))
    .digest("hex");
  return Object.freeze(result);
}

function safeBrief(request, brand = {}, serviceAreaContext = null) {
  const language = serviceLanguage(request.serviceCategory);
  const context = sanitizeServiceAreaVisualContext(serviceAreaContext);
  return Object.freeze({
    serviceCategory: request.serviceCategory,
    visualDirection: request.visualDirection,
    purpose: request.requestedPurpose,
    brandStyle: clean(brand.stylePreset, 30) || null,
    brandColors: [brand.primaryColor, brand.secondaryColor].filter((v) => /^#[0-9A-F]{6}$/i.test(String(v || ""))),
    campaignId: request.campaignId || null,
    materialSlot: request.materialSlot || "landing_page_hero",
    serviceLanguage: language,
    serviceAreaVisualContext: context,
    visualSubject: language.visualSubject,
    workmanship: "physically plausible professional execution with clean lines, realistic proportions, and appropriate site conditions",
    composition: request.materialSlot === "door_hanger_service_hero" ?
      "portrait print composition; keep the marketed service and regional property context visible through a narrow door-hanger crop" :
      "landscape hero composition with a safe central crop",
    exclusions: ["identifiable_people", "real_customer_property", "before_after", "credentials_or_awards",
      "reviews_or_ratings", "factual_signage", "business_logo", "completed_work_claim"],
    embeddedText: "avoid",
    disclosure: DISCLOSURE,
  });
}
function normalizeModeration(result = {}) {
  const flags = new Set(Array.isArray(result.flags) ? result.flags.map((v) => clean(v, 50)) : []);
  const blocked = ["identifiable_people", "before_after", "credential_claim", "unsupported_claim",
    "real_property_transformation"].some((flag) => flags.has(flag));
  return {status: blocked ? "blocked" : result.status === "review_required" ? "review_required" : "passed",
    flags: [...flags].slice(0, 12)};
}
function encodeCursor(createdAt, id) {
  return Buffer.from(JSON.stringify({createdAt, id})).toString("base64url");
}
function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(clean(value, 500), "base64url").toString("utf8"));
    if (!Number.isFinite(parsed.createdAt) || !/^[A-Za-z0-9_-]{3,160}$/.test(parsed.id)) throw new Error();
    return parsed;
  } catch (_) { throw new Error("invalid_generation_cursor"); }
}
function millis(value) { return typeof value?.toMillis === "function" ? value.toMillis() : Number(value || 0); }

function deterministicTestAdapter({fixture, moderation = {status: "passed"}, environment}) {
  assertTestAdapterEnvironment(environment);
  if (!Buffer.isBuffer(fixture) || fixture.length === 0) throw new Error("invalid_output");
  return Object.freeze({
    id: "deterministic_local_fixture",
    mode: "test",
    executionMode: "synchronous",
    async generateServiceConcept({jobId, brief}) {
      return {providerRequestReference: `local_${jobId}`, binary: Buffer.from(fixture),
        usage: {outputs: 1, testFixture: true}, moderation: normalizeModeration(moderation), brief};
    },
  });
}

function createGenerationService({db, FieldValue, Timestamp, FieldPath, adapter = null,
  capability = async () => "disabled", budgetEnabled = async () => false,
  authorization = async () => generationAuthorizationPolicy(undefined, null),
  budgetAuthority = null,
  approvedServices = async () => [], brandProfile = async () => ({}),
  serviceAreaVisualContext = async () => null, ingestCandidate,
  approveCandidate = async () => {}, rejectCandidate = async () => {}, providerAuthPreflight = null,
  usageSummary = async () => null, commercialOperations = async () => ({}),
  notifyReady = async () => {}, reportOperationalFailure = () => {}, now = () => Date.now()}) {
  const jobs = () => db.collection("visualGenerationJobs");
  async function gate(actor) {
    const access = await authorization(actor);
    if (access?.authorized !== true) throw new Error("business_not_authorized_for_provider_generation");
    const mode = normalizeCapability(await capability(actor));
    if (mode === "disabled") throw new Error("generation_disabled");
    if (!(await budgetEnabled(actor))) throw new Error("budget_disabled");
    if (!adapter) throw new Error("provider_unavailable");
    if (mode === "test_only" && adapter.mode !== "test") throw new Error("provider_unavailable");
    if (mode === "enabled" && adapter.mode === "test") throw new Error("test_adapter_forbidden");
    return {mode, access};
  }
  async function request({actor, input}) {
    const gated = await gate(actor); const mode = gated.mode;
    const valid = sanitizeRequest(input, await approvedServices(actor));
    const jobId = stableId("visual_job", actor.uid, valid.requestId);
    const ref = jobs().doc(jobId);
    const existing = await ref.get();
    if (existing.exists) return {jobId, status: existing.data().status, idempotentReplay: true};
    const recent = await jobs().where("businessUid", "==", actor.uid)
      .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(50).get();
    const activeStates = new Set(["requested", "queued", "processing", "review_required"]);
    if (recent.docs.filter((doc) => activeStates.has(doc.data().status)).length >= MAX_ACTIVE_JOBS) {
      throw new Error("generation_rate_limited");
    }
    const dayStartMillis = now() - 24 * 60 * 60 * 1000;
    if (recent.docs.filter((doc) => millis(doc.data().createdAt) >= dayStartMillis).length >= MAX_REQUESTS_PER_DAY) {
      throw new Error("generation_rate_limited");
    }
    const brief = safeBrief(valid, await brandProfile(actor), await serviceAreaVisualContext(actor, valid));
    const at = FieldValue.serverTimestamp();
    await ref.create({schemaVersion: SCHEMA_VERSION, jobId, businessUid: actor.uid,
      requestId: valid.requestId, status: "queued", serviceCategory: valid.serviceCategory,
      visualDirection: valid.visualDirection, requestedPurpose: valid.requestedPurpose,
      campaignId: valid.campaignId, materialSlot: valid.materialSlot,
      requestedAt: at, requestedBy: actor.uid, providerAdapter: adapter.id,
      providerMode: mode === "test_only" ? "test" : "external", safeBrief: brief,
      providerExecutionMode: clean(adapter.executionMode, 30) || "synchronous",
      planId: clean(gated.access?.plan, 40) || null,
      candidateAssetId: null, candidateRevisionId: null, failureCategory: null,
      providerUsage: null, estimatedCostMicros: null, actualCostMicros: null,
      attemptCount: 0, createdAt: at, updatedAt: at});
    return {jobId, status: "queued", idempotentReplay: false};
  }
  async function process({actor, jobId}) {
    const ref = jobs().doc(clean(jobId, 160));
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("generation_job_not_found");
    const job = snapshot.data();
    if (!actor || job.businessUid !== actor.uid) throw new Error("generation_access_denied");
    await gate(actor);
    if (job.candidateRevisionId) {
      if (budgetAuthority && job.customerAllowanceConsumed !== true) {
        const existing = await budgetAuthority.lookup({actor, jobId: ref.id});
        if (["reserved", "unknown_provider_outcome"].includes(existing?.status)) {
          await budgetAuthority.settle({reservation: existing, usage: job.providerUsage || null,
            cost: {actualCostMicros: Number(job.actualCostMicros || 0)}, providerAccepted: true,
            customerConsumed: true});
          await ref.update({customerAllowanceConsumed: true, updatedAt: FieldValue.serverTimestamp()});
        }
      }
      return {jobId: ref.id, status: job.status,
        assetId: job.candidateAssetId, revisionId: job.candidateRevisionId, idempotentReplay: true};
    }
    if (!adapter) throw new Error("provider_unavailable");
    if (["processing", "unknown_provider_outcome"].includes(job.status)) {
      return {jobId: ref.id, status: job.status, idempotentReplay: true};
    }
    let reservation = null;
    if (budgetAuthority) reservation = await budgetAuthority.reserve({actor, jobId: ref.id});
    await ref.update({status: "processing", providerAttemptState: "attempting",
      attemptCount: Number(job.attemptCount || 0) + 1,
      processingStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    let providerResult = null; let usableCandidate = false;
    try {
      const result = await adapter.generateServiceConcept({jobId: ref.id, brief: job.safeBrief});
      providerResult = result;
      const moderation = normalizeModeration(result.moderation);
      if (moderation.status !== "passed") {
        if (budgetAuthority && reservation) await budgetAuthority.settle({reservation,
          usage: result.usage || null, cost: result.cost || null, providerAccepted: true,
          customerConsumed: false});
        await ref.update({status: "blocked", moderation, failureCategory: "moderation_blocked",
          customerAllowanceConsumed: false,
          completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
        return {jobId: ref.id, status: "blocked"};
      }
      const candidate = await ingestCandidate({businessUid: job.businessUid, requestId: job.requestId,
        purpose: job.requestedPurpose, serviceCategory: job.serviceCategory, binary: result.binary,
        disclosure: DISCLOSURE, moderation, jobId: ref.id});
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (fresh.data()?.candidateRevisionId) return;
        tx.update(ref, {status: "review_required", candidateAssetId: candidate.assetId,
          candidateRevisionId: candidate.revisionId, providerRequestReference: result.providerRequestReference || null,
          provider: result.provider || null, providerModel: result.model || null,
          providerModelSnapshot: result.modelSnapshot || null,
          providerRequestTimestamp: result.requestTimestamp || null, providerAttemptState: "settled",
          providerUsage: result.usage || null, estimatedCostMicros: result.cost?.estimatedCostMicros ?? null,
          actualCostMicros: result.cost?.actualCostMicros ?? null,
          moderation, customerAllowanceConsumed: true, completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()});
      });
      usableCandidate = true;
      if (budgetAuthority && reservation) await budgetAuthority.settle({reservation,
        usage: result.usage || null, cost: result.cost || null, providerAccepted: true,
        customerConsumed: true});
      try { await notifyReady({businessUid: job.businessUid, jobId: ref.id,
        serviceCategory: job.serviceCategory}); } catch (_) {
        reportOperationalFailure({jobId: ref.id, category: "notification_failed",
          phase: "ready_notification", providerRequestReferencePresent: true});
      }
      return {jobId: ref.id, status: "review_required", ...candidate};
    } catch (error) {
      const rawCategory = error?.category || error?.message;
      const unknown = error?.outcome === "unknown_provider_outcome";
      const category = unknown ? "unknown_provider_outcome" : FAILURE_CATEGORIES.has(rawCategory) ? rawCategory : "internal";
      reportOperationalFailure({jobId: ref.id, category, phase: "provider_or_ingestion",
        providerRequestReferencePresent: Boolean(error?.providerRequestId)});
      if (budgetAuthority && reservation) {
        if (unknown) await budgetAuthority.holdUnknown({reservation});
        else if (providerResult || error?.providerAccepted === true) await budgetAuthority.settle({reservation,
          usage: providerResult?.usage || error?.usage || null,
          cost: providerResult?.cost || error?.cost || null, providerAccepted: true,
          customerConsumed: usableCandidate});
        else await budgetAuthority.release({reservation});
      }
      await ref.update({status: unknown ? "unknown_provider_outcome" : category === "moderation_blocked" ? "blocked" : "failed",
        failureCategory: category, providerAttemptState: unknown ? "unknown" : "completed",
        customerAllowanceConsumed: usableCandidate,
        providerRequestReference: error?.providerRequestId || null,
        completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      throw new Error(category);
    }
  }
  async function review({actor, input, approve}) {
    const ref = jobs().doc(clean(input.jobId, 160)); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().businessUid !== actor.uid) throw new Error("generation_access_denied");
    const job = snapshot.data();
    const target = approve ? "approved" : "rejected";
    if (job.status === target) return {jobId: ref.id, status: target, idempotentReplay: true};
    if (approve && (job.status !== "review_required" || job.moderation?.status !== "passed" ||
        !job.candidateRevisionId)) throw new Error("generation_not_approvable");
    if (approve) await approveCandidate({businessUid: actor.uid, assetId: job.candidateAssetId,
      revisionId: job.candidateRevisionId, actorUid: actor.uid});
    else if (job.candidateRevisionId) await rejectCandidate({businessUid: actor.uid,
      assetId: job.candidateAssetId, revisionId: job.candidateRevisionId, actorUid: actor.uid});
    await ref.update({status: target, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: actor.uid,
      generatedContentAcknowledged: approve === true, updatedAt: FieldValue.serverTimestamp()});
    return {jobId: ref.id, status: target, assetId: job.candidateAssetId, revisionId: job.candidateRevisionId};
  }
  async function list({actor, input = {}, admin = false}) {
    const cursor = decodeCursor(input.cursor); let query = jobs();
    if (!admin) query = query.where("businessUid", "==", actor.uid);
    else if (input.businessUid) query = query.where("businessUid", "==", clean(input.businessUid, 160));
    query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.createdAt), cursor.id);
    const snap = await query.limit(PAGE_SIZE + 1).get(); const docs = snap.docs.slice(0, PAGE_SIZE);
    const safe = docs.map((doc) => { const d = doc.data(); return {jobId: doc.id, businessUid: admin ? d.businessUid : undefined,
      status: d.status, serviceCategory: d.serviceCategory, visualDirection: d.visualDirection,
      requestedPurpose: d.requestedPurpose, providerMode: d.providerMode, candidateAssetId: d.candidateAssetId,
      candidateRevisionId: d.candidateRevisionId, failureCategory: d.failureCategory || null,
      moderationStatus: d.moderation?.status || null, createdAt: millis(d.createdAt), updatedAt: millis(d.updatedAt)}; });
    const last = docs.at(-1); const hasMore = snap.size > PAGE_SIZE;
    const access = await authorization(actor);
    const usage = await usageSummary(actor);
    return {schemaVersion: SCHEMA_VERSION, capability: normalizeCapability(await capability(actor)),
      businessAuthorized: access?.authorized === true,
      rolloutMode: access?.rolloutMode || "founder_only", betaAvailable: access?.betaAvailable === true,
      budgetEnabled: await budgetEnabled(actor), approvedServiceCategories: (await approvedServices(actor)).slice(0, 12),
      usage,
      visualDirections: [...DIRECTIONS], disclosure: DISCLOSURE, jobs: safe, hasMore,
      nextCursor: hasMore && last ? encodeCursor(millis(last.data().createdAt), last.id) : null,
      limits: {pageSize: PAGE_SIZE, maximumActiveJobs: MAX_ACTIVE_JOBS, maximumRequestsPerDay: MAX_REQUESTS_PER_DAY}};
  }
  async function operations({actor, input = {}}) {
    let query = jobs();
    if (input.businessUid) query = query.where("businessUid", "==", clean(input.businessUid, 160));
    const [snap, reservationSnap] = await Promise.all([query.orderBy("createdAt", "desc").limit(100).get(),
      db.collection("visualGenerationReservations").orderBy("createdAt", "desc").limit(100).get()]);
    const counts = {queued: 0, processing: 0, review_required: 0, approved: 0,
      rejected: 0, failed: 0, blocked: 0, unknown_provider_outcome: 0};
    const failures = {}; const requestsByPlan = {}; const customerConsumedUnitsByPlan = {};
    const providerBilledUnitsByPlan = {}; let latencyTotal = 0; let completed = 0; let stuckJobs = 0;
    let estimatedCostMicros = 0; let actualCostMicros = 0; let providerRequestCount = 0;
    let systemRejectionCount = 0; let outstandingReservationUnits = 0;
    const reservationCounts = {reserved: 0, settled: 0, released: 0, unknown_provider_outcome: 0};
    for (const doc of reservationSnap.docs) { const reservation = doc.data() || {}; const status = reservation.status;
      if (Object.hasOwn(reservationCounts, status)) reservationCounts[status]++; }
    for (const doc of snap.docs) {
      const value = doc.data(); if (Object.hasOwn(counts, value.status)) counts[value.status]++;
      if (value.failureCategory) failures[value.failureCategory] = Number(failures[value.failureCategory] || 0) + 1;
      if (value.providerRequestTimestamp) providerRequestCount++;
      const plan = clean(value.planId, 40) || "unknown";
      requestsByPlan[plan] = Number(requestsByPlan[plan] || 0) + 1;
      const providerBilled = Boolean(value.providerRequestTimestamp) || Number(value.actualCostMicros || 0) > 0;
      const customerConsumed = value.customerAllowanceConsumed === true ||
        (!Object.hasOwn(value, "customerAllowanceConsumed") && Boolean(value.candidateRevisionId) &&
          ["review_required", "approved", "rejected"].includes(value.status));
      if (providerBilled) providerBilledUnitsByPlan[plan] = Number(providerBilledUnitsByPlan[plan] || 0) + 1;
      if (customerConsumed) customerConsumedUnitsByPlan[plan] =
        Number(customerConsumedUnitsByPlan[plan] || 0) + 1;
      if (providerBilled && !customerConsumed && ["blocked", "failed"].includes(value.status)) systemRejectionCount++;
      estimatedCostMicros += Number(value.estimatedCostMicros || 0);
      actualCostMicros += Number(value.actualCostMicros || 0);
      const created = millis(value.createdAt); const finished = millis(value.completedAt);
      if (created && finished >= created) { latencyTotal += finished - created; completed++; }
      if (["queued", "processing"].includes(value.status) && created && now() - created > 15 * 60 * 1000) stuckJobs++;
    }
    for (const doc of reservationSnap.docs) if (["reserved", "unknown_provider_outcome"]
      .includes(doc.data()?.status)) outstandingReservationUnits += Number(doc.data()?.reservedUnits || 0);
    let providerAuth = null;
    if (input.providerAuthPreflight === true) {
      providerAuth = typeof providerAuthPreflight === "function" ? await providerAuthPreflight() :
        {metadataToken: "FAIL", claimsMatch: "FAIL", openAIExchange: "FAIL",
          failureCategory: "provider_client_initialization_failed", claims: null};
    }
    const access = await authorization(actor);
    const commercial = await commercialOperations(actor);
    return {schemaVersion: SCHEMA_VERSION, capability: normalizeCapability(await capability(actor)),
      budgetEnabled: await budgetEnabled(actor), sampleBound: 100, counts, failures, stuckJobs,
      averageCompletionLatencyMs: completed ? Math.round(latencyTotal / completed) : null,
      providerAvailability: adapter ? (adapter.mode === "test" ? "test_only" : "configured_disabled_by_default") : "not_configured",
      providerOperations: {configuredProvider: adapter?.id || null, providerRequestCount,
        configuredModel: adapter?.defaultModel || null,
        configuredModelSnapshot: adapter?.defaultModelSnapshot || null, reservationCounts,
        estimatedCostMicros, actualCostMicros, outstandingReservationUnits,
        requestsByPlan, customerConsumedUnitsByPlan, providerBilledUnitsByPlan,
        systemRejectionCount, systemRejectionRate: providerRequestCount > 0 ?
          systemRejectionCount / providerRequestCount : 0},
      providerAccess: {qaAllowlistEnabled: access?.qaAllowlistEnabled === true,
        founderOnlyMode: access?.founderOnlyMode !== false,
        rolloutMode: access?.rolloutMode || "founder_only",
        betaCohortEnabled: access?.betaCohortEnabled === true,
        betaCohortCount: Number(access?.betaCohortCount || 0),
        authorizedBusinessCount: Number(access?.authorizedBusinessCount || 0),
        configurationValid: access?.configurationValid === true},
      commercial,
      providerAuthPreflight: providerAuth};
  }
  return {request, process, approve: (args) => review({...args, approve: true}),
    reject: (args) => review({...args, approve: false}), list, operations};
}

module.exports = {SCHEMA_VERSION, DISCLOSURE, PAGE_SIZE, MAX_ACTIVE_JOBS, MAX_REQUESTS_PER_DAY,
  MAX_AUTHORIZED_BUSINESSES, MAX_BETA_COHORT_BUSINESSES, ROLLOUT_MODES, BETA_COHORT_STAGES,
  PLAN_MONTHLY_ALLOWANCES,
  normalizeAuthorizedBusinessUids, normalizeRolloutMode, normalizeBetaCohortStage, betaCohortMaximum,
  planMonthlyAllowance, generationAuthorizationPolicy,
  DIRECTIONS, FAILURE_CATEGORIES, stableId, normalizeCapability, assertTestAdapterEnvironment,
  MATERIAL_SLOTS, sanitizeRequest, serviceLanguage, sanitizeServiceAreaVisualContext, safeBrief,
  normalizeModeration, encodeCursor, decodeCursor,
  deterministicTestAdapter, createGenerationService};

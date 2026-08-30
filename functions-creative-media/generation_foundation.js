"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "GeneratedServiceVisualV1";
const DISCLOSURE = "Service concept image — not a photo of this Business's completed work, team, customers, or property.";
const PAGE_SIZE = 20;
const MAX_ACTIVE_JOBS = 2;
const MAX_REQUESTS_PER_DAY = 8;
const CAPABILITIES = new Set(["disabled", "test_only", "enabled"]);
const DIRECTIONS = new Set(["clean", "friendly", "premium", "practical", "modern"]);
const PURPOSES = new Set(["service_visual", "hero"]);
const TERMINAL = new Set(["approved", "rejected", "failed", "blocked"]);
const FAILURE_CATEGORIES = new Set(["provider_unavailable", "rate_limited", "budget_disabled",
  "moderation_blocked", "invalid_output", "processing_failed", "timeout", "internal"]);

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
  return {requestId, serviceCategory, visualDirection, requestedPurpose};
}
function safeBrief(request, brand = {}) {
  return Object.freeze({
    serviceCategory: request.serviceCategory,
    visualDirection: request.visualDirection,
    purpose: request.requestedPurpose,
    brandStyle: clean(brand.stylePreset, 30) || null,
    brandColors: [brand.primaryColor, brand.secondaryColor].filter((v) => /^#[0-9A-F]{6}$/i.test(String(v || ""))),
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
  approvedServices = async () => [], brandProfile = async () => ({}), ingestCandidate,
  approveCandidate = async () => {}, rejectCandidate = async () => {}, now = () => Date.now()}) {
  const jobs = () => db.collection("visualGenerationJobs");
  async function gate(actor) {
    const mode = normalizeCapability(await capability(actor));
    if (mode === "disabled") throw new Error("generation_disabled");
    if (!(await budgetEnabled(actor))) throw new Error("budget_disabled");
    if (!adapter) throw new Error("provider_unavailable");
    if (mode === "test_only" && adapter.mode !== "test") throw new Error("provider_unavailable");
    if (mode === "enabled" && adapter.mode === "test") throw new Error("test_adapter_forbidden");
    return mode;
  }
  async function request({actor, input}) {
    const mode = await gate(actor);
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
    const brief = safeBrief(valid, await brandProfile(actor));
    const at = FieldValue.serverTimestamp();
    await ref.create({schemaVersion: SCHEMA_VERSION, jobId, businessUid: actor.uid,
      requestId: valid.requestId, status: "queued", serviceCategory: valid.serviceCategory,
      visualDirection: valid.visualDirection, requestedPurpose: valid.requestedPurpose,
      requestedAt: at, requestedBy: actor.uid, providerAdapter: adapter.id,
      providerMode: mode === "test_only" ? "test" : "external", safeBrief: brief,
      providerExecutionMode: clean(adapter.executionMode, 30) || "synchronous",
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
    if (job.candidateRevisionId) return {jobId: ref.id, status: job.status,
      assetId: job.candidateAssetId, revisionId: job.candidateRevisionId, idempotentReplay: true};
    if (!adapter) throw new Error("provider_unavailable");
    await ref.update({status: "processing", attemptCount: Number(job.attemptCount || 0) + 1,
      processingStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    try {
      const result = await adapter.generateServiceConcept({jobId: ref.id, brief: job.safeBrief});
      const moderation = normalizeModeration(result.moderation);
      if (moderation.status !== "passed") {
        await ref.update({status: "blocked", moderation, failureCategory: "moderation_blocked",
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
          providerUsage: result.usage || null, estimatedCostMicros: null, actualCostMicros: null,
          moderation, completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()});
      });
      return {jobId: ref.id, status: "review_required", ...candidate};
    } catch (error) {
      const category = FAILURE_CATEGORIES.has(error?.message) ? error.message : "internal";
      await ref.update({status: category === "moderation_blocked" ? "blocked" : "failed",
        failureCategory: category, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
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
    return {schemaVersion: SCHEMA_VERSION, capability: normalizeCapability(await capability(actor)),
      budgetEnabled: await budgetEnabled(actor), approvedServiceCategories: (await approvedServices(actor)).slice(0, 12),
      visualDirections: [...DIRECTIONS], disclosure: DISCLOSURE, jobs: safe, hasMore,
      nextCursor: hasMore && last ? encodeCursor(millis(last.data().createdAt), last.id) : null,
      limits: {pageSize: PAGE_SIZE, maximumActiveJobs: MAX_ACTIVE_JOBS, maximumRequestsPerDay: MAX_REQUESTS_PER_DAY}};
  }
  async function operations({actor, input = {}}) {
    let query = jobs();
    if (input.businessUid) query = query.where("businessUid", "==", clean(input.businessUid, 160));
    const snap = await query.orderBy("createdAt", "desc").limit(100).get();
    const counts = {queued: 0, processing: 0, review_required: 0, approved: 0,
      rejected: 0, failed: 0, blocked: 0};
    const failures = {}; let latencyTotal = 0; let completed = 0; let stuckJobs = 0;
    for (const doc of snap.docs) {
      const value = doc.data(); if (Object.hasOwn(counts, value.status)) counts[value.status]++;
      if (value.failureCategory) failures[value.failureCategory] = Number(failures[value.failureCategory] || 0) + 1;
      const created = millis(value.createdAt); const finished = millis(value.completedAt);
      if (created && finished >= created) { latencyTotal += finished - created; completed++; }
      if (["queued", "processing"].includes(value.status) && created && now() - created > 15 * 60 * 1000) stuckJobs++;
    }
    return {schemaVersion: SCHEMA_VERSION, capability: normalizeCapability(await capability(actor)),
      budgetEnabled: await budgetEnabled(actor), sampleBound: 100, counts, failures, stuckJobs,
      averageCompletionLatencyMs: completed ? Math.round(latencyTotal / completed) : null,
      providerAvailability: adapter ? (adapter.mode === "test" ? "test_only" : "configured") : "not_configured",
      providerUsageAndCost: "not_enabled"};
  }
  return {request, process, approve: (args) => review({...args, approve: true}),
    reject: (args) => review({...args, approve: false}), list, operations};
}

module.exports = {SCHEMA_VERSION, DISCLOSURE, PAGE_SIZE, MAX_ACTIVE_JOBS, MAX_REQUESTS_PER_DAY,
  DIRECTIONS, FAILURE_CATEGORIES, stableId, normalizeCapability, assertTestAdapterEnvironment,
  sanitizeRequest, safeBrief, normalizeModeration, encodeCursor, decodeCursor,
  deterministicTestAdapter, createGenerationService};

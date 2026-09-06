"use strict";

// Offline Story planning only. No provider client, deployment export or feed
// authority fallback. Meta eligibility/transport must be certified separately.
const crypto = require("node:crypto");
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const fail = code => { throw Error(code); };
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const provider = value => ["facebook", "instagram"].includes(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const instant = value => typeof value === "string" && Number.isFinite(Date.parse(value));

function paths(owner, channel) {
  if (!id(owner) || !provider(channel)) fail("story_context_invalid");
  return {authority: `socialStoryAuthorities/${owner}/providers/${channel}`,
    plans: "socialStoryPlans", versions: "socialStoryVersions", media: "socialStoryMediaRevisions",
    approvals: "socialStoryApprovals", jobs: "socialStoryJobs", receipts: "socialStoryReceipts",
    observations: "socialStoryObservations"};
}

function media(input) {
  if (!input || !id(input.owner) || !provider(input.provider) || !digest(input.sha256) ||
      !Array.isArray(input.sourceHashes) || !input.sourceHashes.length || !input.sourceHashes.every(digest) ||
      input.width !== 1080 || input.height !== 1920 || input.mime !== "image/jpeg" ||
      !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > 4 * 1024 * 1024 ||
      input.url !== `https://scaledcircle.com/social/${input.sha256}.jpg` ||
      !id(input.renditionRecipe) || input.intentionalRendition !== true) fail("story_media_invalid");
  // Conservative authoring safe area; not a claim about provider UI guarantees.
  const safe = input.textBounds;
  if (!safe || ![safe.x, safe.y, safe.width, safe.height].every(Number.isSafeInteger) ||
      safe.x < 80 || safe.y < 250 || safe.width <= 0 || safe.height <= 0 ||
      safe.x + safe.width > 1000 || safe.y + safe.height > 1670) fail("story_safe_area_invalid");
  const record = {surface: "story", owner: input.owner, provider: input.provider, sha256: input.sha256,
    sourceHashes: [...input.sourceHashes], width: input.width, height: input.height, mime: input.mime,
    bytes: input.bytes, url: input.url, renditionRecipe: input.renditionRecipe,
    intentionalRendition: true, textBounds: {...safe}};
  return {...record, id: `story_media_${hash(record)}`};
}

async function verifyFetch(revision, fetchImpl) {
  if (media(revision).id !== revision.id) fail("story_media_changed");
  const response = await fetchImpl(revision.url, {method: "GET", redirect: "error", signal: AbortSignal.timeout(20000)});
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== revision.mime) fail("story_media_unavailable");
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > revision.bytes) fail("story_media_changed");
    chunks.push(chunk);
  }
  if (length !== revision.bytes || crypto.createHash("sha256").update(Buffer.concat(chunks)).digest("hex") !== revision.sha256) fail("story_media_changed");
  return {mediaRevisionId: revision.id, anonymousFetchVerified: true};
}

function week(input) {
  if (!input || input.surface !== "story" || !id(input.owner) || !provider(input.provider) ||
      !id(input.accountId) || !instant(input.startsAt) || !instant(input.endsAt) ||
      Date.parse(input.endsAt) - Date.parse(input.startsAt) !== 7 * 86400000 ||
      input.timeZone !== "America/New_York" || !Array.isArray(input.items) || input.items.length !== 3) fail("story_week_invalid");
  const items = input.items.map(item => {
    if (!id(item.contentId) || item.surface !== "story" || item.version !== 1 ||
        typeof item.text !== "string" || !item.text.trim() || item.text.length > 600 ||
        !["product_authority", "business_value", "two_sided_model"].includes(item.pillar) ||
        !instant(item.scheduledFor) || Date.parse(item.scheduledFor) < Date.parse(input.startsAt) ||
        Date.parse(item.scheduledFor) >= Date.parse(input.endsAt) ||
        !["profile_text", "link_in_bio_text"].includes(item.ctaBehavior)) fail("story_item_invalid");
    if (media(item.media).id !== item.media.id || item.media.owner !== input.owner || item.media.provider !== input.provider) fail("story_media_changed");
    const record = {surface: "story", contentId: item.contentId, version: 1, text: item.text,
      pillar: item.pillar, scheduledFor: item.scheduledFor, ctaBehavior: item.ctaBehavior,
      mediaRevisionId: item.media.id, mediaHash: item.media.sha256};
    return {...record, versionId: `story_version_${hash(record)}`};
  });
  if (new Set(items.map(i => i.contentId)).size !== 3 || new Set(items.map(i => i.pillar)).size !== 3) fail("story_items_duplicate");
  const record = {surface: "story", owner: input.owner, provider: input.provider, accountId: input.accountId,
    startsAt: input.startsAt, endsAt: input.endsAt, timeZone: input.timeZone,
    classification: "INITIAL_EXPERIMENT", timingConfidence: "LOW", items};
  const d = hash(record);
  return {...record, digest: d, id: `story_plan_${d}`, executionEnabled: false};
}

// A draft digest is not approval. No approval issuer or provider executor is
// exported until the independent authority and Meta contracts are certified.
function draftJobs(plan) {
  const {id: planId, digest: d, executionEnabled, ...record} = plan;
  if (record.surface !== "story" || hash(record) !== d || planId !== `story_plan_${d}` || executionEnabled !== false) fail("story_plan_changed");
  return record.items.map(item => ({id: `story_job_${hash({planId, versionId: item.versionId})}`,
    surface: "story", owner: record.owner, provider: record.provider, accountId: record.accountId,
    planId, planDigest: d, versionId: item.versionId, mediaRevisionId: item.mediaRevisionId,
    mediaHash: item.mediaHash, scheduledFor: item.scheduledFor, approvalId: null,
    status: "draft", publishingEnabled: false}));
}

function recovery(step, now) {
  if (!Number.isFinite(now)) fail("story_clock_invalid");
  if (step?.started && !step.providerId) return "HOLD_UNKNOWN_OUTCOME";
  if (step?.expiresAt != null && (!Number.isFinite(step.expiresAt) || step.expiresAt <= now)) return "EXPIRED_NO_REPLACEMENT";
  if (step?.providerId) return "RECONCILE_KNOWN_ID";
  return "NOT_STARTED_NO_AUTHORITY";
}

function observation({job, receipt, evidence}) {
  if (job?.surface !== "story" || receipt?.surface !== "story" || evidence?.surface !== "story" ||
      receipt.jobId !== job.id || receipt.versionId !== job.versionId || receipt.mediaRevisionId !== job.mediaRevisionId ||
      receipt.provider !== job.provider || receipt.accountId !== job.accountId || !id(receipt.storyId) ||
      evidence.storyId !== receipt.storyId || evidence.accountId !== job.accountId || evidence.provider !== job.provider ||
      !instant(evidence.observedAt) || !instant(evidence.windowStart) || !instant(evidence.windowEnd) ||
      Date.parse(evidence.windowStart) > Date.parse(evidence.windowEnd) || !Array.isArray(evidence.metrics)) fail("story_observation_binding_invalid");
  const metrics = evidence.metrics.map(m => {
    if (!["views", "reach", "impressions", "interactions", "replies", "navigation", "exits", "link_actions", "profile_actions"].includes(m.name) ||
        !["OBSERVED", "NO_DATA", "UNAVAILABLE", "ERROR"].includes(m.status) ||
        (m.status === "OBSERVED" ? !Number.isSafeInteger(m.value) || m.value < 0 : m.value !== null) ||
        typeof m.providerMetric !== "string" || !m.providerMetric || !["lifetime", "day", "total_value"].includes(m.period)) fail("story_metric_invalid");
    return {...m};
  });
  if (new Set(metrics.map(m => m.name)).size !== metrics.length) fail("story_metric_duplicate");
  return {surface: "story", jobId: job.id, versionId: job.versionId, mediaRevisionId: job.mediaRevisionId,
    provider: job.provider, accountId: job.accountId, storyId: receipt.storyId,
    observedAt: evidence.observedAt, windowStart: evidence.windowStart, windowEnd: evidence.windowEnd,
    metrics, cadenceDecision: "HOLD_PENDING_REVIEW"};
}

module.exports = {paths, media, verifyFetch, week, draftJobs, recovery, observation};

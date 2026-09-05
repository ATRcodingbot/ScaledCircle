"use strict";

const crypto = require("node:crypto");
const social = require("./social_operations");
const MODES = Object.freeze(["observe", "draft", "approval_required", "bounded_managed"]);
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (code) => { throw new Error(code); };
const iso = (value) => {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) fail("growth_date_invalid");
  return date.toISOString();
};

// Bind the actual reviewed version, including every platform/media/CTA field.
// This does not replace canonical content records or authorize provider calls.
function contentBinding({id, record}, businessUid) {
  if (!id || record?.businessUid !== businessUid || !record.contentHash ||
      ["published", "canceled"].includes(record.status) ||
      !Number.isSafeInteger(record.version) || record.version < 1 ||
      !Array.isArray(record.variants) || !record.variants.length) fail("growth_content_invalid");
  if (new Set(record.variants.map((variant) => variant.provider)).size !== record.variants.length) fail("growth_duplicate_platform_version");
  const binding = {versionId: id, version: record.version, contentHash: record.contentHash,
    scheduledFor: iso(record.scheduledFor), goal: record.goal || "", pillar: record.pillar || "",
    variants: record.variants.map(social.platformVariant)};
  return {...binding, bindingHash: hash(binding)};
}

function cycle({businessUid, planId, strategy, versions, startsAt, endsAt, providerAccounts = {},
  timeZone, mode = "approval_required", now = Date.now()}) {
  if (!businessUid || !planId || !MODES.includes(mode)) fail("growth_context_invalid");
  new Intl.DateTimeFormat("en", {timeZone}).format();
  const start = iso(startsAt), end = iso(endsAt);
  const duration = Date.parse(end) - Date.parse(start);
  if (duration < 29 * 86400000 || duration > 31 * 86400000) fail("growth_cycle_window_invalid");
  const boundedTextList = (values) => Array.isArray(values) && values.length > 0 && values.length <= 20 &&
    values.every((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 500);
  if (!strategy || !boundedTextList(strategy.themes) || !boundedTextList(strategy.objectives) ||
      (strategy.audience != null && (typeof strategy.audience !== "string" || strategy.audience.length > 500)) ||
      (strategy.channelMix != null && (!Array.isArray(strategy.channelMix) || strategy.channelMix.length > 4 ||
        strategy.channelMix.some((provider) => !social.PROVIDERS.includes(provider))))) fail("growth_strategy_required");
  if (!Array.isArray(versions) || !versions.length || versions.length > 60) fail("growth_content_required");
  const items = versions.map((version) => contentBinding(version, businessUid))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.versionId.localeCompare(b.versionId));
  if (new Set(items.map((item) => item.versionId)).size !== items.length ||
      items.some((item) => item.scheduledFor < start || item.scheduledFor >= end)) fail("growth_content_window_invalid");
  for (const [provider, account] of Object.entries(providerAccounts)) {
    if (!social.PROVIDERS.includes(provider) || !account?.providerUserId || !account?.handle) fail("growth_account_invalid");
  }
  const canonical = {businessUid, planId, startsAt: start, endsAt: end, timeZone, mode, providerAccounts,
    strategy: {themes: strategy.themes, objectives: strategy.objectives,
      audience: strategy.audience || null, channelMix: strategy.channelMix || [],
      timingConfidence: "NO_DATA"}, items};
  const digest = hash(canonical);
  return {id: `growth_cycle_${digest}`, ...canonical, digest, status: "draft",
    schemaVersion: "SocialGrowthCycleV1", externalPublishingEnabled: false, createdAt: now};
}

function approval({record, businessUid, expectedDigest, versionIds, windowStart, windowEnd,
  now = Date.now()}) {
  if (record?.businessUid !== businessUid || record.digest !== expectedDigest ||
      record.mode !== "approval_required") fail("growth_approval_required");
  const start = iso(windowStart), end = iso(windowEnd);
  // Explicit ISO boundaries retain DST-aware weekly windows supplied by the owner.
  if (start < record.startsAt || end > record.endsAt || end <= start ||
      Date.parse(end) - Date.parse(start) > 7 * 86400000 + 3600000) fail("growth_week_invalid");
  if (!Array.isArray(versionIds) || !versionIds.length || new Set(versionIds).size !== versionIds.length) fail("growth_selection_invalid");
  const items = versionIds.map((id) => record.items.find((item) => item.versionId === id));
  if (items.some((item) => !item || item.scheduledFor < start || item.scheduledFor >= end ||
      Date.parse(item.scheduledFor) <= now)) fail("growth_selection_invalid");
  const binding = {cycleId: record.id, cycleDigest: record.digest, businessUid,
    windowStart: start, windowEnd: end, providerAccounts: record.providerAccounts || {},
    items: items.sort((a, b) => a.versionId.localeCompare(b.versionId))};
  return {id: `growth_approval_${hash(binding)}`, ...binding, approvedByUid: businessUid,
    approvedAt: now, approvalClass: items.length === 1 ? "single_post" : "bounded_week",
    externalPublishingEnabled: false};
}

function jobs(approved) {
  return approved.items.flatMap((item) => item.variants.map((variant) => {
    // A second approval or a rescheduled cycle cannot create a second job for
    // the same immutable platform version. Changed schedule needs new content.
    const key = {businessUid: approved.businessUid, versionId: item.versionId, provider: variant.provider};
    return {id: `social_growth_job_${hash(key)}`, ...key, approvalId: approved.id,
      binding: item, bindingHash: item.bindingHash, scheduledFor: item.scheduledFor,
      status: "approved", externalPublishingEnabled: false};
  }));
}

function publicationGate({job, connection, supervisor, authority, now = Date.now()}) {
  if (supervisor?.killSwitchActive !== false) return "supervisor_paused";
  if (authority?.externalPublishingEnabled !== true || authority?.reviewed !== true ||
      authority.businessUid !== job.businessUid || authority.mode !== "approval_required") return "authority_pending";
  if (job.provider !== "x") return "provider_not_certified";
  if (connection?.status !== "connected_write" || connection?.tokenHealth !== "healthy") return "reconnect";
  if (!authority.providerUserId || connection?.businessUid !== job.businessUid ||
      !social.xConnectionCapabilities(connection, {expectedProviderUserId: authority.providerUserId}).canWrite) return "reconnect";
  const expected = ["users.read", "tweet.read", "offline.access", "tweet.write", "media.write"].sort();
  if (JSON.stringify([...new Set(connection.grantedScopes || [])].sort()) !== JSON.stringify(expected)) return "scope_mismatch";
  if (!Number.isFinite(Date.parse(job.scheduledFor)) || !Number.isFinite(now)) return "schedule_invalid";
  if (Date.parse(job.scheduledFor) > now) return "not_due";
  if (now - Date.parse(job.scheduledFor) > 15 * 60000) return "schedule_expired";
  return "ready";
}

// Source candidate only: no transport, timer or production export calls this.
// Claim must be durable; a reclaimed send always reconciles and never resends.
async function executeCandidate({store, adapter, jobId, context}) {
  const job = await store.get(jobId);
  if (!job) fail("growth_job_missing");
  const live = await context(job);
  const gate = publicationGate({job, ...live});
  if (job.sendStarted) {
    // Reconciliation is read-only and remains possible after a schedule expires
    // or the Supervisor pauses publication. Account ownership still applies.
    if (job.provider !== "x" || !live.authority?.providerUserId || live.connection?.businessUid !== job.businessUid ||
        !social.xConnectionCapabilities(live.connection, {expectedProviderUserId: live.authority.providerUserId}).canReadInsights) return {status: "reconnect"};
  } else if (gate !== "ready") return {status: gate};
  const claimed = await store.claim(jobId);
  if (!claimed) return {status: "busy_or_terminal"};
  if (claimed.sendStarted) {
    try {
      const receipt = await adapter.reconcile(claimed);
      if (!receipt) return store.attention(claimed, "unknown_provider_outcome");
      await adapter.verifyReceipt(claimed, receipt);
      return store.complete(claimed, receipt);
    } catch (_) { return store.attention(claimed, "unknown_provider_outcome"); }
  }
  // Recheck the live Supervisor and authority immediately before marking send.
  const latestGate = publicationGate({job: claimed, ...await context(claimed)});
  if (latestGate !== "ready") return store.attention(claimed, latestGate);
  await adapter.verifyApprovedAssets(claimed);
  // Asset verification can involve slow I/O. Recheck after it, not only before.
  const sendGate = publicationGate({job: claimed, ...await context(claimed)});
  if (sendGate !== "ready") return store.attention(claimed, sendGate);
  const started = await store.markSendStarted(claimed);
  try {
    const receipt = await adapter.create(started);
    await adapter.verifyReceipt(started, receipt);
    return store.complete(started, receipt);
  } catch (_) { return store.attention(started, "unknown_provider_outcome"); }
}

function createStore(db, now = Date.now, beforeSend = null) {
  const ref = (id) => db.collection("socialGrowthCycles").doc(id);
  const jobRef = (id) => db.collection("socialGrowthJobs").doc(id);
  async function checkApproval(tx, current) {
    const approved = (await tx.get(db.collection("socialGrowthApprovals").doc(current.approvalId))).data();
    if (!approved || approved.revokedAt != null || approved.businessUid !== current.businessUid ||
        approved.approvedByUid !== current.businessUid ||
        !Array.isArray(approved.items) || !approved.items.some((item) =>
          item.versionId === current.versionId && item.bindingHash === current.bindingHash &&
          hash(item) === hash(current.binding))) fail("growth_approval_required");
    const canonical = (await tx.get(db.collection("socialContentVersions").doc(current.versionId))).data();
    if (contentBinding({id: current.versionId, record: canonical}, current.businessUid).bindingHash !== current.bindingHash) {
      fail("growth_content_changed");
    }
    const quality = (await tx.get(db.collection("socialContentQualityAssessments").doc(current.versionId))).data();
    if (quality?.businessUid !== current.businessUid || quality.readyToPublish !== true ||
        quality.immutableSourceHash !== current.binding.contentHash) fail("growth_quality_review_required");
  }
  async function update(claim, patch, receipt = null) {
    return db.runTransaction(async (tx) => {
      const current = (await tx.get(jobRef(claim.id))).data();
      if (!current || current.generation !== claim.generation || current.status === "published") fail("growth_stale_claim");
      if (patch.sendStarted === true) {
        if (current.sendStarted || current.leaseUntil <= now()) fail("growth_stale_claim");
        await checkApproval(tx, current);
        if (beforeSend) await beforeSend(tx, current);
      }
      const updated = {...current, ...patch, generation: current.generation + 1};
      if (receipt) {
        if (!receipt.providerPostId || !receipt.providerPostUrl || !receipt.contentHash) fail("growth_receipt_invalid");
        tx.create(jobRef(claim.id).collection("receipts").doc("publication"), {
          providerPostId: receipt.providerPostId, providerPostUrl: receipt.providerPostUrl,
          contentHash: receipt.contentHash, observedAt: now()});
      }
      tx.set(jobRef(claim.id), updated);
      tx.create(jobRef(claim.id).collection("audit").doc(String(updated.generation)), {
        status: updated.status, at: now(), generation: updated.generation});
      return updated;
    });
  }
  return {
    async get(id) { return (await jobRef(id).get()).data(); },
    async claim(id) {
      return db.runTransaction(async (tx) => {
        const current = (await tx.get(jobRef(id))).data();
        if (!current || ["published", "canceled"].includes(current.status) || current.leaseUntil > now()) return null;
        // Once a send starts, revocation must not prevent read-only receipt
        // recovery. It still never grants permission for a second create.
        if (!current.sendStarted) await checkApproval(tx, current);
        const next = {...current, generation: (current.generation || 0) + 1, leaseUntil: now() + 120000};
        tx.set(jobRef(id), next);
        tx.create(jobRef(id).collection("audit").doc(String(next.generation)), {
          status: "claimed", at: now(), generation: next.generation});
        return next;
      });
    },
    markSendStarted(claim) { return update(claim, {sendStarted: true, sendStartedAt: now(), status: "unknown_provider_outcome"}); },
    attention(claim, status) { return update(claim, {status, leaseUntil: 0}); },
    complete(claim, receipt) { return update(claim, {status: "published", leaseUntil: 0}, receipt); },
    async save(record) {
      return db.runTransaction(async (tx) => {
        const prior = await tx.get(ref(record.id));
        if (prior.exists) {
          if (prior.data().digest !== record.digest) fail("growth_cycle_conflict");
          return prior.data();
        }
        tx.create(ref(record.id), record); return record;
      });
    },
    async approve(input) {
      return db.runTransaction(async (tx) => {
        const record = (await tx.get(ref(input.cycleId))).data();
        const approved = approval({...input, record});
        // Read every canonical version within the transaction: approval cannot
        // race a replacement, media/CTA edit, or changed schedule.
        for (const item of approved.items) {
          const current = await tx.get(db.collection("socialContentVersions").doc(item.versionId));
          if (contentBinding({id: item.versionId, record: current.data()}, input.businessUid).bindingHash !== item.bindingHash) {
            fail("growth_content_changed");
          }
          const quality = (await tx.get(db.collection("socialContentQualityAssessments").doc(item.versionId))).data();
          if (quality?.businessUid !== input.businessUid || quality.readyToPublish !== true ||
              quality.immutableSourceHash !== item.contentHash) fail("growth_quality_review_required");
        }
        const approvalRef = db.collection("socialGrowthApprovals").doc(approved.id);
        const previous = await tx.get(approvalRef);
        const planned = jobs(approved);
        const existing = await Promise.all(planned.map((job) => tx.get(db.collection("socialGrowthJobs").doc(job.id))));
        existing.forEach((snapshot, index) => {
          if (snapshot.exists && snapshot.data().bindingHash !== planned[index].bindingHash) fail("growth_job_conflict");
        });
        if (!previous.exists) tx.create(approvalRef, approved);
        planned.forEach((job, index) => {
          if (!existing[index].exists) tx.create(db.collection("socialGrowthJobs").doc(job.id), job);
        });
        return {approvalId: approved.id, jobIds: planned.map((job) => job.id), externalPublishingEnabled: false};
      });
    },
  };
}

module.exports = {MODES, hash, contentBinding, cycle, approval, jobs, publicationGate, executeCandidate, createStore};

"use strict";

// Shared durable substeps for multi-request providers. These are children of the
// existing growth job, not a second planning/approval system. No network export.
const {hash} = require("./social_growth_cycle");
const fail = code => { throw new Error(code); };
function descriptor(job, input) {
  if (!job?.id || !job.businessUid || !job.bindingHash || !input?.key ||
      !/^[a-z0-9:_-]{1,100}$/.test(input.key) || !["facebook", "instagram"].includes(job.provider) ||
      !["photo", "text", "child", "parent", "publish"].includes(input.kind) ||
      !/^[a-f0-9]{64}$/.test(input.requestHash || "")) fail("provider_step_invalid");
  const binding = {jobId: job.id, businessUid: job.businessUid, provider: job.provider,
    bindingHash: job.bindingHash, key: input.key, kind: input.kind, requestHash: input.requestHash};
  return {...binding, id: hash({jobId: job.id, key: input.key})};
}

function createStepStore(db, {authorize, now = Date.now} = {}) {
  // Mandatory transaction authorization rechecks owner, immutable approval,
  // selected account, current credential pointer, scopes and Supervisor.
  if (typeof authorize !== "function") fail("provider_step_authority_required");
  const parent = step => db.collection("socialGrowthJobs").doc(step.jobId);
  const ref = step => parent(step).collection("providerSteps").doc(step.id);
  function validate(step) {
    const expected = descriptor({...step, id: step.jobId}, step);
    if (expected.id !== step.id) fail("provider_step_invalid");
  }
  async function currentJob(tx, step, action) {
    const job = (await tx.get(parent(step))).data();
    if (!job || job.businessUid !== step.businessUid || job.provider !== step.provider ||
        job.bindingHash !== step.bindingHash) fail("provider_step_job_changed");
    await authorize(tx, job, action);
  }
  return {
    async begin(step) {
      validate(step);
      return db.runTransaction(async tx => {
        const prior = (await tx.get(ref(step))).data();
        await currentJob(tx, step, prior ? "reconcile" : "create");
        if (prior && ["jobId", "businessUid", "provider", "bindingHash", "key", "kind", "requestHash"].some(key => prior[key] !== step[key])) fail("provider_step_changed");
        if (prior?.receipt) return {mode: "received", record: prior};
        if (prior?.leaseUntil > now()) return {mode: "busy"};
        const next = {...step, startedAt: prior?.startedAt ?? now(), generation: (prior?.generation || 0) + 1,
          leaseUntil: now() + 120000, state: "unknown"};
        tx.set(ref(step), next);
        tx.create(ref(step).collection("audit").doc(String(next.generation)), {action: prior ? "reconcile_claim" : "send_claim", at: now()});
        return {mode: prior ? "reconcile" : "create", record: next};
      });
    },
    async finish(claim, receipt) {
      validate(claim);
      if (!/^\d+(?:_\d+)?$/.test(receipt?.id || "") ||
          !["RECEIVED", "FINISHED", "PUBLISHED"].includes(receipt.status) ||
          Object.keys(receipt).some(key => !["id", "status"].includes(key))) fail("provider_step_receipt_invalid");
      return db.runTransaction(async tx => {
        const prior = (await tx.get(ref(claim))).data();
        await currentJob(tx, claim, "reconcile");
        if (!prior || prior.generation !== claim.generation || prior.receipt ||
            prior.requestHash !== claim.requestHash) fail("provider_step_stale");
        tx.update(ref(claim), {receipt, state: "received", leaseUntil: 0, completedAt: now()});
        tx.create(ref(claim).collection("receipts").doc("provider"), {...receipt, observedAt: now()});
        return receipt;
      });
    },
  };
}

async function executeStep({store, step, create, reconcile, verify}) {
  const claim = await store.begin(step);
  if (claim.mode === "busy") return {status: "busy"};
  if (claim.mode === "received") {
    // Re-read provider status/identity before reusing containers: a stored ID
    // alone does not prove FINISHED, unexpired or published.
    await verify(claim.record.receipt);
    return {status: "received", receipt: claim.record.receipt};
  }
  try {
    const receipt = claim.mode === "create" ? await create() : await reconcile(claim.record);
    if (!receipt) return {status: "needs_attention"};
    await verify(receipt);
    return {status: "received", receipt: await store.finish(claim.record, receipt)};
  } catch (_) {
    // The durable unknown marker remains. No automatic re-create even after
    // lease expiry, provider deletion, missing results or container expiration.
    return {status: "needs_attention"};
  }
}
module.exports = {descriptor, createStepStore, executeStep};

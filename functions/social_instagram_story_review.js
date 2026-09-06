"use strict";

// Deliberately has no provider client, credentials, approval issuer or sender.
const {isDeepStrictEqual: equal} = require("node:util");
const model = require("./social_story_model");
const bindingKeys = ["id", "surface", "owner", "provider", "accountId", "planId", "planDigest",
  "versionId", "mediaRevisionId", "mediaHash", "scheduledFor"];

function documents({plan, assets}) {
  const jobs = model.draftJobs(plan);
  if (plan.provider !== "instagram" || assets.length !== 3) throw Error("story_review_invalid");
  const media = assets.map(a => a.media || a);
  const out = {[`socialStoryPlans/${plan.id}`]: plan};
  for (const [i, job] of jobs.entries()) {
    const revision = media.find(m => m.id === job.mediaRevisionId);
    if (!revision || model.media(revision).id !== job.mediaRevisionId || revision.sha256 !== job.mediaHash) throw Error("story_review_media_changed");
    out[`socialStoryMediaRevisions/${revision.id}`] = revision;
    out[`socialStoryVersions/${job.versionId}`] = plan.items[i];
    out[`socialStoryJobs/${job.id}`] = {...job, status: "ready_for_review", approvalRequired: true,
      measurement: {surface: "story", versionId: job.versionId, mediaRevisionId: job.mediaRevisionId,
        providerIdSource: "verified_receipt_only", offsetsHours: [1, 23], availabilityHours: 24,
        metrics: ["views", "reach", "replies"], expiredStatus: "UNAVAILABLE", learning: "HOLD_PENDING_REVIEW"}};
  }
  out[model.paths(plan.owner, "instagram").authority] = {surface: "story", owner: plan.owner,
    provider: "instagram", planId: plan.id, planDigest: plan.digest, jobIds: jobs.map(j => j.id),
    approvalId: null, publishingEnabled: false, killSwitchActive: true};
  return out;
}

async function prepare(db, candidate) {
  const expected = documents(candidate);
  return db.runTransaction(async tx => {
    const entries = Object.entries(expected), old = await Promise.all(entries.map(([p]) => tx.get(db.doc(p))));
    for (let i = 0; i < entries.length; i++) if (old[i].exists && !equal(old[i].data(), entries[i][1])) throw Error("story_review_existing_changed");
    for (let i = 0; i < entries.length; i++) if (!old[i].exists) tx.create(db.doc(entries[i][0]), entries[i][1]);
    return {planId: candidate.plan.id, jobIds: model.draftJobs(candidate.plan).map(j => j.id), created: old.filter(s => !s.exists).length};
  });
}

function decision({plan, job, media, version, health, authority, approval}) {
  const expected = model.draftJobs(plan).find(j => j.id === job?.id);
  if (!expected || bindingKeys.some(k => expected[k] !== job[k]) ||
      !equal(version, plan.items.find(i => i.versionId === job.versionId)) ||
      !media || model.media(media).id !== job.mediaRevisionId || media.sha256 !== job.mediaHash) throw Error("story_binding_changed");
  const holds = [];
  if (!job.approvalId || !approval) holds.push("APPROVAL_REQUIRED");
  // No provided approval can activate this review-only deployment.
  if (health?.killSwitchActive !== false) holds.push("GLOBAL_STOP");
  if (authority?.surface !== "story" || authority.owner !== job.owner || authority.provider !== "instagram" ||
      authority.planDigest !== plan.digest || !equal(authority.jobIds, model.draftJobs(plan).map(j => j.id)) ||
      authority.killSwitchActive !== false) holds.push("STORY_PAUSED");
  if (authority?.publishingEnabled !== true) holds.push("PUBLISHING_DISABLED");
  holds.push("DEPLOYMENT_CREATE_DISABLED");
  return {jobId: job.id, state: "HELD", holds, providerCreates: 0};
}

async function inspect(db, planId) {
  const read = async p => (await db.doc(p).get()).data();
  const plan = await read(`socialStoryPlans/${planId}`);
  const expected = model.draftJobs(plan);
  const [health, authority] = await Promise.all([read(`agentHealth/${plan.owner}`), read(model.paths(plan.owner, "instagram").authority)]);
  const rows = [], rehearsal = [];
  for (const e of expected) {
    const [job, media, version] = await Promise.all([read(`socialStoryJobs/${e.id}`), read(`socialStoryMediaRevisions/${e.mediaRevisionId}`), read(`socialStoryVersions/${e.versionId}`)]);
    const approval = job?.approvalId ? await read(`socialStoryApprovals/${job.approvalId}`) : null;
    const context = {plan, job, media, version, health, authority, approval};
    rows.push(decision(context));
    const denied = change => {try {decision({...context, job: {...job, ...change}}); return false;} catch {return true;}};
    rehearsal.push({jobId: e.id, wrongVersionDenied: denied({versionId: "wrong"}), wrongIdentityDenied: denied({accountId: "0"}),
      wrongHashDenied: denied({mediaHash: "0".repeat(64)}), globalStopHeld: decision({...context, health: {killSwitchActive: true}}).holds.includes("GLOBAL_STOP"),
      unknownOutcome: model.recovery({started: true}, Date.now()), knownContainer: model.recovery({started: true, providerId: "fixture"}, Date.now())});
  }
  return {surface: "story", planId, planDigest: plan.digest, deploymentCreateEnabled: false, secretBindings: [],
    supervisorStopped: health?.killSwitchActive !== false, channelPaused: authority?.killSwitchActive !== false,
    jobs: rows, rehearsal, providerCreates: 0, rehearsalMode: "actual_jobs_with_in_memory_negative_cases"};
}
module.exports = {documents, prepare, decision, inspect};

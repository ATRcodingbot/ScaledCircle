"use strict";
const growth = require("./social_growth_cycle");
const social = require("./social_operations");
const reporting = require("./social_growth_reporting");
const available = value => Number.isSafeInteger(value) && value >= 0 ? {status: "AVAILABLE", value} : {status: "UNAVAILABLE", value: null};

function plan(approval) {
  if (!approval?.id || !approval.businessUid || approval.approvedByUid !== approval.businessUid ||
      approval.revokedAt != null || approval.items?.length !== 3 || !approval.providerAccounts?.x?.providerUserId) throw new Error("measurement_approval_required");
  const publishingJobs = growth.jobs(approval);
  if (publishingJobs.length !== 3 || publishingJobs.some(job => job.provider !== "x")) throw new Error("measurement_plan_invalid");
  const dates = [{kind: "starting_baseline", at: approval.windowStart},
    ...[...publishingJobs].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).map((job, index) => ({
      kind: `post_${index + 1}_24h`, at: new Date(Date.parse(job.scheduledFor) + 86400000).toISOString()})),
    {kind: "week_end", at: new Date(Date.parse(approval.windowEnd) + 10 * 3600000).toISOString()}];
  return dates.map(({kind, at}) => ({id: `growth_measurement_${growth.hash({approvalId: approval.id, kind, at})}`,
    businessUid: approval.businessUid, approvalId: approval.id, cycleId: approval.cycleId,
    kind, scheduledFor: at, status: "pending", attempts: 0,
    publicationJobIds: publishingJobs.map(job => job.id)}));
}

async function collect({job, identity, postBindings, accessToken, fetchImpl = globalThis.fetch, now = Date.now()}) {
  if (!/^\d{1,20}$/.test(identity?.providerUserId || "") || postBindings.length > 3 ||
      postBindings.some(item => !/^\d{1,20}$/.test(item.providerPostId || ""))) throw new Error("measurement_identity_invalid");
  async function read(path) {
    const response = await fetchImpl(`https://api.x.com/2/${path}`, {method: "GET", redirect: "error",
      signal: AbortSignal.timeout(20000), headers: {Authorization: `Bearer ${accessToken}`}});
    if (!response.ok) throw new Error("measurement_provider_unavailable");
    return response.json();
  }
  const user = (await read("users/me?user.fields=public_metrics")).data;
  if (user?.id !== identity.providerUserId || user?.username !== identity.handle) throw new Error("measurement_identity_mismatch");
  const observedAt = new Date(now).toISOString();
  const followers = available(user.public_metrics?.followers_count);
  const observations = [reporting.observation({id: `${job.id}_followers`, businessUid: job.businessUid,
    provider: "x", metric: "followers", definition: "provider_followers_total", sourceRef: identity.providerUserId,
    evidenceClass: "provider_reported", measurement: "snapshot", observedAt, ...followers})];
  let rows = [];
  if (postBindings.length) {
    const body = await read(`tweets?ids=${postBindings.map(item => item.providerPostId).join(",")}&tweet.fields=author_id,public_metrics`);
    rows = body.data || [];
    if (!Array.isArray(rows) || rows.some(row => row.author_id !== identity.providerUserId ||
        !postBindings.some(binding => binding.providerPostId === row.id))) throw new Error("measurement_post_identity_mismatch");
  }
  const posts = postBindings.map(binding => {
    const metrics = rows.find(row => row.id === binding.providerPostId)?.public_metrics;
    const impressions = available(metrics?.impression_count);
    const counts = ["like_count", "retweet_count", "reply_count", "quote_count"].map(key => metrics?.[key]);
    const engagements = available(counts.every(value => Number.isSafeInteger(value) && value >= 0) ? counts.reduce((a,b) => a+b, 0) : null);
    for (const [metric, value] of Object.entries({impressions, engagements})) observations.push(reporting.observation({
      id: `${job.id}_${binding.providerPostId}_${metric}`, businessUid: job.businessUid, provider: "x", metric,
      definition: `provider_post_lifetime_${metric}`, sourceRef: binding.providerPostId, contentVersionId: binding.versionId,
      evidenceClass: "provider_reported", measurement: "cumulative", observedAt, ...value}));
    return {...binding, impressions, engagements, engagementRate: impressions.status === "AVAILABLE" && impressions.value > 0 && engagements.status === "AVAILABLE" ?
      {status: "AVAILABLE", value: engagements.value / impressions.value, denominator: "lifetime_impressions"} : {status: "UNAVAILABLE", value: null}};
  });
  return {schemaVersion: "SocialGrowthMeasurementSnapshotV1", id: job.id, businessUid: job.businessUid,
    approvalId: job.approvalId, cycleId: job.cycleId, kind: job.kind, observedAt,
    account: {providerUserId: identity.providerUserId, followers, postCount: available(user.public_metrics?.tweet_count)},
    posts, observations, reach: {status: "UNAVAILABLE", value: null}, profileActivity: {status: "UNAVAILABLE", value: null},
    traffic: {status: "NO_DATA", value: null}, leads: {status: "NO_DATA", value: null}, conversions: {status: "NO_DATA", value: null}};
}

function createCollector({db, credentials, fetchImpl, now = Date.now}) {
  return async id => {
    const ref = db.collection("socialGrowthMeasurementJobs").doc(id);
    const claim = await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (!current || ["completed", "failed"].includes(current.status) || Date.parse(current.scheduledFor) > now() ||
          current.leaseUntil > now() || current.nextAttemptAt > now()) return null;
      if (current.attempts >= 2) { tx.update(ref, {status: "failed"}); return null; }
      const next = {...current, attempts: current.attempts + 1, leaseUntil: now() + 120000, status: "reading"};
      tx.set(ref, next); return next;
    });
    if (!claim) return;
    try {
      const approval = (await db.doc(`socialGrowthApprovals/${claim.approvalId}`).get()).data();
      const expected = plan(approval).find(job => job.id === id);
      if (!expected || expected.businessUid !== claim.businessUid || expected.cycleId !== claim.cycleId ||
          expected.kind !== claim.kind || expected.scheduledFor !== claim.scheduledFor ||
          JSON.stringify(expected.publicationJobIds) !== JSON.stringify(claim.publicationJobIds)) throw new Error("measurement_binding_changed");
      const connection = (await db.doc(`socialConnections/${claim.businessUid}/providers/x`).get()).data();
      const identity = approval.providerAccounts.x;
      if (!social.xConnectionCapabilities(connection, {expectedProviderUserId: identity.providerUserId}).canReadInsights) throw new Error("measurement_reconnect_required");
      const postBindings = [];
      for (const publicationId of claim.publicationJobIds) {
        const job = (await db.doc(`socialGrowthJobs/${publicationId}`).get()).data();
        if (job?.businessUid !== claim.businessUid || job.approvalId !== claim.approvalId) throw new Error("measurement_binding_changed");
        const receipt = (await db.doc(`socialGrowthJobs/${publicationId}/receipts/publication`).get()).data();
        if (job.status === "published" && receipt) {
          if (receipt.contentHash !== job.binding.contentHash) throw new Error("measurement_receipt_mismatch");
          postBindings.push({providerPostId: receipt.providerPostId, versionId: job.versionId});
        }
      }
      const session = await credentials(claim, identity);
      const snapshot = await collect({job: claim, identity, postBindings, accessToken: session.accessToken, fetchImpl, now: now()});
      await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.attempts !== claim.attempts || current.status !== "reading") throw new Error("measurement_stale_claim");
        tx.create(db.doc(`socialGrowthMeasurementSnapshots/${id}`), snapshot);
        tx.update(ref, {status: "completed", leaseUntil: 0, completedAt: now()});
      });
    } catch (_) {
      await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.attempts !== claim.attempts || current.status !== "reading") return;
        tx.update(ref, {status: claim.attempts >= 2 ? "failed" : "pending", leaseUntil: 0,
          nextAttemptAt: now() + 30 * 60000, lastFailure: "measurement_unavailable"});
      });
    }
  };
}
module.exports = {plan, collect, createCollector};

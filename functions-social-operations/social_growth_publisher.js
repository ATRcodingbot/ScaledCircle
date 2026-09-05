"use strict";
const growth = require("./social_growth_cycle");
const x = require("./social_x_publisher");
const entitlements = require("./subscription_entitlements");

function environment(project) {
  if (project === "scaled-circle") return "production";
  if (project === "scaledcircle-staging") return "staging";
  throw new Error("growth_runtime_unavailable");
}

// Dedicated Social Supervisor: enabling one exact approval never enables other
// agent actions. An existing global kill switch always takes precedence.
function contextFromRecords({job, state, globalHealth, connection, user, subscription, project, now}) {
  const env = environment(project);
  const eligible = user?.role === "admin" || (user?.role === "business" &&
    entitlements.hasActiveScaleEntitlement(subscription));
  const valid = state?.schemaVersion === "SocialPublisherSupervisorV1" &&
    state.businessUid === job.businessUid && state.environment === env && eligible &&
    state.approvalId === job.approvalId && Array.isArray(state.jobIds) &&
    state.jobIds.length > 0 && state.jobIds.length <= 3 && state.jobIds.includes(job.id) &&
    connection?.environment === env && connection.tokenHealth === "healthy" && connection.handle === state.handle;
  return {now, supervisor: {killSwitchActive: !valid || state.killSwitchActive !== false ||
      state.supervisorStatus !== "healthy" || globalHealth?.killSwitchActive === true},
    authority: valid ? state : null,
    // Ownership comes from the server-selected document path, not client input.
    connection: connection ? {...connection, businessUid: job.businessUid} : null};
}

function createPublisher({db, project, credentials, fetchImpl, now = Date.now}) {
  environment(project);
  const stateRef = (uid) => db.collection("socialPublishingAuthorities").doc(uid);
  async function context(job, tx = null) {
    const read = (ref) => tx ? tx.get(ref) : ref.get();
    const refs = [stateRef(job.businessUid), db.doc(`agentHealth/${job.businessUid}`),
      db.doc(`socialConnections/${job.businessUid}/providers/x`), db.doc(`users/${job.businessUid}`),
      db.doc(`businessSubscriptions/${job.businessUid}`)];
    const [state, globalHealth, connection, user, subscription] = (await Promise.all(refs.map(read))).map(s => s.data());
    return contextFromRecords({job, state, globalHealth, connection, user, subscription, project, now: now()});
  }
  const store = growth.createStore(db, now, async (tx, job) => {
    if (growth.publicationGate({job, ...await context(job, tx)}) !== "ready") throw new Error("growth_send_not_authorized");
  });
  return {
    context,
    async prepare(businessUid) {
      return db.runTransaction(async tx => {
        const ref = stateRef(businessUid), prior = await tx.get(ref);
        if (prior.exists) return {prepared: true, paused: prior.data().killSwitchActive !== false};
        tx.create(ref, {schemaVersion: "SocialPublisherSupervisorV1", businessUid,
          environment: environment(project), supervisorStatus: "healthy", killSwitchActive: true,
          mode: "approval_required", reviewed: true, externalPublishingEnabled: false,
          approvalId: null, jobIds: [], createdAt: now()});
        return {prepared: true, paused: true};
      });
    },
    async activate({businessUid, approvalId}) {
      if (!/^growth_approval_[a-f0-9]{64}$/.test(approvalId || "")) throw new Error("growth_approval_required");
      return db.runTransaction(async tx => {
        const [approvedSnapshot, stateSnapshot, connectionSnapshot, globalSnapshot, userSnapshot, subscriptionSnapshot] = await Promise.all([
          tx.get(db.doc(`socialGrowthApprovals/${approvalId}`)), tx.get(stateRef(businessUid)),
          tx.get(db.doc(`socialConnections/${businessUid}/providers/x`)), tx.get(db.doc(`agentHealth/${businessUid}`)),
          tx.get(db.doc(`users/${businessUid}`)), tx.get(db.doc(`businessSubscriptions/${businessUid}`))]);
        const approved = approvedSnapshot.data(), state = stateSnapshot.data(), connection = connectionSnapshot.data();
        if (!state || state.schemaVersion !== "SocialPublisherSupervisorV1" || state.businessUid !== businessUid ||
            !approved || approved.businessUid !== businessUid || approved.approvedByUid !== businessUid ||
            approved.revokedAt != null || globalSnapshot.data()?.killSwitchActive === true ||
            !Array.isArray(approved.items) || approved.items.length < 1 || approved.items.length > 3) throw new Error("growth_approval_required");
        const planned = growth.jobs(approved);
        if (planned.length !== approved.items.length || planned.some(job => job.provider !== "x" ||
            Date.parse(job.scheduledFor) <= now())) throw new Error("growth_selection_invalid");
        const identity = approved.providerAccounts?.x;
        if (!identity?.providerUserId || !identity?.handle || connection?.providerUserId !== identity.providerUserId ||
            connection?.handle !== identity.handle) throw new Error("growth_identity_mismatch");
        const next = {...state, environment: environment(project), supervisorStatus: "healthy",
          reviewed: true, mode: "approval_required", killSwitchActive: false, externalPublishingEnabled: true,
          providerUserId: identity.providerUserId, handle: identity.handle,
          approvalId, jobIds: planned.map(job => job.id), activatedAt: now()};
        for (const job of planned) {
          x.approvedText(job);
          const existing = (await tx.get(db.doc(`socialGrowthJobs/${job.id}`))).data();
          if (existing?.approvalId !== approvalId || existing.bindingHash !== job.bindingHash) throw new Error("growth_job_conflict");
          const live = contextFromRecords({job, state: next, globalHealth: globalSnapshot.data(), connection,
            user: userSnapshot.data(), subscription: subscriptionSnapshot.data(), project, now: Date.parse(job.scheduledFor)});
          if (growth.publicationGate({job, ...live}) !== "ready") throw new Error("growth_connection_not_ready");
        }
        tx.set(stateRef(businessUid), next);
        tx.create(stateRef(businessUid).collection("audit").doc(), {action: "bounded_approval_activated", approvalId,
          jobIds: next.jobIds, businessUid, at: now()});
        return {approvalId, jobIds: next.jobIds, maximumPostCreates: planned.length};
      });
    },
    async pause(businessUid) {
      await db.runTransaction(async tx => {
        const ref = stateRef(businessUid), state = (await tx.get(ref)).data();
        if (!state || state.businessUid !== businessUid) throw new Error("growth_supervisor_missing");
        tx.update(ref, {killSwitchActive: true, externalPublishingEnabled: false});
        tx.create(ref.collection("audit").doc(), {action: "paused", businessUid, at: now()});
      });
      return {paused: true};
    },
    async execute(jobId) {
      const adapter = x.createAdapter({credentials: async job => {
        const live = await context(job);
        if (!live.authority?.providerUserId) throw new Error("growth_identity_required");
        return credentials(job, live.authority);
      }, fetchImpl, now});
      return growth.executeCandidate({store, adapter, jobId, context});
    },
  };
}

module.exports = {environment, contextFromRecords, createPublisher};

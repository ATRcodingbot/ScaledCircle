"use strict";

// Source-only Instagram Facebook Login transport. Not wired to any deployed
// export. The server supplies Story-only authority and a durable claim store.
const {isDeepStrictEqual} = require("node:util");
const model = require("./social_story_model");
const numeric = v => typeof v === "string" && /^\d+$/.test(v);
const requiredScopes = ["instagram_basic", "instagram_content_publish", "pages_read_engagement"];
function describe({job, revision, account}) {
  if (job?.surface !== "story" || job.provider !== "instagram" || !/^story_job_[a-f0-9]{64}$/.test(job.id || "") ||
      !numeric(account?.id) || account.id !== job.accountId || account.owner !== job.owner ||
      account.type !== "BUSINESS" || account.login !== "facebook" || !numeric(account.linkedPageId) ||
      !requiredScopes.every(s => account.scopes?.includes(s))) throw Error("instagram_story_identity_or_scope_denied");
  if (model.media(revision).id !== revision.id || revision.id !== job.mediaRevisionId || revision.sha256 !== job.mediaHash ||
      revision.owner !== job.owner || revision.provider !== job.provider) throw Error("instagram_story_media_changed");
  return {surface: "story", jobId: job.id, accountId: account.id, mediaRevisionId: revision.id,
    create: {path: `/${account.id}/media`, body: {image_url: revision.url, media_type: "STORIES"}},
    publishPath: `/${account.id}/media_publish`, requiredScopes: [...requiredScopes],
    maximumEffects: {containers: 1, publications: 1, createRequests: 2}, cta: "on_image_plain_text_only"};
}

function createTransport({job, revision, account, credentials, authorize, store, fetchImpl,
  deploymentEnabled = false, now = Date.now}) {
  const plan = describe({job, revision, account});
  if (typeof credentials !== "function" || typeof authorize !== "function" || typeof fetchImpl !== "function" ||
      !["claim", "remember", "complete", "get"].every(m => typeof store?.[m] === "function")) throw Error("story_runtime_dependencies_required");
  async function request(path, body) {
    if (path !== `/${account.id}/content_publishing_limit?fields=quota_usage,config` && !/^\/\d+(?:\/(?:media|media_publish|stories))?(?:\?fields=id,(?:status_code|media_product_type&limit=100))?$/.test(path)) throw Error("story_path_denied");
    const c = await credentials();
    if (c.owner !== job.owner || c.accountId !== account.id || c.linkedPageId !== account.linkedPageId ||
        !c.accessToken || c.tokenType !== "USER" || !requiredScopes.every(s => c.scopes?.includes(s))) throw Error("story_credential_identity_changed");
    if (body) {
      if (!["direct", "business_manager"].includes(account.roleOrigin) ||
          account.roleOrigin === "business_manager" && !["ads_read", "ads_management"].some(s => c.scopes.includes(s))) throw Error("story_role_permission_unverified");
      if (!deploymentEnabled) throw Error("story_deployment_disabled");
      await authorize(job, "create");
    }
    const response = await fetchImpl(`https://graph.facebook.com/v26.0${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: {Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json"},
      ...(body ? {body: JSON.stringify(body)} : {})});
    // Never return/log the raw provider payload or error. An HTTP failure after
    // send does not grant another POST, even when the provider reports 4xx.
    if (!response.ok) throw Error("story_provider_response_unavailable");
    const data = await response.json();
    if (data.error) throw Error("story_provider_response_unavailable");
    return data;
  }
  async function step(key, path, body) {
    const claim = await store.claim(job, key, {path, body});
    if (claim.mode !== "send") {
      if (!numeric(claim.providerId)) return {state: "HOLD_UNKNOWN_OUTCOME"};
      return {state: "KNOWN_ID", id: claim.providerId};
    }
    const data = await request(path, body);
    if (!numeric(data.id)) throw Error("story_provider_id_missing_hold");
    await store.remember(job, key, data.id);
    return {state: "KNOWN_ID", id: data.id};
  }
  return {plan,
    async run({reconcileOnly = false} = {}) {
      await authorize(job, "inspect");
      const old = await store.get(job, "publish");
      if (old?.receipt) return old.receipt;
      if (reconcileOnly && !old?.providerId) return {state: "HOLD_READ_ONLY"};
      if (!reconcileOnly && (!deploymentEnabled || !Number.isFinite(Date.parse(job.scheduledFor)) ||
          now() < Date.parse(job.scheduledFor) || now() > Date.parse(job.scheduledFor) + 15 * 60000)) throw Error("story_execution_window_closed");
      let published = old?.providerId ? {id: old.providerId} : null;
      if (!published) {
        await model.verifyFetch(revision, fetchImpl);
        const container = await step("container", plan.create.path, plan.create.body);
        if (!container.id) return container;
        const status = await request(`/${container.id}?fields=id,status_code`);
        if (status.id !== container.id) throw Error("story_container_identity_mismatch");
        if (["EXPIRED", "ERROR"].includes(status.status_code)) return {state: "EXPIRED_OR_FAILED_NO_REPLACEMENT"};
        if (status.status_code === "PUBLISHED") return {state: "HOLD_UNKNOWN_PUBLISHED_ID"};
        if (status.status_code !== "FINISHED") return {state: "WAITING_FOR_CONTAINER"};
        const quota = await request(`/${account.id}/content_publishing_limit?fields=quota_usage,config`);
        const limit = quota.data?.[0];
        if (quota.data?.length !== 1 || !Number.isSafeInteger(limit?.quota_usage) || limit.quota_usage < 0 ||
            !Number.isSafeInteger(limit?.config?.quota_total) || limit.config.quota_total < 1 ||
            !Number.isSafeInteger(limit.config.quota_duration) || limit.config.quota_duration < 1) return {state: "HOLD_QUOTA_UNAVAILABLE"};
        if (limit.quota_usage >= limit.config.quota_total) return {state: "HOLD_PUBLISHING_LIMIT"};
        published = await step("publish", plan.publishPath, {creation_id: container.id});
        if (!published.id) return published;
      }
      const owned = await request(`/${account.id}/stories?fields=id,media_product_type&limit=100`);
      const row = owned.data?.find(r => r.id === published.id);
      if (!row || row.media_product_type !== "STORY") return {state: "HOLD_STORY_ID_NOT_VERIFIED"};
      const receipt = {surface: "story", jobId: job.id, versionId: job.versionId, mediaRevisionId: revision.id,
        provider: "instagram", accountId: account.id, storyId: published.id, state: "PUBLISHED", observedAt: now()};
      await store.complete(job, "publish", receipt);
      return receipt;
    }
  };
}

// Atomic, at-most-one POST claim. Crashed/ambiguous claims never become new
// sends. Missing IDs HOLD indefinitely until a separate reviewed recovery.
function createStore({db, authorize}) {
  if (typeof authorize !== "function") throw Error("story_store_authority_required");
  function ref(job, key) {
    if (job?.surface !== "story" || !/^story_job_[a-f0-9]{64}$/.test(job.id || "") || !["container", "publish"].includes(key)) throw Error("story_store_path_denied");
    return db.doc(`socialStoryJobs/${job.id}/steps/${key}`);
  }
  async function txFor(job, key, action, fn) {
    return db.runTransaction(async tx => {
      await authorize(tx, job, action);
      const r = ref(job, key), old = (await tx.get(r)).data();
      return fn(tx, r, old);
    });
  }
  return {
    get: async (job, key) => (await ref(job, key).get()).data(),
    claim: (job, key, request) => txFor(job, key, "claim", (tx, r, old) => {
      if (old) {
        if (!isDeepStrictEqual(old.request, request)) throw Error("story_request_changed");
        return {mode: "reconcile", providerId: old.providerId || null};
      }
      tx.create(r, {surface: "story", jobId: job.id, request, state: "claimed"});
      return {mode: "send"};
    }),
    remember: (job, key, providerId) => txFor(job, key, "reconcile", (tx, r, old) => {
      if (!old || !numeric(providerId) || old.providerId && old.providerId !== providerId) throw Error("story_provider_id_conflict");
      if (!old.providerId) tx.update(r, {providerId});
    }),
    complete: (job, key, receipt) => txFor(job, key, "reconcile", (tx, r, old) => {
      if (!old || old.providerId !== receipt.storyId || old.receipt && !isDeepStrictEqual(old.receipt, receipt)) throw Error("story_receipt_conflict");
      if (!old.receipt) tx.update(r, {receipt, state: "verified"});
    })
  };
}
function createAuthority({db, plan, account}) {
  const expected = model.draftJobs(plan);
  if (plan.provider !== "instagram" || account.id !== plan.accountId || account.owner !== plan.owner || account.type !== "BUSINESS") throw Error("story_authority_identity_invalid");
  return async (tx, job, action) => {
    const read = async path => (await (tx ? tx.get(db.doc(path)) : db.doc(path).get())).data();
    const binding = expected.find(e => e.id === job.id);
    if (!binding || ["surface", "owner", "provider", "accountId", "planId", "planDigest", "versionId", "mediaRevisionId", "mediaHash", "scheduledFor"].some(k => job[k] !== binding[k])) throw Error("story_job_binding_changed");
    const current = await read(`socialStoryJobs/${job.id}`);
    if (!current || !isDeepStrictEqual(current, job) || !/^story_approval_[a-f0-9]{64}$/.test(current.approvalId || "")) throw Error("story_approval_required");
    const approval = await read(`socialStoryApprovals/${current.approvalId}`);
    if (approval?.schemaVersion !== "StoryApprovalV1" || approval.surface !== "story" || approval.owner !== plan.owner ||
        approval.provider !== plan.provider || approval.accountId !== account.id || approval.planId !== plan.id ||
        approval.planDigest !== plan.digest || approval.revokedAt != null ||
        !isDeepStrictEqual(approval.jobIds, expected.map(j => j.id))) throw Error("story_approval_changed");
    const storedPlan = await read(`socialStoryPlans/${plan.id}`);
    if (!isDeepStrictEqual(storedPlan, plan)) throw Error("story_plan_changed");
    const media = await read(`socialStoryMediaRevisions/${job.mediaRevisionId}`);
    if (!media || model.media(media).id !== job.mediaRevisionId || media.sha256 !== job.mediaHash) throw Error("story_media_changed");
    const connection = await read(`socialConnections/${job.owner}/providers/instagram`);
    if (connection?.providerUserId !== account.id || connection.linkedPageId !== account.linkedPageId ||
        connection.tokenHealth !== "healthy" || connection.environment !== "production" ||
        !requiredScopes.every(s => connection.grantedScopes?.includes(s))) throw Error("story_connection_changed");
    // Reconciliation is read-only at the provider and may preserve known IDs
    // after pause. Any new claim/send must pass both independent stop controls.
    if (["claim", "create"].includes(action)) {
      const health = await read(`agentHealth/${job.owner}`), allowance = await read(model.paths(job.owner, job.provider).authority);
      if (health?.killSwitchActive !== false || allowance?.surface !== "story" || allowance.owner !== job.owner ||
          allowance.provider !== job.provider || allowance.approvalId !== job.approvalId || allowance.planDigest !== plan.digest ||
          allowance.publishingEnabled !== true || allowance.killSwitchActive !== false ||
          !isDeepStrictEqual(allowance.jobIds, expected.map(j => j.id))) throw Error("story_paused");
    }
  };
}
module.exports = {describe, createTransport, createStore, createAuthority};

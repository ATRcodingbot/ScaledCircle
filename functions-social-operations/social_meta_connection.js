"use strict";

// Server-owned connection policy. Possession of scopes does not authorize a post.
function policy(config = {}) {
  const p = config.metaDogfood;
  if (config.provider !== "meta" || config.environment !== "production" ||
      config.externalPublishingEnabled === true || !p ||
      typeof p.businessUid !== "string" || !p.businessUid.trim() ||
      typeof p.pageId !== "string" || !/^\d+$/.test(p.pageId) ||
      typeof p.instagramId !== "string" || !/^\d+$/.test(p.instagramId) ||
      typeof p.pageName !== "string" || !p.pageName.trim() ||
      !/^[a-zA-Z0-9._]+$/.test(p.instagramUsername || "")) {
    throw new Error("social_oauth_meta_restricted_config_required");
  }
  return {businessUid: p.businessUid, pageId: p.pageId, pageName: p.pageName,
    instagramId: p.instagramId, instagramUsername: p.instagramUsername};
}

function authorize(config, businessUid, expectedPolicy = null) {
  const p = policy(config);
  if (config.enabled !== true || config.writeScopesEnabled !== true || businessUid !== p.businessUid ||
      (expectedPolicy && Object.keys(p).some((key) => p[key] !== expectedPolicy[key]))) {
    throw new Error("social_oauth_meta_restricted_identity_mismatch");
  }
  return p;
}

// The bounded publishing pilot is not the identity policy for ordinary
// customer read-only onboarding. Never lend its Page or write scopes to a
// different workspace, and never modify the stored provider configuration.
function connectionConfig(config, businessUid, purpose = null) {
  if (config?.provider !== "meta" || !config.metaDogfood) return config;
  const restricted = policy(config);
  if (businessUid === restricted.businessUid) return config;
  if (purpose && purpose !== "read_only_connection") {
    throw new Error("social_oauth_meta_restricted_identity_mismatch");
  }
  const {metaDogfood, ...ordinary} = config;
  return {...ordinary, writeScopesEnabled: false, externalPublishingEnabled: false};
}

function identity(candidate, p) {
  if (candidate?.provider !== "meta" || candidate.accountId !== p.pageId ||
      candidate.accountDisplayName !== p.pageName || candidate.linkedAccountId !== p.instagramId ||
      candidate.linkedHandle !== p.instagramUsername ||
      candidate.linkedAccountType !== "instagram_professional" ||
      candidate.professionalIdentityEvidence !== "page_instagram_business_account_and_ig_user" ||
      !candidate.pageAccessToken || !candidate.userAccessToken) {
    throw new Error("social_oauth_meta_restricted_identity_mismatch");
  }
}

function confirmation({attempt, attemptId, businessUid, environment, config,
  facebook = {}, instagram = {}, now}) {
  authorize(config, businessUid, attempt?.metaDogfood);
  if (!attempt?.metaDogfood || attempt.businessUid !== businessUid ||
      attempt.provider !== "meta" || attempt.environment !== environment ||
      attempt.purpose !== "meta_connection_authority" || attempt.status !== "identity_pending" ||
      !Number.isFinite(attempt.expiresAtMillis) || attempt.expiresAtMillis <= now ||
      facebook.pendingAttemptId !== attemptId ||
      (facebook.providerUserId && facebook.providerUserId !== attempt.metaDogfood.pageId) ||
      (instagram.providerUserId && instagram.providerUserId !== attempt.metaDogfood.instagramId)) {
    throw new Error("social_oauth_stale_connection_attempt");
  }
}

function capabilities(scopes, surface) {
  const s = new Set(scopes);
  const fb = surface === "facebook";
  const profile = s.has(fb ? "pages_read_engagement" : "instagram_basic");
  const analytics = profile && s.has(fb ? "read_insights" : "instagram_manage_insights") &&
    s.has("pages_read_engagement");
  const publish = profile && s.has(fb ? "pages_manage_posts" : "instagram_content_publish");
  return {profile, analytics, publishText: fb && publish, publishImage: publish,
    publishVideo: false, schedule: false};
}

module.exports = {policy, authorize, connectionConfig, identity, confirmation, capabilities};

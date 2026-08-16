"use strict";

const crypto = require("node:crypto");

const CONNECTION_VERSION = "SocialConnectionV1";
const DRAFT_VERSION = "SocialPostDraftV1";
const MEDIA_VERSION = "SocialMediaItemV1";
const JOB_VERSION = "SocialPublishingJobV1";
const PROVIDER_POLICY_VERSION = "SocialProviderAvailabilityV1";
const PROVIDERS = Object.freeze({
  facebook: {phase: 1, label: "Facebook", status: "requires_approval"},
  instagram: {phase: 1, label: "Instagram", status: "requires_approval"},
  google_business: {phase: 2, label: "Google Business", status: "coming_soon"},
  linkedin: {phase: 3, label: "LinkedIn", status: "coming_soon"},
});
const STATUSES = new Set(["draft", "ready_for_review", "approved", "scheduled",
  "publishing", "published", "failed", "cancelled", "connection_required"]);

function text(value, max = 2400) {
  return value == null ? "" : String(value).trim().slice(0, max);
}

function providerAvailability() {
  return Object.entries(PROVIDERS).map(([provider, config]) => ({provider, ...config,
    capabilities: {canReadProfile: false, canCreatePost: false, canUploadImage: false,
      canUploadVideo: false, canSchedule: false, canReadPublishedPosts: false,
      canReadBasicAnalytics: false}}));
}

function requireOwner(uid, record) {
  if (!record || record.businessUid !== uid) throw new Error("social_record_not_owned");
  return record;
}

function sanitizePlatformPost(value) {
  const provider = text(value?.provider, 40).toLowerCase();
  if (!PROVIDERS[provider]) throw new Error("unsupported_social_provider");
  const body = text(value?.body, 5000);
  if (!body) throw new Error("social_body_required");
  return {provider, accountId: text(value?.accountId, 160) || null,
    accountDisplayName: text(value?.accountDisplayName, 160) || null,
    format: text(value?.format, 40) || "feed", body,
    callToAction: text(value?.callToAction, 300) || null,
    destinationUrl: text(value?.destinationUrl, 1000) || null,
    hashtags: Array.isArray(value?.hashtags) ? value.hashtags.slice(0, 30)
      .map((item) => text(item, 80)).filter(Boolean) : [],
    mediaId: text(value?.mediaId, 160) || null,
    mediaDescription: text(value?.mediaDescription, 500) || null};
}

function createDraft({uid, artifactId, title, posts, now = Date.now()}) {
  const cleanPosts = Array.isArray(posts) ? posts.map(sanitizePlatformPost) : [];
  if (!cleanPosts.length) throw new Error("social_posts_required");
  const contentVersion = 1;
  const digest = crypto.createHash("sha256")
    .update(`${uid}\n${artifactId}\n${JSON.stringify(cleanPosts)}`).digest("hex").slice(0, 40);
  return {id: `social_${digest}`, record: {schemaVersion: DRAFT_VERSION, businessUid: uid,
    artifactId: text(artifactId, 160), title: text(title, 240) || "Social post drafts",
    status: "ready_for_review", contentVersion, posts: cleanPosts,
    approvedByUid: null, approvedAt: null, approvedContentVersion: null,
    createdAt: now, updatedAt: now}};
}

function editDraft({uid, record, posts, now = Date.now()}) {
  requireOwner(uid, record);
  if (["publishing", "published", "cancelled"].includes(record.status)) {
    throw new Error("social_draft_not_editable");
  }
  const cleanPosts = posts.map(sanitizePlatformPost);
  return {...record, posts: cleanPosts, status: "ready_for_review",
    contentVersion: Number(record.contentVersion || 0) + 1,
    approvedByUid: null, approvedAt: null, approvedContentVersion: null, updatedAt: now};
}

function approveDraft({uid, record, contentVersion, now = Date.now()}) {
  requireOwner(uid, record);
  if (record.status !== "ready_for_review" || Number(contentVersion) !== record.contentVersion) {
    throw new Error("social_approval_version_mismatch");
  }
  return {...record, status: "approved", approvedByUid: uid, approvedAt: now,
    approvedContentVersion: record.contentVersion, updatedAt: now};
}

function validateConnection(uid, connection, provider) {
  requireOwner(uid, connection);
  if (connection.provider !== provider || connection.connectionStatus !== "connected" ||
      connection.requiresReconnect === true || connection.capabilities?.canCreatePost !== true) {
    throw new Error("social_connection_required");
  }
  return connection;
}

function publishingJob({uid, draft, postIndex, connection, scheduledFor, now = Date.now()}) {
  requireOwner(uid, draft);
  if (draft.status !== "approved" || draft.approvedContentVersion !== draft.contentVersion) {
    throw new Error("social_approval_required");
  }
  const post = draft.posts?.[postIndex];
  if (!post) throw new Error("social_post_missing");
  validateConnection(uid, connection, post.provider);
  const when = new Date(scheduledFor);
  if (Number.isNaN(when.getTime()) || when.getTime() < now - 60000) {
    throw new Error("invalid_social_schedule");
  }
  const id = `social_publish_${crypto.createHash("sha256")
    .update(`${draft.id || "draft"}\n${draft.contentVersion}\n${postIndex}\n${when.toISOString()}`)
    .digest("hex")}`;
  return {id, record: {schemaVersion: JOB_VERSION, businessUid: uid,
    draftId: draft.id || null, contentVersion: draft.contentVersion, postIndex,
    provider: post.provider, connectionId: connection.id || null,
    status: "scheduled", scheduledFor: when.toISOString(), attemptCount: 0,
    providerPostId: null, providerPostUrl: null, createdAt: now, updatedAt: now}};
}

function mediaRecord({uid, mediaId, storagePath, filename, category, description, now = Date.now()}) {
  const expectedPrefix = `social_media/${uid}/${mediaId}/`;
  if (!text(storagePath, 1000).startsWith(expectedPrefix)) throw new Error("invalid_social_media_path");
  return {schemaVersion: MEDIA_VERSION, businessUid: uid, mediaId: text(mediaId, 160),
    storagePath: text(storagePath, 1000), filename: text(filename, 240),
    category: text(category, 80) || null, description: text(description, 500) || null,
    status: "ready", createdAt: now, updatedAt: now};
}

class SocialPublishingProvider {
  async publish() { throw new Error("social_provider_not_configured"); }
}

class MockSocialPublishingProvider extends SocialPublishingProvider {
  constructor(result = {}) { super(); this.result = result; this.calls = []; }
  async publish(request) { this.calls.push(request); return {...this.result}; }
}

module.exports = {CONNECTION_VERSION, DRAFT_VERSION, MEDIA_VERSION, JOB_VERSION,
  PROVIDER_POLICY_VERSION, PROVIDERS, STATUSES, providerAvailability, requireOwner,
  sanitizePlatformPost, createDraft, editDraft, approveDraft, validateConnection,
  publishingJob, mediaRecord, SocialPublishingProvider, MockSocialPublishingProvider};

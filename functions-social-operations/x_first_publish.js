"use strict";

const crypto = require("node:crypto");

const BUSINESS_UID = "FF1bfDuvtdNjuuC4mc7NdGtk3LC3";
const PLAN_ID = "sc_plan_2026_09_launch_readiness_v1";
const PLAN_VERSION_ID = `${PLAN_ID}:v1`;
const CAMPAIGN_ID = "sc_campaign_brand_launch_md_2026_09";
const CONTENT_ITEM_ID = "sc_x_20260903_mapping_v1";
const VERSION_ID = "v3";
const VERSION_NUMBER = 3;
const VERSION_DOCUMENT_ID = `${CONTENT_ITEM_ID}_v3`;
const PRODUCTION_VERSION_ID = "v4";
const PRODUCTION_VERSION_NUMBER = 4;
const PRODUCTION_VERSION_DOCUMENT_ID = `${CONTENT_ITEM_ID}_v4`;
const PRODUCTION_SUCCESSOR_REASON = "PRODUCTION_ATTRIBUTION_SUCCESSOR";
const ORIGINAL_VERSION_DOCUMENT_ID = `${CONTENT_ITEM_ID}_v1`;
const PREVIOUS_VERSION_ID = "v2";
const PREVIOUS_VERSION_NUMBER = 2;
const PREVIOUS_VERSION_DOCUMENT_ID = `${CONTENT_ITEM_ID}_v2`;
const MEDIA_ID = "sc_media_x_smart_mapping_20260903_v2";
const MEDIA_REVISION_ID = `${MEDIA_ID}:4741ed4177276180`;
const MEDIA_SHA256 = "4741ed4177276180fbd498d1e6e66841bdd652c86d451cbbfa9f35a1a0f7c1d4";
const MEDIA_URL = "https://scaledcircle-staging.web.app/social/scaledcircle-smart-mapping-x-v2.png";
const MEDIA_BYTES = 577663;
const MEDIA_WIDTH = 1200;
const MEDIA_HEIGHT = 675;
const PRODUCTION_MEDIA_ID = `${MEDIA_ID}_production_v1`;
const PRODUCTION_MEDIA_REVISION_ID = `${PRODUCTION_MEDIA_ID}:${MEDIA_SHA256.slice(0, 16)}`;
const DESTINATION_URL = "https://scaledcircle.com/#/businesses";
const SCHEDULED_FOR = "2026-09-03T14:00:00.000Z";
const EXPECTED_X_ID = "2090731921177210880";
const EXPECTED_X_HANDLE = "scaledcircle";
const EXPECTED_X_NAME = "Scaled Circle";
const ORIGINAL_DEFECTIVE_POST_ID = "2095513212485529898";
const ORIGINAL_DEFECT_REASON = "PUBLIC_STAGING_ORIGIN";
const REPLACEMENT_REASON = "PUBLIC_STAGING_ORIGIN";
const ORIGINAL_DELETION_SOURCE = "FOUNDER_MANUAL_DELETE";
const DEFECTIVE_TRACKED_URL = "https://scaledcircle-staging.web.app/r?code=vZN94658Lq6cEcYQ5V8IoFfC";
const PUBLIC_RESPONSE_ORIGIN = "https://scaledcircle.com";
const PRODUCTION_RESPONSE_ASSET_ID = "response_bcfcc63ef31d8eb467edfd209b9b5e9caf94f0ac";
const PRODUCTION_RESPONSE_CODE = "P2AF8bOxfGyqZ_uYDwPtjkr3";
const PRODUCTION_RESPONSE_URL = `${PUBLIC_RESPONSE_ORIGIN}/r?code=${PRODUCTION_RESPONSE_CODE}`;

function assertProductionResponseAsset({responseAssetId, publicCode, publicUrl}) {
  const id = String(responseAssetId || "").trim();
  const code = String(publicCode || "").trim();
  if (!/^response_[a-f0-9]{40}$/.test(id) || !/^[A-Za-z0-9_-]{24}$/.test(code)) {
    throw new Error("x_production_response_asset_invalid");
  }
  const expected = `${PUBLIC_RESPONSE_ORIGIN}/r?code=${encodeURIComponent(code)}`;
  if (String(publicUrl || "").trim() !== expected) {
    throw new Error("x_production_response_asset_invalid");
  }
  return {responseAssetId: id, publicCode: code, publicUrl: expected};
}
const V2_APPROVED_COPY = "A bigger service area isn’t automatically a better campaign. " +
  "ScaledCircle helps a Business choose exact streets and zones, connect responses to each " +
  "campaign, and learn what happened next. Built for local growth in Maryland.\n\n" +
  "See how it works: https://scaledcircle.com/#/businesses";
const APPROVED_COPY = "Smart Mapping helps a Maryland Business focus a local campaign street by " +
  "street. Choose the neighborhoods you can serve, connect each response to the campaign, and " +
  "review what happened before expanding the map.\n\nSee ScaledCircle work: " +
  "https://scaledcircle.com/#/businesses\n\n#MarylandBusiness";
const V2_CTA = "See how it works.";
const CTA = "See ScaledCircle work.";
const ALT_TEXT = "ScaledCircle Smart Mapping product preview showing a privacy-safe validated " +
  "Baltimore planning demo, a selected campaign zone, and no customer information.";
const X_READ_SCOPES = Object.freeze(["users.read", "tweet.read", "offline.access"]);
const X_WRITE_SCOPES = Object.freeze([...X_READ_SCOPES, "tweet.write", "media.write"]);

function digest(value) {
  return crypto.createHash("sha256")
    .update(Buffer.isBuffer(value) ? value :
      typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function weightedXLength(value) {
  const text = String(value || "").normalize("NFC");
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  let count = [...text].length;
  for (const url of urls) count += 23 - [...url].length;
  return count;
}

function renderPostText(trackedUrl) {
  const url = String(trackedUrl || "").trim();
  if (!/^https:\/\//.test(url)) throw new Error("x_response_asset_url_required");
  const rendered = APPROVED_COPY.replace(DESTINATION_URL, url);
  if (weightedXLength(rendered) > 280) throw new Error("x_character_limit_exceeded");
  return rendered;
}

function pngDimensions(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("x_media_png_required");
  }
  return {width: data.readUInt32BE(16), height: data.readUInt32BE(20)};
}

function assertMedia(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const dimensions = pngDimensions(data);
  if (data.length !== MEDIA_BYTES || digest(data) !== MEDIA_SHA256 ||
      dimensions.width !== MEDIA_WIDTH || dimensions.height !== MEDIA_HEIGHT ||
      data.length > 5 * 1024 * 1024) throw new Error("x_media_integrity_mismatch");
  return {bytes: data.length, ...dimensions, sha256: digest(data), type: "image/png"};
}

function versionRecord({businessUid = BUSINESS_UID, responseAssetId, trackedUrl,
  now = Date.now()} = {}) {
  if (businessUid !== BUSINESS_UID) throw new Error("x_certification_business_mismatch");
  const renderedCopy = renderPostText(trackedUrl);
  const snapshot = {businessUid, planId: PLAN_ID, itemKey: CONTENT_ITEM_ID,
    version: VERSION_NUMBER, scheduledFor: SCHEDULED_FOR,
    goal: "Establish the problem ScaledCircle solves",
    pillar: "Measurable local marketing",
    variants: [{provider: "x", format: "post", copy: APPROVED_COPY,
      renderedCopy, mediaAssetId: MEDIA_ID, mediaRevisionId: MEDIA_REVISION_ID,
      mediaRequirement: "Certified privacy-safe capture of the real ScaledCircle Smart Mapping UI",
      altText: ALT_TEXT, callToAction: CTA, destinationUrl: DESTINATION_URL,
      hashtags: ["#MarylandBusiness"],
      responseAssetId: String(responseAssetId || "").trim(),
      responseAssetRequirement: "Campaign-and-version-specific tracked link is bound."}],
  };
  if (!snapshot.variants[0].responseAssetId) throw new Error("x_response_asset_required");
  return {schemaVersion: "SocialContentItemVersionV1", ...snapshot,
    versionId: VERSION_ID, planVersionId: PLAN_VERSION_ID, campaignId: CAMPAIGN_ID,
    status: "ready_for_review", originalStatus: "ready_for_review",
    contentHash: digest(snapshot), approvedAt: null, createdAtMillis: now,
    supersedes: PREVIOUS_VERSION_DOCUMENT_ID, supersessionReason: "SOCIAL_QUALITY_IMPROVEMENT",
    founderPublicationApprovalRequired: true, founderPublicationApproved: false,
    immutable: true};
}

function versionFourRecord({businessUid = BUSINESS_UID, now = Date.now()} = {}) {
  if (businessUid !== BUSINESS_UID) throw new Error("x_certification_business_mismatch");
  const snapshot = {businessUid, planId: PLAN_ID, itemKey: CONTENT_ITEM_ID,
    version: PRODUCTION_VERSION_NUMBER, scheduledFor: null,
    goal: "Establish the problem ScaledCircle solves",
    pillar: "Measurable local marketing",
    variants: [{provider: "x", format: "post", copy: APPROVED_COPY,
      renderedCopy: renderPostText(PRODUCTION_RESPONSE_URL), mediaAssetId: PRODUCTION_MEDIA_ID,
      mediaRevisionId: PRODUCTION_MEDIA_REVISION_ID,
      mediaRequirement: "Certified privacy-safe capture of the real ScaledCircle Smart Mapping UI",
      altText: ALT_TEXT, callToAction: CTA, destinationUrl: DESTINATION_URL,
      hashtags: ["#MarylandBusiness"], responseAssetId: PRODUCTION_RESPONSE_ASSET_ID,
      responseAssetRequirement: "Production campaign-and-version-specific tracked link is bound."}],
  };
  const record = {schemaVersion: "SocialContentItemVersionV1", ...snapshot,
    versionId: PRODUCTION_VERSION_ID, planVersionId: PLAN_VERSION_ID, campaignId: CAMPAIGN_ID,
    status: "ready_for_review", originalStatus: "ready_for_review",
    contentHash: digest(snapshot), approvedAt: null, createdAtMillis: now,
    supersedes: VERSION_DOCUMENT_ID, supersessionReason: PRODUCTION_SUCCESSOR_REASON,
    supersessionDetail: "v3 remained immutably bound to staging-origin attribution and could not " +
      "truthfully be published as the corrected production replacement.",
    founderPublicationApprovalRequired: true, founderPublicationApproved: false,
    immutable: true};
  assertNoStagingReference(record);
  return record;
}

function productionMediaRecord({businessUid = BUSINESS_UID} = {}) {
  if (businessUid !== BUSINESS_UID) throw new Error("x_certification_business_mismatch");
  const record = {schemaVersion: "SocialMediaItemV1", businessUid,
    mediaAssetId: PRODUCTION_MEDIA_ID, mediaRevisionId: PRODUCTION_MEDIA_REVISION_ID,
    sourceMediaAssetId: MEDIA_ID, sourceMediaRevisionId: MEDIA_REVISION_ID,
    sha256: MEDIA_SHA256, bytes: MEDIA_BYTES, width: MEDIA_WIDTH, height: MEDIA_HEIGHT,
    mimeType: "image/png", byteIdentityPreserved: true,
    storageAuthority: "immutable_hash_reuse", publicDeliveryUrl: null,
    privacyReview: "pass", visualQualityReview: "pass", productionOriginSafe: true,
    stagingReferenceCount: 0, immutable: true};
  assertNoStagingReference(record);
  return {...record, bindingHash: digest(record)};
}

function productionApprovalIntent({version, qualityAssessment} = {}) {
  if (!version || version.version !== PRODUCTION_VERSION_NUMBER ||
      version.contentHash !== versionFourRecord({now: version.createdAtMillis}).contentHash ||
      !qualityAssessment || qualityAssessment.contentVersion !== PRODUCTION_VERSION_NUMBER ||
      qualityAssessment.readyToPublish !== true || qualityAssessment.recommendation !== "keep") {
    throw new Error("x_v4_approval_intent_gate_failed");
  }
  const identity = {businessUid: BUSINESS_UID, provider: "x", contentItemId: CONTENT_ITEM_ID,
    version: PRODUCTION_VERSION_NUMBER, contentHash: version.contentHash,
    mediaId: PRODUCTION_MEDIA_ID, mediaSha256: MEDIA_SHA256,
    responseAssetId: PRODUCTION_RESPONSE_ASSET_ID,
    trackedUrl: PRODUCTION_RESPONSE_URL, action: "replacement",
    replacesPostId: ORIGINAL_DEFECTIVE_POST_ID};
  const id = `social_approval_intent_${digest(identity)}`;
  return {id, record: {schemaVersion: "SocialExternalApprovalIntentV1", ...identity,
    approvalHash: digest(identity), status: "awaiting_founder_approval",
    approvalClass: "single_social_replacement", externalExecutionAllowed: false,
    providerMutationAuthorized: false, wildcardApproval: false,
    founderActionRequired: true, immutable: true}};
}

function productionReplacementJob({version, approvalIntent} = {}) {
  if (!version || version.version !== PRODUCTION_VERSION_NUMBER ||
      !approvalIntent || approvalIntent.record?.status !== "awaiting_founder_approval") {
    throw new Error("x_v4_job_gate_failed");
  }
  const identity = {businessUid: BUSINESS_UID, provider: "x", contentItemId: CONTENT_ITEM_ID,
    version: PRODUCTION_VERSION_NUMBER, contentHash: version.contentHash,
    responseAssetId: PRODUCTION_RESPONSE_ASSET_ID, mediaAssetId: PRODUCTION_MEDIA_ID,
    mediaSha256: MEDIA_SHA256, action: "replacement",
    replacesPostId: ORIGINAL_DEFECTIVE_POST_ID,
    replacementReason: REPLACEMENT_REASON, approvalIntentId: approvalIntent.id};
  const id = `social_replacement_${digest(identity)}`;
  const record = {schemaVersion: "SocialPublishJobV1", ...identity,
    idempotencyKey: id, status: "awaiting_founder_approval", scheduledFor: null,
    attemptCount: 0, providerCreateAttemptCount: 0, providerPostId: null,
    providerPostUrl: null, providerReceiptId: null,
    originalDeletionSource: ORIGINAL_DELETION_SOURCE,
    executionAuthority: "single_certified_replacement_only",
    externalExecutionAllowed: false, providerMutationCount: 0,
    reconciliationRequired: false, duplicatePreventionRequired: true,
    immutablePreparationBinding: true};
  assertNoStagingReference(record);
  return {id, record: {...record, bindingHash: digest(record)}};
}

function assertNoStagingReference(value) {
  if (/scaledcircle-staging|\.web\.app|firebaseapp\.com|localhost|127\.0\.0\.1/i
    .test(JSON.stringify(value))) throw new Error("x_v4_staging_reference_forbidden");
  return value;
}

function assertProductionSuccessorHttpRequest(request) {
  if (String(request?.method || "").toUpperCase() !== "POST") {
    throw new Error("x_v4_method_not_allowed");
  }
  if (String(request?.originalUrl || request?.url || "").includes("?")) {
    throw new Error("x_v4_empty_request_required");
  }
  const body = request?.body;
  if (body == null || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 0) throw new Error("x_v4_empty_request_required");
  return true;
}

function versionTwoRecord({businessUid = BUSINESS_UID, responseAssetId, trackedUrl,
  now = Date.now()} = {}) {
  if (businessUid !== BUSINESS_UID) throw new Error("x_certification_business_mismatch");
  const url = String(trackedUrl || "").trim();
  if (!/^https:\/\//.test(url)) throw new Error("x_response_asset_url_required");
  const renderedCopy = V2_APPROVED_COPY.replace(DESTINATION_URL, url);
  if (weightedXLength(renderedCopy) > 280) throw new Error("x_character_limit_exceeded");
  const snapshot = {businessUid, planId: PLAN_ID, itemKey: CONTENT_ITEM_ID,
    version: PREVIOUS_VERSION_NUMBER, scheduledFor: SCHEDULED_FOR,
    goal: "Establish the problem ScaledCircle solves",
    pillar: "Measurable local marketing",
    variants: [{provider: "x", format: "post", copy: V2_APPROVED_COPY,
      renderedCopy, mediaAssetId: MEDIA_ID, mediaRevisionId: MEDIA_REVISION_ID,
      mediaRequirement: "Certified privacy-safe capture of the real ScaledCircle Smart Mapping UI",
      altText: ALT_TEXT, callToAction: V2_CTA, destinationUrl: DESTINATION_URL,
      responseAssetId: String(responseAssetId || "").trim(),
      responseAssetRequirement: "Campaign-and-version-specific tracked link is bound."}],
  };
  if (!snapshot.variants[0].responseAssetId) throw new Error("x_response_asset_required");
  return {schemaVersion: "SocialContentItemVersionV1", ...snapshot,
    versionId: PREVIOUS_VERSION_ID, planVersionId: PLAN_VERSION_ID, campaignId: CAMPAIGN_ID,
    status: "ready_for_review", originalStatus: "ready_for_review",
    contentHash: digest(snapshot), approvedAt: null, createdAtMillis: now,
    supersedes: ORIGINAL_VERSION_DOCUMENT_ID, supersessionReason: "X_CHARACTER_LIMIT",
    immutable: true};
}

function approvalRecord({version, qualityAssessment, responseAsset, approvedByUid = BUSINESS_UID,
  now = Date.now()} = {}) {
  if (!version || version.businessUid !== BUSINESS_UID || version.version !== VERSION_NUMBER ||
      version.contentHash !== versionRecord({responseAssetId: responseAsset?.responseAssetId,
        trackedUrl: responseAsset?.trackedUrl, now: version.createdAtMillis}).contentHash) {
    throw new Error("x_version_integrity_mismatch");
  }
  if (!qualityAssessment || qualityAssessment.contentItemId !== CONTENT_ITEM_ID ||
      Number(qualityAssessment.contentVersion) !== VERSION_NUMBER ||
      qualityAssessment.readyToPublish !== true || Number(qualityAssessment.score) < 75 ||
      !["good", "strong"].includes(qualityAssessment.qualityBand)) {
    throw new Error("x_quality_gate_failed");
  }
  if (!responseAsset || responseAsset.responseAssetId !== version.variants[0].responseAssetId ||
      responseAsset.businessUid !== BUSINESS_UID || responseAsset.destination !== DESTINATION_URL ||
      responseAsset.attribution?.campaignId !== CAMPAIGN_ID ||
      responseAsset.attribution?.creativeVersion !== VERSION_ID ||
      responseAsset.attribution?.sourceDetail !== `${CONTENT_ITEM_ID}:${VERSION_ID}`) {
    throw new Error("x_response_asset_integrity_mismatch");
  }
  const identity = {businessUid: BUSINESS_UID, provider: "x", contentItemId: CONTENT_ITEM_ID,
    version: VERSION_NUMBER, contentHash: version.contentHash, mediaId: MEDIA_ID,
    mediaSha256: MEDIA_SHA256, responseAssetId: responseAsset.responseAssetId,
    trackedUrl: responseAsset.trackedUrl, scheduledFor: SCHEDULED_FOR,
    expectedProviderAccountId: EXPECTED_X_ID};
  return {id: `social_approval_${digest(identity)}`, record: {
    schemaVersion: "SocialExternalApprovalV1", ...identity,
    approvalHash: digest(identity), status: "approved", approvalClass: "single_social_publish",
    approvedByUid, approvedAtMillis: now, externalExecutionAllowed: true,
    wildcardApproval: false, immutable: true,
  }};
}

function expectedJobId(approval) {
  return `social_publish_${digest({businessUid: BUSINESS_UID, contentItemId: CONTENT_ITEM_ID,
    version: VERSION_NUMBER, provider: "x", scheduledFor: SCHEDULED_FOR,
    approvalHash: approval.approvalHash})}`;
}

function assertWriteConnection(connection = {}) {
  const granted = new Set(Array.isArray(connection.grantedScopes) ? connection.grantedScopes : []);
  if (connection.status !== "connected_write" || connection.writeScopesGranted !== true ||
      connection.accountDisplayName !== EXPECTED_X_NAME ||
      String(connection.handle || "").replace(/^@/, "").toLowerCase() !== EXPECTED_X_HANDLE ||
      connection.providerUserId !== EXPECTED_X_ID ||
      X_WRITE_SCOPES.some((scope) => !granted.has(scope)) ||
      [...granted].some((scope) => !X_WRITE_SCOPES.includes(scope)) ||
      connection.capabilities?.publishText !== true || connection.capabilities?.publishImage !== true) {
    throw new Error("x_write_connection_mismatch");
  }
  return connection;
}

async function providerJson(fetchImpl, url, options, stage) {
  let response;
  try { response = await fetchImpl(url, options); } catch (error) {
    const failure = new Error("x_provider_outcome_unknown");
    failure.stage = stage;
    throw failure;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = new Error(response.status >= 500 ?
      "x_provider_outcome_unknown" : "x_provider_request_rejected");
    failure.stage = stage;
    failure.status = response.status;
    failure.providerCode = String(body?.errors?.[0]?.type || body?.title || body?.error || "")
      .slice(0, 160);
    throw failure;
  }
  return body;
}

async function uploadMedia({fetchImpl = globalThis.fetch, accessToken, bytes}) {
  const media = assertMedia(bytes);
  const body = await providerJson(fetchImpl, "https://api.x.com/2/media/upload", {
    method: "POST",
    headers: {Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json"},
    body: JSON.stringify({media: Buffer.from(bytes).toString("base64"),
      media_category: "tweet_image"}),
  }, "media_upload");
  const mediaId = String(body?.data?.id || "").trim();
  const mediaKey = String(body?.data?.media_key || "").trim();
  if (!mediaId) throw new Error("x_media_receipt_missing");
  return {mediaId, mediaKey: mediaKey || null, ...media};
}

async function createPost({fetchImpl = globalThis.fetch, accessToken, renderedCopy, mediaId}) {
  if (weightedXLength(renderedCopy) > 280 || !mediaId) throw new Error("x_post_payload_invalid");
  const body = await providerJson(fetchImpl, "https://api.x.com/2/tweets", {
    method: "POST",
    headers: {Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json"},
    body: JSON.stringify({text: renderedCopy, media: {media_ids: [String(mediaId)]}}),
  }, "post_create");
  const providerPostId = String(body?.data?.id || "").trim();
  if (!providerPostId || body?.data?.text !== renderedCopy) throw new Error("x_post_receipt_mismatch");
  return {providerPostId, providerPostUrl: `https://x.com/${EXPECTED_X_HANDLE}/status/${providerPostId}`,
    providerTextHash: digest(renderedCopy)};
}

async function lookupPost({fetchImpl = globalThis.fetch, accessToken, providerPostId}) {
  const id = String(providerPostId || "").trim();
  if (!/^[0-9]{1,19}$/.test(id)) throw new Error("x_post_id_invalid");
  let response;
  try {
    response = await fetchImpl(`https://api.x.com/2/tweets/${id}?` +
      "tweet.fields=author_id,created_at,attachments,edit_controls,edit_history_tweet_ids", {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
  } catch (_) {
    throw new Error("x_provider_outcome_unknown");
  }
  if (response.status === 404) return {status: "not_found", providerPostId: id};
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("x_provider_request_rejected");
  const post = body?.data || {};
  if (String(post.id || "") !== id || String(post.author_id || "") !== EXPECTED_X_ID) {
    throw new Error("x_post_identity_mismatch");
  }
  return {status: "found", providerPostId: id, text: String(post.text || ""),
    createdAt: post.created_at || null, attachments: post.attachments || null,
    editControls: post.edit_controls || null,
    editHistoryPostIds: Array.isArray(post.edit_history_tweet_ids) ?
      post.edit_history_tweet_ids.map(String) : [id],
    providerPostUrl: `https://x.com/${EXPECTED_X_HANDLE}/status/${id}`};
}

async function createReplacementPost({fetchImpl = globalThis.fetch, accessToken, renderedCopy, mediaId}) {
  const created = await createPost({fetchImpl, accessToken, renderedCopy, mediaId});
  if (created.providerPostId === ORIGINAL_DEFECTIVE_POST_ID) {
    throw new Error("x_replacement_post_id_invalid");
  }
  return created;
}

async function reconcilePost({fetchImpl = globalThis.fetch, accessToken, renderedCopy,
  startedAt, endedAt}) {
  const url = new URL(`https://api.x.com/2/users/${EXPECTED_X_ID}/tweets`);
  url.searchParams.set("max_results", "10");
  url.searchParams.set("exclude", "retweets,replies");
  url.searchParams.set("tweet.fields", "created_at,attachments");
  if (startedAt) url.searchParams.set("start_time", new Date(startedAt).toISOString());
  if (endedAt) url.searchParams.set("end_time", new Date(endedAt).toISOString());
  const body = await providerJson(fetchImpl, url, {
    headers: {Authorization: `Bearer ${accessToken}`},
  }, "post_reconciliation");
  const matches = (body.data || []).filter((post) => post.text === renderedCopy);
  if (matches.length > 1) throw new Error("x_duplicate_provider_posts_detected");
  if (!matches.length) return {status: "not_found", providerPostId: null};
  return {status: "found", providerPostId: String(matches[0].id),
    createdAt: matches[0].created_at || null,
    providerPostUrl: `https://x.com/${EXPECTED_X_HANDLE}/status/${matches[0].id}`};
}

module.exports = {BUSINESS_UID, PLAN_ID, PLAN_VERSION_ID, CAMPAIGN_ID, CONTENT_ITEM_ID,
  VERSION_ID, VERSION_NUMBER, VERSION_DOCUMENT_ID, ORIGINAL_VERSION_DOCUMENT_ID,
  PRODUCTION_VERSION_ID, PRODUCTION_VERSION_NUMBER, PRODUCTION_VERSION_DOCUMENT_ID,
  PRODUCTION_SUCCESSOR_REASON,
  PREVIOUS_VERSION_ID, PREVIOUS_VERSION_NUMBER, PREVIOUS_VERSION_DOCUMENT_ID,
  MEDIA_ID, MEDIA_REVISION_ID, MEDIA_SHA256, MEDIA_URL, MEDIA_BYTES, MEDIA_WIDTH,
  MEDIA_HEIGHT, PRODUCTION_MEDIA_ID, PRODUCTION_MEDIA_REVISION_ID,
  DESTINATION_URL, SCHEDULED_FOR, EXPECTED_X_ID, EXPECTED_X_HANDLE,
  EXPECTED_X_NAME, V2_APPROVED_COPY, APPROVED_COPY, V2_CTA, CTA, ALT_TEXT,
  ORIGINAL_DEFECTIVE_POST_ID, ORIGINAL_DEFECT_REASON, REPLACEMENT_REASON,
  ORIGINAL_DELETION_SOURCE, DEFECTIVE_TRACKED_URL, PUBLIC_RESPONSE_ORIGIN,
  PRODUCTION_RESPONSE_ASSET_ID, PRODUCTION_RESPONSE_CODE, PRODUCTION_RESPONSE_URL,
  assertProductionResponseAsset,
  X_READ_SCOPES, X_WRITE_SCOPES,
  digest, weightedXLength, renderPostText, pngDimensions, assertMedia, versionRecord,
  versionFourRecord, productionMediaRecord, productionApprovalIntent,
  productionReplacementJob, assertNoStagingReference, assertProductionSuccessorHttpRequest,
  versionTwoRecord, approvalRecord, expectedJobId, assertWriteConnection, uploadMedia, createPost,
  reconcilePost, lookupPost, createReplacementPost};

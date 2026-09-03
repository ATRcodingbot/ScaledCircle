"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const subject = require("../functions-social-operations/x_first_publish");
const socialOperations = require("../functions-social-operations/social_operations");

const trackedUrl = "https://scaledcircle-staging.web.app/r?code=abcdefghijklmnopqrstuvwx";
const responseAsset = {responseAssetId: "asset-one", businessUid: subject.BUSINESS_UID,
  destination: subject.DESTINATION_URL, trackedUrl, attribution: {
    campaignId: subject.CAMPAIGN_ID, creativeVersion: subject.VERSION_ID,
    sourceDetail: `${subject.CONTENT_ITEM_ID}:${subject.VERSION_ID}`,
  }};

test("X v2 remains immutable and preserves the failed-v1 character-limit lineage", () => {
  assert.equal(subject.weightedXLength(subject.V2_APPROVED_COPY), 267);
  const version = subject.versionTwoRecord({responseAssetId: "asset-one", trackedUrl, now: 1000});
  assert.equal(subject.weightedXLength(version.variants[0].renderedCopy), 267);
  assert.equal(version.version, 2);
  assert.equal(version.supersedes, `${subject.CONTENT_ITEM_ID}_v1`);
  assert.equal(version.supersessionReason, "X_CHARACTER_LIMIT");
  assert.equal(version.immutable, true);
});

test("X v3 is one compliant immutable quality revision that supersedes v2", () => {
  assert.equal(subject.weightedXLength(subject.APPROVED_COPY), 277);
  const version = subject.versionRecord({responseAssetId: "asset-three", trackedUrl, now: 1000});
  assert.equal(subject.weightedXLength(version.variants[0].renderedCopy), 277);
  assert.equal(version.version, 3);
  assert.equal(version.supersedes, `${subject.CONTENT_ITEM_ID}_v2`);
  assert.equal(version.supersessionReason, "SOCIAL_QUALITY_IMPROVEMENT");
  assert.deepEqual(version.variants[0].hashtags, ["#MarylandBusiness"]);
  assert.equal(version.founderPublicationApprovalRequired, true);
  assert.equal(version.founderPublicationApproved, false);
  assert.equal(version.immutable, true);
});

test("the unchanged quality authority marks the exact v3 ready without performance guesses", () => {
  const version = subject.versionRecord({responseAssetId: "asset-three", trackedUrl, now: 1000});
  const v2 = subject.versionTwoRecord({responseAssetId: "asset-two", trackedUrl, now: 900});
  const assessment = socialOperations.assessScheduledContent({
    businessUid: subject.BUSINESS_UID,
    contentItemId: subject.CONTENT_ITEM_ID,
    versionRecord: version,
    businessContext: {businessName: "ScaledCircle", services: ["Smart Mapping"],
      geography: ["Maryland"]},
    recentVariants: v2.variants,
    performanceEvidence: [],
    now: 1100,
  });
  assert.equal(assessment.readyToPublish, true);
  assert.equal(assessment.recommendation, "keep");
  assert.equal(assessment.variantAssessments[0].evidenceStatus, "initial_experiment");
  assert.equal(assessment.variantAssessments[0].timing.confidence, "low");
  assert.equal(assessment.variantAssessments[0].scores.hashtagQuality, 90);
});

test("certified media has the exact hash, dimensions, type, and provider-safe size", () => {
  const media = fs.readFileSync(path.resolve(__dirname, "../apps/mobile/web/social/" +
    "scaledcircle-smart-mapping-x-v2.png"));
  assert.deepEqual(subject.assertMedia(media), {bytes: 577663, width: 1200, height: 675,
    sha256: subject.MEDIA_SHA256, type: "image/png"});
});

test("approval binds exact content, media, attribution, schedule, and quality", () => {
  const version = subject.versionRecord({responseAssetId: "asset-one", trackedUrl, now: 1000});
  const quality = {contentItemId: subject.CONTENT_ITEM_ID, contentVersion: 3,
    readyToPublish: true, score: 75, qualityBand: "good"};
  const approval = subject.approvalRecord({version, qualityAssessment: quality,
    responseAsset, now: 2000});
  assert.equal(approval.record.wildcardApproval, false);
  assert.equal(approval.record.mediaSha256, subject.MEDIA_SHA256);
  assert.equal(approval.record.responseAssetId, "asset-one");
  assert.equal(approval.record.scheduledFor, subject.SCHEDULED_FOR);
  assert.throws(() => subject.approvalRecord({version,
    qualityAssessment: {...quality, score: 74}, responseAsset}), /quality_gate/);
});

test("write connection accepts only the exact account and exact bounded scopes", () => {
  const exact = {status: "connected_write", writeScopesGranted: true,
    accountDisplayName: subject.EXPECTED_X_NAME, handle: `@${subject.EXPECTED_X_HANDLE}`,
    providerUserId: subject.EXPECTED_X_ID, grantedScopes: [...subject.X_WRITE_SCOPES],
    capabilities: {publishText: true, publishImage: true}};
  assert.equal(subject.assertWriteConnection(exact), exact);
  assert.throws(() => subject.assertWriteConnection({...exact, providerUserId: "other"}),
    /connection_mismatch/);
  assert.throws(() => subject.assertWriteConnection({...exact,
    grantedScopes: [...subject.X_WRITE_SCOPES, "follows.write"]}), /connection_mismatch/);
});

test("adapter uploads one certified image then creates one exact post", async () => {
  const media = fs.readFileSync(path.resolve(__dirname, "../apps/mobile/web/social/" +
    "scaledcircle-smart-mapping-x-v2.png"));
  const calls = [];
  const uploaded = await subject.uploadMedia({accessToken: "secret", bytes: media,
    fetchImpl: async (url, options) => {
      calls.push({url: String(url), options});
      return {ok: true, json: async () => ({data: {id: "media-one", media_key: "key-one"}})};
    }});
  const renderedCopy = subject.renderPostText(trackedUrl);
  const created = await subject.createPost({accessToken: "secret", renderedCopy,
    mediaId: uploaded.mediaId, fetchImpl: async (url, options) => {
      calls.push({url: String(url), options});
      return {ok: true, json: async () => ({data: {id: "post-one", text: renderedCopy}})};
    }});
  assert.deepEqual(calls.map((call) => call.url), [
    "https://api.x.com/2/media/upload", "https://api.x.com/2/tweets",
  ]);
  assert.deepEqual(JSON.parse(calls[1].options.body).media.media_ids, ["media-one"]);
  assert.equal(created.providerPostId, "post-one");
  assert.equal(JSON.stringify({uploaded, created}).includes("secret"), false);
});

test("ambiguous provider create never becomes an automatic retry", async () => {
  await assert.rejects(() => subject.createPost({accessToken: "secret",
    renderedCopy: subject.renderPostText(trackedUrl), mediaId: "media-one",
    fetchImpl: async () => { throw new Error("network"); }}), /outcome_unknown/);
});

test("reconciliation returns zero or one exact match and rejects duplicates", async () => {
  const renderedCopy = subject.renderPostText(trackedUrl);
  const fetchImpl = (data) => async () => ({ok: true, json: async () => ({data})});
  assert.equal((await subject.reconcilePost({accessToken: "secret", renderedCopy,
    fetchImpl: fetchImpl([])})).status, "not_found");
  assert.equal((await subject.reconcilePost({accessToken: "secret", renderedCopy,
    fetchImpl: fetchImpl([{id: "one", text: renderedCopy, created_at: "2026-09-03T14:00:00Z"}])}))
    .providerPostId, "one");
  await assert.rejects(() => subject.reconcilePost({accessToken: "secret", renderedCopy,
    fetchImpl: fetchImpl([{id: "one", text: renderedCopy}, {id: "two", text: renderedCopy}])}),
  /duplicate_provider_posts/);
});

test("known-post reconciliation validates exact post ownership without another create", async () => {
  const calls = [];
  const found = await subject.lookupPost({accessToken: "secret",
    providerPostId: subject.ORIGINAL_DEFECTIVE_POST_ID, fetchImpl: async (url, options) => {
      calls.push({url: String(url), method: options?.method || "GET"});
      return {ok: true, status: 200, json: async () => ({data: {
        id: subject.ORIGINAL_DEFECTIVE_POST_ID, author_id: subject.EXPECTED_X_ID,
        text: "original", created_at: "2026-09-03T14:04:00Z",
        edit_history_tweet_ids: [subject.ORIGINAL_DEFECTIVE_POST_ID],
      }})};
    }});
  assert.equal(found.status, "found");
  assert.equal(found.providerPostId, subject.ORIGINAL_DEFECTIVE_POST_ID);
  assert.deepEqual(calls, [{url: `https://api.x.com/2/tweets/${subject.ORIGINAL_DEFECTIVE_POST_ID}?` +
    "tweet.fields=author_id,created_at,attachments,edit_controls,edit_history_tweet_ids",
  method: "GET"}]);
  await assert.rejects(subject.lookupPost({accessToken: "secret", providerPostId: "123",
    fetchImpl: async () => ({ok: true, status: 200,
      json: async () => ({data: {id: "123", author_id: "other"}})})}),
  /identity_mismatch/);
});

test("replacement remains one distinct create and no delete adapter is exported", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null});
    return {ok: true, status: 200, json: async () => ({data: {
      id: "2095513212485529999", text: "replacement"}})};
  };
  assert.equal(subject.deletePost, undefined);
  const replaced = await subject.createReplacementPost({accessToken: "secret",
    renderedCopy: "replacement", mediaId: "media-one", fetchImpl});
  assert.equal(replaced.providerPostId, "2095513212485529999");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 0);
});

test("ambiguous replacement create never retries", async () => {
  let creates = 0;
  await assert.rejects(subject.createReplacementPost({accessToken: "secret",
    renderedCopy: "replacement", mediaId: "media-one", fetchImpl: async () => {
      creates += 1;
      throw new Error("network");
    }}), /outcome_unknown/);
  assert.equal(creates, 1);
});

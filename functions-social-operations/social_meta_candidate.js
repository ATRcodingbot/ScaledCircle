"use strict";

// Offline adapter preparation for the existing growth cycle. No transport or
// production export: a request description is never publication authority.
const {hash, jobs} = require("./social_growth_cycle");
const fail = (code) => { throw new Error(code); };
const numericId = (value) => typeof value === "string" && /^\d+$/.test(value);

function mediaRevision({businessUid, assetId, provider, images, productionOrigin}) {
  if (!businessUid || !assetId || !["facebook", "instagram"].includes(provider)) fail("meta_media_context");
  const origin = new URL(productionOrigin);
  if (origin.protocol !== "https:" || origin.origin !== productionOrigin ||
      /staging|web\.app|firebaseapp\.com|localhost|127\.0\.0\.1/i.test(origin.hostname)) fail("meta_media_origin");
  if (!Array.isArray(images) || images.length !== (provider === "facebook" ? 1 : 4)) fail("meta_media_count");
  const files = images.map((image) => {
    if (!/^[a-f0-9]{64}$/.test(image.sha256) || !Number.isSafeInteger(image.bytes) || image.bytes <= 0 ||
        image.bytes > 8 * 1024 * 1024 || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
        image.width <= 0 || image.height <= 0) fail("meta_media_invalid");
    const extension = image.mime === "image/png" ? "png" : image.mime === "image/jpeg" ? "jpg" : null;
    if (!extension || (provider === "instagram" && extension !== "jpg")) fail("meta_media_format");
    if (provider === "instagram" && (image.width < 320 || image.width > 1440 ||
        image.width / image.height < 0.8 || image.width / image.height > 1.91)) fail("meta_media_dimensions");
    if (image.url !== `${productionOrigin}/social/${image.sha256}.${extension}`) fail("meta_media_url");
    return {sha256: image.sha256, bytes: image.bytes, width: image.width, height: image.height,
      mime: image.mime, url: image.url};
  });
  if (new Set(files.map((file) => file.sha256)).size !== files.length) fail("meta_media_duplicate");
  const binding = {businessUid, assetId, provider, images: files};
  return {...binding, id: `media_sha256_${hash(binding)}`};
}

function prepare({job, revision, account, approval}) {
  if (!job || !["facebook", "instagram"].includes(job.provider) || !numericId(account?.providerUserId) ||
      account.businessUid !== job.businessUid) fail("meta_account_mismatch");
  const approvedAccount = approval?.providerAccounts?.[job.provider];
  if (approval?.businessUid !== job.businessUid || approval?.approvedByUid !== job.businessUid ||
      approval.revokedAt != null || approvedAccount?.providerUserId !== account.providerUserId ||
      (job.provider === "instagram" && approvedAccount?.linkedPageId !== account.linkedPageId) ||
      !jobs(approval).some((expected) => expected.id === job.id && hash(expected) === hash(job))) fail("meta_approval_mismatch");
  const variant = job.binding?.variants?.find((item) => item.provider === job.provider);
  const canonical = mediaRevision({...revision, productionOrigin: new URL(revision.images[0].url).origin});
  if (canonical.id !== revision.id || revision.businessUid !== job.businessUid || revision.provider !== job.provider ||
      variant?.mediaRevisionId !== revision.id || variant.mediaAssetId !== revision.assetId) fail("meta_media_binding");
  if (!variant.copy || (job.provider === "instagram" && variant.copy.length > 2200)) fail("meta_copy_invalid");
  if (job.provider === "instagram" && /click.{0,20}(caption|below)|clickable.{0,20}(caption|url)/i.test(variant.copy)) fail("meta_caption_cta");
  const accountId = account.providerUserId;
  if (job.provider === "facebook") return {jobId: job.id, provider: job.provider,
    request: {method: "POST", path: `/${accountId}/photos`, body: {
      url: revision.images[0].url, message: variant.copy, published: true}},
    requiredScopes: ["pages_manage_posts", "pages_read_engagement"], requiredPageTask: "CREATE_CONTENT",
    maximumEffects: {photoPosts: 1, containers: 0}, executionEnabled: false};
  if (!numericId(account.linkedPageId)) fail("meta_linked_page_required");
  return {jobId: job.id, provider: job.provider, linkedPageId: account.linkedPageId,
    children: revision.images.map((image, index) => ({stepId: `${job.id}:child:${index}`,
      method: "POST", path: `/${accountId}/media`, body: {image_url: image.url, is_carousel_item: true}})),
    parent: {stepId: `${job.id}:parent`, path: `/${accountId}/media`, media_type: "CAROUSEL",
      caption: variant.copy, childrenFrom: "durable_ordered_child_receipts"},
    publish: {stepId: `${job.id}:publish`, path: `/${accountId}/media_publish`,
      creationIdFrom: "durable_finished_parent_receipt"},
    requiredScopes: ["instagram_basic", "instagram_content_publish", "pages_read_engagement"],
    maximumEffects: {carouselPosts: 1, containers: 5}, executionEnabled: false};
}

// Resumption must use recorded step receipts; timeout is not permission to create
// another container/post. An expired container needs a new reviewed decision.
function nextStep(record) {
  if (record?.outcome === "unknown" || record?.started && !record?.providerId) return "reconcile";
  if (record?.status === "EXPIRED" || record?.status === "ERROR") return "needs_attention";
  if (record?.providerId && record.status === "FINISHED") return "reuse_receipt";
  if (record?.providerId) return "poll";
  return "not_started";
}

module.exports = {mediaRevision, prepare, nextStep};

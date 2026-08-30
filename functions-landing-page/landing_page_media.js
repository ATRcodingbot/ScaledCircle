"use strict";

const crypto = require("node:crypto");

const MAX_VISUALS = 6;
const ROLES = new Set(["hero", "service"]);

function clean(value, maximum = 240) {
  return value == null ? "" : String(value).trim().slice(0, maximum);
}
function safeHex(value) {const color=clean(value,9).toUpperCase();return /^#[0-9A-F]{6}$/.test(color)?color:null;}

function mediaRef(value, role, order = 0) {
  if (!value || typeof value !== "object") return null;
  const assetId = clean(value.assetId, 160);
  const revisionId = clean(value.revisionId, 160);
  if (!assetId || !revisionId) throw new Error("landing_page_media_reference_invalid");
  return {assetId, revisionId, role, order, altText: clean(value.altText, 240)};
}

function sanitizeMediaSelection(value = {}) {
  if (!value || typeof value !== "object") return {useBrandColors: false, logo: null, visuals: []};
  const logo = value.logo ? mediaRef(value.logo, "logo", 0) : null;
  const raw = Array.isArray(value.visuals) ? value.visuals : [];
  if (raw.length > MAX_VISUALS) throw new Error("landing_page_media_limit_exceeded");
  const visuals = raw.map((item, index) => {
    const role = clean(item?.role, 20).toLowerCase();
    if (!ROLES.has(role)) throw new Error("landing_page_media_role_invalid");
    return mediaRef(item, role, index);
  });
  const slotIds = new Set();
  for (const item of visuals) {
    const slotId = clean(raw[item.order]?.slotId, 80) || `${item.role}-${item.order + 1}`;
    if (!/^[a-z0-9_-]{1,80}$/i.test(slotId) || slotIds.has(slotId)) {
      throw new Error("landing_page_media_slot_invalid");
    }
    item.slotId = slotId; slotIds.add(slotId);
  }
  return {useBrandColors: value.useBrandColors === true, logo, visuals};
}

function publicPath({businessUid, pageId, versionId, slotId, contentHash}) {
  return `landing_page_public/${businessUid}/${pageId}/${versionId}/${slotId}/${contentHash}.webp`;
}

function publicUrl(bucketName, path) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media`;
}

async function approvedRevision(db, businessUid, selected) {
  const assetRef = db.collection("businessMediaLibraries").doc(businessUid)
    .collection("mediaAssets").doc(selected.assetId);
  const revisionRef = assetRef.collection("revisions").doc(selected.revisionId);
  const [assetSnap, revisionSnap] = await Promise.all([assetRef.get(), revisionRef.get()]);
  const asset = assetSnap.data?.() || {};
  const revision = revisionSnap.data?.() || {};
  const generated = revision.origin === "generated_service_concept";
  const approvalEvidence = generated ? revision.generatedContentAcknowledged === true &&
    revision.moderationStatus === "passed" && Boolean(clean(revision.truthfulnessDisclosure, 320)) :
    revision.rightsAttestation === true;
  if (!assetSnap.exists || !revisionSnap.exists || asset.businessUid !== businessUid ||
      revision.businessUid !== businessUid || asset.removed === true ||
      asset.approvedRevisionId !== selected.revisionId || revision.status !== "ready" ||
      revision.approvalStatus !== "approved" || !approvalEvidence) {
    throw new Error("landing_page_media_not_approved");
  }
  return {asset, revision};
}

async function materializeSelection({db, bucket, businessUid, pageId, versionId, selection}) {
  const normalized = sanitizeMediaSelection(selection);
  const selected = [...(normalized.logo ? [{...normalized.logo, slotId: "logo"}] : []), ...normalized.visuals];
  if (!selected.length && !normalized.useBrandColors) {
    return {schemaVersion: "LandingPageMediaSnapshotV1", useBrandColors: false, brand: null, logo: null, visuals: []};
  }
  const activeBucket = typeof bucket === "function" ? bucket() : bucket;
  if (!activeBucket) throw new Error("landing_page_media_storage_unavailable");
  const published = [];
  for (const item of selected) {
    const authority = await approvedRevision(db, businessUid, item);
    const variantNames=item.role==="logo"?["card"]:item.role==="hero"?["card","hero"]:["thumbnail","card"];
    const derivatives=[];
    for(const variant of variantNames){
      const rendition=authority.revision.renditions?.[variant];
      if(!rendition?.storagePath||rendition.mimeType!=="image/webp")throw new Error("landing_page_media_rendition_missing");
      const [bytes]=await activeBucket.file(rendition.storagePath).download();
      const contentHash=crypto.createHash("sha256").update(bytes).digest("hex");
      const path=publicPath({businessUid,pageId,versionId,slotId:item.slotId,contentHash});
      const target=activeBucket.file(path);
      try{await target.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},contentType:"image/webp",
        metadata:{cacheControl:"public,max-age=31536000,immutable",metadata:{landingPageId:pageId,
          landingPageVersionId:versionId,slotId:item.slotId,variant,contentHash}}});}
      catch(error){if(![409,412].includes(Number(error?.code)))throw error;}
      const [metadata]=await target.getMetadata();
      if(Number(metadata.size)!==bytes.length||metadata.contentType!=="image/webp"||
          metadata.metadata?.contentHash!==contentHash)throw new Error("landing_page_media_derivative_verification_failed");
      derivatives.push({variant,contentHash,publicDerivativePath:path,width:rendition.width,height:rendition.height,
        mimeType:"image/webp"});
    }
    const primary=derivatives.at(-1);
    published.push({slotId: item.slotId, role: item.role, order: item.order,
      assetId: item.assetId, revisionId: item.revisionId,
      altText: clean(authority.revision.altText,240),
      origin: authority.revision.origin || "business_upload",...primary,derivatives});
    if (authority.revision.origin === "generated_service_concept") {
      published.at(-1).truthfulnessDisclosure = clean(authority.revision.truthfulnessDisclosure, 320);
      published.at(-1).serviceCategory = clean(authority.revision.serviceLabel, 80) || null;
    }
  }
  let brand = null;
  if (normalized.useBrandColors) {
    const profile = await db.collection("businessBrandProfiles").doc(businessUid).get();
    if (profile.exists) {
      const data = profile.data();
      brand = {primaryColor: safeHex(data.primaryColor),
        secondaryColor: safeHex(data.secondaryColor),
        stylePreset: clean(data.stylePreset, 30) || null};
    }
  }
  return {schemaVersion: "LandingPageMediaSnapshotV1", useBrandColors: normalized.useBrandColors,
    brand, logo: published.find((item) => item.role === "logo") || null,
    visuals: published.filter((item) => item.role !== "logo")};
}

async function availableSnapshot({bucket, snapshot}) {
  if (!snapshot) return null;
  const activeBucket = typeof bucket === "function" ? bucket() : bucket;
  if (!activeBucket) return null;
  const keep = async (item) => {
    if (!item?.publicDerivativePath) return null;
    try {
      const available=[];
      for(const derivative of item.derivatives||[item]){const [exists]=await activeBucket.file(derivative.publicDerivativePath).exists();if(exists)available.push(derivative);}
      if(!available.length)return null;const primary=available.at(-1);return{...item,...primary,derivatives:available};
    }
    catch (_) { return null; }
  };
  const logo = await keep(snapshot.logo);
  const visuals = (await Promise.all((snapshot.visuals || []).map(keep))).filter(Boolean);
  return {...snapshot, logo, visuals};
}

module.exports = {MAX_VISUALS, sanitizeMediaSelection, publicPath, publicUrl,
  approvedRevision, materializeSelection, availableSnapshot};

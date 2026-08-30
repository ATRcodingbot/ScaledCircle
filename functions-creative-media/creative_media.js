"use strict";

const crypto = require("node:crypto");
const sharpDefault = require("sharp");

const SCHEMA_VERSION = "BusinessMediaV1";
const BRAND_VERSION = "BusinessBrandProfileV1";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_WIDTH = 12000;
const MAX_HEIGHT = 12000;
const MAX_PIXELS = 40_000_000;
const PAGE_SIZE = 20;
const MAX_ASSETS = 200;
const ACTIVE_INTENT_LIMIT = 3;
const PURPOSES = new Set(["logo", "hero", "service_visual"]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const RENDITIONS = Object.freeze({
  thumbnail: {width: 320, height: 320},
  card: {width: 960, height: 720},
  hero: {width: 1920, height: 1080},
});

function text(value, maximum = 240) {
  return value == null ? "" : String(value).trim().slice(0, maximum);
}
function requestId(value) {
  const normalized = text(value, 128);
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(normalized)) throw new Error("invalid_request_id");
  return normalized;
}
function safeId(prefix, uid, value) {
  return `${prefix}_${crypto.createHash("sha256").update(`${uid}\n${value}`).digest("hex").slice(0, 40)}`;
}
function pathFor(uid, assetId, revisionId) {
  return `business_media_private/${uid}/${assetId}/${revisionId}/original`;
}
function encodeCursor(createdAt, id) {
  return Buffer.from(JSON.stringify({createdAt, id})).toString("base64url");
}
function decodeCursor(value) {
  if (!value) return null;
  try {
    const result = JSON.parse(Buffer.from(text(value, 500), "base64url").toString("utf8"));
    if (!Number.isFinite(result.createdAt) || !/^[A-Za-z0-9_-]{3,160}$/.test(result.id)) throw new Error();
    return result;
  } catch (_) { throw new Error("invalid_media_cursor"); }
}
function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value)) return Number(value);
  return 0;
}
function readableTextColor(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#FFFFFF" : "#000000";
}
function revisionProjection(revisionDoc) {
  if (!revisionDoc?.exists) return null;
  const revision = revisionDoc.data();
  return {revisionId: revisionDoc.id, status: revision.status, approvalStatus: revision.approvalStatus,
    altText: revision.altText || "", serviceLabel: revision.serviceLabel || "",
    origin: revision.origin || "business_upload", moderationStatus: revision.moderationStatus || null,
    truthfulnessDisclosure: revision.truthfulnessDisclosure || null,
    generatedContentAcknowledged: revision.generatedContentAcknowledged === true,
    rightsAttestation: revision.rightsAttestation === true, failureCategory: revision.failureCategory || null,
    renditions: revision.renditions || {}};
}
function publicAsset(assetDoc, revisionDoc, approvedRevisionDoc = null) {
  const asset = assetDoc.data();
  return {
    assetId: assetDoc.id,
    purpose: asset.purpose,
    title: asset.title || null,
    currentRevisionId: asset.currentRevisionId || null,
    approvedRevisionId: asset.approvedRevisionId || null,
    removed: asset.removed === true,
    createdAt: timestampMillis(asset.createdAt),
    revision: revisionProjection(revisionDoc),
    approvedRevision: revisionProjection(approvedRevisionDoc),
  };
}

function createCreativeMediaService({db, bucket, FieldPath, FieldValue, Timestamp, sharp = sharpDefault}) {
  const storageBucket = () => typeof bucket === "function" ? bucket() : bucket;
  const library = (uid) => db.collection("businessMediaLibraries").doc(uid);
  const assets = (uid) => library(uid).collection("mediaAssets");
  const revision = (uid, assetId, revisionId) => assets(uid).doc(assetId).collection("revisions").doc(revisionId);

  async function createUploadIntent({actor, input}) {
    const idempotencyKey = requestId(input.requestId);
    const purpose = text(input.purpose, 40).toLowerCase();
    if (!PURPOSES.has(purpose)) throw new Error("invalid_media_purpose");
    const replacingAssetId = text(input.assetId, 160);
    const assetId = replacingAssetId || safeId("asset", actor.uid, idempotencyKey);
    const revisionId = safeId("revision", actor.uid, idempotencyKey);
    const assetRef = assets(actor.uid).doc(assetId);
    const revisionRef = revision(actor.uid, assetId, revisionId);
    const intentRef = db.collection("businessMediaUploadIntents").doc(revisionId);
    const originalPath = pathFor(actor.uid, assetId, revisionId);
    await db.runTransaction(async (tx) => {
      const libraryRef = library(actor.uid);
      const [librarySnap, assetSnap, revisionSnap] = await Promise.all([
        tx.get(libraryRef), tx.get(assetRef), tx.get(revisionRef),
      ]);
      if (revisionSnap.exists) return;
      const recordedActive = Array.isArray(librarySnap.data()?.activeUploadRevisionIds) ?
        librarySnap.data().activeUploadRevisionIds.slice(0, ACTIVE_INTENT_LIMIT + 5) : [];
      const activeSnapshots = await Promise.all(recordedActive.map((id) =>
        tx.get(db.collection("businessMediaUploadIntents").doc(id))));
      const activeUploads = activeSnapshots.filter((snap) => snap.exists &&
        snap.data().status === "open" && timestampMillis(snap.data().expiresAt) > Date.now())
        .map((snap) => snap.id);
      const assetTotal = Number(librarySnap.data()?.assetCount || 0);
      if (activeUploads.length >= ACTIVE_INTENT_LIMIT) throw new Error("media_upload_limit_reached");
      if (!assetSnap.exists && assetTotal >= MAX_ASSETS) throw new Error("media_asset_limit_reached");
      if (assetSnap.exists && assetSnap.data().businessUid !== actor.uid) throw new Error("media_access_denied");
      const at = FieldValue.serverTimestamp();
      if (!assetSnap.exists) tx.create(assetRef, {schemaVersion: SCHEMA_VERSION, businessUid: actor.uid,
        purpose, title: text(input.title, 100) || (purpose === "logo" ? "Company logo" : "Business photo"),
        currentRevisionId: revisionId, approvedRevisionId: null, removed: false, createdAt: at, updatedAt: at});
      else tx.update(assetRef, {currentRevisionId: revisionId, removed: false, updatedAt: at});
      tx.create(revisionRef, {schemaVersion: SCHEMA_VERSION, businessUid: actor.uid, assetId, revisionId,
        origin: "business_upload", purpose, status: "upload_pending", approvalStatus: "pending",
        moderationStatus: "not_required", privateOriginalPath: originalPath, renditions: {},
        altText: "", serviceLabel: "", rightsAttestation: false, requestId: idempotencyKey,
        createdAt: at, createdBy: actor.uid, updatedAt: at});
      tx.create(intentRef, {schemaVersion: SCHEMA_VERSION, businessUid: actor.uid, assetId, revisionId,
        storagePath: originalPath, status: "open", maximumBytes: MAX_BYTES,
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp"], createdAt: at,
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000)});
      tx.set(libraryRef, {schemaVersion: SCHEMA_VERSION, businessUid: actor.uid,
        activeUploadRevisionIds: [...activeUploads, revisionId], assetCount: assetTotal + (assetSnap.exists ? 0 : 1),
        updatedAt: at}, {merge: true});
    });
    return {assetId, revisionId, uploadPath: originalPath, maximumBytes: MAX_BYTES,
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp"]};
  }

  async function finalizeUpload({actor, input}) {
    const assetId = text(input.assetId, 160); const revisionId = text(input.revisionId, 160);
    const revRef = revision(actor.uid, assetId, revisionId);
    const intentRef = db.collection("businessMediaUploadIntents").doc(revisionId);
    const [revSnap, intentSnap] = await Promise.all([revRef.get(), intentRef.get()]);
    if (!revSnap.exists || !intentSnap.exists || revSnap.data().businessUid !== actor.uid ||
        intentSnap.data().businessUid !== actor.uid || intentSnap.data().assetId !== assetId) throw new Error("media_access_denied");
    if (revSnap.data().status === "ready") return {assetId, revisionId, status: "ready", idempotentReplay: true};
    const originalPath = pathFor(actor.uid, assetId, revisionId);
    const activeBucket = storageBucket();
    const file = activeBucket.file(originalPath);
    let metadata; let bytes;
    try { [metadata] = await file.getMetadata(); [bytes] = await file.download(); }
    catch (_) { throw new Error("media_upload_incomplete"); }
    if (String(metadata.generation || "") === "" || bytes.length < 1 || bytes.length > MAX_BYTES) {
      await failRevision(actor.uid, revRef, intentRef, "invalid_size", true); throw new Error("media_file_unsuitable");
    }
    await revRef.update({status: "uploaded", uploadedAt: FieldValue.serverTimestamp(),
      storageGeneration: String(metadata.generation), updatedAt: FieldValue.serverTimestamp()});
    await revRef.update({status: "processing", processingStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    try {
      const image = sharp(bytes, {failOn: "error", limitInputPixels: MAX_PIXELS, sequentialRead: true});
      const info = await image.metadata();
      if (!ALLOWED_FORMATS.has(info.format) || !info.width || !info.height ||
          info.width > MAX_WIDTH || info.height > MAX_HEIGHT || info.width * info.height > MAX_PIXELS) {
        throw Object.assign(new Error("invalid_image_dimensions"), {quarantine: true});
      }
      const normalized = sharp(bytes, {failOn: "error", limitInputPixels: MAX_PIXELS}).rotate();
      const renditionMap = {};
      for (const [name, bounds] of Object.entries(RENDITIONS)) {
        const output = await normalized.clone().resize({...bounds, fit: "inside", withoutEnlargement: true})
          .webp({quality: 82, effort: 4}).toBuffer({resolveWithObject: true});
        const renditionPath = `business_media_private/${actor.uid}/${assetId}/${revisionId}/renditions/${name}.webp`;
        await activeBucket.file(renditionPath).save(output.data, {resumable: false, contentType: "image/webp",
          metadata: {cacheControl: "private,max-age=31536000,immutable", metadata: {assetId, revisionId, rendition: name}}});
        renditionMap[name] = {storagePath: renditionPath, width: output.info.width,
          height: output.info.height, bytes: output.data.length, mimeType: "image/webp"};
      }
      const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(revRef);
        if (fresh.data()?.status === "ready") return;
        tx.update(revRef, {status: "ready", contentHash, storageGeneration: String(metadata.generation),
          mimeType: `image/${info.format === "jpeg" ? "jpeg" : info.format}`, bytes: bytes.length,
          width: info.width, height: info.height, renditions: renditionMap,
          processingCompletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), failureCategory: null});
        tx.update(intentRef, {status: "consumed", consumedAt: FieldValue.serverTimestamp()});
        tx.set(library(actor.uid), {activeUploadRevisionIds: FieldValue.arrayRemove(revisionId),
          updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      });
      return {assetId, revisionId, status: "ready", renditions: renditionMap};
    } catch (error) {
      await failRevision(actor.uid, revRef, intentRef, error.quarantine ? "file_unsuitable" : "processing_failed", error.quarantine);
      throw new Error(error.quarantine ? "media_file_unsuitable" : "media_processing_failed");
    }
  }
  async function ingestGeneratedCandidate({businessUid, requestId: rawRequestId, purpose, serviceCategory,
    binary, disclosure, moderation, jobId}) {
    const idempotencyKey = requestId(rawRequestId);
    if (!Buffer.isBuffer(binary) || binary.length < 1 || binary.length > MAX_BYTES) throw new Error("invalid_output");
    if (!PURPOSES.has(purpose) || purpose === "logo") throw new Error("invalid_generated_purpose");
    if (moderation?.status !== "passed") throw new Error("moderation_blocked");
    const assetId = safeId("asset", businessUid, `generated-${idempotencyKey}`);
    const revisionId = safeId("revision", businessUid, `generated-${idempotencyKey}`);
    const assetRef = assets(businessUid).doc(assetId);
    const revisionRef = revision(businessUid, assetId, revisionId);
    const intentRef = db.collection("businessMediaUploadIntents").doc(revisionId);
    const originalPath = pathFor(businessUid, assetId, revisionId);
    const existing = await revisionRef.get();
    if (existing.exists && existing.data().status === "ready") return {assetId, revisionId, idempotentReplay: true};
    const at = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      const libraryRef = library(businessUid);
      const [librarySnap, assetSnap, revisionSnap] = await Promise.all([
        tx.get(libraryRef), tx.get(assetRef), tx.get(revisionRef),
      ]);
      const assetTotal = Number(librarySnap.data()?.assetCount || 0);
      if (!assetSnap.exists && assetTotal >= MAX_ASSETS) throw new Error("media_asset_limit_reached");
      if (!assetSnap.exists) tx.create(assetRef, {schemaVersion: SCHEMA_VERSION, businessUid,
        purpose, title: `${text(serviceCategory, 80)} generated concept`, currentRevisionId: revisionId,
        approvedRevisionId: null, removed: false, createdAt: at, updatedAt: at});
      if (!revisionSnap.exists) tx.create(revisionRef, {schemaVersion: SCHEMA_VERSION, businessUid,
        assetId, revisionId, origin: "generated_service_concept", purpose, status: "upload_pending",
        approvalStatus: "pending", moderationStatus: "passed", moderation,
        truthfulnessDisclosure: text(disclosure, 320), generatedContentAcknowledged: false,
        privateOriginalPath: originalPath, renditions: {}, altText: `Concept image illustrating ${text(serviceCategory, 80)}`,
        serviceLabel: text(serviceCategory, 80), rightsAttestation: false, requestId: idempotencyKey,
        generationJobId: text(jobId, 160), createdAt: at, createdBy: "creative-media-core", updatedAt: at});
      tx.set(intentRef, {schemaVersion: SCHEMA_VERSION, businessUid, assetId, revisionId,
        storagePath: originalPath, status: "open", generatedBackendWrite: true, maximumBytes: MAX_BYTES,
        allowedContentTypes: ["image/png", "image/jpeg", "image/webp"], createdAt: at,
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000)}, {merge: false});
      tx.set(libraryRef, {schemaVersion: SCHEMA_VERSION, businessUid,
        assetCount: assetTotal + (assetSnap.exists ? 0 : 1), updatedAt: at}, {merge: true});
    });
    await storageBucket().file(originalPath).save(binary, {resumable: false,
      contentType: "application/octet-stream", metadata: {cacheControl: "private,no-store",
        metadata: {assetId, revisionId, origin: "generated_service_concept"}}});
    await finalizeUpload({actor: {uid: businessUid}, input: {assetId, revisionId}});
    return {assetId, revisionId, idempotentReplay: false};
  }
  async function approveGeneratedCandidate({businessUid, assetId, revisionId, actorUid}) {
    const assetRef = assets(businessUid).doc(text(assetId, 160));
    const revisionRef = revision(businessUid, text(assetId, 160), text(revisionId, 160));
    await db.runTransaction(async (tx) => {
      const [assetSnap, revisionSnap] = await Promise.all([tx.get(assetRef), tx.get(revisionRef)]);
      const data = revisionSnap.data?.() || {};
      if (!assetSnap.exists || !revisionSnap.exists || data.businessUid !== businessUid ||
          data.origin !== "generated_service_concept") throw new Error("media_access_denied");
      if (data.status !== "ready" || data.moderationStatus !== "passed" ||
          !text(data.truthfulnessDisclosure, 320)) throw new Error("media_approval_requirements_missing");
      if (data.approvalStatus === "approved") return;
      tx.update(revisionRef, {approvalStatus: "approved", generatedContentAcknowledged: true,
        approvedAt: FieldValue.serverTimestamp(), approvedBy: actorUid,
        updatedAt: FieldValue.serverTimestamp()});
      tx.update(assetRef, {approvedRevisionId: revisionId, removed: false,
        updatedAt: FieldValue.serverTimestamp()});
    });
    return {assetId, revisionId, approvalStatus: "approved"};
  }
  async function rejectGeneratedCandidate({businessUid, assetId, revisionId, actorUid}) {
    const assetRef = assets(businessUid).doc(text(assetId, 160));
    const revisionRef = revision(businessUid, text(assetId, 160), text(revisionId, 160));
    await db.runTransaction(async (tx) => {
      const [assetSnap, revisionSnap] = await Promise.all([tx.get(assetRef), tx.get(revisionRef)]);
      const data = revisionSnap.data?.() || {};
      if (!assetSnap.exists || !revisionSnap.exists || data.businessUid !== businessUid ||
          data.origin !== "generated_service_concept") throw new Error("media_access_denied");
      if (data.approvalStatus === "rejected") return;
      tx.update(revisionRef, {approvalStatus: "rejected", rejectedAt: FieldValue.serverTimestamp(),
        rejectedBy: actorUid, updatedAt: FieldValue.serverTimestamp()});
      tx.update(assetRef, {removed: true, removedAt: FieldValue.serverTimestamp(),
        removedBy: actorUid, updatedAt: FieldValue.serverTimestamp()});
    });
    return {assetId, revisionId, approvalStatus: "rejected"};
  }
  async function failRevision(uid, revRef, intentRef, category, quarantined = false) {
    await db.runTransaction(async (tx) => {
      const intent = await tx.get(intentRef);
      tx.update(revRef, {status: quarantined ? "quarantined" : "failed", failureCategory: category,
        processingCompletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      if (intent.data()?.status === "open") {
        tx.update(intentRef, {status: "failed", failureCategory: category, updatedAt: FieldValue.serverTimestamp()});
        tx.set(library(uid), {activeUploadRevisionIds: FieldValue.arrayRemove(intent.id),
          updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      }
    });
  }

  async function updateMetadata({actor, input}) {
    const ref = revision(actor.uid, text(input.assetId, 160), text(input.revisionId, 160));
    const snap = await ref.get(); if (!snap.exists || snap.data().businessUid !== actor.uid) throw new Error("media_access_denied");
    if (snap.data().status !== "ready") throw new Error("media_not_ready");
    await ref.update({altText: text(input.altText, 240), serviceLabel: text(input.serviceLabel, 80),
      rightsAttestation: input.rightsAttestation === true,
      rightsAttestedAt: input.rightsAttestation === true ? FieldValue.serverTimestamp() : null,
      rightsAttestedBy: input.rightsAttestation === true ? actor.uid : null,
      updatedAt: FieldValue.serverTimestamp()});
    return {updated: true};
  }
  async function review({actor, input, approved}) {
    const assetId = text(input.assetId, 160); const revisionId = text(input.revisionId, 160);
    const assetRef = assets(actor.uid).doc(assetId); const revRef = revision(actor.uid, assetId, revisionId);
    await db.runTransaction(async (tx) => {
      const [assetSnap, revSnap] = await Promise.all([tx.get(assetRef), tx.get(revRef)]);
      if (!assetSnap.exists || !revSnap.exists || revSnap.data().businessUid !== actor.uid) throw new Error("media_access_denied");
      if (revSnap.data().status !== "ready") throw new Error("media_not_ready");
      if (approved && (!revSnap.data().rightsAttestation || !text(revSnap.data().altText, 240))) throw new Error("media_approval_requirements_missing");
      if (revSnap.data().approvalStatus === (approved ? "approved" : "rejected")) return;
      tx.update(revRef, {approvalStatus: approved ? "approved" : "rejected",
        approvedAt: approved ? FieldValue.serverTimestamp() : null, approvedBy: approved ? actor.uid : null,
        rejectedAt: approved ? null : FieldValue.serverTimestamp(), rejectedBy: approved ? null : actor.uid,
        updatedAt: FieldValue.serverTimestamp()});
      if (approved) tx.update(assetRef, {approvedRevisionId: revisionId, removed: false, updatedAt: FieldValue.serverTimestamp()});
    });
    return {assetId, revisionId, approvalStatus: approved ? "approved" : "rejected"};
  }
  async function remove({actor, input}) {
    const assetRef = assets(actor.uid).doc(text(input.assetId, 160));
    const snap = await assetRef.get(); if (!snap.exists || snap.data().businessUid !== actor.uid) throw new Error("media_access_denied");
    await assetRef.update({removed: true, removedAt: FieldValue.serverTimestamp(), removedBy: actor.uid, updatedAt: FieldValue.serverTimestamp()});
    return {removed: true};
  }
  async function updateBrand({actor, input}) {
    const ref = db.collection("businessBrandProfiles").doc(actor.uid);
    const hasLogo = Object.hasOwn(input, "approvedLogo");
    const logo = input.approvedLogo && typeof input.approvedLogo === "object" ? input.approvedLogo : null;
    if (logo) {
      const snap = await revision(actor.uid, text(logo.assetId, 160), text(logo.revisionId, 160)).get();
      if (!snap.exists || snap.data().businessUid !== actor.uid || snap.data().approvalStatus !== "approved" || snap.data().purpose !== "logo") throw new Error("brand_logo_not_approved");
    }
    const color = (value) => { const v = text(value, 7).toUpperCase(); if (v && !/^#[0-9A-F]{6}$/.test(v)) throw new Error("invalid_brand_color"); return v || null; };
    const patch = {schemaVersion: BRAND_VERSION, businessUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid};
    if (hasLogo) patch.approvedLogo = logo ? {assetId: text(logo.assetId, 160), revisionId: text(logo.revisionId, 160)} : null;
    if (Object.hasOwn(input, "primaryColor")) {
      patch.primaryColor = color(input.primaryColor);
      patch.primaryTextColor = patch.primaryColor ? readableTextColor(patch.primaryColor) : null;
    }
    if (Object.hasOwn(input, "secondaryColor")) {
      patch.secondaryColor = color(input.secondaryColor);
      patch.secondaryTextColor = patch.secondaryColor ? readableTextColor(patch.secondaryColor) : null;
    }
    if (Object.hasOwn(input, "stylePreset")) {
      const preset = text(input.stylePreset, 30).toLowerCase();
      if (!["clean", "bold", "friendly", "premium"].includes(preset)) throw new Error("invalid_brand_style");
      patch.stylePreset = preset;
    }
    if (Array.isArray(input.approvedServiceCategories)) patch.approvedServiceCategories =
      input.approvedServiceCategories.slice(0, 12).map((v) => text(v, 80)).filter(Boolean);
    if (Array.isArray(input.visualDirectionTags)) patch.visualDirectionTags =
      input.visualDirectionTags.slice(0, 8).map((v) => text(v, 60)).filter(Boolean);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      tx.set(ref, {...patch, ...(existing.exists ? {} : {createdAt: FieldValue.serverTimestamp()})}, {merge: true});
    });
    return {updated: true};
  }
  async function workspace({actor, input = {}}) {
    const directAssetId = text(input.assetId, 160);
    if (directAssetId) {
      const doc = await assets(actor.uid).doc(directAssetId).get();
      if (!doc.exists || doc.data().businessUid !== actor.uid || doc.data().removed === true) {
        throw new Error("media_access_denied");
      }
      const currentId = doc.data().currentRevisionId; const approvedId = doc.data().approvedRevisionId;
      const [current, approved] = await Promise.all([
        currentId ? doc.ref.collection("revisions").doc(currentId).get() : null,
        approvedId && approvedId !== currentId ? doc.ref.collection("revisions").doc(approvedId).get() : null,
      ]);
      return {asset: publicAsset(doc, current, approved), hasMore: false, nextCursor: null};
    }
    const cursor = decodeCursor(input.cursor); let query = assets(actor.uid).where("removed", "==", false)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.createdAt), cursor.id);
    const snapshot = await query.limit(PAGE_SIZE + 1).get(); const page = snapshot.docs.slice(0, PAGE_SIZE);
    const result = [];
    for (const doc of page) {
      const currentId = doc.data().currentRevisionId; const approvedId = doc.data().approvedRevisionId;
      const [current, approved] = await Promise.all([
        currentId ? doc.ref.collection("revisions").doc(currentId).get() : null,
        approvedId && approvedId !== currentId ? doc.ref.collection("revisions").doc(approvedId).get() : null,
      ]);
      result.push(publicAsset(doc, current, approved));
    }
    const last = page.at(-1); const hasMore = snapshot.size > PAGE_SIZE;
    const brand = await db.collection("businessBrandProfiles").doc(actor.uid).get();
    return {assets: result, hasMore, nextCursor: hasMore && last ? encodeCursor(timestampMillis(last.data().createdAt), last.id) : null,
      brandProfile: brand.exists ? brand.data() : null,
      legacyCompatibility: {collection: "socialMediaLibraries", mode: "read_only_existing_workflow"},
      limits: {maximumAssets: MAX_ASSETS, maximumActiveUploads: ACTIVE_INTENT_LIMIT, maximumBytes: MAX_BYTES}};
  }
  return {createUploadIntent, finalizeUpload, ingestGeneratedCandidate, approveGeneratedCandidate,
    rejectGeneratedCandidate,
    updateMetadata, approve: (args) => review({...args, approved: true}),
    reject: (args) => review({...args, approved: false}), remove, updateBrand, workspace};
}

module.exports = {SCHEMA_VERSION, BRAND_VERSION, MAX_BYTES, MAX_WIDTH, MAX_HEIGHT, MAX_PIXELS,
  PAGE_SIZE, MAX_ASSETS, ACTIVE_INTENT_LIMIT, RENDITIONS, pathFor, encodeCursor, decodeCursor,
  createCreativeMediaService};

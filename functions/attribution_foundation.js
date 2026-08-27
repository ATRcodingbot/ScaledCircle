"use strict";

const crypto = require("crypto");

const SCHEMA_VERSION = "AttributionFoundationV1";
const ASSET_TYPES = new Set(["qr", "tracked_link"]);
const FUTURE_ASSET_TYPES = new Set(["landing_page", "phone", "email", "form", "promo_code"]);
const SOURCES = new Set([
  "direct", "website", "sales", "agent_prospecting", "referral", "affiliate",
  "social", "qr", "tracked_link", "landing_page", "phone", "email", "form",
  "print_material", "postcard", "door_hanger", "flyer", "brochure", "advertising",
]);
const CONVERSION_MILESTONES = new Set([
  "lead", "qualified_lead", "business_signup", "subscription",
  "first_funded_campaign", "repeat_funded_campaign", "customer_conversion",
]);
const PAGE_LIMIT = 100;

function text(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function millis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(value) ? Number(value) : null;
}

function assertHttpsDestination(value) {
  const raw = text(value, 1000);
  let parsed;
  try { parsed = new URL(raw); } catch (_) { throw new Error("invalid_response_destination"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("invalid_response_destination");
  }
  return parsed.toString();
}

function assertAttributionActor(actor) {
  if (!actor?.uid || actor.emailVerified !== true || actor.user?.active === false ||
      actor.user?.disabled === true || !["admin", "business"].includes(actor.role)) {
    throw new Error("attribution_actor_required");
  }
  return actor;
}

function opaqueCode(randomBytes = crypto.randomBytes) {
  return randomBytes(18).toString("base64url");
}

function canonicalEnvelope(input = {}) {
  const source = text(input.source, 40).toLowerCase() || "direct";
  if (!SOURCES.has(source)) throw new Error("invalid_attribution_source");
  return {
    schemaVersion: SCHEMA_VERSION,
    source,
    sourceDetail: text(input.sourceDetail, 160) || null,
    campaignId: text(input.campaignId, 160) || null,
    zoneId: text(input.zoneId, 160) || null,
    materialId: text(input.materialId, 160) || null,
    materialType: text(input.materialType, 60).toLowerCase() || null,
    creativeVersion: text(input.creativeVersion, 80) || null,
    responseAssetId: text(input.responseAssetId, 160) || null,
    interactionId: text(input.interactionId, 160) || null,
    leadId: text(input.leadId, 160) || null,
  };
}

function privacyFingerprint({ip, userAgent, assetId, now = Date.now()}) {
  const rawIp = text(ip, 100);
  const prefix = rawIp.includes(":") ? rawIp.split(":").slice(0, 4).join(":") :
    rawIp.split(".").slice(0, 3).join(".");
  const day = new Date(now).toISOString().slice(0, 10);
  return crypto.createHash("sha256")
    .update(`${assetId}|${day}|${prefix}|${text(userAgent, 240)}`)
    .digest("hex");
}

function safeAsset(id, data, publicBaseUrl) {
  const code = text(data.publicCode, 80);
  return {
    responseAssetId: id,
    type: text(data.type, 40),
    status: text(data.status, 30) || "active",
    label: text(data.label, 160) || null,
    destination: text(data.destination, 1000),
    trackedUrl: `${publicBaseUrl.replace(/\/$/, "")}/r?code=${encodeURIComponent(code)}`,
    attribution: canonicalEnvelope(data.attribution || {}),
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
  };
}

function createAttributionService({db, FieldValue, now = () => Date.now(), randomBytes = crypto.randomBytes,
  publicBaseUrl = "https://scaledcircle.com"}) {
  async function resolveBusinessUid(actor, requested) {
    assertAttributionActor(actor);
    const businessUid = actor.role === "business" ? actor.uid : text(requested, 160);
    if (!businessUid) throw new Error("business_identity_required");
    if (actor.role === "business" && requested && requested !== actor.uid) {
      throw new Error("cross_business_attribution_forbidden");
    }
    const user = await db.collection("users").doc(businessUid).get();
    if (!user.exists || text(user.data()?.role, 40).toLowerCase() !== "business") {
      throw new Error("business_identity_required");
    }
    return businessUid;
  }

  async function validateOwnedReferences(businessUid, envelope) {
    if (envelope.campaignId) {
      const campaign = await db.collection("campaigns").doc(envelope.campaignId).get();
      if (!campaign.exists || campaign.data()?.businessId !== businessUid) {
        throw new Error("attribution_reference_forbidden");
      }
    }
    if (envelope.zoneId) {
      const zone = await db.collection("campaignZones").doc(envelope.zoneId).get();
      if (!zone.exists || zone.data()?.businessId !== businessUid ||
          (envelope.campaignId && zone.data()?.campaignId !== envelope.campaignId)) {
        throw new Error("attribution_reference_forbidden");
      }
    }
  }

  async function createResponseAsset(input, actor) {
    const businessUid = await resolveBusinessUid(actor, input?.businessUid);
    const type = text(input?.type, 40).toLowerCase();
    if (!ASSET_TYPES.has(type)) throw new Error("unsupported_response_asset_type");
    const attribution = canonicalEnvelope({...input?.attribution, source: input?.attribution?.source || type});
    await validateOwnedReferences(businessUid, attribution);
    const destination = assertHttpsDestination(input?.destination);
    const ref = db.collection("responseAssets").doc();
    const code = opaqueCode(randomBytes);
    await ref.create({schemaVersion: SCHEMA_VERSION, businessUid, type, publicCode: code,
      status: "active", label: text(input?.label, 160) || null, destination,
      attribution: {...attribution, responseAssetId: ref.id}, createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    return {responseAssetId: ref.id, publicCode: code,
      trackedUrl: `${publicBaseUrl.replace(/\/$/, "")}/r?code=${encodeURIComponent(code)}`};
  }

  async function resolveAndRecord({code, ip, userAgent}) {
    const publicCode = text(code, 80);
    if (!publicCode) throw new Error("response_asset_not_found");
    const matches = await db.collection("responseAssets").where("publicCode", "==", publicCode).limit(2).get();
    if (matches.docs.length !== 1) throw new Error("response_asset_not_found");
    const assetDoc = matches.docs[0];
    const asset = assetDoc.data() || {};
    if (asset.status !== "active") throw new Error("response_asset_inactive");
    const destination = assertHttpsDestination(asset.destination);
    const fingerprint = privacyFingerprint({ip, userAgent, assetId: assetDoc.id, now: now()});
    const interactionId = crypto.createHash("sha256").update(`${assetDoc.id}|${fingerprint}`).digest("hex");
    const ref = db.collection("responseInteractions").doc(interactionId);
    let created = false;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) return;
      const envelope = canonicalEnvelope({...asset.attribution, responseAssetId: assetDoc.id,
        interactionId});
      transaction.create(ref, {schemaVersion: SCHEMA_VERSION, businessUid: asset.businessUid,
        responseAssetId: assetDoc.id, publicCode, attribution: envelope,
        visitorHash: fingerprint, occurredAt: FieldValue.serverTimestamp(), immutable: true});
      transaction.set(db.collection("featureHealth").doc("attribution"), {
        schemaVersion: SCHEMA_VERSION, feature: "attribution", status: "enabled",
        successfulEvents: FieldValue.increment(1), lastSuccessfulEventAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      created = true;
    });
    return {destination, interactionId, created};
  }

  async function bridgeLead(input, actor) {
    const interactionId = text(input?.interactionId, 160);
    if (!interactionId) throw new Error("interaction_id_required");
    const interaction = await db.collection("responseInteractions").doc(interactionId).get();
    if (!interaction.exists) throw new Error("interaction_not_found");
    const interactionData = interaction.data() || {};
    const businessUid = await resolveBusinessUid(actor, interactionData.businessUid);
    if (businessUid !== interactionData.businessUid) throw new Error("cross_business_attribution_forbidden");
    const businessName = text(input?.businessName, 160) || "Campaign response";
    const leadRef = db.collection("salesLeads").doc();
    const activityRef = db.collection("salesActivities").doc();
    const conversionRef = db.collection("attributionConversions").doc(`lead_${leadRef.id}`);
    const at = FieldValue.serverTimestamp();
    const attribution = canonicalEnvelope({...interactionData.attribution, interactionId, leadId: leadRef.id});
    await db.runTransaction(async (transaction) => {
      transaction.create(leadRef, {schemaVersion: "SalesFunnelV1", leadType: "campaign_response",
        businessName, contactName: text(input?.contactName, 120) || null,
        contactEmail: text(input?.contactEmail, 160).toLowerCase() || null,
        contactPhone: text(input?.contactPhone, 50) || null, source: attribution.source,
        sourceDetail: attribution.sourceDetail, attribution, firstAttribution: attribution,
        lastAttribution: attribution, stage: "prospect", priority: "normal",
        ownerUid: actor.uid, suppressionStatus: null, createdBy: actor.uid, createdAt: at, updatedAt: at});
      transaction.create(activityRef, {schemaVersion: "SalesFunnelV1", leadId: leadRef.id,
        type: "lead_created", actorUid: actor.uid, attribution, occurredAt: at});
      transaction.create(conversionRef, {schemaVersion: SCHEMA_VERSION, milestone: "lead",
        businessUid, leadId: leadRef.id, interactionId, responseAssetId: interactionData.responseAssetId,
        attribution, occurredAt: at, economicValue: null, immutable: true});
    });
    return {leadId: leadRef.id, conversionId: conversionRef.id};
  }

  async function getOverview(input, actor) {
    assertAttributionActor(actor);
    const requestedBusinessUid = text(input?.businessUid, 160);
    const businessUid = actor.role === "admin" && !requestedBusinessUid ? null :
      await resolveBusinessUid(actor, requestedBusinessUid);
    const limit = Math.min(Math.max(Number(input?.limit) || PAGE_LIMIT, 1), PAGE_LIMIT);
    const bounded = (collection, timestampField) => businessUid ?
      db.collection(collection).where("businessUid", "==", businessUid).limit(limit) :
      db.collection(collection).orderBy(timestampField, "desc").limit(limit);
    const [assetSnap, interactionSnap, conversionSnap] = await Promise.all([
      bounded("responseAssets", "createdAt").get(),
      bounded("responseInteractions", "occurredAt").get(),
      bounded("attributionConversions", "occurredAt").get(),
    ]);
    const assets = assetSnap.docs.map((doc) => safeAsset(doc.id, doc.data() || {}, publicBaseUrl));
    const interactions = interactionSnap.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
    const conversions = conversionSnap.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
    const leadIds = new Set(conversions.map((item) => text(item.leadId, 160)).filter(Boolean));
    return {schemaVersion: SCHEMA_VERSION, generatedAt: now(), scope: businessUid || "admin_bounded",
      metrics: {responseAssets: assets.length, trackedInteractions: interactions.length,
        uniqueResponses: new Set(interactions.map((item) => text(item.visitorHash, 80))).size,
        leads: leadIds.size,
        conversions: conversions.filter((item) => item.milestone !== "lead").length},
      assets, dataStatus: assets.length || interactions.length ? "available" : "insufficient_data",
      page: {limit, bounded: true}};
  }

  return {createResponseAsset, resolveAndRecord, bridgeLead, getOverview};
}

module.exports = {SCHEMA_VERSION, ASSET_TYPES, FUTURE_ASSET_TYPES, SOURCES,
  CONVERSION_MILESTONES, PAGE_LIMIT, text, millis, assertHttpsDestination,
  assertAttributionActor, opaqueCode, canonicalEnvelope, privacyFingerprint,
  safeAsset, createAttributionService};

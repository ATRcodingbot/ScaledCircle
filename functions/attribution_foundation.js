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
const LIVE_CAMPAIGN_STATUSES = new Set([
  "open", "published", "active", "assigned", "in_progress", "submitted", "awaiting_review",
]);
const PAUSED_CAMPAIGN_STATUSES = new Set(["paused", "paused_work_window"]);
const COMPLETED_CAMPAIGN_STATUSES = new Set(["approved", "completed"]);
const CANCELLED_CAMPAIGN_STATUSES = new Set([
  "cancelled", "canceled", "canceling", "refunded", "archived",
]);
const PUBLIC_RESPONSE_ORIGINS = Object.freeze({
  "scaled-circle": "https://scaledcircle.com",
  "scaledcircle-staging": "https://scaledcircle-staging.web.app",
  "demo-scaledcircle": "http://127.0.0.1:5000",
});

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

function publicResponseOrigin(projectId) {
  return PUBLIC_RESPONSE_ORIGINS[text(projectId, 160)] || null;
}

function assertPublicResponseOrigin(value) {
  const raw = text(value, 1000);
  let parsed;
  try { parsed = new URL(raw); } catch (_) { throw new Error("response_origin_unavailable"); }
  const local = ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
      parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("response_origin_unavailable");
  }
  return parsed.origin;
}

function responseCodeFingerprint(value) {
  const code = text(value, 80);
  return code ? crypto.createHash("sha256").update(code).digest("hex").slice(0, 16) : null;
}

function resolverFailureCategory(error) {
  const code = String(error?.message || "");
  if (code === "response_code_malformed") return "malformed_code";
  if (code === "response_asset_not_found") return "unknown_code";
  if (code === "response_asset_ambiguous") return "ambiguous_code";
  if (code === "response_asset_inactive") return "inactive_asset";
  if (code === "response_asset_expired") return "expired_asset";
  if (code === "invalid_response_destination") return "invalid_destination";
  return "datastore_or_internal_failure";
}

function assertAttributionActor(actor) {
  const role = text(actor?.role, 40).toLowerCase();
  const trustedAdmin = role === "admin" && actor?.isAdmin === true;
  const activeBusiness = role === "business" && actor?.user?.active !== false &&
    actor?.user?.disabled !== true;
  if (!actor?.uid || actor.emailVerified !== true || (!trustedAdmin && !activeBusiness)) {
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

function responseActivityClass(asset, campaign) {
  if (text(asset?.status, 30).toLowerCase() !== "active") return "retired";
  if (!text(asset?.attribution?.campaignId, 160)) return "prelaunch";
  const status = text(campaign?.status, 40).toLowerCase() || "draft";
  if (LIVE_CAMPAIGN_STATUSES.has(status)) return "live";
  if (PAUSED_CAMPAIGN_STATUSES.has(status)) return "paused";
  if (COMPLETED_CAMPAIGN_STATUSES.has(status)) return "post_campaign";
  if (CANCELLED_CAMPAIGN_STATUSES.has(status)) return "cancelled";
  return "prelaunch";
}

function interactionEventId(assetId, requestIdentity) {
  const requestKey = text(requestIdentity, 500);
  if (!requestKey) throw new Error("response_request_identity_required");
  return crypto.createHash("sha256").update(`${assetId}|${requestKey}`).digest("hex");
}

function safeAsset(id, data, publicBaseUrl) {
  const origin = assertPublicResponseOrigin(publicBaseUrl);
  const code = text(data.publicCode, 80);
  return {
    responseAssetId: id,
    type: text(data.type, 40),
    status: text(data.status, 30) || "active",
    label: text(data.label, 160) || null,
    destination: text(data.destination, 1000),
    trackedUrl: `${origin}/r?code=${encodeURIComponent(code)}`,
    attribution: canonicalEnvelope(data.attribution || {}),
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
  };
}

function createAttributionService({db, FieldValue, now = () => Date.now(), randomBytes = crypto.randomBytes,
  publicBaseUrl}) {
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
    const origin = assertPublicResponseOrigin(publicBaseUrl);
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
      trackedUrl: `${origin}/r?code=${encodeURIComponent(code)}`};
  }

  async function resolveAndRecord({code, ip, userAgent, requestIdentity}) {
    const publicCode = text(code, 80);
    if (!/^[A-Za-z0-9_-]{24}$/.test(publicCode)) throw new Error("response_code_malformed");
    const matches = await db.collection("responseAssets").where("publicCode", "==", publicCode).limit(2).get();
    if (matches.docs.length === 0) throw new Error("response_asset_not_found");
    if (matches.docs.length !== 1) throw new Error("response_asset_ambiguous");
    const assetDoc = matches.docs[0];
    const asset = assetDoc.data() || {};
    if (asset.status !== "active") throw new Error("response_asset_inactive");
    const expiresAt = millis(asset.expiresAt);
    if (expiresAt !== null && expiresAt <= now()) throw new Error("response_asset_expired");
    const destination = assertHttpsDestination(asset.destination);
    const fingerprint = privacyFingerprint({ip, userAgent, assetId: assetDoc.id, now: now()});
    const interactionId = interactionEventId(assetDoc.id, requestIdentity);
    const campaignId = text(asset.attribution?.campaignId, 160);
    const campaign = campaignId ? await db.collection("campaigns").doc(campaignId).get() : null;
    const analyticsClass = responseActivityClass(asset, campaign?.exists ? campaign.data() : null);
    const ref = db.collection("responseInteractions").doc(interactionId);
    let created = false;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) return;
      const envelope = canonicalEnvelope({...asset.attribution, responseAssetId: assetDoc.id,
        interactionId});
      transaction.create(ref, {schemaVersion: SCHEMA_VERSION, businessUid: asset.businessUid,
        responseAssetId: assetDoc.id, publicCode, attribution: envelope,
        visitorHash: fingerprint, analyticsClass, liveAttribution: analyticsClass === "live",
        occurredAt: FieldValue.serverTimestamp(), immutable: true});
      transaction.set(db.collection("featureHealth").doc("attribution"), {
        schemaVersion: SCHEMA_VERSION, feature: "attribution", status: "enabled",
        successfulEvents: FieldValue.increment(1), lastSuccessfulEventAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      created = true;
    });
    return {destination, interactionId, analyticsClass, created};
  }

  async function bridgeLead(input, actor) {
    const interactionId = text(input?.interactionId, 160);
    if (!interactionId) throw new Error("interaction_id_required");
    const interaction = await db.collection("responseInteractions").doc(interactionId).get();
    if (!interaction.exists) throw new Error("interaction_not_found");
    const interactionData = interaction.data() || {};
    if (interactionData.analyticsClass !== "live") throw new Error("interaction_not_live");
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
        attribution, analyticsClass: "live", occurredAt: at, economicValue: null, immutable: true});
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
    const [assetSnap, interactionSnap, conversionSnap, businessCampaignSnap] = await Promise.all([
      bounded("responseAssets", "createdAt").get(),
      bounded("responseInteractions", "occurredAt").get(),
      bounded("attributionConversions", "occurredAt").get(),
      businessUid ? db.collection("campaigns").where("businessId", "==", businessUid)
        .limit(PAGE_LIMIT).get() : Promise.resolve({docs: []}),
    ]);
    const assetRecords = assetSnap.docs.map((doc) => ({id: doc.id, data: doc.data() || {}}));
    const campaignIds = [...new Set(assetRecords.map((item) =>
      text(item.data.attribution?.campaignId, 160)).filter(Boolean))];
    const campaignEntries = await Promise.all(campaignIds.map(async (campaignId) => {
      const snapshot = await db.collection("campaigns").doc(campaignId).get();
      return [campaignId, snapshot.exists ? snapshot.data() : null];
    }));
    const campaigns = new Map(campaignEntries);
    const assets = assetRecords.map((item) => ({
      ...safeAsset(item.id, item.data, publicBaseUrl),
      analyticsClass: responseActivityClass(
        item.data,
        campaigns.get(text(item.data.attribution?.campaignId, 160)),
      ),
    }));
    const assetDataById = new Map(assetRecords.map((item) => [item.id, item.data]));
    const interactions = interactionSnap.docs.map((doc) => {
      const data = doc.data() || {};
      if (text(data.analyticsClass, 40)) return {id: doc.id, ...data};
      const asset = assetDataById.get(text(data.responseAssetId, 160));
      const campaignId = text(asset?.attribution?.campaignId, 160);
      return {id: doc.id, ...data,
        analyticsClass: responseActivityClass(asset, campaigns.get(campaignId))};
    });
    const conversions = conversionSnap.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
    const liveInteractions = interactions.filter((item) => item.analyticsClass === "live");
    const testInteractions = interactions.filter((item) => item.analyticsClass === "prelaunch");
    const nonLiveInteractions = interactions.filter((item) =>
      !["live", "prelaunch"].includes(item.analyticsClass));
    const liveConversions = conversions.filter((item) => item.analyticsClass !== "prelaunch" &&
      item.analyticsClass !== "paused" && item.analyticsClass !== "cancelled");
    const leadIds = new Set(liveConversions.map((item) => text(item.leadId, 160)).filter(Boolean));
    return {schemaVersion: SCHEMA_VERSION, generatedAt: now(), scope: businessUid || "admin_bounded",
      metrics: {responseAssets: assets.length, trackedInteractions: liveInteractions.length,
        uniqueResponses: new Set(liveInteractions.map((item) => text(item.visitorHash, 80))).size,
        testInteractions: testInteractions.length,
        uniqueTestResponses: new Set(testInteractions.map((item) => text(item.visitorHash, 80))).size,
        nonLiveInteractions: nonLiveInteractions.length,
        totalInteractions: interactions.length,
        leads: leadIds.size,
        conversions: liveConversions.filter((item) => item.milestone !== "lead").length},
      assets,
      campaigns: businessCampaignSnap.docs.map((doc) => {
        const data = doc.data() || {};
        return {campaignId: doc.id, name: text(data.campaignName || data.name, 120) || "Campaign",
          status: text(data.status, 40) || "draft"};
      }),
      dataStatus: assets.length || interactions.length ? "available" : "insufficient_data",
      page: {limit, bounded: true}};
  }

  return {createResponseAsset, resolveAndRecord, bridgeLead, getOverview};
}

module.exports = {SCHEMA_VERSION, ASSET_TYPES, FUTURE_ASSET_TYPES, SOURCES,
  CONVERSION_MILESTONES, PAGE_LIMIT, text, millis, assertHttpsDestination,
  PUBLIC_RESPONSE_ORIGINS, publicResponseOrigin, assertPublicResponseOrigin,
  responseCodeFingerprint, resolverFailureCategory, assertAttributionActor,
  opaqueCode, canonicalEnvelope, privacyFingerprint, responseActivityClass, interactionEventId,
  safeAsset, createAttributionService};

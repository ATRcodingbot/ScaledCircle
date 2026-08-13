"use strict";

const crypto = require("node:crypto");

const MATERIAL_FULFILLMENT_TYPES = Object.freeze([
  "scaler_pickup_print_shop",
  "scaler_pickup_business",
  "business_delivery",
  "no_materials_required",
]);

const LEGACY_MATERIAL_FULFILLMENT_TYPES = Object.freeze({
  third_party_pickup: "scaler_pickup_print_shop",
  business_pickup: "scaler_pickup_business",
  business_dropoff: "business_delivery",
});

const HANDOFF_STATES = Object.freeze([
  "not_required",
  "scheduled",
  "scaler_en_route",
  "scaler_arrived",
  "waiting_for_counterparty",
  "handoff_in_progress",
  "received",
  "failed_scaler",
  "failed_business",
  "failed_third_party",
  "support_review",
]);

const HANDOFF_TRANSITIONS = Object.freeze({
  not_required: [],
  scheduled: ["scaler_en_route", "failed_scaler", "failed_business", "failed_third_party"],
  scaler_en_route: ["scaler_arrived", "failed_scaler"],
  scaler_arrived: ["waiting_for_counterparty", "handoff_in_progress", "received"],
  waiting_for_counterparty: ["handoff_in_progress", "failed_business", "failed_third_party"],
  handoff_in_progress: ["received", "failed_business", "failed_third_party"],
  received: [],
  failed_scaler: [],
  failed_business: [],
  failed_third_party: ["support_review"],
  support_review: [],
});

const MAX_ZONE_WALKING_MINUTES = 360;
const HANDOFF_GRACE_MINUTES = 15;
const CUTOFF_WARNING_MINUTES = 30;
const SUPPORT_EMAIL = "support@scaledcircle.com";
const SUPPORT_CASE_CATEGORIES = Object.freeze([
  "material_handoff", "business_no_show", "scaler_no_show", "campaign_issue",
  "verification_dispute", "payment_refund", "transfer_payout", "account",
  "chat_report", "other",
]);

const SUPPORT_ACTIONS = Object.freeze([
  "release_assignment", "reschedule_handoff", "resolve_business_failure",
  "authorize_handoff_allocation", "authorize_redo", "extend_deadline",
  "reopen_assignment", "restrict_account", "suspend_account", "resolve_case",
]);

const DEFAULT_WORK_WINDOWS = Object.freeze({
  residential: {start: "08:00", end: "20:00"},
  commercial: {start: "06:00", end: "20:00"},
});

function normalizeMaterialLogistics(value = {}) {
  const fulfillmentType = normalizeFulfillmentType(value.fulfillmentType);
  const materialsRequired = fulfillmentType !== "no_materials_required";
  const scheduledAt = value.scheduledAt || null;
  const windowEndAt = value.windowEndAt || null;
  const location = String(value.location || "").trim();
  const printingShopName = String(value.printingShopName || "").trim();
  const orderReference = String(value.orderReference || "").trim();
  const instructions = String(value.instructions || "").trim();
  if (materialsRequired && (!scheduledAt || !location)) {
    throw new Error("Material date/time and location are required.");
  }
  if (materialsRequired && Number.isNaN(new Date(scheduledAt).getTime())) {
    throw new Error("Material date and time must be valid.");
  }
  if (windowEndAt && (Number.isNaN(new Date(windowEndAt).getTime()) ||
      new Date(windowEndAt) < new Date(scheduledAt))) {
    throw new Error("Material window end must follow its start.");
  }
  if (fulfillmentType === "scaler_pickup_print_shop" && !printingShopName) {
    throw new Error("Printing shop name is required.");
  }
  if ([location, printingShopName, orderReference].some((item) => item.length > 500) ||
      instructions.length > 2000) throw new Error("Material logistics details are too long.");
  return {fulfillmentType, materialsRequired,
    scheduledAt: materialsRequired ? scheduledAt : null,
    windowEndAt: materialsRequired ? windowEndAt : null,
    location: materialsRequired ? location : null,
    printingShopName: fulfillmentType === "scaler_pickup_print_shop" ? printingShopName : null,
    orderReference: orderReference || null, instructions: instructions || null};
}

function materialLogisticsFromCampaign(campaign = {}) {
  const fulfillmentType = normalizeFulfillmentType(String(
    campaign.materialFulfillmentType || campaign.materialHandoffMethod ||
    "no_materials_required",
  ));
  const materialsRequired = fulfillmentType !== "no_materials_required";
  return {
    fulfillmentType,
    materialsRequired,
    scheduledAt: materialsRequired ? campaign.materialHandoffScheduledAt || null : null,
    windowEndAt: materialsRequired ? campaign.materialHandoffWindowEndAt || null : null,
    location: materialsRequired ? String(campaign.materialHandoffAddress ||
      campaign.materialPickupAddress || campaign.materialDropoffAddress || "").trim() : null,
    printingShopName: fulfillmentType === "scaler_pickup_print_shop" ?
      String(campaign.materialHandoffPrintingShopName || "").trim() || null : null,
    orderReference: materialsRequired ?
      String(campaign.materialHandoffOrderReference || "").trim() || null : null,
    instructions: materialsRequired ?
      String(campaign.materialHandoffInstructions || "").trim() || null : null,
  };
}

function logisticsDateIdentity(value) {
  if (value == null) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : String(value);
}

function materialLogisticsDigest(logistics = {}) {
  const canonical = {
    fulfillmentType: logistics.fulfillmentType || null,
    materialsRequired: logistics.materialsRequired === true,
    scheduledAt: logisticsDateIdentity(logistics.scheduledAt),
    windowEndAt: logisticsDateIdentity(logistics.windowEndAt),
    location: logistics.location || null,
    printingShopName: logistics.printingShopName || null,
    orderReference: logistics.orderReference || null,
    instructions: logistics.instructions || null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function materialChangeConsentStatus({affectedScalerIds = [], acceptedScalerIds = [],
  declinedScalerIds = []} = {}) {
  const affected = [...new Set(affectedScalerIds.map(String))].sort();
  const accepted = [...new Set(acceptedScalerIds.map(String))]
    .filter((uid) => affected.includes(uid)).sort();
  const declined = [...new Set(declinedScalerIds.map(String))]
    .filter((uid) => affected.includes(uid)).sort();
  const pending = affected.filter((uid) => !accepted.includes(uid) && !declined.includes(uid));
  return {
    acceptedScalerIds: accepted,
    declinedScalerIds: declined,
    pendingScalerIds: pending,
    status: declined.length ? "declined" : pending.length ?
      "pending_acknowledgment" : "accepted",
  };
}

function readinessStatus({assignedCount, requiredCount, acknowledgedCount,
  coordinationConfigured, materialsRequired, receivedCount}) {
  const assigned = Number(assignedCount || 0);
  const required = Number(requiredCount || 1);
  const acknowledged = Number(acknowledgedCount || 0);
  const received = Number(receivedCount || 0);
  const ready = assigned >= required && coordinationConfigured === true &&
    acknowledged >= assigned && (!materialsRequired || received >= assigned);
  return {ready, status: ready ? "ready_for_work" : "coordination_required"};
}

function isJobRoomMember({room = {}, uid, isAdmin = false}) {
  const scalerIds = Array.isArray(room.scalerIds) ? room.scalerIds : [];
  return isAdmin || [room.businessId, room.scalerId, ...scalerIds].includes(uid);
}

function normalizeFulfillmentType(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const normalized = LEGACY_MATERIAL_FULFILLMENT_TYPES[raw] || raw;
  if (!MATERIAL_FULFILLMENT_TYPES.includes(normalized)) {
    throw new Error("Unsupported material fulfillment type.");
  }
  return normalized;
}

function canRewriteMaterialHandoff(status) {
  return ["scheduled", "scaler_en_route"].includes(String(status || "scheduled"));
}

function assertHandoffTransition(from, to) {
  if (!HANDOFF_STATES.includes(from) || !HANDOFF_STATES.includes(to)) {
    throw new Error("Unknown handoff state.");
  }
  if (!(HANDOFF_TRANSITIONS[from] || []).includes(to)) {
    throw new Error(`Invalid handoff transition: ${from} -> ${to}.`);
  }
}

function assertZoneDuration(minutes) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_ZONE_WALKING_MINUTES) {
    throw new Error(`A one-Scaler zone must be between 1 and ${MAX_ZONE_WALKING_MINUTES} walking minutes.`);
  }
  return minutes;
}

function minutesFromClock(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) throw new Error("Invalid work-window clock.");
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) throw new Error("Invalid work-window clock.");
  return hour * 60 + minute;
}

function localClockParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return {hour, minute, totalMinutes: hour * 60 + minute};
}

function zonedClockInstant(date, timeZone, clock) {
  const [hour, minute] = clock.split(":").map(Number);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type) => Number(dateParts.find((part) => part.type === type)?.value);
  const desiredUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, minute);
  let candidate = new Date(desiredUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).formatToParts(candidate);
    const part = (type) => Number(local.find((item) => item.type === type)?.value);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"),
      part("hour") % 24, part("minute"));
    candidate = new Date(candidate.getTime() + desiredUtc - represented);
  }
  return candidate;
}

function evaluateWorkWindow({date = new Date(), timeZone, propertyType = "residential", start, end}) {
  if (!timeZone) throw new Error("Campaign time zone is required.");
  const defaults = DEFAULT_WORK_WINDOWS[propertyType] || DEFAULT_WORK_WINDOWS.residential;
  const startClock = start || defaults.start;
  const endClock = end || defaults.end;
  const startMinutes = minutesFromClock(startClock);
  const endMinutes = minutesFromClock(endClock);
  const now = localClockParts(date, timeZone).totalMinutes;
  const cutoffAt = zonedClockInstant(date, timeZone, endClock);
  const warningAt = new Date(cutoffAt.getTime() - CUTOFF_WARNING_MINUTES * 60 * 1000);
  return {
    allowed: now >= startMinutes && now < endMinutes,
    beforeWindow: now < startMinutes,
    atOrAfterCutoff: now >= endMinutes,
    start: startClock,
    end: endClock,
    timeZone,
    source: start || end ? "campaign_override" : "scaledcircle_default",
    cutoffAt,
    warningAt,
    warningActive: date >= warningAt && date < cutoffAt,
  };
}

function evaluateJobStart({materialRequired, handoffStatus, workWindow}) {
  if (materialRequired && handoffStatus !== "received") {
    return {allowed: false, reason: "material_not_received"};
  }
  if (!workWindow.allowed) {
    return {allowed: false, reason: workWindow.atOrAfterCutoff ? "workday_cutoff" : "outside_work_hours"};
  }
  return {allowed: true, reason: null};
}

function graceExpired(scheduledAt, now = new Date()) {
  const value = scheduledAt?.toDate ? scheduledAt.toDate() : new Date(scheduledAt);
  if (Number.isNaN(value.getTime())) throw new Error("A valid handoff schedule is required.");
  return now.getTime() >= value.getTime() + HANDOFF_GRACE_MINUTES * 60 * 1000;
}

function arrivalWasTimely({scheduledAt, arrivedAt}) {
  const scheduled = scheduledAt?.toDate ? scheduledAt.toDate() : new Date(scheduledAt);
  const arrived = arrivedAt?.toDate ? arrivedAt.toDate() : new Date(arrivedAt);
  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(arrived.getTime())) return false;
  return arrived.getTime() <= scheduled.getTime() + HANDOFF_GRACE_MINUTES * 60 * 1000;
}

function normalizeSupportCategory(value) {
  const normalized = String(value || "other").trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (!SUPPORT_CASE_CATEGORIES.includes(normalized)) throw new Error("Unsupported support category.");
  return normalized;
}

function calculateBusinessNoShowAllocation({workerAmountCents, platformFeeCents}) {
  if (!Number.isInteger(workerAmountCents) || workerAmountCents < 0 ||
      !Number.isInteger(platformFeeCents) || platformFeeCents < 0) {
    throw new Error("Financial amounts must be non-negative integer cents.");
  }
  const scalerCompensationCents = Math.floor(workerAmountCents / 2);
  return {
    scalerCompensationCents,
    workerRefundCents: workerAmountCents - scalerCompensationCents,
    platformRetainedCents: platformFeeCents,
  };
}

function classifyCutoffAction({status, now = new Date(), warningAt, cutoffAt}) {
  if (status !== "in_progress") return "none";
  const warning = warningAt?.toDate ? warningAt.toDate() : new Date(warningAt);
  const cutoff = cutoffAt?.toDate ? cutoffAt.toDate() : new Date(cutoffAt);
  if (Number.isNaN(cutoff.getTime())) return "none";
  if (now >= cutoff) return "pause";
  if (!Number.isNaN(warning.getTime()) && now >= warning) return "warn";
  return "none";
}

function assertSupportAction(value) {
  const action = String(value || "").trim();
  if (!SUPPORT_ACTIONS.includes(action)) throw new Error("Unsupported support action.");
  return action;
}

function haversineMeters(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(value)));
}

function calculateGeometryWalkingEstimate(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("At least three geometry points are required.");
  }
  const centerLat = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.cos(centerLat * Math.PI / 180));
  const projected = points.map((point) => ({
    x: point.longitude * metersPerDegreeLng,
    y: point.latitude * metersPerDegreeLat,
  }));
  let twiceArea = 0;
  let perimeterMeters = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    twiceArea += projected[index].x * projected[next].y - projected[next].x * projected[index].y;
    perimeterMeters += haversineMeters(points[index], points[next]);
  }
  const areaSquareMeters = Math.abs(twiceArea) / 2;
  // Geometry-only planning model shared with the current client UX. The
  // server owns the authoritative result used to cap a one-Scaler zone.
  const estimatedWalkingMeters = perimeterMeters + areaSquareMeters / 30;
  const estimatedWalkingMinutes = Math.max(1, Math.ceil(estimatedWalkingMeters / 75));
  return {
    areaSquareMeters,
    perimeterMeters,
    estimatedWalkingMeters,
    estimatedWalkingMinutes,
    version: "geometry_v1_server",
  };
}

function zoneGeometryDigest(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("At least three geometry points are required.");
  }
  const normalized = points.map((point) => {
    const latitude = Number(point?.latitude);
    const longitude = Number(point?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("Zone geometry contains an invalid coordinate.");
    }
    return [latitude.toFixed(7), longitude.toFixed(7)];
  });
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function safeDiscoveryProjection(campaign) {
  const requestedScalerCount = Number.isSafeInteger(campaign.requiredScalerCount) ?
    campaign.requiredScalerCount : Number.isSafeInteger(campaign.requestedScalerCount) ? campaign.requestedScalerCount : 1;
  const workerPoolCents = Number.isSafeInteger(campaign.workerPoolCents) ? campaign.workerPoolCents :
    Number.isSafeInteger(campaign.workerAmountCents) ? campaign.workerAmountCents : null;
  const materialLogistics = materialLogisticsFromCampaign(campaign);
  return {
    campaignId: campaign.id || null,
    title: campaign.name || campaign.title || "Campaign",
    campaignType: campaign.campaignType || campaign.type || null,
    businessDisplayName: campaign.businessDisplayName || campaign.companyName || "Business",
    mapPreview: campaign.publicMapPreview || campaign.zoneMapPreview || null,
    zoneName: campaign.zoneName || null,
    zoneSummary: campaign.zoneSummary || null,
    estimatedWalkingMinutes: campaign.estimatedWalkingMinutes || null,
    estimatedPayCents: workerPoolCents,
    workerPoolCents,
    requiredScalerCount: requestedScalerCount,
    acceptedScalerCount: Number.isSafeInteger(campaign.acceptedScalerCount) ?
      campaign.acceptedScalerCount : Number.isSafeInteger(campaign.assignedScalerCount) ?
        campaign.assignedScalerCount : 0,
    scheduledShareCents: workerPoolCents ? Math.floor(workerPoolCents / requestedScalerCount) : null,
    bonusAmountCents: campaign.bonusAmountCents || null,
    materialsRequired: materialLogistics.materialsRequired,
    materialFulfillmentType: campaign.materialFulfillmentType || null,
    materialLogistics: {
      ...materialLogistics,
      version: Number(campaign.materialLogisticsVersion || 1),
      digest: materialLogisticsDigest(materialLogistics),
    },
    handoffWindow: campaign.publicHandoffWindow || null,
    recommendedStartTime: campaign.recommendedStartTime || null,
    workWindowSummary: campaign.workWindowSummary || null,
    deadline: campaign.deadline || null,
  };
}

module.exports = {
  DEFAULT_WORK_WINDOWS,
  CUTOFF_WARNING_MINUTES,
  HANDOFF_GRACE_MINUTES,
  HANDOFF_STATES,
  MATERIAL_FULFILLMENT_TYPES,
  MAX_ZONE_WALKING_MINUTES,
  SUPPORT_EMAIL,
  SUPPORT_CASE_CATEGORIES,
  SUPPORT_ACTIONS,
  assertHandoffTransition,
  assertZoneDuration,
  calculateBusinessNoShowAllocation,
  calculateGeometryWalkingEstimate,
  zoneGeometryDigest,
  classifyCutoffAction,
  arrivalWasTimely,
  evaluateJobStart,
  evaluateWorkWindow,
  graceExpired,
  normalizeFulfillmentType,
  normalizeMaterialLogistics,
  readinessStatus,
  isJobRoomMember,
  canRewriteMaterialHandoff,
  normalizeSupportCategory,
  assertSupportAction,
  materialLogisticsFromCampaign,
  materialLogisticsDigest,
  materialChangeConsentStatus,
  safeDiscoveryProjection,
};

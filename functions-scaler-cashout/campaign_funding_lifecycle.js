"use strict";
const crypto = require("node:crypto");

const PLATFORM_FEE_BASIS_POINTS = 2000;
const BASIS_POINTS_DENOMINATOR = 10000;
const CURRENCY = "usd";
const MAX_CENTS = 100000000;
const ACTIVE_CHECKOUT_STATUSES = new Set(["open"]);

function safeCents(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new Error(`${field}_invalid`);
  }
  return value;
}

function workerCompensationCents(campaign) {
  const direct = campaign.workerCompensationCents ?? campaign.workerAmountCents ??
    campaign.maximumWorkerBudgetCents;
  if (Number.isSafeInteger(direct) && direct > 0) return safeCents(direct, "worker_compensation");
  const base = Number(campaign.basePay || 0);
  const bonus = Number(campaign.bonus || campaign.completionBonus || 0);
  const explicitPool = Number(campaign.maximumWorkerBudget || campaign.workerBudget || 0);
  const dollars = explicitPool > 0 ? explicitPool : base + bonus;
  if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("worker_compensation_missing");
  const cents = Math.round(dollars * 100);
  return safeCents(cents, "worker_compensation");
}

function halfUpBasisPoints(cents, basisPoints) {
  safeCents(cents, "worker_compensation");
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new Error("platform_fee_basis_points_invalid");
  }
  return Math.floor((cents * basisPoints + BASIS_POINTS_DENOMINATOR / 2) /
    BASIS_POINTS_DENOMINATOR);
}

function quoteForCampaign(campaign) {
  const workerCompensation = workerCompensationCents(campaign);
  const platformFeeCents = halfUpBasisPoints(workerCompensation, PLATFORM_FEE_BASIS_POINTS);
  const quote = {
    workerCompensationCents: workerCompensation,
    workerAmountCents: workerCompensation,
    platformFeeBasisPoints: PLATFORM_FEE_BASIS_POINTS,
    platformFeeRateBasisPoints: PLATFORM_FEE_BASIS_POINTS,
    platformFeeCents,
    totalChargeCents: workerCompensation + platformFeeCents,
    businessChargeCents: workerCompensation + platformFeeCents,
    currency: CURRENCY,
    quoteVersion: 2,
  };
  return Object.freeze({...quote, quoteDigest: quoteDigest(quote)});
}

function quoteDigest(quote) {
  return crypto.createHash("sha256").update([
    quote.workerCompensationCents ?? quote.workerAmountCents,
    quote.platformFeeBasisPoints ?? quote.platformFeeRateBasisPoints,
    quote.platformFeeCents,
    quote.totalChargeCents ?? quote.businessChargeCents,
    quote.currency,
    quote.quoteVersion || 2,
  ].join("|")).digest("hex");
}

function paymentId(campaignId, fundingVersion) {
  const digest = crypto.createHash("sha256")
    .update(`campaign-payment|${campaignId}|${fundingVersion}`).digest("hex").slice(0, 40);
  return `campaign-payment_${digest}`;
}

function stripeIdempotencyKey(campaignPaymentId, stripeMode = "test") {
  if (!new Set(["test", "live"]).has(stripeMode)) throw new Error("stripe_mode_invalid");
  return `scaledcircle:${stripeMode}:campaign-checkout:${campaignPaymentId}`;
}

function stripeRefundIdempotencyKey(campaignPaymentId, stripeMode = "test") {
  if (!new Set(["test", "live"]).has(stripeMode)) throw new Error("stripe_mode_invalid");
  return `scaledcircle:${stripeMode}:campaign-refund:${campaignPaymentId}`;
}

function cancelRefundEligibility(input = {}) {
  const campaign = input.campaign || {};
  const payment = input.payment || {};
  const blockers = [];
  if (!new Set(["open", "funded"]).has(String(campaign.status || "")) ||
      campaign.fundingStatus !== "funded" || payment.status !== "paid") blockers.push("not_funded");
  if (campaign.fundingReviewRequired === true || payment.settlementFrozen === true) blockers.push("financial_review");
  if (campaign.refundRequestedAt || payment.refundRequestedAt ||
      new Set(["canceling", "refund_pending", "refunded", "canceled"])
        .has(String(campaign.status || ""))) blockers.push("refund_in_progress");
  if (input.hasAssignedZone || input.hasAcceptedApplication || input.hasAssignedScalerRecord ||
      Number(campaign.assignedScalerCount || 0) > 0) blockers.push("scaler_assigned");
  if (input.hasTrackingSession || input.hasCompletionEvidence || input.hasMaterialHandoff) blockers.push("work_started");
  if (input.hasWorkerEarning || input.hasSettlement || input.hasPayout) blockers.push("worker_obligation");
  if (input.hasDispute || payment.status === "disputed") blockers.push("dispute");
  return Object.freeze({eligible: blockers.length === 0, blockers: [...new Set(blockers)]});
}

function paymentEnvironment(environment = {}) {
  let firebaseProjectId = "";
  try {
    const firebaseConfig = typeof environment.FIREBASE_CONFIG === "string" ?
      JSON.parse(environment.FIREBASE_CONFIG) : environment.FIREBASE_CONFIG;
    firebaseProjectId = String(firebaseConfig?.projectId || "").trim();
  } catch (_) {
    throw new Error("campaign_funding_environment_mismatch");
  }
  const discoveryActive = environment.FUNCTIONS_CONTROL_API === "true" ||
    Boolean(String(environment.FUNCTIONS_MANIFEST_OUTPUT_PATH || "").trim());
  const configuredAppEnv = String(environment.APP_ENV || "").trim();
  const projectId = String(environment.GCLOUD_PROJECT || environment.GOOGLE_CLOUD_PROJECT ||
    firebaseProjectId).trim();
  const discoveredAppEnv = discoveryActive && !configuredAppEnv ? ({
    "scaledcircle-staging": "staging",
    "scaled-circle": "production",
  })[projectId] || "" : "";
  const appEnv = configuredAppEnv || discoveredAppEnv;
  const emulatorActive = Boolean(String(environment.FIRESTORE_EMULATOR_HOST || "").trim());
  if (appEnv === "local" && projectId === "demo-scaledcircle" && emulatorActive) {
    return Object.freeze({appEnv, projectId, stripeMode: "test", returnBaseUrl: "http://127.0.0.1:5000"});
  }
  if (appEnv === "staging" && projectId === "scaledcircle-staging") {
    return Object.freeze({appEnv, projectId, stripeMode: "test", returnBaseUrl: "https://scaledcircle-staging.web.app"});
  }
  if (appEnv === "production" && projectId === "scaled-circle") {
    return Object.freeze({appEnv, projectId, stripeMode: "live", returnBaseUrl: "https://scaledcircle.com"});
  }
  throw new Error("campaign_funding_environment_mismatch");
}

function assertStripeSecret(key, stripeMode) {
  const normalized = typeof key === "string" ? key.trim() : "";
  const prefix = stripeMode === "live" ? "sk_live_" : stripeMode === "test" ? "sk_test_" : "";
  if (!prefix || !normalized.startsWith(prefix)) {
    throw new Error("stripe_secret_mode_mismatch");
  }
  return normalized;
}

function assertWebhookSecret(secret) {
  const normalized = typeof secret === "string" ? secret.trim() : "";
  if (!normalized.startsWith("whsec_")) {
    throw new Error("stripe_test_webhook_secret_required");
  }
  return normalized;
}

function assertStripeEvent(event, stripeMode) {
  const expectedLivemode = stripeMode === "live" ? true : stripeMode === "test" ? false : null;
  if (!event || expectedLivemode === null || event.livemode !== expectedLivemode) {
    throw new Error("stripe_event_mode_mismatch");
  }
  return event;
}

function mappedZoneIsValid(zone, campaignId, businessId) {
  if (!zone || zone.campaignId !== campaignId) return false;
  if (zone.businessId && zone.businessId !== businessId) return false;
  const serviceArea = Array.isArray(zone.serviceArea) ? zone.serviceArea : [];
  const coordinates = serviceArea
    .map((point) => [Number(point?.latitude ?? point?.lat), Number(point?.longitude ?? point?.lng)])
    .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));
  const uniqueCoordinates = new Set(coordinates.map(([latitude, longitude]) =>
    `${latitude.toFixed(7)},${longitude.toFixed(7)}`));
  const polygonArea = coordinates.length >= 3 ? Math.abs(coordinates.reduce((sum, point, index) => {
    const next = coordinates[(index + 1) % coordinates.length];
    return sum + (point[1] * next[0]) - (next[1] * point[0]);
  }, 0) / 2) : 0;
  const points = Number(zone.serviceAreaPointCount || zone.pointCount || coordinates.length || 0);
  const estimatedHomes = Number(zone.estimatedHomes || 0);
  const estimatedMinutes = Number(
    zone.serverEstimatedWalkingMinutes || zone.estimatedWorkMinutes || 0,
  );
  const geometryDigest = coordinates.length >= 3 ? crypto.createHash("sha256")
    .update(JSON.stringify(coordinates.map(([latitude, longitude]) =>
      [latitude.toFixed(7), longitude.toFixed(7)]))).digest("hex") : null;
  return (zone.mapped === true || points >= 3) && points >= 3 &&
    coordinates.length >= 3 && uniqueCoordinates.size >= 3 && polygonArea > 0 &&
    zone.serverZoneMetricsVersion === "geometry_v1_server" &&
    zone.serverZoneGeometryDigest === geometryDigest &&
    zone.analysisStatus === "complete" &&
    Number.isSafeInteger(estimatedHomes) && estimatedHomes > 0 &&
    Number.isFinite(estimatedMinutes) && estimatedMinutes > 0 && estimatedMinutes <= 360;
}

function allMappedZonesValid(zones, campaignId, businessId) {
  return Array.isArray(zones) && zones.length > 0 &&
    zones.every((zone) => mappedZoneIsValid(zone, campaignId, businessId));
}

function checkoutRecoveryDecision(payment, stripeSession, nowSeconds) {
  if (!payment?.stripeCheckoutSessionId) return {action: "create"};
  if (stripeSession?.status === "complete") return {action: "await_webhook"};
  if (!stripeSession || !ACTIVE_CHECKOUT_STATUSES.has(String(stripeSession.status || "")) ||
      !stripeSession.url || Number(stripeSession.expires_at || 0) <= nowSeconds) {
    return {action: "expire_and_replace"};
  }
  return {action: "recover", sessionId: stripeSession.id, url: stripeSession.url};
}

function campaignStateForPaymentEvent(type, campaignStatus) {
  if (type === "checkout.session.expired") return {paymentStatus: "checkout_expired", fundingStatus: "unfunded"};
  if (type === "checkout.session.async_payment_failed" || type === "payment_intent.payment_failed") {
    return {paymentStatus: "payment_failed", fundingStatus: "payment_failed"};
  }
  if (type === "charge.refunded" || type === "refund.updated") {
    return {paymentStatus: "refunded", fundingStatus: "refunded",
      campaignStatus: campaignStatus === "canceling" ? "canceled" :
        campaignStatus === "draft" ? "draft" : "funding_review_required",
      settlementFrozen: true};
  }
  if (type.startsWith("charge.dispute.")) {
    return {paymentStatus: "disputed", fundingStatus: "disputed",
      campaignStatus: "funding_review_required", settlementFrozen: true};
  }
  return null;
}

function transitionAllowed(current, next) {
  const terminal = new Set(["refunded", "disputed"]);
  if (current === next) return true;
  if (terminal.has(current)) return false;
  if (next === "paid") return ["created", "payment_pending"].includes(current);
  if (["checkout_expired", "payment_failed"].includes(next)) return current === "payment_pending";
  if (next === "refund_pending") return current === "paid";
  if (terminal.has(next)) return ["paid", "refund_pending"].includes(current);
  return false;
}

module.exports = {
  PLATFORM_FEE_BASIS_POINTS,
  assertStripeEvent,
  assertStripeSecret,
  assertWebhookSecret,
  campaignStateForPaymentEvent,
  checkoutRecoveryDecision,
  cancelRefundEligibility,
  mappedZoneIsValid,
  allMappedZonesValid,
  paymentEnvironment,
  paymentId,
  quoteDigest,
  quoteForCampaign,
  stripeIdempotencyKey,
  stripeRefundIdempotencyKey,
  transitionAllowed,
  workerCompensationCents,
};

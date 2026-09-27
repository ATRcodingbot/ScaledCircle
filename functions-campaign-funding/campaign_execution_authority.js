"use strict";

const crypto = require("node:crypto");

// An absent field is the historical marketplace contract. An explicit unknown
// value is never silently upgraded into financial or assignment authority.
function executionMode(campaign) {
  if (!campaign || typeof campaign !== "object") return null;
  if (!Object.hasOwn(campaign, "executionMode")) return "marketplace";
  return ["marketplace", "own_team"].includes(campaign.executionMode) ? campaign.executionMode : null;
}

function fail(message, reason, ErrorType) {
  if (ErrorType) throw new ErrorType("failed-precondition", message, {reason});
  const error = new Error(message);
  error.code = "failed-precondition";
  error.reason = reason;
  throw error;
}

function assertMarketplace(campaign, ErrorType) {
  if (executionMode(campaign) !== "marketplace") {
    fail("This campaign uses your own team and cannot create Scaler work or funding.",
      "MARKETPLACE_EXECUTION_REQUIRED", ErrorType);
  }
}

function normalizedPoints(value) {
  return Array.isArray(value) ? value.map(point => ({
    latitude: point?.latitude ?? point?.lat,
    longitude: point?.longitude ?? point?.lng,
  })) : [];
}

function planningDigest(campaign, zones = []) {
  const territory = normalizedPoints(campaign.serviceArea);
  const areas = zones.filter(zone => Array.isArray(zone.serviceArea) && zone.serviceArea.length > 0)
    .map(zone => ({id: zone.id, serviceArea: normalizedPoints(zone.serviceArea)}))
    .sort((left, right) => left.id.localeCompare(right.id));
  return crypto.createHash("sha256").update(JSON.stringify({territory, zones: areas})).digest("hex");
}

function assertPlanningReview(campaign, zones, ErrorType) {
  // These funding/assignment fields are server-owned. Exemption from a NEW
  // planning rule is not payment authority: the retained financial handlers
  // still reconcile the actual payment, allocation and worker obligations.
  const committed = (typeof campaign.fundingPaymentId === 'string' && campaign.fundingPaymentId.length > 0 &&
      ['funded', 'refund_pending', 'refund_review_required', 'disputed', 'refunded'].includes(campaign.fundingStatus)) ||
    zones.some(zone => zone.campaignId && (!campaign.id || zone.campaignId === campaign.id) && zone.businessId === campaign.businessId &&
      zone.assignedScalerId && ['assigned', 'in_progress', 'completed', 'awaiting_review'].includes(zone.status));
  if (executionMode(campaign) === 'marketplace' && (campaign.status === 'draft' || campaign.campaignWorkload) &&
      campaign.configurationMode !== 'exact_locations' && !committed &&
      ['', 'draft'].includes(campaign.status || '')) {
    require('./campaign_workload_authority').assertComplete(campaign, zones, ErrorType);
  }
  if (!Object.hasOwn(campaign, "planningSchemaVersion")) return;
  if (campaign.planningSchemaVersion !== 1 || campaign.planningStage !== "review" ||
      typeof campaign.materialsAreaDigest !== "string" ||
      campaign.materialsAreaDigest !== planningDigest(campaign, zones)) {
    fail("Review materials for the current mapped area before funding or publishing.",
      "CURRENT_AREA_MATERIAL_REVIEW_REQUIRED", ErrorType);
  }
}

// Pinned legacy exports are wrapped at extraction time rather than replaced
// with newer economic implementations. Resolve the server-owned parent first.
async function assertRequestMarketplace({db, request, resource, ErrorType}) {
  if (!request.auth?.uid) return; // The maintained handler owns authentication.
  const data = request.data || {};
  // A quote without a campaign is the existing nonbinding amount calculator.
  if (resource === "quoteCampaignFunding" && !data.campaignId) return;
  const byCampaign = ["quoteCampaignFunding", "createCampaignFundingCheckoutSession", "publishFundedCampaign", "getCampaignFundingState", "fundCampaign", "applyToCampaign", "assignScalerToCampaignLocations"];
  const byZone = ["assignScalerToZone", "configureZoneGroupAssignment", "acceptZoneGroupSlot", "startAssignedZone", "startTrackingSession", "finalizeZoneReview"];
  const byCompletion = ["startCampaignCompletion", "appendCampaignCompletionEvidence", "submitCampaignCompletion", "submitZoneCompletion", "reviewCampaignCompletion"];
  let binding;
  if (resource === "approveZonePayout") binding = ["payoutId", "payouts"];
  else if (byZone.includes(resource)) binding = ["zoneId", "campaignZones"];
  else if (byCompletion.includes(resource)) binding = ["completionId", "campaignCompletions"];
  else if (resource === "initializeCampaignCompletion") binding = data.zoneId ? ["zoneId", "campaignZones"] : null;
  else if (!byCampaign.includes(resource)) fail("Campaign execution authority is unavailable.", "CAMPAIGN_AUTHORITY_UNAVAILABLE", ErrorType);
  const id = typeof data[binding?.[0] || "campaignId"] === "string" ? data[binding?.[0] || "campaignId"].trim() : "";
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    fail("Campaign execution authority is unavailable.", "CAMPAIGN_AUTHORITY_UNAVAILABLE", ErrorType);
  }
  const record = (await db.collection(binding?.[1] || "campaigns").doc(id).get()).data();
  const campaignId = binding ? record?.campaignId : id;
  if (!record || typeof campaignId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(campaignId)) {
    fail("Campaign execution authority is unavailable.", "CAMPAIGN_AUTHORITY_UNAVAILABLE", ErrorType);
  }
  const campaign = binding ? (await db.collection("campaigns").doc(campaignId).get()).data() : record;
  assertMarketplace(campaign, ErrorType);
  if (["quoteCampaignFunding", "createCampaignFundingCheckoutSession", "publishFundedCampaign", "fundCampaign"].includes(resource) &&
      (Object.hasOwn(campaign, "planningSchemaVersion") || campaign.campaignWorkload ||
        (resource !== 'quoteCampaignFunding' && campaign.status === 'draft')) && campaign.status !== "open") {
    const zones = await db.collection("campaignZones").where("campaignId", "==", campaignId).get();
    assertPlanningReview(campaign, zones.docs.map(doc => ({...doc.data(), id: doc.id})), ErrorType);
  }
}

module.exports = {executionMode, assertMarketplace, normalizedPoints, planningDigest, assertPlanningReview, assertRequestMarketplace};

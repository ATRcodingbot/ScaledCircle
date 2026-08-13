"use strict";

const crypto = require("node:crypto");

const MANAGED_GROWTH_PLAN_ID = "managed_growth";
const BUSINESS_GROWTH_CONTEXT_VERSION = "BusinessGrowthIntelligenceContextV1";
const GROWTH_PLAN_VERSION = "ManagedGrowth30DayPlanV1";
const GROWTH_RATE_LIMIT_POLICY_VERSION = "ManagedGrowthGenerationLimitV1";
const MAX_FULL_PLAN_GENERATIONS_PER_DAY = 3;
const MAX_REGENERATIONS_PER_PLAN = 2;
const PHYSICAL_CHANNEL_SATURATION_POLICY = Object.freeze({
  version: "PhysicalChannelSaturationPolicyV1",
  significantGeometryOverlapBps: 5000,
  saturationReviewWindowDays: 30,
  coordinatedFollowUpMinimumDays: 14,
});
const PHYSICAL_CHANNEL_SUITABILITY_POLICY = Object.freeze({
  version: "PhysicalChannelSuitabilityPolicyV1",
  minimumIndependentSignals: 2,
  lowDensityHomesPerSquareKm: 180,
  highDensityHomesPerSquareKm: 650,
  dispersedSpacingMeters: 70,
  efficientSpacingMeters: 35,
  inefficientWalkingMinutesPerAddress: 2.5,
  efficientWalkingMinutesPerAddress: 1.25,
});
const PHYSICAL_CHANNELS = Object.freeze({
  directMail: "direct_mail",
  scalerDistribution: "scaler_distribution",
  doorToDoorOutreach: "door_to_door_outreach",
});
const FIELD_SERVICE_TYPES = Object.freeze({
  distributionOnly: "distribution_only",
  doorToDoorOutreach: "door_to_door_outreach",
});
const DIRECT_MAIL_FEE_POLICY = Object.freeze({
  version: "DirectMailFulfillmentFeePolicyV1",
  percentageBasisPoints: 2000,
});
const DIRECT_MAIL_STATUSES = Object.freeze([
  "draft", "awaiting_business_approval", "approved", "awaiting_vendor_quote",
  "quoted", "awaiting_payment", "submitted_to_vendor", "in_production",
  "mailed", "completed", "cancelled", "support_review",
]);

function text(value, maximum = 600) {
  return value == null ? "" : String(value).trim().slice(0, maximum);
}

function list(value, maximumItems = 20, maximumLength = 300) {
  return Array.isArray(value) ? value.slice(0, maximumItems)
    .map((item) => text(item, maximumLength)).filter(Boolean) : [];
}

function buildBusinessGrowthContext(input = {}) {
  const context = {
    contextVersion: BUSINESS_GROWTH_CONTEXT_VERSION,
    business: {
      description: text(input.businessDescription, 1200),
      objective: text(input.businessObjective, 800),
      servicesOffered: list(input.servicesOffered, 30, 120),
      serviceArea: text(input.serviceArea, 500),
      differentiators: list(input.differentiators, 20, 240),
      marketingGoals: list(input.marketingGoals, 20, 240),
      targetOffers: list(input.targetOffers, 20, 240),
      seasonalContext: text(input.seasonalContext, 500),
    },
    intelligence: {
      property: input.propertyIntelligence || null,
      weather: input.weatherIntelligence || null,
      campaignPerformance: input.campaignPerformance || null,
    },
    authorityBoundary: {
      businessProvidedFieldsAreClaims: true,
      propertyAndWeatherFactsRemainAuthoritative: true,
      outputIsDraftOnly: true,
      businessApprovalRequired: true,
      mayNotPublishFundSpendSendAssignOrSubmit: true,
    },
  };
  const serialized = JSON.stringify(context);
  if (/owner(name)?|protectedDemographic|race|religion|health/i.test(serialized)) {
    throw new Error("managed_growth_private_field_rejected");
  }
  return context;
}

function requireString(value, field, maximum = 4000) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${field}`);
  return text(value, maximum);
}

function validateSocialPost(value) {
  return {
    date: requireString(value?.date, "social_date", 40),
    platform: requireString(value?.platform, "social_platform", 40),
    goal: requireString(value?.goal, "social_goal", 240),
    postCopy: requireString(value?.postCopy, "social_copy", 2400),
    creativeBrief: requireString(value?.creativeBrief, "social_creative", 1200),
    callToAction: requireString(value?.callToAction, "social_cta", 300),
    recommendedAudience: requireString(value?.recommendedAudience, "social_audience", 500),
  };
}

function validateManagedGrowthPlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("malformed_managed_growth_plan");
  }
  const socialPosts = Array.isArray(value.socialPosts) ? value.socialPosts.map(validateSocialPost) : null;
  if (!socialPosts || socialPosts.length !== 30) throw new Error("managed_growth_requires_30_social_posts");
  const emails = Array.isArray(value.emailSequence) ? value.emailSequence.slice(0, 12).map((email) => ({
    sendDay: Number(email?.sendDay), goal: requireString(email?.goal, "email_goal", 240),
    subjectOptions: list(email?.subjectOptions, 5, 180),
    previewText: requireString(email?.previewText, "email_preview", 300),
    body: requireString(email?.body, "email_body", 5000),
    callToAction: requireString(email?.callToAction, "email_cta", 300),
    audienceSegmentSuggestion: requireString(email?.audienceSegmentSuggestion, "email_audience", 500),
  })) : [];
  const physicalRecommendations = validatePhysicalRecommendations(
    value.physicalRecommendations || [],
  );
  return {
    planVersion: GROWTH_PLAN_VERSION,
    summary: requireString(value.summary, "growth_summary", 2400),
    weeklyThemes: list(value.weeklyThemes, 4, 500),
    socialPosts,
    adPackage: value.adPackage || {},
    seoActionPlan: Array.isArray(value.seoActionPlan) ? value.seoActionPlan.slice(0, 30) : [],
    emailSequence: emails,
    postcardRecommendation: value.postcardRecommendation || null,
    propertyOpportunities: list(value.propertyOpportunities, 12, 600),
    weatherOpportunities: list(value.weatherOpportunities, 12, 600),
    physicalRecommendations,
    limitations: list(value.limitations, 20, 600),
    approvalRequired: true,
    executionStatus: "draft",
  };
}

function validateFieldServiceContract(value = {}) {
  const serviceType = text(value.serviceType || FIELD_SERVICE_TYPES.distributionOnly, 60);
  if (!Object.values(FIELD_SERVICE_TYPES).includes(serviceType)) {
    throw new Error("invalid_field_service_type");
  }
  const contract = {
    version: "FieldServiceContractV1",
    serviceType,
    residentConversationRequired: serviceType === FIELD_SERVICE_TYPES.doorToDoorOutreach,
    businessExplicitlySelected: value.businessExplicitlySelected === true,
    scalerExplicitlyConsented: value.scalerExplicitlyConsented === true,
    outreachDisclosure: text(value.outreachDisclosure, 1200),
    compensationContractVersion: text(value.compensationContractVersion, 120),
  };
  if (serviceType === FIELD_SERVICE_TYPES.doorToDoorOutreach &&
      (!contract.businessExplicitlySelected || !contract.scalerExplicitlyConsented ||
       !contract.outreachDisclosure || !contract.compensationContractVersion)) {
    throw new Error("door_to_door_requires_explicit_selection_consent_and_terms");
  }
  return contract;
}

function dateMillis(value) {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function evaluatePhysicalChannelSaturation({candidate = {}, existingCampaigns = [],
  intentionalFollowUp = false} = {}) {
  const channel = text(candidate.channel, 60);
  if (!Object.values(PHYSICAL_CHANNELS).includes(channel)) {
    throw new Error("invalid_physical_channel");
  }
  const candidateAt = dateMillis(candidate.scheduledAt);
  const conflicts = existingCampaigns.filter((campaign) => {
    if (!["planned", "approved", "scheduled", "in_progress", "completed"]
      .includes(text(campaign.status, 40))) return false;
    const overlapBps = Number(campaign.geometryOverlapBps || 0);
    const campaignAt = dateMillis(campaign.scheduledAt || campaign.completedAt);
    if (overlapBps < PHYSICAL_CHANNEL_SATURATION_POLICY.significantGeometryOverlapBps ||
        candidateAt == null || campaignAt == null) return false;
    const days = Math.abs(candidateAt - campaignAt) / 86400000;
    return days <= PHYSICAL_CHANNEL_SATURATION_POLICY.saturationReviewWindowDays;
  });
  const coordinatedDelayDays = Number(candidate.coordinatedFollowUpDelayDays || 0);
  const coordinated = intentionalFollowUp && conflicts.length > 0 &&
    coordinatedDelayDays >= PHYSICAL_CHANNEL_SATURATION_POLICY.coordinatedFollowUpMinimumDays;
  return {
    policyVersion: PHYSICAL_CHANNEL_SATURATION_POLICY.version,
    automaticRecommendationAllowed: conflicts.length === 0,
    coordinatedFollowUpAllowed: coordinated,
    businessApprovalRequired: conflicts.length > 0,
    conflicts: conflicts.map((campaign) => ({
      campaignId: text(campaign.campaignId, 120),
      channel: text(campaign.channel, 60),
      geometryOverlapBps: Number(campaign.geometryOverlapBps || 0),
      status: text(campaign.status, 40),
    })),
    warning: conflicts.length === 0 ? null :
      "This area already has a physical campaign planned or recently completed.",
    alternatives: conflicts.length === 0 ? [] : [
      "use_another_geography", "wait_for_follow_up_interval",
      "use_digital_social_or_email", "choose_one_primary_physical_channel",
    ],
  };
}

function validatePhysicalRecommendations(values) {
  if (!Array.isArray(values)) throw new Error("invalid_physical_recommendations");
  const recommendations = values.slice(0, 12).map((value) => ({
    channel: text(value?.channel, 60), geometryDigest: text(value?.geometryDigest, 80),
    scheduledAt: text(value?.scheduledAt, 60), rationale: text(value?.rationale, 1000),
    coordinatedFollowUp: value?.coordinatedFollowUp === true,
    businessApprovalRequired: value?.businessApprovalRequired === true,
  }));
  for (const recommendation of recommendations) {
    if (!Object.values(PHYSICAL_CHANNELS).includes(recommendation.channel)) {
      throw new Error("invalid_physical_channel");
    }
  }
  for (let left = 0; left < recommendations.length; left++) {
    for (let right = left + 1; right < recommendations.length; right++) {
      const a = recommendations[left]; const b = recommendations[right];
      if (a.geometryDigest && a.geometryDigest === b.geometryDigest &&
          a.scheduledAt === b.scheduledAt && !a.coordinatedFollowUp &&
          !b.coordinatedFollowUp) {
        throw new Error("redundant_physical_channel_recommendation");
      }
    }
  }
  return recommendations;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function evaluatePhysicalChannelSuitability(input = {}) {
  const density = finiteOrNull(input.homesPerSquareKm);
  const spacing = finiteOrNull(input.averagePropertySpacingMeters);
  const walking = finiteOrNull(input.walkingMinutesPerReachableAddress);
  const lotSize = finiteOrNull(input.medianLotSquareMeters);
  const access = ["accessible", "restricted", "unknown"].includes(input.accessStatus) ?
    input.accessStatus : "unknown";
  const evidence = [];
  let mailWeight = 0;
  let distributionWeight = 0;
  if (density != null) {
    if (density <= PHYSICAL_CHANNEL_SUITABILITY_POLICY.lowDensityHomesPerSquareKm) {
      evidence.push({signal: "low_residential_density", value: density}); mailWeight += 2;
    } else if (density >= PHYSICAL_CHANNEL_SUITABILITY_POLICY.highDensityHomesPerSquareKm) {
      evidence.push({signal: "compact_residential_density", value: density}); distributionWeight += 2;
    }
  }
  if (spacing != null) {
    if (spacing >= PHYSICAL_CHANNEL_SUITABILITY_POLICY.dispersedSpacingMeters) {
      evidence.push({signal: "dispersed_property_spacing", value: spacing}); mailWeight += 2;
    } else if (spacing <= PHYSICAL_CHANNEL_SUITABILITY_POLICY.efficientSpacingMeters) {
      evidence.push({signal: "compact_property_spacing", value: spacing}); distributionWeight += 1;
    }
  }
  if (walking != null) {
    if (walking >= PHYSICAL_CHANNEL_SUITABILITY_POLICY.inefficientWalkingMinutesPerAddress) {
      evidence.push({signal: "high_walking_time_per_address", value: walking}); mailWeight += 2;
    } else if (walking <= PHYSICAL_CHANNEL_SUITABILITY_POLICY.efficientWalkingMinutesPerAddress) {
      evidence.push({signal: "efficient_walking_time_per_address", value: walking}); distributionWeight += 2;
    }
  }
  // Lot size is supporting evidence only and cannot determine a recommendation alone.
  if (lotSize != null && lotSize >= 2000) {
    evidence.push({signal: "large_represented_lot_area", value: lotSize}); mailWeight += 1;
  }
  if (access === "restricted") {
    evidence.push({signal: "authoritative_access_restriction", value: true}); mailWeight += 4;
  }
  const independentSignals = evidence.length;
  let recommendation = "manual_review";
  if (access === "restricted") recommendation = "direct_mail_preferred";
  else if (independentSignals >= PHYSICAL_CHANNEL_SUITABILITY_POLICY.minimumIndependentSignals) {
    if (mailWeight >= distributionWeight + 2) recommendation = "direct_mail_preferred";
    else if (distributionWeight >= mailWeight + 2) recommendation = "scaler_distribution_preferred";
    else recommendation = "either_channel_reasonable";
  }
  return {
    policyVersion: PHYSICAL_CHANNEL_SUITABILITY_POLICY.version,
    recommendation, evidence, accessStatus: access,
    advisoryOnly: true, businessOverrideAllowed: true,
    scalerServiceType: FIELD_SERVICE_TYPES.distributionOnly,
    lawfulAuthorizedAccessRequired: access === "restricted",
    unavailableSignals: [
      density == null ? "housing_density" : null,
      spacing == null ? "property_spacing" : null,
      walking == null ? "walking_time_per_address" : null,
      lotSize == null ? "lot_size" : null,
      access === "unknown" ? "access_characteristics" : null,
    ].filter(Boolean),
    explanation: recommendation === "direct_mail_preferred" ?
      "Available logistical evidence indicates that physical distribution may be less efficient. Direct mail can reach selected addresses without requiring physical property access." :
      recommendation === "scaler_distribution_preferred" ?
        "Available logistical evidence indicates a compact, efficient route where verified physical distribution may be practical." :
        recommendation === "either_channel_reasonable" ?
          "Available logistical evidence does not strongly favor one physical delivery channel." :
          "Available logistical evidence is insufficient for a confident physical-channel recommendation.",
  };
}

function physicalChannelAnalytics() {
  return {
    version: "PhysicalChannelAnalyticsV1",
    directMail: ["householdsPlanned", "piecesMailed", "trackedResponses"],
    scalerDistribution: ["materialsDistributed", "verifiedRouteCoverage", "trackedResponses"],
    doorToDoorOutreach: ["optedInAssignments", "verifiedOutreachUnits", "trackedResponses"],
    combinedPhysicalTotalPermitted: false,
  };
}

function calculateDirectMailEstimate({vendorPrintingCents = 0, postageCents = 0,
  vendorFulfillmentCents = 0, policy = DIRECT_MAIL_FEE_POLICY} = {}) {
  const amounts = [vendorPrintingCents, postageCents, vendorFulfillmentCents];
  if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) {
    throw new Error("invalid_direct_mail_cost");
  }
  const vendorCostCents = amounts.reduce((sum, amount) => sum + amount, 0);
  const managementFeeCents = Math.floor(
    (vendorCostCents * policy.percentageBasisPoints + 5000) / 10000,
  );
  return {policyVersion: policy.version, percentageBasisPoints: policy.percentageBasisPoints,
    vendorPrintingCents, postageCents, vendorFulfillmentCents, vendorCostCents,
    managementFeeCents, totalEstimatedCents: vendorCostCents + managementFeeCents,
    subscriptionIncludesVendorCosts: false, quoteIsFinal: false};
}

function buildPostcardCampaign(input = {}) {
  const status = text(input.status || "draft", 60);
  if (!DIRECT_MAIL_STATUSES.includes(status)) throw new Error("invalid_direct_mail_status");
  return {
    schemaVersion: "PostcardCampaignV1", status,
    campaignName: text(input.campaignName, 160), geometryDigest: text(input.geometryDigest, 80),
    estimatedHouseholdCount: Number.isFinite(Number(input.estimatedHouseholdCount)) ?
      Number(input.estimatedHouseholdCount) : null,
    postcardSize: text(input.postcardSize, 60), frontHeadline: text(input.frontHeadline, 300),
    frontCreativeBrief: text(input.frontCreativeBrief, 1200), backCopy: text(input.backCopy, 3000),
    offer: text(input.offer, 500), callToAction: text(input.callToAction, 300),
    destination: text(input.destination, 500), quantity: Number(input.quantity || 0),
    businessApprovedAt: null, provider: null, providerOrderId: null,
    vendorSubmissionAllowed: false, estimatedCosts: calculateDirectMailEstimate(input.estimatedCosts),
  };
}

function planCacheIdentity(context) {
  return crypto.createHash("sha256").update(JSON.stringify({
    context, planVersion: GROWTH_PLAN_VERSION,
  })).digest("hex");
}

class DirectMailFulfillmentProvider {
  async requestQuote() { throw new Error("direct_mail_provider_not_configured"); }
  async submitOrder() { throw new Error("direct_mail_provider_not_configured"); }
}

module.exports = {
  MANAGED_GROWTH_PLAN_ID, BUSINESS_GROWTH_CONTEXT_VERSION, GROWTH_PLAN_VERSION,
  GROWTH_RATE_LIMIT_POLICY_VERSION, MAX_FULL_PLAN_GENERATIONS_PER_DAY,
  MAX_REGENERATIONS_PER_PLAN, DIRECT_MAIL_FEE_POLICY, DIRECT_MAIL_STATUSES,
  PHYSICAL_CHANNEL_SATURATION_POLICY, PHYSICAL_CHANNELS, FIELD_SERVICE_TYPES,
  PHYSICAL_CHANNEL_SUITABILITY_POLICY,
  DirectMailFulfillmentProvider, buildBusinessGrowthContext, validateManagedGrowthPlan,
  validateFieldServiceContract, evaluatePhysicalChannelSaturation,
  evaluatePhysicalChannelSuitability,
  validatePhysicalRecommendations, physicalChannelAnalytics,
  calculateDirectMailEstimate, buildPostcardCampaign, planCacheIdentity,
};

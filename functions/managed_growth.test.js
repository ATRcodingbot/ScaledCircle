"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const growth = require("./managed_growth");
const entitlement = require("./subscription_entitlements");

const future = {toMillis: () => Date.now() + 86400000};

test("Managed Growth inherits Scale while Scale does not inherit managed services", () => {
  const managed = {plan: "managed_growth", status: "active", expiresAt: future};
  const scale = {plan: "scale", status: "active", expiresAt: future};
  assert.equal(entitlement.hasActiveScaleEntitlement(managed), true);
  assert.equal(entitlement.hasActiveManagedGrowthEntitlement(managed), true);
  assert.equal(entitlement.hasActiveManagedGrowthEntitlement(scale), false);
});

test("Business Growth context rejects owner and protected demographic fields", () => {
  assert.throws(() => growth.buildBusinessGrowthContext({businessDescription: "ownerName: secret"}));
  const context = growth.buildBusinessGrowthContext({businessDescription: "Local contractor",
    businessObjective: "Stay top of mind", servicesOffered: ["Maintenance"]});
  assert.equal(context.authorityBoundary.mayNotPublishFundSpendSendAssignOrSubmit, true);
});

test("30-day plan validates cohesive package schemas and remains a draft", () => {
  const socialPosts = Array.from({length: 30}, (_, index) => ({date: `Day ${index + 1}`,
    platform: "Facebook", goal: "Education", postCopy: "Helpful local tip",
    creativeBrief: "Simple branded visual", callToAction: "Learn more",
    recommendedAudience: "Consented local audience"}));
  const plan = growth.validateManagedGrowthPlan({summary: "One coordinated plan",
    weeklyThemes: ["Education", "Area opportunity", "Trust", "Offer"], socialPosts,
    adPackage: {adSpendAuthorized: false}, seoActionPlan: [{title: "Service page"}],
    emailSequence: [{sendDay: 2, goal: "Education", subjectOptions: ["Helpful guide"],
      previewText: "What to know", body: "Educational content", callToAction: "Read more",
      audienceSegmentSuggestion: "Existing consented customers"}],
    postcardRecommendation: {vendorSubmissionAllowed: false}, limitations: ["Draft only"]});
  assert.equal(plan.socialPosts.length, 30);
  assert.equal(plan.executionStatus, "draft");
  assert.equal(plan.approvalRequired, true);
});

test("direct-mail fee is versioned and printing postage remain separate", () => {
  const quote = growth.calculateDirectMailEstimate({vendorPrintingCents: 40000,
    postageCents: 60000});
  assert.deepEqual(quote, {policyVersion: "DirectMailFulfillmentFeePolicyV1",
    percentageBasisPoints: 2000, vendorPrintingCents: 40000, postageCents: 60000,
    vendorFulfillmentCents: 0, vendorCostCents: 100000, managementFeeCents: 20000,
    totalEstimatedCents: 120000, subscriptionIncludesVendorCosts: false, quoteIsFinal: false});
});

test("postcard campaign is provider-neutral and cannot submit automatically", () => {
  const campaign = growth.buildPostcardCampaign({campaignName: "Older stock education",
    quantity: 1000, estimatedCosts: {vendorPrintingCents: 40000, postageCents: 60000}});
  assert.equal(campaign.status, "draft");
  assert.equal(campaign.vendorSubmissionAllowed, false);
  assert.equal(campaign.provider, null);
  const provider = new growth.DirectMailFulfillmentProvider();
  assert.rejects(() => provider.submitOrder(), /not_configured/);
});

test("identical growth contexts have one cache identity and limits are bounded", () => {
  const context = growth.buildBusinessGrowthContext({businessObjective: "Grow locally"});
  assert.equal(growth.planCacheIdentity(context), growth.planCacheIdentity(context));
  assert.equal(growth.MAX_FULL_PLAN_GENERATIONS_PER_DAY, 3);
  assert.equal(growth.MAX_REGENERATIONS_PER_PLAN, 2);
});

test("standard Scaler work is distribution only and implies no resident conversation", () => {
  const contract = growth.validateFieldServiceContract({});
  assert.equal(contract.serviceType, "distribution_only");
  assert.equal(contract.residentConversationRequired, false);
  assert.equal(contract.scalerExplicitlyConsented, false);
});

test("door-to-door outreach requires Business selection, Scaler consent, disclosure, and compensation terms", () => {
  assert.throws(() => growth.validateFieldServiceContract({
    serviceType: "door_to_door_outreach", businessExplicitlySelected: true,
  }), /explicit_selection_consent_and_terms/);
  const contract = growth.validateFieldServiceContract({serviceType: "door_to_door_outreach",
    businessExplicitlySelected: true, scalerExplicitlyConsented: true,
    outreachDisclosure: "Resident conversations are expected; no sale is guaranteed.",
    compensationContractVersion: "OutreachCompensationV1"});
  assert.equal(contract.residentConversationRequired, true);
});

test("postcard plan suppresses automatic same-window Scaler distribution over the same area", () => {
  const result = growth.evaluatePhysicalChannelSaturation({candidate: {
    channel: "scaler_distribution", scheduledAt: "2030-09-05T09:00:00Z",
  }, existingCampaigns: [{campaignId: "mail-a", channel: "direct_mail",
    status: "scheduled", scheduledAt: "2030-09-03T09:00:00Z", geometryOverlapBps: 9000}]});
  assert.equal(result.automaticRecommendationAllowed, false);
  assert.equal(result.businessApprovalRequired, true);
  assert.match(result.warning, /physical campaign/);
});

test("Scaler distribution suppresses redundant postcard while delayed follow-up requires approval", () => {
  const existingCampaigns = [{campaignId: "field-a", channel: "scaler_distribution",
    status: "scheduled", scheduledAt: "2030-09-03T09:00:00Z", geometryOverlapBps: 8000}];
  const blocked = growth.evaluatePhysicalChannelSaturation({candidate: {
    channel: "direct_mail", scheduledAt: "2030-09-05T09:00:00Z",
  }, existingCampaigns});
  assert.equal(blocked.automaticRecommendationAllowed, false);
  const followUp = growth.evaluatePhysicalChannelSaturation({candidate: {
    channel: "direct_mail", scheduledAt: "2030-09-24T09:00:00Z",
    coordinatedFollowUpDelayDays: 21,
  }, existingCampaigns, intentionalFollowUp: true});
  assert.equal(followUp.coordinatedFollowUpAllowed, true);
  assert.equal(followUp.businessApprovalRequired, true);
});

test("growth plan may select one physical channel and rejects automatic double saturation", () => {
  assert.deepEqual(growth.validatePhysicalRecommendations([{
    channel: "direct_mail", geometryDigest: "area-a", scheduledAt: "2030-09-03",
    rationale: "Use one primary physical channel.",
  }]).map((item) => item.channel), ["direct_mail"]);
  assert.throws(() => growth.validatePhysicalRecommendations([{
    channel: "direct_mail", geometryDigest: "area-a", scheduledAt: "2030-09-03",
  }, {channel: "scaler_distribution", geometryDigest: "area-a",
    scheduledAt: "2030-09-03"}]), /redundant_physical_channel/);
});

test("Attractive Remodel plan selects mail for Area A and distribution only for Area B", () => {
  const areaA = growth.evaluatePhysicalChannelSaturation({candidate: {
    channel: "scaler_distribution", scheduledAt: "2030-09-03",
  }, existingCampaigns: [{campaignId: "attractive-remodel-mail",
    channel: "direct_mail", status: "planned", scheduledAt: "2030-09-03",
    geometryOverlapBps: 10000}]});
  const areaB = growth.evaluatePhysicalChannelSaturation({candidate: {
    channel: "scaler_distribution", scheduledAt: "2030-09-03",
  }, existingCampaigns: []});
  assert.equal(areaA.automaticRecommendationAllowed, false);
  assert.equal(areaB.automaticRecommendationAllowed, true);
});

test("physical analytics never combines mail distribution and outreach into one metric", () => {
  const analytics = growth.physicalChannelAnalytics();
  assert.deepEqual(Object.keys(analytics).sort(), ["combinedPhysicalTotalPermitted",
    "directMail", "doorToDoorOutreach", "scalerDistribution", "version"].sort());
  assert.equal(analytics.combinedPhysicalTotalPermitted, false);
});

test("estate-style logistical evidence prefers direct mail without demographic inference", () => {
  const result = growth.evaluatePhysicalChannelSuitability({homesPerSquareKm: 95,
    averagePropertySpacingMeters: 110, walkingMinutesPerReachableAddress: 3.4,
    medianLotSquareMeters: 3100, accessStatus: "unknown"});
  assert.equal(result.recommendation, "direct_mail_preferred");
  assert.equal(result.businessOverrideAllowed, true);
  assert.equal(result.scalerServiceType, "distribution_only");
  assert.match(result.explanation, /less efficient/);
  assert.doesNotMatch(JSON.stringify(result), /wealth|income|race|ethnicity|personality/i);
});

test("compact route evidence may prefer Scaler distribution", () => {
  const result = growth.evaluatePhysicalChannelSuitability({homesPerSquareKm: 900,
    averagePropertySpacingMeters: 22, walkingMinutesPerReachableAddress: 0.8,
    accessStatus: "accessible"});
  assert.equal(result.recommendation, "scaler_distribution_preferred");
});

test("unknown or single logistical signal stays qualified", () => {
  const unknown = growth.evaluatePhysicalChannelSuitability({});
  const oneSignal = growth.evaluatePhysicalChannelSuitability({homesPerSquareKm: 80});
  assert.equal(unknown.recommendation, "manual_review");
  assert.equal(oneSignal.recommendation, "manual_review");
  assert.ok(unknown.unavailableSignals.includes("access_characteristics"));
});

test("authoritative restricted access strongly prefers mail but never authorizes trespass", () => {
  const result = growth.evaluatePhysicalChannelSuitability({accessStatus: "restricted"});
  assert.equal(result.recommendation, "direct_mail_preferred");
  assert.equal(result.lawfulAuthorizedAccessRequired, true);
  assert.equal(result.businessOverrideAllowed, true);
});

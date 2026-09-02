"use strict";

const crypto = require("node:crypto");
const socialOperations = require("./social_operations");

const PLAN_ID = "sc_plan_2026_09_launch_readiness_v1";
const PLAN_VERSION_ID = `${PLAN_ID}:v1`;
const CAMPAIGN_ID = "sc_campaign_brand_launch_md_2026_09";
const SOURCE_ARTIFACT = "ScaledCircle-social-evidence/scaledcircle-30-day-plan-2026-09.md";

const SHARED = Object.freeze({
  businessDestination: "https://scaledcircle.com/#/businesses",
  scalerDestination: "https://scaledcircle.com/#/scalers",
});

const ITEMS = Object.freeze([
  {
    id: "sc_x_20260903_mapping_v1", scheduledFor: "2026-09-03T14:00:00.000Z",
    pillar: "Measurable local marketing", goal: "Establish the problem ScaledCircle solves",
    variants: [{provider: "x", format: "post",
      copy: "A bigger service area is not automatically a better campaign. Local marketing works better when a Business can choose the exact streets and zones it wants to reach, connect each response to a campaign, and learn what happened next. That is the operating problem we’re building ScaledCircle to solve in Maryland.",
      mediaRequirement: "Clean screen capture of Smart Mapping with customer data and private addresses excluded",
      callToAction: "See how ScaledCircle works.", destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated campaign-and-version Response Asset before publishing."}],
  },
  {
    id: "sc_yt_20260905_what_it_does_v1", scheduledFor: "2026-09-05T15:00:00.000Z",
    pillar: "How ScaledCircle works", goal: "Explain the product in under 40 seconds",
    variants: [{provider: "youtube", format: "shorts_concept",
      copy: "Most local marketing breaks into disconnected pieces: pick an area, make the creative, find help distributing it, then guess what worked. ScaledCircle is being built as one workflow. A Business maps a campaign, prepares a landing page and tracked response asset, creates downloadable physical marketing, and can coordinate local Scalers. The result is a campaign the Business can actually follow. ScaledCircle is launching from Maryland, and several provider-connected features remain in beta or development.",
      mediaRequirement: "9:16 product walkthrough: map, landing page, QR, physical-material proof, then results screen; do not portray provider-coming-soon controls as live",
      callToAction: "Explore the Business workflow.", destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before upload."}],
  },
  {
    id: "sc_x_20260907_campaign_thread_v1", scheduledFor: "2026-09-07T13:30:00.000Z",
    pillar: "Product demonstration", goal: "Show the operating workflow",
    variants: [{provider: "x", format: "thread",
      copy: "What should happen between ‘we need more local jobs’ and ‘did this campaign work?’ A practical local campaign needs five connected decisions:\n\n1/ Choose the service and target area.\n2/ Build one clear destination.\n3/ Give each channel a tracked response path.\n4/ Prepare the right creative and field execution.\n5/ Review visits, responses, and outcomes in the same campaign.\n\nScaledCircle is building that operating loop—not another folder of disconnected marketing files.",
      mediaRequirement: "Five-step branded diagram using approved ScaledCircle Brand Assets",
      callToAction: "Follow the build and explore the Business side.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before publishing."}],
  },
  {
    id: "sc_yt_20260909_qr_attribution_v1", scheduledFor: "2026-09-09T16:00:00.000Z",
    pillar: "Attribution", goal: "Explain why QR is more than decoration",
    variants: [{provider: "youtube", format: "shorts_concept",
      copy: "A QR code on physical marketing should do more than open a page. In ScaledCircle, a Response Asset can connect the scan to the Business, campaign, creative version, and landing-page destination—without putting recipient information in the public link. That means the Business can compare response across materials instead of treating every scan as anonymous traffic. Printing and mailing integrations are still coming; downloadable print-ready materials and tracked destinations are the current foundation.",
      mediaRequirement: "Macro QR scan demonstration followed by an attribution timeline using a safe staging/demo Response Asset and no customer PII",
      callToAction: "See the measurable-marketing workflow.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before upload."}],
  },
  {
    id: "sc_x_20260911_scaler_opportunity_v1", scheduledFor: "2026-09-11T21:30:00.000Z",
    pillar: "Scaler opportunity", goal: "Recruit and educate prospective Scalers",
    variants: [{provider: "x", format: "post",
      copy: "Local campaign execution can be real, visible work—not a vague gig listing. ScaledCircle’s Scaler workflow is designed around mapped opportunities, clear campaign instructions, completion evidence, and understandable status. We’re preparing the Maryland launch now. Interested in helping local Businesses reach the right neighborhoods? Explore the Scaler path.",
      mediaRequirement: "Scaler dashboard and map walkthrough with private locations removed",
      callToAction: "Explore becoming a Scaler.", destinationUrl: SHARED.scalerDestination,
      responseAssetRequirement: "Create a dedicated Scaler-acquisition Response Asset before publishing."}],
  },
  {
    id: "sc_meta_20260913_local_campaign_v1", scheduledFor: "2026-09-13T15:00:00.000Z",
    pillar: "Local-business pain points", goal: "Reserve a visual local campaign explainer",
    originalStatus: "pending_connection",
    variants: ["facebook", "instagram"].map((provider) => ({provider,
      format: provider === "instagram" ? "carousel" : "feed",
      copy: "Your best customers may be only a few neighborhoods away—but broad, disconnected marketing makes it hard to know where to focus. ScaledCircle is building one local campaign workflow for target-area planning, creative, field execution, tracked destinations, and results. Starting in Maryland.",
      mediaRequirement: `Map-to-campaign carousel with a ${provider}-specific crop`,
      callToAction: "Explore ScaledCircle for Businesses.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a provider-specific Response Asset before publishing."})),
  },
  {
    id: "sc_yt_20260915_landing_page_v1", scheduledFor: "2026-09-15T14:30:00.000Z",
    pillar: "Product demonstration", goal: "Show the landing-page workflow",
    variants: [{provider: "youtube", format: "shorts_concept",
      copy: "A local campaign should not end at a generic homepage. ScaledCircle lets a Business prepare a campaign-specific landing page, connect it to a tracked Response Asset, and keep the destination tied to the campaign. The message, QR, and response path stay together. That is more useful than sending every piece of marketing to the same generic page and guessing what created interest.",
      mediaRequirement: "9:16 walkthrough of Landing Page selection and Response Asset linkage with no private lead data",
      callToAction: "Explore the connected campaign workflow.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before upload."}],
  },
  {
    id: "sc_x_20260917_physical_digital_v1", scheduledFor: "2026-09-17T13:00:00.000Z",
    pillar: "Physical + digital integration", goal: "Demonstrate current physical-marketing value accurately",
    variants: [{provider: "x", format: "post",
      copy: "A door hanger can be physical media and still be measurable. ScaledCircle can prepare an approved, print-ready material with a campaign-linked QR and landing-page destination. The Business can download the exact PDF and take it to any printer. Integrated printing and mailing remain Coming Soon—but the creative, print-quality, and attribution foundation is real today.",
      mediaRequirement: "Certified front/back door-hanger proof with conceptual-image disclosure visible where applicable",
      callToAction: "See the Business marketing workflow.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before publishing."}],
  },
  {
    id: "sc_yt_20260919_service_visual_v1", scheduledFor: "2026-09-19T15:00:00.000Z",
    pillar: "Creative quality", goal: "Explain truthful area-contextual service visuals",
    variants: [{provider: "youtube", format: "shorts_concept",
      copy: "Local creative should look like the market it is meant for. ScaledCircle’s generated service-visual foundation can use non-sensitive area context—such as general property style, terrain, vegetation, and season—to create a relevant conceptual image. It never needs resident identity or protected demographic data. Generated visuals remain labeled as conceptual, not as a photo of the Business’s completed work. Authentic approved project photography stays the preferred option.",
      mediaRequirement: "Howard County contextual concept beside its disclosure and final layout; no implication of completed customer work",
      callToAction: "Follow the product build.", destinationUrl: "https://scaledcircle.com",
      responseAssetRequirement: "Create a dedicated Response Asset before upload."}],
  },
  {
    id: "sc_x_20260921_maryland_build_v1", scheduledFor: "2026-09-21T17:00:00.000Z",
    pillar: "Maryland build-in-public", goal: "Establish focused launch geography",
    variants: [{provider: "x", format: "post",
      copy: "We’re starting ScaledCircle where we can learn locally: Maryland, with Baltimore, Howard County, and nearby launch markets in focus. The goal is not to claim nationwide scale before it exists. It is to build a useful operating workflow for local Businesses and Scalers, test it honestly, and expand from evidence.",
      mediaRequirement: "Simple Maryland launch-area graphic without claiming complete statewide coverage",
      callToAction: "Follow the Maryland launch.", destinationUrl: "https://scaledcircle.com",
      responseAssetRequirement: "Create a dedicated Response Asset before publishing."}],
  },
  {
    id: "sc_yt_20260923_scaler_walkthrough_v1", scheduledFor: "2026-09-23T21:00:00.000Z",
    pillar: "Scaler opportunity", goal: "Explain the Scaler experience",
    variants: [{provider: "youtube", format: "shorts_concept",
      copy: "A Scaler helps execute a local Business campaign in the real world. The ScaledCircle workflow is designed to show the opportunity, mapped work area, campaign instructions, progress, and completion evidence in one place. It is not an outbound sales dialer, and it does not promise work that has not been funded or opened. We’re preparing the Maryland launch and documenting the experience before wider availability.",
      mediaRequirement: "Scaler flow storyboard: discover, review, accept, complete, evidence",
      callToAction: "Explore the Scaler path.", destinationUrl: SHARED.scalerDestination,
      responseAssetRequirement: "Create a dedicated Scaler-acquisition Response Asset before upload."}],
  },
  {
    id: "sc_x_20260925_measure_response_v1", scheduledFor: "2026-09-25T13:30:00.000Z",
    pillar: "Measurement", goal: "Shift attention from vanity metrics to business response",
    variants: [{provider: "x", format: "post",
      copy: "Reach is useful. Response is better. A local Business should be able to connect a marketing item to visits, inquiries, campaign activity, and—when evidence exists—leads or conversions. ScaledCircle keeps unavailable metrics distinct from zero and does not automatically turn a click or call into a qualified lead. Measurement should stay truthful.",
      mediaRequirement: "Metric ladder graphic: exposure, response, inquiry, qualified lead, conversion",
      callToAction: "See how ScaledCircle approaches attribution.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before publishing."}],
  },
  {
    id: "sc_meta_20260927_two_sided_market_v1", scheduledFor: "2026-09-27T18:00:00.000Z",
    pillar: "How ScaledCircle works", goal: "Explain Businesses and Scalers together",
    originalStatus: "pending_connection",
    variants: ["facebook", "instagram"].map((provider) => ({provider,
      format: provider === "instagram" ? "carousel" : "feed",
      copy: "Businesses need a clearer way to plan and measure local campaigns. Scalers need understandable opportunities and execution workflows. ScaledCircle is being built to connect those roles without hiding campaign status or pretending every interaction is a conversion.",
      mediaRequirement: `Two-panel Business and Scaler carousel with a ${provider}-specific crop`,
      callToAction: "Choose your path.", destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create separate Business and Scaler funnel Response Assets before publishing."})),
  },
  {
    id: "sc_yt_20260929_campaign_walkthrough_v1", scheduledFor: "2026-09-29T15:30:00.000Z",
    pillar: "Product demonstration", goal: "Show the complete current campaign foundation",
    variants: [{provider: "youtube", format: "long_video",
      copy: "Start with a real Business goal and service area. Use Smart Mapping to focus the campaign. Build a campaign Landing Page and Response Asset. Prepare approved creative, including downloadable print-ready physical marketing where appropriate. Coordinate campaign execution and return to the same campaign for response evidence. This walkthrough separates what works now from tracking-phone, integrated print/mail, and automated publishing capabilities that are still in development.",
      mediaRequirement: "Three-to-five-minute narrated desktop walkthrough with chapter cards and explicit Beta or Coming Soon labels",
      callToAction: "Explore ScaledCircle for Businesses.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before upload."}],
  },
  {
    id: "sc_x_20261001_managed_growth_v1", scheduledFor: "2026-10-01T14:00:00.000Z",
    pillar: "Managed Growth", goal: "Explain management value without overstating automation",
    variants: [{provider: "x", format: "post",
      copy: "Marketing tools are useful. An operating rhythm is more valuable. ScaledCircle’s Managed Growth foundation is being designed around a rolling plan, platform-specific drafts, explicit approval, read-only performance, and a weekly learning loop. Automated publishing is not live yet. The goal is to help a Business keep marketing moving without silently taking control away.",
      mediaRequirement: "Calendar, approvals, performance, and next-actions loop",
      callToAction: "Follow the Managed Growth build.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create a dedicated Response Asset before publishing."}],
  },
  {
    id: "sc_yt_20261002_app_launch_v1", scheduledFor: "2026-10-02T20:00:00.000Z",
    pillar: "App-launch preparation", goal: "Invite the right early audience without claiming launch completion",
    variants: [{provider: "youtube", format: "shorts_concept",
      copy: "We’re preparing ScaledCircle for app testing and a focused Maryland launch. For Businesses, the goal is a clearer local marketing workflow. For Scalers, it is a clearer way to find and complete local campaign opportunities. We are still finishing release signing, provider certification, and selected beta integrations, so this is build-in-public—not a claim that every feature is commercially live. Follow along or choose the path that fits you.",
      mediaRequirement: "Founder voice-over with current product screens and Business and Scaler closing cards",
      callToAction: "Explore Business or Scaler access.",
      destinationUrl: SHARED.businessDestination,
      responseAssetRequirement: "Create separate Business and Scaler Response Assets before upload."}],
  },
]);

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildScaledCircleLaunchPlan({businessUid, subscriptionPlanId = "managed_growth",
  now = Date.now()} = {}) {
  const uid = typeof businessUid === "string" ? businessUid.trim() : "";
  if (!uid) throw new Error("scaledcircle_business_uid_required");
  const content = ITEMS.map((source) => {
    const item = {itemKey: source.id, scheduledFor: source.scheduledFor,
      goal: source.goal, pillar: source.pillar, variants: source.variants};
    const version = socialOperations.contentItemVersion({businessUid: uid,
      planId: PLAN_ID, item, now});
    const status = source.originalStatus || "ready_for_review";
    const versionRecordId = `${source.id}_v1`;
    return {itemId: source.id, versionRecordId,
      itemRecord: {schemaVersion: socialOperations.SCHEMA_VERSION, businessUid: uid,
        planId: PLAN_ID, campaignId: CAMPAIGN_ID, itemKey: source.id,
        status, originalStatus: status, currentVersion: 1, approvedVersion: null,
        scheduledFor: source.scheduledFor, createdAtMillis: now, updatedAtMillis: now},
      versionRecord: {...version, versionId: "v1", planVersionId: PLAN_VERSION_ID,
        campaignId: CAMPAIGN_ID, status, originalStatus: status,
        scheduledFor: source.scheduledFor, createdAtMillis: now}};
  });
  const planContent = {businessUid: uid, planId: PLAN_ID, planVersionId: PLAN_VERSION_ID,
    campaignId: CAMPAIGN_ID, businessName: "Scaled Circle", automationMode: "manual",
    startsOn: "2026-09-03T04:00:00.000Z", endsOn: "2026-10-03T03:59:59.999Z",
    goal: "Build ScaledCircle awareness in Maryland, educate local Businesses and Scalers, drive attributable site visits and signups, and learn which messages resonate.",
    pillars: ["Measurable local marketing", "Product demonstrations", "Scaler opportunity",
      "Physical plus digital workflow", "Maryland build-in-public", "App-launch preparation"],
    itemIds: content.map((entry) => entry.itemId)};
  return {planId: PLAN_ID, planVersionId: PLAN_VERSION_ID, campaignId: CAMPAIGN_ID,
    sourceArtifact: SOURCE_ARTIFACT, content,
    planRecord: {schemaVersion: "SocialContentPlanV1", ...planContent,
      itemCount: content.length,
      platformVersionCount: content.reduce(
          (count, item) => count + item.versionRecord.variants.length,
          0,
      ),
      subscriptionPlanId, status: "ready_for_review", planVersion: 1,
      approvedVersion: null, approvedAt: null, immutableOriginal: true,
      supersedes: null, supersededBy: null, sourceAuthority: "local_evidence_artifact",
      sourceArtifact: SOURCE_ARTIFACT, sourceStatus: "ready_for_review",
      contentHash: digest(planContent), createdAtMillis: now, updatedAtMillis: now}};
}

module.exports = {PLAN_ID, PLAN_VERSION_ID, CAMPAIGN_ID, SOURCE_ARTIFACT, ITEMS,
  buildScaledCircleLaunchPlan};

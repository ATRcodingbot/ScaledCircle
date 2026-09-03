"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const platformRoot = path.join(root, "functions-platform");
const legacyRoot = path.join(root, "functions-legacy");
const walletRoot = path.join(root, "functions-wallet");
const artifactEmailRoot = path.join(root, "functions-artifact-email");
const jobAlertEmailRoot = path.join(root, "functions-job-alert-email");
const campaignFundingRoot = path.join(root, "functions-campaign-funding");
const assignmentRoot = path.join(root, "functions-assignment");
const discoveryRoot = path.join(root, "functions-discovery");
const jobRoomRoot = path.join(root, "functions-job-room");
const transactionalEmailRoot = path.join(root, "functions-transactional-email");
const adminOpsRoot = path.join(root, "functions-admin-ops");
const salesRoot = path.join(root, "functions-sales");
const legalRoot = path.join(root, "functions-legal");
const applicationRoot = path.join(root, "functions-application");
const attributionRoot = path.join(root, "functions-attribution");
const landingPageRoot = path.join(root, "functions-landing-page");
const creativeMediaRoot = path.join(root, "functions-creative-media");
const physicalMarketingRoot = path.join(root, "functions-physical-marketing");
const businessProfileRoot = path.join(root, "functions-business-profile");
const expectedExports = [
  "analyzePropertyIntelligence",
  "analyzeScaleIntelligence",
  "notifyOnCampaignApplicationCreated",
  "notifyOnCampaignApplicationUpdated",
  "notifyOnCampaignZoneUpdated",
  "notifyScalersOnCampaignOpened",
  "sendJobMessage",
  "updateCampaignMaterialLogistics",
  "proposeMaterialLogisticsChange",
  "respondToMaterialLogisticsChange",
  "configureJobCoordination",
  "acknowledgeJobReadiness",
  "transitionMaterialHandoff",
  "grantInternalBetaEntitlement",
  "revokeInternalBetaEntitlement",
  "setApplicationAdminRole",
  "confirmAdminLoginReadiness",
  "createAdminIssue",
  "generateManagedGrowthArtifact",
  "saveArtifactDeliveryPreference",
  "deliverManagedGrowthArtifact",
  "getSocialProviderAvailability",
  "createSocialPostDraft",
  "updateSocialPostDraft",
  "approveSocialPostDraft",
  "scheduleSocialPostDraft",
  "registerSocialMediaItem",
  "suggestBusinessGrowthProfileFromWebsite",
  "getMarketplaceWorkTypes",
  "getPendingScalerPreferences",
  "savePendingScalerPreferences",
  "evaluateOpportunityMatch",
  "joinScalerAffiliateProgram",
  "getScalerAffiliateDashboard",
  "recordBusinessReferralAttribution",
  "adminSetScalerAffiliateRate",
  "adminGetScalerAffiliateOverview",
  "updateScalerProfile",
];

function resolveFrom(packageName, packageRoot) {
  require.resolve(packageName, {paths: [packageRoot]});
}

for (const dependency of ["firebase-functions", "firebase-admin", "openai"]) {
  resolveFrom(dependency, platformRoot);
}
for (const dependency of ["firebase-functions", "firebase-admin", "nodemailer", "stripe"]) {
  resolveFrom(dependency, legacyRoot);
}
for (const dependency of ["firebase-functions", "firebase-admin"]) {
  resolveFrom(dependency, walletRoot);
}
for (const dependency of ["firebase-functions", "firebase-admin", "nodemailer"]) {
  resolveFrom(dependency, artifactEmailRoot);
  resolveFrom(dependency, jobAlertEmailRoot);
}
for (const dependency of ["firebase-functions", "firebase-admin"]) {
  resolveFrom(dependency, campaignFundingRoot);
  resolveFrom(dependency, assignmentRoot);
  resolveFrom(dependency, discoveryRoot);
  resolveFrom(dependency, jobRoomRoot);
  resolveFrom(dependency, adminOpsRoot);
  resolveFrom(dependency, salesRoot);
  resolveFrom(dependency, legalRoot);
  resolveFrom(dependency, applicationRoot);
  resolveFrom(dependency, attributionRoot);
  resolveFrom(dependency, landingPageRoot);
  resolveFrom(dependency, businessProfileRoot);
}
for (const dependency of ["firebase-functions", "firebase-admin", "openai", "sharp"]) {
  resolveFrom(dependency, creativeMediaRoot);
}
for (const dependency of ["firebase-functions", "firebase-admin", "sharp", "pdf-lib", "qrcode",
  "@pdf-lib/fontkit", "@fontsource/roboto"]) {
  resolveFrom(dependency, physicalMarketingRoot);
}
for (const dependency of ["firebase-functions", "firebase-admin", "nodemailer"]) {
  resolveFrom(dependency, transactionalEmailRoot);
}

const platform = require(path.join(platformRoot, "index.js"));
assert.deepEqual(Object.keys(platform).sort(), [...expectedExports].sort());
const legacy = require(path.join(legacyRoot, "index.js"));
const wallet = require(path.join(walletRoot, "index.js"));
const artifactEmail = require(path.join(artifactEmailRoot, "index.js"));
const jobAlertEmail = require(path.join(jobAlertEmailRoot, "index.js"));
const priorPaymentEnvironment = {
  APP_ENV: process.env.APP_ENV,
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
};
process.env.APP_ENV = "production";
process.env.GCLOUD_PROJECT = "scaled-circle";
const campaignFunding = require(path.join(campaignFundingRoot, "index.js"));
const assignment = require(path.join(assignmentRoot, "index.js"));
const discovery = require(path.join(discoveryRoot, "index.js"));
const jobRoom = require(path.join(jobRoomRoot, "index.js"));
for (const [name, value] of Object.entries(priorPaymentEnvironment)) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
const transactionalEmail = require(path.join(transactionalEmailRoot, "index.js"));
const adminOps = require(path.join(adminOpsRoot, "index.js"));
const sales = require(path.join(salesRoot, "index.js"));
const legal = require(path.join(legalRoot, "index.js"));
const application = require(path.join(applicationRoot, "index.js"));
const attribution = require(path.join(attributionRoot, "index.js"));
const landingPage = require(path.join(landingPageRoot, "index.js"));
const creativeMedia = require(path.join(creativeMediaRoot, "index.js"));
const physicalMarketing = require(path.join(physicalMarketingRoot, "index.js"));
const businessProfile = require(path.join(businessProfileRoot, "index.js"));
assert.deepEqual(Object.keys(wallet).sort(), ["ensureLegacyWalletProjection"]);
assert.deepEqual(Object.keys(attribution).sort(), [
  "bridgeResponseLead", "createResponseAsset", "getAttributionOverview",
  "getTrackingPhoneOperations", "getTrackingPhoneWorkspace",
  "importScaledCircleDogfoodCampaignV1", "resolveTrackedResponse",
]);
assert.deepEqual(Object.keys(artifactEmail).sort(), ["sendArtifactDeliveryEmailJob"]);
assert.deepEqual(Object.keys(jobAlertEmail).sort(), ["sendScalerJobAlertEmailJob"]);
assert.deepEqual(Object.keys(campaignFunding).filter((name) => !name.startsWith("_")).sort(), [
  "archiveCanceledCampaign", "cancelUnassignedFundedCampaign",
  "createCampaignFundingCheckoutSession", "publishFundedCampaign",
  "quoteCampaignFunding", "stripeWebhook",
]);
assert.deepEqual(Object.keys(assignment).sort(), [
  "acceptZoneGroupSlot", "assignScalerToZone", "configureZoneGroupAssignment",
]);
assert.deepEqual(Object.keys(discovery).sort(), [
  "analyzeCampaignZone", "applySmartZonePlan", "getSmartZonePlan",
  "resolveServiceAreaPlace", "saveDiscoveryPreferences",
].sort());
assert.deepEqual(Object.keys(jobRoom), ["getJobRoom"]);
assert.deepEqual(Object.keys(transactionalEmail).sort(), [
  "finalizePublicAccountSignup", "resendEmailVerification", "sendTransactionalEmailJob",
  "retryTransactionalEmailJob",
].sort());
assert.deepEqual(Object.keys(adminOps).sort(), [
  "getAdminCampaignTimeline", "getAdminOperationsOverview", "updateAdminSupportCaseStatus",
].sort());
assert.deepEqual(Object.keys(sales).sort(), [
  "getSalesPipeline", "mutateSalesLead", "recordSalesActivity",
].sort());
assert.deepEqual(Object.keys(legal).sort(), ["getLegalConsentStatus", "recordLegalConsent"]);
assert.deepEqual(Object.keys(application), ["applyToCampaign"]);
assert.deepEqual(Object.keys(landingPage).sort(), [
  "getLandingPageWorkspace", "mutateLandingPageDraft", "renderLandingPage",
  "submitLandingPageForm", "transitionLandingPage", "reconcileLandingPageInquiryDelivery",
].sort());
assert.deepEqual(Object.keys(creativeMedia).sort(), [
  "approveBusinessMediaRevision", "approveGeneratedServiceVisual",
  "createBusinessMediaUploadIntent", "finalizeBusinessMediaUpload",
  "getBusinessMediaWorkspace", "getGeneratedMediaOperations",
  "getGeneratedServiceVisualWorkspace", "processGeneratedServiceVisual",
  "rejectBusinessMediaRevision", "rejectGeneratedServiceVisual",
  "removeBusinessMediaAsset", "requestGeneratedServiceVisual",
  "updateBusinessBrandProfile", "updateBusinessMediaRevisionMetadata",
  "updateGeneratedMediaSafetyConfiguration",
].sort());
assert.deepEqual(Object.keys(physicalMarketing).sort(), [
  "approvePhysicalMarketingVersion", "getPhysicalMarketingOperations",
  "getPhysicalMarketingWorkspace", "mutatePhysicalMarketingMaterial",
  "preparePhysicalMarketingVersion",
].sort());
assert.deepEqual(Object.keys(businessProfile).sort(), ["saveBusinessGrowthProfile"]);
const canonicalEntitlements = fs.readFileSync(
  path.join(root, "functions", "subscription_entitlements.js"), "utf8");
const creativeMediaEntitlements = fs.readFileSync(
  path.join(creativeMediaRoot, "subscription_entitlements.js"), "utf8");
assert.equal(creativeMediaEntitlements, canonicalEntitlements,
  "creative-media-core must package the canonical entitlement reader without modification");
for (const forbidden of ["require\\(", "Stripe", "defineSecret", "collection\\(",
  "\\.set\\(", "\\.update\\("]) {
  assert.doesNotMatch(creativeMediaEntitlements, new RegExp(forbidden));
}
assert.equal(Object.hasOwn(legacy, "ensureLegacyWalletProjection"), false);
assert.equal(Object.hasOwn(legacy, "sendArtifactDeliveryEmailJob"), false);
assert.equal(Object.hasOwn(legacy, "sendScalerJobAlertEmailJob"), false);
assert.equal(Object.hasOwn(legacy, "quoteCampaignFunding"), false);
assert.equal(Object.hasOwn(legacy, "createCampaignFundingCheckoutSession"), false);
assert.equal(Object.hasOwn(legacy, "publishFundedCampaign"), false);
assert.equal(Object.hasOwn(legacy, "stripeWebhook"), false);
for (const name of ["assignScalerToZone", "configureZoneGroupAssignment", "acceptZoneGroupSlot"]) {
  assert.equal(Object.hasOwn(legacy, name), false);
}
assert.equal(Object.hasOwn(legacy, "sendOutboundEmailJob"), false);
assert.equal(Object.hasOwn(legacy, "sendTransactionalEmailJob"), false);
assert.equal(Object.hasOwn(legacy, "finalizePublicAccountSignup"), false);
assert.equal(Object.hasOwn(legacy, "resendEmailVerification"), false);
for (const name of Object.keys(adminOps)) assert.equal(Object.hasOwn(legacy, name), false);
for (const name of Object.keys(sales)) assert.equal(Object.hasOwn(legacy, name), false);
for (const name of Object.keys(legal)) assert.equal(Object.hasOwn(legacy, name), false);
for (const name of Object.keys(application)) assert.equal(Object.hasOwn(legacy, name), false);
for (const name of Object.keys(landingPage)) assert.equal(Object.hasOwn(legacy, name), false);
for (const name of Object.keys(creativeMedia)) assert.equal(Object.hasOwn(legacy, name), false);
for (const name of Object.keys(physicalMarketing)) assert.equal(Object.hasOwn(legacy, name), false);
for (const name of Object.keys(businessProfile)) assert.equal(Object.hasOwn(legacy, name), false);

const inventories = [Object.keys(platform), Object.keys(legacy), Object.keys(wallet),
  Object.keys(artifactEmail), Object.keys(jobAlertEmail), Object.keys(campaignFunding),
  Object.keys(transactionalEmail), Object.keys(adminOps)];
inventories.push(Object.keys(sales));
inventories.push(Object.keys(assignment));
inventories.push(Object.keys(discovery));
inventories.push(Object.keys(jobRoom));
inventories.push(Object.keys(legal));
inventories.push(Object.keys(application));
inventories.push(Object.keys(attribution));
inventories.push(Object.keys(landingPage));
inventories.push(Object.keys(creativeMedia));
inventories.push(Object.keys(physicalMarketing));
inventories.push(Object.keys(businessProfile));
const assigned = inventories.flat();
assert.equal(new Set(assigned).size, assigned.length, "A Function export belongs to multiple codebases.");

const walletSource = require("node:fs").readFileSync(path.join(walletRoot, "index.js"), "utf8");
const walletLock = require("node:fs").readFileSync(path.join(walletRoot, "package-lock.json"), "utf8");
for (const forbidden of [
  "STRIPE_THIN_WEBHOOK_SECRET",
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
  "OPENAI_API_KEY", "CENSUS_API_KEY", "stripeClient", "stripeWebhook",
]) assert.doesNotMatch(walletSource, new RegExp(forbidden));
for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(walletLock, new RegExp(forbiddenPackage));
}

const assignmentSource = require("node:fs").readFileSync(path.join(assignmentRoot, "index.js"), "utf8");
const assignmentLock = require("node:fs").readFileSync(path.join(assignmentRoot, "package-lock.json"), "utf8");
const discoverySource = require("node:fs").readFileSync(path.join(discoveryRoot, "index.js"), "utf8");
const discoveryLock = require("node:fs").readFileSync(path.join(discoveryRoot, "package-lock.json"), "utf8");
for (const forbidden of [
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
  "STRIPE_SECRET_KEY", "STRIPE_TEST_SECRET_KEY", "STRIPE_LIVE_SECRET_KEY",
  "signupNotifications", "nodemailer",
]) assert.doesNotMatch(assignmentSource, new RegExp(forbidden));
for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(assignmentLock, new RegExp(forbiddenPackage));
}
for (const forbidden of ["CENSUS_API_KEY", "OPENAI_API_KEY", "SMTP_PASSWORD", "STRIPE_", "defineSecret"]) {
  assert.doesNotMatch(discoverySource, new RegExp(forbidden));
}
for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(discoveryLock, new RegExp(forbiddenPackage));
}

const transactionalSource = require("node:fs").readFileSync(
  path.join(transactionalEmailRoot, "index.js"), "utf8");
const transactionalLock = require("node:fs").readFileSync(
  path.join(transactionalEmailRoot, "package-lock.json"), "utf8");
assert.match(transactionalSource,
  /const SUPPORT_EMAIL_SMTP_PASSWORD = defineSecret\("SUPPORT_EMAIL_SMTP_PASSWORD"\)/);
for (const forbidden of [
  "STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "OPENAI_API_KEY", "CENSUS_API_KEY",
  "stripeClient", "stripeWebhook", "campaignFunding", "wallet",
]) assert.doesNotMatch(transactionalSource, new RegExp(forbidden));
for (const forbiddenPackage of ["node_modules/stripe", "openai"]) {
  assert.doesNotMatch(transactionalLock, new RegExp(forbiddenPackage));
}

const artifactSource = require("node:fs").readFileSync(path.join(artifactEmailRoot, "index.js"), "utf8");
const artifactLock = require("node:fs").readFileSync(
  path.join(artifactEmailRoot, "package-lock.json"), "utf8");
assert.match(artifactSource,
  /const SUPPORT_EMAIL_SMTP_PASSWORD = defineSecret\("SUPPORT_EMAIL_SMTP_PASSWORD"\)/);
for (const forbidden of [
  "STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "OPENAI_API_KEY", "CENSUS_API_KEY",
  "stripeClient", "stripeWebhook",
]) assert.doesNotMatch(artifactSource, new RegExp(forbidden));
for (const forbiddenPackage of ["node_modules/stripe", "openai"]) {
  assert.doesNotMatch(artifactLock, new RegExp(forbiddenPackage));
}

const jobAlertSource = require("node:fs").readFileSync(path.join(jobAlertEmailRoot, "index.js"), "utf8");
assert.match(jobAlertSource,
  /const SUPPORT_EMAIL_SMTP_PASSWORD = defineSecret\("SUPPORT_EMAIL_SMTP_PASSWORD"\)/);
for (const forbidden of ["STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "OPENAI_API_KEY",
  "CENSUS_API_KEY", "sendArtifactDeliveryEmailJob"]) assert.doesNotMatch(jobAlertSource, new RegExp(forbidden));

const campaignFundingSource = require("node:fs").readFileSync(
  path.join(campaignFundingRoot, "index.js"), "utf8");
const campaignFundingLock = require("node:fs").readFileSync(
  path.join(campaignFundingRoot, "package-lock.json"), "utf8");
for (const forbidden of [
  "STRIPE_THIN_WEBHOOK_SECRET",
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
  "OPENAI_API_KEY", "CENSUS_API_KEY", "stripeThinWebhook", "fundCampaign",
]) assert.doesNotMatch(campaignFundingSource, new RegExp(forbidden));
assert.doesNotMatch(campaignFundingSource, /defineSecret\(["']STRIPE_SECRET_KEY["']\)/);
assert.doesNotMatch(campaignFundingSource, /defineSecret\(["']STRIPE_WEBHOOK_SECRET["']\)/);
assert.match(campaignFundingSource, /STRIPE_TEST_SECRET_KEY/);
assert.match(campaignFundingSource, /STRIPE_TEST_WEBHOOK_SECRET/);
assert.match(campaignFundingSource, /STRIPE_LIVE_SECRET_KEY/);
assert.match(campaignFundingSource, /STRIPE_LIVE_WEBHOOK_SECRET/);
for (const forbiddenPackage of ["node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(campaignFundingLock, new RegExp(forbiddenPackage));
}

const salesSource = require("node:fs").readFileSync(path.join(salesRoot, "index.js"), "utf8");
const salesLock = require("node:fs").readFileSync(path.join(salesRoot, "package-lock.json"), "utf8");
for (const forbidden of ["STRIPE_", "SMTP_PASSWORD", "OPENAI_API_KEY", "CENSUS_API_KEY", "defineSecret"]) {
  assert.doesNotMatch(salesSource, new RegExp(forbidden));
}
for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(salesLock, new RegExp(forbiddenPackage));
}

const legalSource = require("node:fs").readFileSync(path.join(legalRoot, "index.js"), "utf8");
const legalLock = require("node:fs").readFileSync(path.join(legalRoot, "package-lock.json"), "utf8");
for (const forbidden of ["STRIPE_", "SMTP_PASSWORD", "OPENAI_API_KEY", "CENSUS_API_KEY",
  "defineSecret", "wallets", "campaignPayments", "scalerEarnings"]) {
  assert.doesNotMatch(legalSource, new RegExp(forbidden));
}
for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(legalLock, new RegExp(forbiddenPackage));
}

console.log(`Verified ${expectedExports.length} platform-core exports plus isolated business-profile-core, assignment-core, discovery-core, job-room-core, wallet-core, artifact-email, job-alert-email, campaign-funding, transactional-email, admin-ops-core, sales-core, and legal-core exports.`);

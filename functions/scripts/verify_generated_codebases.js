"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const platformRoot = path.join(root, "functions-platform");
const legacyRoot = path.join(root, "functions-legacy");
const walletRoot = path.join(root, "functions-wallet");
const artifactEmailRoot = path.join(root, "functions-artifact-email");
const jobAlertEmailRoot = path.join(root, "functions-job-alert-email");
const campaignFundingRoot = path.join(root, "functions-campaign-funding");
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
  "saveBusinessGrowthProfile",
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
  "saveDiscoveryPreferences",
  "getMarketplaceWorkTypes",
  "getPendingScalerPreferences",
  "savePendingScalerPreferences",
  "resolveServiceAreaPlace",
  "evaluateOpportunityMatch",
  "joinScalerAffiliateProgram",
  "getScalerAffiliateDashboard",
  "recordBusinessReferralAttribution",
  "adminSetScalerAffiliateRate",
  "adminGetScalerAffiliateOverview",
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
}

const platform = require(path.join(platformRoot, "index.js"));
assert.deepEqual(Object.keys(platform).sort(), [...expectedExports].sort());
const legacy = require(path.join(legacyRoot, "index.js"));
const wallet = require(path.join(walletRoot, "index.js"));
const artifactEmail = require(path.join(artifactEmailRoot, "index.js"));
const jobAlertEmail = require(path.join(jobAlertEmailRoot, "index.js"));
const campaignFunding = require(path.join(campaignFundingRoot, "index.js"));
assert.deepEqual(Object.keys(wallet).sort(), ["ensureLegacyWalletProjection"]);
assert.deepEqual(Object.keys(artifactEmail).sort(), ["sendArtifactDeliveryEmailJob"]);
assert.deepEqual(Object.keys(jobAlertEmail).sort(), ["sendScalerJobAlertEmailJob"]);
assert.deepEqual(Object.keys(campaignFunding).sort(), ["quoteCampaignFunding"]);
assert.equal(Object.hasOwn(legacy, "ensureLegacyWalletProjection"), false);
assert.equal(Object.hasOwn(legacy, "sendArtifactDeliveryEmailJob"), false);
assert.equal(Object.hasOwn(legacy, "sendScalerJobAlertEmailJob"), false);
assert.equal(Object.hasOwn(legacy, "quoteCampaignFunding"), false);

const inventories = [Object.keys(platform), Object.keys(legacy), Object.keys(wallet),
  Object.keys(artifactEmail), Object.keys(jobAlertEmail), Object.keys(campaignFunding)];
const assigned = inventories.flat();
assert.equal(new Set(assigned).size, assigned.length, "A Function export belongs to multiple codebases.");

const walletSource = require("node:fs").readFileSync(path.join(walletRoot, "index.js"), "utf8");
const walletLock = require("node:fs").readFileSync(path.join(walletRoot, "package-lock.json"), "utf8");
for (const forbidden of [
  "STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
  "OPENAI_API_KEY", "CENSUS_API_KEY", "stripeClient", "stripeWebhook",
]) assert.doesNotMatch(walletSource, new RegExp(forbidden));
for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(walletLock, new RegExp(forbiddenPackage));
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
  "STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
  "OPENAI_API_KEY", "CENSUS_API_KEY", "stripeClient", "stripeWebhook",
  "createCampaignFundingCheckoutSession", "publishFundedCampaign", "fundCampaign",
]) assert.doesNotMatch(campaignFundingSource, new RegExp(forbidden));
for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
  assert.doesNotMatch(campaignFundingLock, new RegExp(forbiddenPackage));
}

console.log(`Verified ${expectedExports.length} platform-core exports plus isolated wallet-core, artifact-email, job-alert-email, and campaign-funding exports.`);

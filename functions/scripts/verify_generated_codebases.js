"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const platformRoot = path.join(root, "functions-platform");
const legacyRoot = path.join(root, "functions-legacy");
const walletRoot = path.join(root, "functions-wallet");
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
  "evaluateOpportunityMatch",
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

const platform = require(path.join(platformRoot, "index.js"));
assert.deepEqual(Object.keys(platform).sort(), [...expectedExports].sort());
const legacy = require(path.join(legacyRoot, "index.js"));
const wallet = require(path.join(walletRoot, "index.js"));
assert.deepEqual(Object.keys(wallet).sort(), ["ensureLegacyWalletProjection"]);
assert.equal(Object.hasOwn(legacy, "ensureLegacyWalletProjection"), false);

const inventories = [Object.keys(platform), Object.keys(legacy), Object.keys(wallet)];
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

console.log("Verified generated dependencies, 31 platform-core exports, and one isolated wallet-core export.");

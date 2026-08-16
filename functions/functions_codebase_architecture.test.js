"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const platform = fs.readFileSync(path.join(root, "functions-platform", "index.js"), "utf8");
const legacy = fs.readFileSync(path.join(root, "functions-legacy", "index.js"), "utf8");
const wallet = fs.readFileSync(path.join(root, "functions-wallet", "index.js"), "utf8");
const artifactEmail = fs.readFileSync(path.join(root, "functions-artifact-email", "index.js"), "utf8");
const artifactEmailDelivery = fs.readFileSync(
  path.join(root, "functions-artifact-email", "managed_growth_delivery.js"), "utf8");
const expected = [
  "analyzePropertyIntelligence", "analyzeScaleIntelligence",
  "notifyOnCampaignApplicationCreated", "notifyOnCampaignApplicationUpdated",
  "notifyOnCampaignZoneUpdated", "sendJobMessage", "updateCampaignMaterialLogistics",
  "notifyScalersOnCampaignOpened",
  "proposeMaterialLogisticsChange", "respondToMaterialLogisticsChange",
  "configureJobCoordination", "acknowledgeJobReadiness", "transitionMaterialHandoff",
  "grantInternalBetaEntitlement", "revokeInternalBetaEntitlement",
  "setApplicationAdminRole", "confirmAdminLoginReadiness", "createAdminIssue",
  "saveBusinessGrowthProfile", "generateManagedGrowthArtifact",
  "saveArtifactDeliveryPreference", "deliverManagedGrowthArtifact",
  "getSocialProviderAvailability", "createSocialPostDraft", "updateSocialPostDraft",
  "approveSocialPostDraft", "scheduleSocialPostDraft", "registerSocialMediaItem",
  "suggestBusinessGrowthProfileFromWebsite",
  "saveDiscoveryPreferences", "evaluateOpportunityMatch",
  "resolveServiceAreaPlace",
];

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
const platformPackage = JSON.parse(fs.readFileSync(path.join(root, "functions-platform", "package.json"), "utf8"));
const legacyPackage = JSON.parse(fs.readFileSync(path.join(root, "functions-legacy", "package.json"), "utf8"));
const walletPackage = JSON.parse(fs.readFileSync(path.join(root, "functions-wallet", "package.json"), "utf8"));
const walletLock = fs.readFileSync(path.join(root, "functions-wallet", "package-lock.json"), "utf8");
const artifactEmailPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-artifact-email", "package.json"), "utf8"));
const artifactEmailLock = fs.readFileSync(
  path.join(root, "functions-artifact-email", "package-lock.json"), "utf8");

function exportsIn(source) {
  return [...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
}

test("platform-core has the exact reviewed public exports", () => {
  assert.deepEqual([...new Set(exportsIn(platform))].sort(), [...expected].sort());
  for (const name of expected) assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
});

test("wallet-core owns exactly one secret-free callable with no duplicate assignment", () => {
  assert.deepEqual(exportsIn(wallet), ["ensureLegacyWalletProjection"]);
  assert.doesNotMatch(legacy, /exports\.ensureLegacyWalletProjection\s*=/);
  for (const forbidden of [
    "STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
    "OPENAI_API_KEY", "CENSUS_API_KEY", "stripeClient", "stripeWebhook",
  ]) assert.doesNotMatch(wallet, new RegExp(forbidden));
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(walletLock, new RegExp(forbiddenPackage));
  }
  const inventories = [exportsIn(platform), exportsIn(legacy), exportsIn(wallet),
    exportsIn(artifactEmail)]
    .map((exports) => [...new Set(exports)]);
  const all = inventories.flat();
  assert.equal(new Set(all).size, all.length);
});

test("artifact-email owns one isolated support-SMTP worker on a distinct queue", () => {
  assert.deepEqual(exportsIn(artifactEmail), ["sendArtifactDeliveryEmailJob"]);
  assert.doesNotMatch(legacy, /exports\.sendArtifactDeliveryEmailJob\s*=/);
  assert.match(artifactEmail,
    /const SUPPORT_EMAIL_SMTP_PASSWORD = defineSecret\("SUPPORT_EMAIL_SMTP_PASSWORD"\)/);
  assert.match(`${artifactEmail}\n${artifactEmailDelivery}`, /artifactDeliveryEmailJobs/);
  for (const forbidden of [
    "STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "OPENAI_API_KEY", "CENSUS_API_KEY",
    "stripeClient", "stripeWebhook",
  ]) assert.doesNotMatch(artifactEmail, new RegExp(forbidden));
  for (const forbiddenPackage of ["node_modules/stripe", "openai"]) {
    assert.doesNotMatch(artifactEmailLock, new RegExp(forbiddenPackage));
  }
  const legacyWorker = legacy.slice(legacy.indexOf("exports.sendOutboundEmailJob"),
    legacy.indexOf("exports.localOpportunityAlerts"));
  assert.doesNotMatch(legacyWorker, /artifact_delivery_v1|artifactDeliveryEmailJobs/);
});

test("platform-core is isolated from legacy and unrelated provider secrets", () => {
  assert.doesNotMatch(platform, /require\([^)]*functions[\\/]index\.js/);
  for (const forbidden of [
    "STRIPE_THIN_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
  ]) assert.doesNotMatch(platform, new RegExp(forbidden));
  assert.match(platform, /const CENSUS_API_KEY = defineSecret\("CENSUS_API_KEY"\)/);
  assert.match(platform, /const OPENAI_API_KEY = defineSecret\("OPENAI_API_KEY"\)/);
});

test("provider secrets bind only to their reviewed intelligence functions", () => {
  assert.match(platform, /exports\.analyzePropertyIntelligence[\s\S]*?secrets:\s*\[CENSUS_API_KEY\]/);
  assert.match(platform, /exports\.analyzeScaleIntelligence[\s\S]*?secrets:\s*\[OPENAI_API_KEY\]/);
  const growthStart = platform.indexOf("exports.generateManagedGrowthArtifact");
  assert.match(platform.slice(growthStart, growthStart + 900), /secrets:\s*\[OPENAI_API_KEY\]/);
  for (const name of ["saveBusinessGrowthProfile", "suggestBusinessGrowthProfileFromWebsite",
    "saveDiscoveryPreferences", "evaluateOpportunityMatch"]) {
    const start = platform.indexOf(`exports.${name}`);
    assert.doesNotMatch(platform.slice(start, start + 1200), /secrets\s*:/);
  }
  for (const name of ["notifyOnCampaignApplicationCreated", "notifyScalersOnCampaignOpened", "sendJobMessage",
    "setApplicationAdminRole", "createAdminIssue"]) {
    const start = platform.indexOf(`exports.${name}`);
    assert.doesNotMatch(platform.slice(start, start + 900),
      /secrets:\s*\[(?:CENSUS_API_KEY|OPENAI_API_KEY)\]/);
  }
});

test("internal beta callables add no provider or payment secret boundary", () => {
  for (const name of ["grantInternalBetaEntitlement", "revokeInternalBetaEntitlement"]) {
    const start = platform.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    const declaration = platform.slice(start, start + 900);
    assert.doesNotMatch(declaration, /secrets\s*:/);
  }
});

test("admin operations are platform-only and add no provider, payment, or email secret binding", () => {
  for (const name of ["setApplicationAdminRole", "confirmAdminLoginReadiness", "createAdminIssue"]) {
    const start = platform.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    const declaration = platform.slice(start, start + 1000);
    assert.doesNotMatch(declaration, /secrets\s*:/);
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  }
  assert.doesNotMatch(platform, /registerSalesRepresentative|salesCommission|claimSalesReferral/);
});

test("new notification triggers do not silently enable production retries", () => {
  for (const name of [
    "notifyOnCampaignApplicationCreated",
    "notifyOnCampaignApplicationUpdated",
    "notifyOnCampaignZoneUpdated",
  ]) {
    const start = platform.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    const declaration = platform.slice(start, start + 650);
    assert.match(declaration, /retry:\s*false/);
    assert.doesNotMatch(declaration, /retry:\s*true/);
  }
});

test("generated codebase preparation installs dependencies after regeneration", () => {
  for (const codebase of firebaseConfig.functions.filter((item) =>
    ["default", "platform-core", "wallet-core", "artifact-email"].includes(item.codebase))) {
    assert.deepEqual(codebase.predeploy, ["npm --prefix functions run prepare:function-codebases"]);
  }
  assert.deepEqual(Object.keys(platformPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions", "openai",
  ]);
  assert.deepEqual(Object.keys(legacyPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions", "nodemailer", "stripe",
  ]);
  assert.deepEqual(Object.keys(walletPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  assert.deepEqual(Object.keys(artifactEmailPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions", "nodemailer",
  ]);
});

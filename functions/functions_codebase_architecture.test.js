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
const jobAlertEmail = fs.readFileSync(path.join(root, "functions-job-alert-email", "index.js"), "utf8");
const artifactEmailDelivery = fs.readFileSync(
  path.join(root, "functions-artifact-email", "managed_growth_delivery.js"), "utf8");
const expected = [
  "analyzePropertyIntelligence", "analyzeScaleIntelligence",
  "notifyOnCampaignApplicationCreated", "notifyOnCampaignApplicationUpdated",
  "notifyOnCampaignZoneUpdated", "sendJobMessage", "updateCampaignMaterialLogistics",
  "notifyScalersOnCampaignOpened",
  "proposeMaterialLogisticsChange",
  "respondToMaterialLogisticsChange", "configureJobCoordination",
  "acknowledgeJobReadiness", "transitionMaterialHandoff",
  "grantInternalBetaEntitlement", "revokeInternalBetaEntitlement",
  "setApplicationAdminRole", "confirmAdminLoginReadiness", "createAdminIssue",
  "saveBusinessGrowthProfile", "generateManagedGrowthArtifact",
  "saveArtifactDeliveryPreference", "deliverManagedGrowthArtifact",
  "getSocialProviderAvailability", "createSocialPostDraft", "updateSocialPostDraft",
  "approveSocialPostDraft", "scheduleSocialPostDraft", "registerSocialMediaItem",
  "suggestBusinessGrowthProfileFromWebsite",
  "evaluateOpportunityMatch",
  "getMarketplaceWorkTypes", "getPendingScalerPreferences", "savePendingScalerPreferences",
  "resolveServiceAreaPlace",
  "joinScalerAffiliateProgram", "getScalerAffiliateDashboard",
  "recordBusinessReferralAttribution", "adminSetScalerAffiliateRate",
  "adminGetScalerAffiliateOverview",
  "updateScalerProfile",
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
const campaignFunding = fs.readFileSync(
  path.join(root, "functions-campaign-funding", "index.js"), "utf8");
const campaignFundingPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-campaign-funding", "package.json"), "utf8"));
const campaignFundingLock = fs.readFileSync(
  path.join(root, "functions-campaign-funding", "package-lock.json"), "utf8");
const assignment = fs.readFileSync(
  path.join(root, "functions-assignment", "index.js"), "utf8");
const discovery = fs.readFileSync(
  path.join(root, "functions-discovery", "index.js"), "utf8");
const assignmentPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-assignment", "package.json"), "utf8"));
const assignmentLock = fs.readFileSync(
  path.join(root, "functions-assignment", "package-lock.json"), "utf8");
const discoveryPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-discovery", "package.json"), "utf8"));
const discoveryLock = fs.readFileSync(
  path.join(root, "functions-discovery", "package-lock.json"), "utf8");
const jobRoom = fs.readFileSync(path.join(root, "functions-job-room", "index.js"), "utf8");
const jobRoomPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-job-room", "package.json"), "utf8"));
const jobRoomLock = fs.readFileSync(
  path.join(root, "functions-job-room", "package-lock.json"), "utf8");
const transactionalEmail = fs.readFileSync(
  path.join(root, "functions-transactional-email", "index.js"), "utf8");
const transactionalEmailPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-transactional-email", "package.json"), "utf8"));
const transactionalEmailLock = fs.readFileSync(
  path.join(root, "functions-transactional-email", "package-lock.json"), "utf8");
const adminOps = fs.readFileSync(path.join(root, "functions-admin-ops", "index.js"), "utf8");
const adminOpsPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-admin-ops", "package.json"), "utf8"));
const adminOpsLock = fs.readFileSync(
  path.join(root, "functions-admin-ops", "package-lock.json"), "utf8");
const sales = fs.readFileSync(path.join(root, "functions-sales", "index.js"), "utf8");
const salesPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-sales", "package.json"), "utf8"));
const salesLock = fs.readFileSync(path.join(root, "functions-sales", "package-lock.json"), "utf8");
const legal = fs.readFileSync(path.join(root, "functions-legal", "index.js"), "utf8");
const legalPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-legal", "package.json"), "utf8"));
const legalLock = fs.readFileSync(path.join(root, "functions-legal", "package-lock.json"), "utf8");
const application = fs.readFileSync(path.join(root, "functions-application", "index.js"), "utf8");
const applicationPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-application", "package.json"), "utf8"));
const applicationLock = fs.readFileSync(
  path.join(root, "functions-application", "package-lock.json"), "utf8");

function exportsIn(source) {
  return [...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
}

test("platform-core has the exact reviewed public exports", () => {
  assert.deepEqual([...new Set(exportsIn(platform))].sort(), [...expected].sort());
  for (const name of expected) assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
});

test("campaign-funding owns the isolated TEST-mode campaign payment boundary", () => {
  assert.deepEqual(exportsIn(campaignFunding), [
    "quoteCampaignFunding", "createCampaignFundingCheckoutSession",
    "cancelUnassignedFundedCampaign", "archiveCanceledCampaign",
    "stripeWebhook", "publishFundedCampaign",
  ]);
  assert.doesNotMatch(legacy, /exports\.quoteCampaignFunding\s*=/);
  assert.match(campaignFunding, /exports\.quoteCampaignFunding\s*=\s*onCall/);
  assert.match(campaignFunding, /async function ownedCampaign/);
  assert.match(campaignFunding, /lifecycle\.quoteForCampaign\(input\.campaign\)/);
  for (const forbidden of [
    "STRIPE_THIN_WEBHOOK_SECRET",
    "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
    "OPENAI_API_KEY", "CENSUS_API_KEY", "stripeThinWebhook", "fundCampaign",
  ]) assert.doesNotMatch(campaignFunding, new RegExp(forbidden));
  assert.doesNotMatch(campaignFunding, /defineSecret\(["']STRIPE_SECRET_KEY["']\)/);
  assert.doesNotMatch(campaignFunding, /defineSecret\(["']STRIPE_WEBHOOK_SECRET["']\)/);
  for (const writeOrProvider of [
    /wallets/, /createCreditCheckoutSession/, /createScalerConnectedAccount/,
    /stripeThinWebhook/, /STRIPE_THIN_WEBHOOK_SECRET/,
  ]) assert.doesNotMatch(campaignFunding, writeOrProvider);
  assert.deepEqual(Object.keys(campaignFundingPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions", "stripe",
  ]);
  for (const forbiddenPackage of ["node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(campaignFundingLock, new RegExp(forbiddenPackage));
  }
});

test("discovery-core exclusively owns the secret-free discovery and Zone analysis callables", () => {
  const names = ["saveDiscoveryPreferences", "analyzeCampaignZone",
    "getSmartZonePlan", "applySmartZonePlan"];
  assert.deepEqual(exportsIn(discovery).sort(), [...names].sort());
  for (const name of names) {
    assert.doesNotMatch(platform, new RegExp(`exports\\.${name}\\s*=`));
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  }
  assert.match(discovery, /exports\.saveDiscoveryPreferences\s*=\s*onCall/);
  assert.match(discovery, /exports\.analyzeCampaignZone\s*=\s*onCall/);
  assert.match(discovery, /exports\.getSmartZonePlan\s*=\s*onCall/);
  assert.match(discovery, /exports\.applySmartZonePlan\s*=\s*onCall/);
  assert.match(discovery, /smart_zone_conservative_density_v1/);
  assert.match(discovery, /analysisStatus:\s*"complete"/);
  assert.match(discovery, /serverZoneMetricsVersion/);
  assert.match(discovery,
    /const areaSquareMeters\s*=\s*serverWalkingEstimate\.areaSquareMeters/);
  assert.doesNotMatch(discovery,
    /readNumber\(\s*zoneData\.zoneAreaSquareMeters/);
  assert.deepEqual(Object.keys(discoveryPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  for (const forbidden of [
    "CENSUS_API_KEY", "OPENAI_API_KEY", "SMTP_PASSWORD", "STRIPE_",
    "WEATHER_API", "defineSecret",
  ]) assert.doesNotMatch(discovery, new RegExp(forbidden));
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(discoveryLock, new RegExp(forbiddenPackage));
  }
  assert.equal(firebaseConfig.functions.find((entry) =>
    entry.codebase === "discovery-core")?.source, "functions-discovery");
});

test("assignment-core exclusively owns the maintained assignment callable IDs", () => {
  const names = ["assignScalerToZone", "configureZoneGroupAssignment", "acceptZoneGroupSlot"];
  assert.deepEqual(exportsIn(assignment).sort(), [...names].sort());
  for (const name of names) assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  assert.deepEqual(Object.keys(assignmentPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  for (const forbidden of [
    "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD", "SUPPORT_EMAIL_SMTP_PASSWORD",
    "STRIPE_SECRET_KEY", "STRIPE_TEST_SECRET_KEY", "STRIPE_LIVE_SECRET_KEY",
    "signupNotifications", "nodemailer",
  ]) assert.doesNotMatch(assignment, new RegExp(forbidden));
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(assignmentLock, new RegExp(forbiddenPackage));
  }
});

test("job-room-core exclusively owns the secret-free Job Room read authority", () => {
  const names = ["getJobRoom"];
  assert.deepEqual(exportsIn(jobRoom).sort(), [...names].sort());
  for (const name of names) {
    assert.doesNotMatch(platform, new RegExp(`exports\\.${name}\\s*=`));
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  }
  assert.deepEqual(Object.keys(jobRoomPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  for (const forbidden of ["defineSecret", "STRIPE_", "SMTP_PASSWORD", "OPENAI_API_KEY",
    "CENSUS_API_KEY", "nodemailer"]) assert.doesNotMatch(jobRoom, new RegExp(forbidden));
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(jobRoomLock, new RegExp(forbiddenPackage));
  }
  assert.equal(firebaseConfig.functions.find((entry) =>
    entry.codebase === "job-room-core")?.source, "functions-job-room");
});

test("admin-ops-core exclusively owns the secret-free operational read boundary", () => {
  const names = ["getAdminOperationsOverview", "getAdminCampaignTimeline",
    "updateAdminSupportCaseStatus"];
  assert.deepEqual(exportsIn(adminOps).sort(), [...names].sort());
  for (const name of names) {
    assert.doesNotMatch(platform, new RegExp(`exports\\.${name}\\s*=`));
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  }
  assert.deepEqual(Object.keys(adminOpsPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  for (const forbidden of ["defineSecret", "STRIPE_", "SMTP_PASSWORD", "OPENAI_API_KEY",
    "CENSUS_API_KEY", "nodemailer"]) assert.doesNotMatch(adminOps, new RegExp(forbidden));
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(adminOpsLock, new RegExp(forbiddenPackage));
  }
  assert.equal(firebaseConfig.functions.find((entry) =>
    entry.codebase === "admin-ops-core")?.source, "functions-admin-ops");
});

test("sales-core exclusively owns the bounded zero-secret Sales authority", () => {
  const names = ["getSalesPipeline", "mutateSalesLead", "recordSalesActivity"];
  assert.deepEqual(exportsIn(sales).sort(), [...names].sort());
  for (const name of names) {
    assert.doesNotMatch(platform, new RegExp(`exports\\.${name}\\s*=`));
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  }
  assert.deepEqual(Object.keys(salesPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  for (const forbidden of ["defineSecret", "STRIPE_", "SMTP_PASSWORD", "OPENAI_API_KEY",
    "CENSUS_API_KEY", "nodemailer"]) assert.doesNotMatch(sales, new RegExp(forbidden));
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(salesLock, new RegExp(forbiddenPackage));
  }
  assert.equal(firebaseConfig.functions.find((entry) =>
    entry.codebase === "sales-core")?.source, "functions-sales");
});

test("legal-core exclusively owns immutable zero-secret consent authority", () => {
  assert.deepEqual(exportsIn(legal).sort(), ["getLegalConsentStatus", "recordLegalConsent"]);
  for (const name of ["recordLegalConsent", "getLegalConsentStatus"]) {
    assert.doesNotMatch(platform, new RegExp(`exports\\.${name}\\s*=`));
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  }
  assert.deepEqual(Object.keys(legalPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  for (const forbidden of ["defineSecret", "STRIPE_", "SMTP_PASSWORD", "OPENAI_API_KEY",
    "CENSUS_API_KEY", "nodemailer", "wallets", "campaignPayments", "scalerEarnings"]) {
    assert.doesNotMatch(legal, new RegExp(forbidden));
  }
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(legalLock, new RegExp(forbiddenPackage));
  }
  assert.equal(firebaseConfig.functions.find((entry) =>
    entry.codebase === "legal-core")?.source, "functions-legal");
});

test("application-core exclusively owns secret-free consent-gated applications", () => {
  assert.deepEqual(exportsIn(application), ["applyToCampaign"]);
  assert.doesNotMatch(legacy, /exports\.applyToCampaign\s*=/);
  assert.match(application, /ROLE_REQUIREMENTS\.scaler_work/);
  assert.deepEqual(Object.keys(applicationPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  for (const forbidden of ["defineSecret", "STRIPE_", "SMTP_PASSWORD", "OPENAI_API_KEY",
    "CENSUS_API_KEY", "nodemailer", "stripeClient"]) {
    assert.doesNotMatch(application, new RegExp(forbidden));
  }
  for (const forbiddenPackage of ["node_modules/stripe", "node_modules/nodemailer", "openai"]) {
    assert.doesNotMatch(applicationLock, new RegExp(forbiddenPackage));
  }
  assert.equal(firebaseConfig.functions.find((entry) =>
    entry.codebase === "application-core")?.source, "functions-application");
});

test("assignment-core preserves ownership, Zone, duplicate, and rollout authority", () => {
  assert.match(assignment,
    /context\.role !== "business"[\s\S]*campaign\.businessId !== context\.uid/);
  assert.match(assignment,
    /zone\.campaignId !== campaignId \|\| zone\.businessId !== campaign\.businessId/);
  assert.match(assignment, /if \(zone\.assignedScalerId\)/);
  assert.match(assignment, /if \(compensationSnapshot\.exists\)/);
  assert.match(assignment, /assertProductionScalerCount\([\s\S]*requiredScalerCount/);
  assert.match(assignment, /groupAssignment\.assertSlotAvailable/);
  assert.match(assignment, /transaction\.create\(participantRef/);
  assert.match(assignment, /type: "job_assignment"/);
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
    exportsIn(artifactEmail), exportsIn(transactionalEmail), exportsIn(assignment),
    exportsIn(discovery), exportsIn(jobRoom), exportsIn(adminOps), exportsIn(sales),
    exportsIn(legal)]
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

test("retired legacy GPS endpoint is absent from every deployable codebase", () => {
  const deployableSources = [platform, legacy, wallet, artifactEmail,
    jobAlertEmail, transactionalEmail, campaignFunding, assignment, discovery];
  for (const source of deployableSources) {
    assert.doesNotMatch(source, /exports\.saveLegacyTrackingRoute\s*=/);
  }
  const generator = fs.readFileSync(path.join(
    root, "functions", "scripts", "generate_functions_codebases.js"), "utf8");
  assert.match(generator,
    /retiredProductionExports = new Set\(\["saveLegacyTrackingRoute", "fundCampaign"\]\)/);
});

test("legacy wallet campaign funding cannot be regenerated", () => {
  for (const source of [legacy, platform, campaignFunding]) {
    assert.doesNotMatch(source, /exports\.fundCampaign\s*=/);
  }
  const generator = fs.readFileSync(path.join(
    root, "functions", "scripts", "generate_functions_codebases.js"), "utf8");
  assert.match(generator, /retiredProductionExports[\s\S]*fundCampaign/);
});

test("transactional-email exclusively owns signup callables and durable queue worker", () => {
  assert.deepEqual([...new Set(exportsIn(transactionalEmail))].sort(), [
    "finalizePublicAccountSignup", "resendEmailVerification", "sendTransactionalEmailJob",
  ].sort());
  for (const name of ["finalizePublicAccountSignup", "resendEmailVerification",
    "sendTransactionalEmailJob", "sendOutboundEmailJob"]) {
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
  }
  assert.match(transactionalEmail, /outboundEmailJobs\/\{jobId\}/);
  assert.match(transactionalEmail,
    /const SUPPORT_EMAIL_SMTP_PASSWORD = defineSecret\("SUPPORT_EMAIL_SMTP_PASSWORD"\)/);
  assert.deepEqual(Object.keys(transactionalEmailPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions", "nodemailer",
  ]);
  for (const forbidden of ["STRIPE_SECRET_KEY", "STRIPE_THIN_WEBHOOK_SECRET",
    "OPENAI_API_KEY", "CENSUS_API_KEY", "campaignFunding", "wallet"]) {
    assert.doesNotMatch(transactionalEmail, new RegExp(forbidden));
  }
  for (const forbiddenPackage of ["node_modules/stripe", "openai"]) {
    assert.doesNotMatch(transactionalEmailLock, new RegExp(forbiddenPackage));
  }
});

test("Scaler profile email producer is platform-only and default signup stays isolated", () => {
  assert.equal(fs.existsSync(path.join(root, "functions-platform",
    "scaler_profile_notifications.js")), true);
  assert.equal(fs.existsSync(path.join(root, "functions-legacy",
    "scaler_profile_notifications.js")), false);
  assert.doesNotMatch(legacy, /scalerProfileCompletion|scaler-profile-completed/);
  assert.doesNotMatch(legacy, /initialSetupCompleted/);
  assert.match(platform, /scaler_profile_notifications/);
});

test("affiliate authority is platform-only and carries no provider secrets", () => {
  assert.equal(fs.existsSync(path.join(root, "functions-platform", "affiliate_program.js")), true);
  assert.equal(fs.existsSync(path.join(root, "functions-legacy", "affiliate_program.js")), false);
  for (const name of ["joinScalerAffiliateProgram", "getScalerAffiliateDashboard",
    "recordBusinessReferralAttribution", "adminSetScalerAffiliateRate",
    "adminGetScalerAffiliateOverview"]) {
    assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
    const start = platform.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    assert.doesNotMatch(platform.slice(start, start + 1200), /secrets\s*:/);
  }
});

test("provider secrets bind only to their reviewed intelligence functions", () => {
  assert.match(platform, /exports\.analyzePropertyIntelligence[\s\S]*?secrets:\s*\[CENSUS_API_KEY\]/);
  assert.match(platform, /exports\.analyzeScaleIntelligence[\s\S]*?secrets:\s*\[OPENAI_API_KEY\]/);
  const growthStart = platform.indexOf("exports.generateManagedGrowthArtifact");
  assert.match(platform.slice(growthStart, growthStart + 900), /secrets:\s*\[OPENAI_API_KEY\]/);
  for (const name of ["saveBusinessGrowthProfile", "suggestBusinessGrowthProfileFromWebsite",
    "evaluateOpportunityMatch"]) {
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
    ["default", "platform-core", "wallet-core", "artifact-email", "campaign-funding", "sales-core",
      "application-core"]
      .includes(item.codebase))) {
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
  assert.deepEqual(Object.keys(campaignFundingPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions", "stripe",
  ]);
  assert.deepEqual(Object.keys(salesPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
});

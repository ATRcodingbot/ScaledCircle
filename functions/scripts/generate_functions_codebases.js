"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const generator = require("@babel/generator").default;
const traverse = require("@babel/traverse").default;

const root = path.resolve(__dirname, "..", "..");
const sourceRoot = path.join(root, "functions");
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

const platformExports = new Set([
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
  "updateScalerProfile",
]);

const platformSecrets = new Set(["CENSUS_API_KEY", "OPENAI_API_KEY"]);
const walletExports = new Set(["ensureLegacyWalletProjection"]);
const artifactEmailExports = new Set(["sendArtifactDeliveryEmailJob"]);
const artifactEmailSecrets = new Set(["SUPPORT_EMAIL_SMTP_PASSWORD"]);
const jobAlertEmailExports = new Set(["sendScalerJobAlertEmailJob"]);
const jobAlertEmailSecrets = new Set(["SUPPORT_EMAIL_SMTP_PASSWORD"]);
const campaignFundingExports = new Set([
  "quoteCampaignFunding",
  "createCampaignFundingCheckoutSession",
  "cancelUnassignedFundedCampaign",
  "archiveCanceledCampaign",
  "publishFundedCampaign",
  "stripeWebhook",
]);
const assignmentExports = new Set([
  "assignScalerToZone",
  "configureZoneGroupAssignment",
  "acceptZoneGroupSlot",
]);
const discoveryExports = new Set([
  "saveDiscoveryPreferences",
  "analyzeCampaignZone",
  "getSmartZonePlan",
  "applySmartZonePlan",
]);
const jobRoomExports = new Set(["getJobRoom"]);
const transactionalEmailExports = new Set([
  "finalizePublicAccountSignup", "resendEmailVerification", "sendTransactionalEmailJob",
]);
const adminOpsExports = new Set([
  "getAdminOperationsOverview",
  "getAdminCampaignTimeline",
  "updateAdminSupportCaseStatus",
]);
const salesExports = new Set(["getSalesPipeline", "mutateSalesLead", "recordSalesActivity"]);
const legalExports = new Set(["recordLegalConsent", "getLegalConsentStatus"]);
const applicationExports = new Set(["applyToCampaign"]);
const migratedLegacyExports = new Set(["sendOutboundEmailJob"]);
// Retired production endpoints stay in the monolithic source only for audit
// history. No configured Firebase codebase may regenerate or deploy them.
const retiredProductionExports = new Set(["saveLegacyTrackingRoute", "fundCampaign"]);
const allSecretNames = new Set([
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD",
  "SUPPORT_EMAIL_SMTP_PASSWORD",
  "CENSUS_API_KEY",
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_THIN_WEBHOOK_SECRET",
  "STRIPE_STARTER_PRICE_ID",
  "STRIPE_GROWTH_PRICE_ID",
  "STRIPE_SCALE_PRICE_ID",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
]);

function exportedName(statement) {
  const expression = statement.type === "ExpressionStatement" && statement.expression;
  const left = expression?.type === "AssignmentExpression" && expression.left;
  if (left?.type !== "MemberExpression" || left.computed ||
      left.object?.type !== "Identifier" || left.object.name !== "exports" ||
      left.property?.type !== "Identifier") return null;
  return left.property.name;
}

function selectedProgram(ast, selectedExports) {
  const retained = new Set();
  const queued = [];
  let programPath;
  traverse(ast, {Program(path) { programPath = path; path.stop(); }});

  function retain(statementPath) {
    if (!statementPath || retained.has(statementPath.node)) return;
    retained.add(statementPath.node);
    queued.push(statementPath);
  }

  for (const statementPath of programPath.get("body")) {
    const name = exportedName(statementPath.node);
    if (name && selectedExports.has(name)) retain(statementPath);
    if (statementPath.isExpressionStatement()) {
      const callee = statementPath.node.expression?.callee;
      if (callee?.type === "Identifier" && ["initializeApp", "setGlobalOptions"].includes(callee.name)) {
        retain(statementPath);
      }
    }
  }

  while (queued.length) {
    const statementPath = queued.pop();
    statementPath.traverse({
      ReferencedIdentifier(identifierPath) {
        const binding = identifierPath.scope.getBinding(identifierPath.node.name);
        if (!binding || binding.scope.path !== programPath) return;
        retain(binding.path.getStatementParent());
      },
    });
  }

  ast.program.body = programPath.get("body")
    .filter((statementPath) => retained.has(statementPath.node))
    .map((statementPath) => statementPath.node);
  return ast;
}

function transformIndex(mode) {
  const source = fs.readFileSync(path.join(sourceRoot, "index.js"), "utf8");
  const ast = parser.parse(source, {sourceType: "script", plugins: ["optionalChaining"]});
  if (mode === "platform") selectedProgram(ast, platformExports);
  if (mode === "wallet") selectedProgram(ast, walletExports);
  if (mode === "artifact-email") selectedProgram(ast, artifactEmailExports);
  if (mode === "job-alert-email") selectedProgram(ast, jobAlertEmailExports);
  if (mode === "campaign-funding") selectedProgram(ast, campaignFundingExports);
  if (mode === "assignment") selectedProgram(ast, assignmentExports);
  if (mode === "discovery") selectedProgram(ast, discoveryExports);
  if (mode === "job-room") selectedProgram(ast, jobRoomExports);
  if (mode === "transactional-email") selectedProgram(ast, transactionalEmailExports);
  if (mode === "admin-ops") selectedProgram(ast, adminOpsExports);
  if (mode === "sales") selectedProgram(ast, salesExports);
  if (mode === "legal") selectedProgram(ast, legalExports);
  if (mode === "application") selectedProgram(ast, applicationExports);
  ast.program.body = ast.program.body.flatMap((statement) => {
    const name = exportedName(statement);
    const excludedFromLegacy = new Set([
      ...platformExports, ...walletExports, ...artifactEmailExports, ...jobAlertEmailExports,
      ...campaignFundingExports,
      ...assignmentExports,
      ...discoveryExports,
      ...jobRoomExports,
      ...transactionalEmailExports,
      ...adminOpsExports,
      ...salesExports,
      ...legalExports,
      ...applicationExports,
      ...migratedLegacyExports,
      ...retiredProductionExports,
    ]);
    if (name && (
      (mode === "platform" && !platformExports.has(name)) ||
      (mode === "wallet" && !walletExports.has(name)) ||
      (mode === "artifact-email" && !artifactEmailExports.has(name)) ||
      (mode === "job-alert-email" && !jobAlertEmailExports.has(name)) ||
      (mode === "campaign-funding" && !campaignFundingExports.has(name)) ||
      (mode === "assignment" && !assignmentExports.has(name)) ||
      (mode === "discovery" && !discoveryExports.has(name)) ||
      (mode === "job-room" && !jobRoomExports.has(name)) ||
      (mode === "transactional-email" && !transactionalEmailExports.has(name)) ||
      (mode === "admin-ops" && !adminOpsExports.has(name)) ||
      (mode === "sales" && !salesExports.has(name)) ||
      (mode === "legal" && !legalExports.has(name)) ||
      (mode === "application" && !applicationExports.has(name)) ||
      (mode === "legacy" && excludedFromLegacy.has(name))
    )) {
      return [];
    }
    if (statement.type !== "VariableDeclaration") return [statement];
    const declarations = statement.declarations.filter((declaration) => {
      const identifier = declaration.id?.type === "Identifier" ? declaration.id.name : null;
      if (mode === "legacy" && identifier === "transactionalEmail") return false;
      if (!identifier || !allSecretNames.has(identifier)) return true;
      if (mode === "platform") return platformSecrets.has(identifier);
      if (mode === "wallet") return false;
      if (mode === "artifact-email") return artifactEmailSecrets.has(identifier);
      if (mode === "job-alert-email") return jobAlertEmailSecrets.has(identifier);
      if (mode === "campaign-funding") return false;
      if (mode === "assignment") return false;
      if (mode === "discovery") return false;
      if (mode === "job-room") return false;
      if (mode === "transactional-email") return identifier === "SUPPORT_EMAIL_SMTP_PASSWORD";
      if (mode === "admin-ops") return false;
      if (mode === "sales") return false;
      if (mode === "legal") return false;
      if (mode === "application") return false;
      return !platformSecrets.has(identifier);
    });
    return declarations.length ? [{...statement, declarations}] : [];
  });
  return `${generator(ast, {
    comments: true,
    retainLines: mode !== "campaign-funding",
  }, source).code}\n`;
}

function resetDirectory(destination) {
  fs.mkdirSync(destination, {recursive: true});
  for (const entry of fs.readdirSync(destination)) {
    fs.rmSync(path.join(destination, entry), {recursive: true, force: true});
  }
}

function copyPackage(destination, mode) {
  for (const name of fs.readdirSync(sourceRoot)) {
    const source = path.join(sourceRoot, name);
    if (!fs.statSync(source).isFile()) continue;
    if (name.endsWith(".test.js")) continue;
    if (name === "index.js" || (!name.endsWith(".js") &&
        !["package.json", "package-lock.json"].includes(name))) continue;
    if (mode === "wallet" && name.endsWith(".js")) continue;
    if (mode === "legacy" && ["scaler_profile_notifications.js", "affiliate_program.js",
      "transactional_email.js"].includes(name)) continue;
    if (mode === "artifact-email" && name.endsWith(".js") &&
        name !== "managed_growth_delivery.js") continue;
    if (mode === "job-alert-email" && name.endsWith(".js") &&
        name !== "scaler_job_alert_email.js") continue;
    if (mode === "campaign-funding" && name.endsWith(".js") &&
        name !== "campaign_funding_quote.js") continue;
    if (mode === "assignment" && name.endsWith(".js") &&
        !["campaign_funding_quote.js", "marketplace_finance.js",
          "operational_layer.js", "group_assignment.js", "multi_scaler_rollout.js",
          "tracking_security.js", "legal_consent.js"].includes(name)) continue;
    if (mode === "discovery" && name.endsWith(".js") &&
        !["discovery_preferences.js", "service_area_geometry_codec.js",
          "marketplace_work_types.js", "scaler_profile_notifications.js",
          "signup_notifications.js", "operational_layer.js",
          "group_assignment.js", "smart_zone_planning.js"].includes(name)) continue;
    if (mode === "job-room" && name.endsWith(".js") &&
        !["marketplace_finance.js", "marketplace_operations.js", "operational_layer.js",
          "group_assignment.js", "campaign_funding_quote.js",
          "multi_scaler_rollout.js", "tracking_security.js"].includes(name)) continue;
    if (mode === "transactional-email" && name.endsWith(".js") &&
        name !== "transactional_email.js") continue;
    if (mode === "admin-ops" && name.endsWith(".js") &&
        !["admin_operations.js", "admin_ops_read_model.js"].includes(name)) continue;
    if (mode === "sales" && name.endsWith(".js") && name !== "sales_funnel.js") continue;
    if (mode === "legal" && name.endsWith(".js") && name !== "legal_consent.js") continue;
    if (mode === "application" && name.endsWith(".js") &&
        !["legal_consent.js", "tracking_security.js", "operational_layer.js"].includes(name)) continue;
    fs.copyFileSync(source, path.join(destination, name));
  }
}

function writePackageManifest(mode, destination) {
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const sourceLock = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package-lock.json"), "utf8"));
  const dependencyNames = mode === "platform"
    ? ["firebase-admin", "firebase-functions", "openai"]
    : mode === "wallet"
      ? ["firebase-admin", "firebase-functions"]
      : mode === "artifact-email"
        ? ["firebase-admin", "firebase-functions", "nodemailer"]
      : mode === "job-alert-email"
        ? ["firebase-admin", "firebase-functions", "nodemailer"]
      : mode === "campaign-funding"
        ? ["firebase-admin", "firebase-functions"]
      : mode === "assignment"
        ? ["firebase-admin", "firebase-functions"]
      : mode === "discovery"
        ? ["firebase-admin", "firebase-functions"]
      : mode === "job-room"
        ? ["firebase-admin", "firebase-functions"]
      : mode === "transactional-email"
        ? ["firebase-admin", "firebase-functions", "nodemailer"]
      : mode === "admin-ops"
        ? ["firebase-admin", "firebase-functions"]
      : mode === "sales"
        ? ["firebase-admin", "firebase-functions"]
      : mode === "legal"
        ? ["firebase-admin", "firebase-functions"]
      : mode === "application"
        ? ["firebase-admin", "firebase-functions"]
      : ["firebase-admin", "firebase-functions", "nodemailer", "stripe"];
  const dependencies = Object.fromEntries(dependencyNames.map((name) => [name, sourcePackage.dependencies[name]]));
  const generatedPackage = {
    name: `scaledcircle-functions-${mode}`,
    version: sourcePackage.version || "1.0.0",
    private: true,
    main: "index.js",
    engines: sourcePackage.engines,
    dependencies,
  };
  const generatedLock = {...sourceLock};
  generatedLock.name = generatedPackage.name;
  generatedLock.version = generatedPackage.version;
  generatedLock.packages = selectLockPackages(sourceLock.packages, dependencyNames);
  generatedLock.packages[""] = {
    name: generatedPackage.name,
    version: generatedPackage.version,
    dependencies,
    engines: generatedPackage.engines,
  };
  fs.writeFileSync(path.join(destination, "package.json"), `${JSON.stringify(generatedPackage, null, 2)}\n`);
  fs.writeFileSync(path.join(destination, "package-lock.json"), `${JSON.stringify(generatedLock, null, 2)}\n`);
}

function resolveLockedPackage(packages, fromPackagePath, dependencyName) {
  let searchPath = fromPackagePath;
  while (true) {
    const candidate = searchPath ?
      `${searchPath}/node_modules/${dependencyName}` : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    if (!searchPath) break;
    const marker = searchPath.lastIndexOf("/node_modules/");
    // A top-level package path is `node_modules/<name>` and therefore has no
    // `/node_modules/` delimiter. Its unresolved dependencies must still be
    // resolved from the lockfile root, just as Node/npm resolution does.
    searchPath = marker < 0 ? "" : searchPath.slice(0, marker);
  }
  return null;
}

function selectLockPackages(packages, dependencyNames) {
  const selected = {};
  const queued = dependencyNames.map((name) => ({from: "", name}));
  while (queued.length) {
    const {from, name} = queued.pop();
    const packagePath = resolveLockedPackage(packages, from, name);
    if (!packagePath || selected[packagePath]) continue;
    const locked = packages[packagePath];
    selected[packagePath] = locked;
    for (const dependencyName of new Set([
      ...Object.keys(locked.dependencies || {}),
      ...Object.keys(locked.optionalDependencies || {}),
      ...Object.keys(locked.peerDependencies || {}),
    ])) {
      queued.push({from: packagePath, name: dependencyName});
    }
  }
  return selected;
}

for (const [mode, destination] of [
  ["legacy", legacyRoot], ["platform", platformRoot], ["wallet", walletRoot],
  ["artifact-email", artifactEmailRoot],
  ["job-alert-email", jobAlertEmailRoot],
  ["campaign-funding", campaignFundingRoot],
  ["assignment", assignmentRoot],
  ["discovery", discoveryRoot],
  ["job-room", jobRoomRoot],
  ["transactional-email", transactionalEmailRoot],
  ["admin-ops", adminOpsRoot],
  ["sales", salesRoot],
  ["legal", legalRoot],
  ["application", applicationRoot],
]) {
  // Campaign funding is deliberately hand-maintained as a small, auditable
  // payment boundary. Never regenerate it from the subscription/payout-heavy
  // legacy monolith; the export set above still removes its four authorities
  // from the default deployment package.
  if (mode === "campaign-funding") continue;
  resetDirectory(destination);
  copyPackage(destination, mode);
  writePackageManifest(mode, destination);
  fs.writeFileSync(path.join(destination, "index.js"), transformIndex(mode));
  fs.writeFileSync(path.join(destination, "README.md"),
    "Deployment package generated from functions/index.js. Do not edit generated contents; run npm --prefix functions run generate:function-codebases.\n");
}

// Campaign funding is intentionally hand-maintained, but consumes the same
// canonical, secret-free consent contract as generated codebases.
fs.copyFileSync(path.join(sourceRoot, "legal_consent.js"),
  path.join(campaignFundingRoot, "legal_consent.js"));

console.log("Generated isolated legacy, platform-core, assignment-core, discovery-core, application-core, job-room-core, wallet-core, artifact-email, job-alert-email, campaign-funding, transactional-email, admin-ops-core, sales-core, and legal-core Functions packages.");

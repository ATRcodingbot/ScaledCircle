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
  "saveDiscoveryPreferences",
  "getMarketplaceWorkTypes",
  "getPendingScalerPreferences",
  "savePendingScalerPreferences",
  "resolveServiceAreaPlace",
  "evaluateOpportunityMatch",
]);

const platformSecrets = new Set(["CENSUS_API_KEY", "OPENAI_API_KEY"]);
const walletExports = new Set(["ensureLegacyWalletProjection"]);
const artifactEmailExports = new Set(["sendArtifactDeliveryEmailJob"]);
const artifactEmailSecrets = new Set(["SUPPORT_EMAIL_SMTP_PASSWORD"]);
const jobAlertEmailExports = new Set(["sendScalerJobAlertEmailJob"]);
const jobAlertEmailSecrets = new Set(["SUPPORT_EMAIL_SMTP_PASSWORD"]);
const campaignFundingExports = new Set(["quoteCampaignFunding"]);
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
  ast.program.body = ast.program.body.flatMap((statement) => {
    const name = exportedName(statement);
    const excludedFromLegacy = new Set([
      ...platformExports, ...walletExports, ...artifactEmailExports, ...jobAlertEmailExports,
      ...campaignFundingExports,
    ]);
    if (name && (
      (mode === "platform" && !platformExports.has(name)) ||
      (mode === "wallet" && !walletExports.has(name)) ||
      (mode === "artifact-email" && !artifactEmailExports.has(name)) ||
      (mode === "job-alert-email" && !jobAlertEmailExports.has(name)) ||
      (mode === "campaign-funding" && !campaignFundingExports.has(name)) ||
      (mode === "legacy" && excludedFromLegacy.has(name))
    )) {
      return [];
    }
    if (statement.type !== "VariableDeclaration") return [statement];
    const declarations = statement.declarations.filter((declaration) => {
      const identifier = declaration.id?.type === "Identifier" ? declaration.id.name : null;
      if (!identifier || !allSecretNames.has(identifier)) return true;
      if (mode === "platform") return platformSecrets.has(identifier);
      if (mode === "wallet") return false;
      if (mode === "artifact-email") return artifactEmailSecrets.has(identifier);
      if (mode === "job-alert-email") return jobAlertEmailSecrets.has(identifier);
      if (mode === "campaign-funding") return false;
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
  fs.rmSync(destination, {recursive: true, force: true});
  fs.mkdirSync(destination, {recursive: true});
}

function copyPackage(destination, mode) {
  for (const name of fs.readdirSync(sourceRoot)) {
    const source = path.join(sourceRoot, name);
    if (!fs.statSync(source).isFile()) continue;
    if (name.endsWith(".test.js")) continue;
    if (name === "index.js" || (!name.endsWith(".js") &&
        !["package.json", "package-lock.json"].includes(name))) continue;
    if (mode === "wallet" && name.endsWith(".js")) continue;
    if (mode === "legacy" && name === "scaler_profile_notifications.js") continue;
    if (mode === "artifact-email" && name.endsWith(".js") &&
        name !== "managed_growth_delivery.js") continue;
    if (mode === "job-alert-email" && name.endsWith(".js") &&
        name !== "scaler_job_alert_email.js") continue;
    if (mode === "campaign-funding" && name.endsWith(".js") &&
        name !== "campaign_funding_quote.js") continue;
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
  generatedLock.packages = {...sourceLock.packages};
  generatedLock.packages[""] = {
    name: generatedPackage.name,
    version: generatedPackage.version,
    dependencies,
    engines: generatedPackage.engines,
  };
  fs.writeFileSync(path.join(destination, "package.json"), `${JSON.stringify(generatedPackage, null, 2)}\n`);
  fs.writeFileSync(path.join(destination, "package-lock.json"), `${JSON.stringify(generatedLock, null, 2)}\n`);
}

for (const [mode, destination] of [
  ["legacy", legacyRoot], ["platform", platformRoot], ["wallet", walletRoot],
  ["artifact-email", artifactEmailRoot],
  ["job-alert-email", jobAlertEmailRoot],
  ["campaign-funding", campaignFundingRoot],
]) {
  resetDirectory(destination);
  copyPackage(destination, mode);
  writePackageManifest(mode, destination);
  fs.writeFileSync(path.join(destination, "index.js"), transformIndex(mode));
  fs.writeFileSync(path.join(destination, "README.md"),
    "Deployment package generated from functions/index.js. Do not edit generated contents; run npm --prefix functions run generate:function-codebases.\n");
}

console.log("Generated isolated legacy, platform-core, wallet-core, artifact-email, job-alert-email, and campaign-funding Functions packages.");

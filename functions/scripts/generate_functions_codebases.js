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

const platformExports = new Set([
  "analyzePropertyIntelligence",
  "analyzeScaleIntelligence",
  "notifyOnCampaignApplicationCreated",
  "notifyOnCampaignApplicationUpdated",
  "notifyOnCampaignZoneUpdated",
  "sendJobMessage",
  "updateCampaignMaterialLogistics",
  "proposeMaterialLogisticsChange",
  "respondToMaterialLogisticsChange",
  "configureJobCoordination",
  "acknowledgeJobReadiness",
  "transitionMaterialHandoff",
]);

const platformSecrets = new Set(["CENSUS_API_KEY", "OPENAI_API_KEY"]);
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

function platformProgram(ast) {
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
    if (name && platformExports.has(name)) retain(statementPath);
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
  if (mode === "platform") platformProgram(ast);
  ast.program.body = ast.program.body.flatMap((statement) => {
    const name = exportedName(statement);
    if (name && (mode === "platform" ? !platformExports.has(name) : platformExports.has(name))) {
      return [];
    }
    if (statement.type !== "VariableDeclaration") return [statement];
    const declarations = statement.declarations.filter((declaration) => {
      const identifier = declaration.id?.type === "Identifier" ? declaration.id.name : null;
      if (!identifier || !allSecretNames.has(identifier)) return true;
      return mode === "platform" ? platformSecrets.has(identifier) : !platformSecrets.has(identifier);
    });
    return declarations.length ? [{...statement, declarations}] : [];
  });
  return `${generator(ast, {comments: true, retainLines: true}, source).code}\n`;
}

function resetDirectory(destination) {
  fs.rmSync(destination, {recursive: true, force: true});
  fs.mkdirSync(destination, {recursive: true});
}

function copyPackage(destination) {
  for (const name of fs.readdirSync(sourceRoot)) {
    const source = path.join(sourceRoot, name);
    if (!fs.statSync(source).isFile()) continue;
    if (name.endsWith(".test.js")) continue;
    if (name === "index.js" || (!name.endsWith(".js") &&
        !["package.json", "package-lock.json"].includes(name))) continue;
    fs.copyFileSync(source, path.join(destination, name));
  }
}

function writePackageManifest(mode, destination) {
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const sourceLock = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package-lock.json"), "utf8"));
  const dependencyNames = mode === "platform"
    ? ["firebase-admin", "firebase-functions", "openai"]
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

for (const [mode, destination] of [["legacy", legacyRoot], ["platform", platformRoot]]) {
  resetDirectory(destination);
  copyPackage(destination);
  writePackageManifest(mode, destination);
  fs.writeFileSync(path.join(destination, "index.js"), transformIndex(mode));
  fs.writeFileSync(path.join(destination, "README.md"),
    "Deployment package generated from functions/index.js. Do not edit generated contents; run npm --prefix functions run generate:function-codebases.\n");
}

console.log("Generated isolated legacy and platform-core Functions packages.");

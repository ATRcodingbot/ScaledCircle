"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const platformRoot = path.join(root, "functions-platform");
const legacyRoot = path.join(root, "functions-legacy");
const expectedExports = [
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

const platform = require(path.join(platformRoot, "index.js"));
assert.deepEqual(Object.keys(platform).sort(), [...expectedExports].sort());
console.log("Verified generated dependencies and 12 exact platform-core exports.");

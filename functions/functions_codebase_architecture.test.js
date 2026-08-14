"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const platform = fs.readFileSync(path.join(root, "functions-platform", "index.js"), "utf8");
const legacy = fs.readFileSync(path.join(root, "functions-legacy", "index.js"), "utf8");
const expected = [
  "analyzePropertyIntelligence", "analyzeScaleIntelligence",
  "notifyOnCampaignApplicationCreated", "notifyOnCampaignApplicationUpdated",
  "notifyOnCampaignZoneUpdated", "sendJobMessage", "updateCampaignMaterialLogistics",
  "proposeMaterialLogisticsChange", "respondToMaterialLogisticsChange",
  "configureJobCoordination", "acknowledgeJobReadiness", "transitionMaterialHandoff",
];

function exportsIn(source) {
  return [...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
}

test("platform-core has the exact reviewed public exports", () => {
  assert.deepEqual([...new Set(exportsIn(platform))].sort(), [...expected].sort());
  for (const name of expected) assert.doesNotMatch(legacy, new RegExp(`exports\\.${name}\\s*=`));
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

test("provider secrets bind only to their intelligence functions", () => {
  assert.match(platform, /exports\.analyzePropertyIntelligence[\s\S]*?secrets:\s*\[CENSUS_API_KEY\]/);
  assert.match(platform, /exports\.analyzeScaleIntelligence[\s\S]*?secrets:\s*\[OPENAI_API_KEY\]/);
  const operational = platform.slice(platform.indexOf("exports.notifyOnCampaignApplicationCreated"));
  assert.doesNotMatch(operational, /secrets:\s*\[(?:CENSUS_API_KEY|OPENAI_API_KEY)\]/);
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

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

for (const collection of ["socialContentPlans", "socialContentItems", "socialContentVersions",
  "socialProviderReceipts", "socialPerformanceSnapshots", "socialLearningSignals",
  "socialContentQualityAssessments", "socialPostCapabilitySnapshots",
  "socialPastPostRatings", "socialContentReplacementProposals",
  "managedGrowthPlans", "emailContentPlans", "adConnections", "adAccounts",
  "adCampaignSnapshots", "adAccountHealth", "socialOAuthAttempts", "socialProviderConfigs"]) {
  test(`${collection} is server-only`, () => {
    const pattern = new RegExp(`match /${collection}/\\{document=\\*\\*\\} \\{[\\s\\S]*?` +
      "allow read, write: if false;[\\s\\S]*?\\}");
    assert.match(rules, pattern);
  });
}

for (const collection of ["agentProfiles", "agentPlaybooks", "agentPermissions",
  "agentRuns", "agentActions", "agentActionVersions", "agentApprovals",
  "agentEscalations", "agentObservations", "agentRecommendations",
  "agentProviderReceipts", "agentBudgets", "agentHealth"]) {
  test(`${collection} is server-only`, () => {
    const pattern = new RegExp(`match /${collection}/\\{document=\\*\\*\\} \\{[\\s\\S]*?` +
      "allow read, write: if false;[\\s\\S]*?\\}");
    assert.match(rules, pattern);
  });
}

test("social credential values remain denied", () => {
  assert.match(rules, /match \/socialConnectionCredentials\/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
});

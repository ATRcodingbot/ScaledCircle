"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("completion and exact-location collections are client read-only", () => {
  const rules = read("firestore.rules");
  const locations = rules.match(/match \/campaignLocations\/\{locationId\}[\s\S]*?\n    }/)?.[0] || "";
  const completions = rules.match(/match \/campaignCompletions\/\{completionId\}[\s\S]*?\n    }/)?.[0] || "";
  assert.match(locations, /allow create, update, delete: if false/);
  assert.match(locations, /resource\.data\.assignedScalerId == request\.auth\.uid/);
  assert.match(locations, /campaigns\/\$\(resource\.data\.campaignId\)/);
  assert.match(completions, /allow create: if false/);
  assert.match(completions, /allow update, delete: if false/);
  assert.match(completions, /\|\| isAdmin\(\)/);
});

test("maintained exact-location and completion callables are exported", () => {
  const backend = read("functions/index.js");
  for (const name of [
    "createCampaignLocation", "deleteCampaignLocation",
    "assignScalerToCampaignLocations", "rejectCampaignApplication",
    "initializeCampaignCompletion",
    "startCampaignCompletion", "appendCampaignCompletionEvidence",
    "submitCampaignCompletion", "reviewCampaignCompletion",
  ]) assert.match(backend, new RegExp(`exports\\.${name} = completionAuthorityCallable`));
  const submit = backend.match(/exports\.submitZoneCompletion[\s\S]*?exports\.approveZonePayout/)?.[0] || "";
  assert.doesNotMatch(submit, /payoutReference/);
  assert.match(submit, /compensationContractId/);
});

test("migrated Flutter paths do not directly mutate completion or location authority", () => {
  const service = read("apps/mobile/lib/services/campaign/campaign_service.dart");
  const submission = read("apps/mobile/lib/services/campaign/completion_submission_service.dart");
  const exactJob = read("apps/mobile/lib/screens/scaler/campaigns/exact_location_job_screen.dart");
  const applicants = read("apps/mobile/lib/screens/campaigns/campaign_applicants_screen.dart");
  const legacyService = read("apps/mobile/lib/services/campaign_service.dart");
  for (const callable of [
    "createCampaignLocation", "deleteCampaignLocation",
    "initializeCampaignCompletion", "appendCampaignCompletionEvidence",
    "submitCampaignCompletion", "reviewCampaignCompletion",
  ]) assert.match(`${service}\n${submission}`, new RegExp(callable));
  assert.doesNotMatch(exactJob, /collection\('campaignLocations'\)\.doc\([^)]*\)\.update/);
  assert.doesNotMatch(exactJob, /collection\('campaignCompletions'\)[\s\S]{0,120}\.update\(/);
  assert.match(applicants, /assignScalerToCampaignLocations/);
  assert.match(applicants, /rejectCampaignApplication/);
  assert.doesNotMatch(applicants, /transaction\.update\(location\.reference/);
  assert.doesNotMatch(applicants, /batch\.update\(application\.reference/);
  assert.match(legacyService, /Choose a zone or exact locations/);
  assert.match(legacyService, /Completion must be submitted and reviewed through the Job Room/);
});

test("application and assignment contract records are server-write-only", () => {
  const rules = read("firestore.rules");
  const applications = rules.match(/match \/applications\/\{scalerId\}[\s\S]*?\n      }/)?.[0] || "";
  const assignments = rules.match(/match \/assignedScalers\/\{scalerId\}[\s\S]*?\n      }/)?.[0] || "";
  assert.match(applications, /allow update, delete:[\s\S]*?if false/);
  assert.match(assignments, /allow create, update, delete:[\s\S]*?if false/);
});

test("exact-location approval fails closed instead of inventing earnings", () => {
  const backend = read("functions/index.js");
  const review = backend.match(
    /exports\.reviewCampaignCompletion[\s\S]*?exports\.submitZoneCompletion/,
  )?.[0] || "";
  assert.match(review, /authoritative assignment compensation contract/);
  assert.doesNotMatch(review, /wallets|walletTransactions|scalerTransfers/);
});

test("Business approval records an earning without executing a provider transfer", () => {
  const backend = read("functions/index.js");
  const service = read("apps/mobile/lib/services/completion_payout_service.dart");
  const review = backend.match(/exports\.finalizeZoneReview[\s\S]*?exports\.requestCampaignCancellationRefund/)?.[0] || "";
  assert.match(review, /walletTransactions/);
  assert.match(review, /earning_\$\{zoneId\}_v1/);
  assert.match(review, /externalExecutionAuthorized: false/);
  assert.match(review, /transaction\.create\(transferRef/);
  assert.doesNotMatch(service, /functionName: 'createScalerTransfer'/);
  assert.match(service, /Provider transfer and[\s\S]*bank cash-out are deliberately separate/);
});

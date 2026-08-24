"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const canonical = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
const funding = fs.readFileSync(path.join(root, "functions-campaign-funding", "index.js"), "utf8");
const clientCampaignService = fs.readFileSync(path.join(
  root, "apps", "mobile", "lib", "services", "campaign_service.dart"), "utf8");

function callable(name, source = canonical) {
  const start = source.indexOf(`exports.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf("\nexports.", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

test("funding checks current Business consent before any Stripe authority", () => {
  const body = callable("createCampaignFundingCheckoutSession", funding);
  assert.ok(body.indexOf("requireBusinessFundingConsent") < body.indexOf("stripeClient()"));
  assert.ok(body.indexOf("requireBusinessFundingConsent") < body.indexOf("paymentRef"));
  assert.match(funding, /reason:\s*"LEGAL_CONSENT_REQUIRED"/);
});

test("application is callable-only and requires current Scaler work agreements", () => {
  const body = callable("applyToCampaign");
  assert.match(body, /ROLE_REQUIREMENTS\.scaler_work/);
  assert.match(clientCampaignService, /httpsCallable\('applyToCampaign'\)/);
  const clientMethod = clientCampaignService.slice(
    clientCampaignService.indexOf("Future<void> applyToCampaign"),
    clientCampaignService.indexOf("// CAMPAIGN APPLICATIONS"),
  );
  assert.doesNotMatch(clientMethod, /\.set\(|batch\./);
});

test("new assignment obligations check the affected Scaler agreement", () => {
  assert.match(callable("assignScalerToZone"),
    /requireCurrentLegalConsents\([\s\S]*scalerId[\s\S]*ROLE_REQUIREMENTS\.scaler_work/);
  assert.match(callable("acceptZoneGroupSlot"),
    /existingParticipant\.exists[\s\S]*requireCurrentLegalConsents\([\s\S]*scalerUid/);
  assert.doesNotMatch(callable("configureZoneGroupAssignment"),
    /requireCurrentLegalConsents/);
});

test("new tracking creation requires location notice after existing-session recovery", () => {
  const body = callable("startTrackingSession");
  const existingRecovery = body.indexOf("pointerSnapshot.exists");
  const pausedRecovery = body.indexOf("resumeRequested");
  const consent = body.indexOf("trackingConsentStatus.missing.length");
  const create = body.indexOf("transaction.create(sessionRef");
  assert.match(body, /ROLE_REQUIREMENTS\.scaler_tracking/);
  assert.ok(existingRecovery >= 0 && pausedRecovery > existingRecovery);
  assert.ok(consent > pausedRecovery && consent < create);
});

test("legal consent failures use the machine-readable contract", () => {
  assert.match(canonical, /reason:\s*"LEGAL_CONSENT_REQUIRED"/);
  assert.match(canonical, /missing:\s*Array\.isArray\(error\.missing\)/);
});

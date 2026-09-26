"use strict";
const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) assert.match(process.env[key] || "", /^(127\.0\.0\.1|localhost):\d+$/);
process.env.GCLOUD_PROJECT = "demo-scaledcircle";
process.env.GOOGLE_CLOUD_PROJECT = "demo-scaledcircle";
const functions = require("./index");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {getApps} = require("firebase-admin/app");
const db = getFirestore();
const legal = require("./legal_consent");
const campaignId = "own_team_authority", zoneId = "own_team_zone", completionId = "own_team_completion";
const owner = "own_team_owner", scaler = "own_team_scaler", admin = "own_team_admin";
const call = (name, data, uid = owner) => functions[name].run({data, auth: {uid, token: {email_verified: true}}});
before(async () => {
  for (const [uid, role] of [[owner, "business"], [scaler, "scaler"], [admin, "admin"]]) {
    await getAuth().createUser({uid, email: `${uid}@example.test`, emailVerified: true}).catch(error => {if (error.code !== "auth/uid-already-exists") throw error;});
    await db.doc(`users/${uid}`).set({role, active: true});
    for (const [type, version] of Object.entries(legal.AGREEMENTS)) await db.doc(`legalConsents/${uid}_${type}_${version}`).set({uid, agreementType: type, agreementVersion: version});
  }
  await db.doc(`campaigns/${campaignId}`).set({businessId: owner, executionMode: "own_team", status: "open", fundingStatus: "funded", basePay: 50, workerBudget: 50});
  await db.doc(`campaignZones/${zoneId}`).set({businessId: owner, campaignId, assignedScalerId: scaler, status: "assigned", reviewStatus: "verification_pending"});
  await db.doc(`campaigns/${campaignId}/applications/${scaler}`).set({scalerId: scaler, campaignId, businessId: owner, status: "pending"});
  await db.doc(`campaignLocations/own_location`).set({businessId: owner, campaignId, assignedScalerId: scaler, status: "assigned"});
  await db.doc(`campaignCompletions/${completionId}`).set({businessId: owner, campaignId, scalerId: scaler, zoneId, routeId: "own_route", status: "in_progress"});
  await db.doc("campaignRoutes/own_route").set({campaignId, zoneId, scalerId: scaler});
  await db.doc(`assignmentCompensations/${zoneId}`).set({campaignId, zoneId, scalerId: scaler, baseAmountCents: 5000});
  await db.doc(`zoneGroupAssignments/${zoneId}`).set({campaignId, zoneId, businessId: owner});
  await db.doc("payouts/own_payout").set({campaignId, zoneId, businessId: owner, scalerId: scaler, status: "pending_review", totalPayout: 50});
  await db.doc(`wallets/${owner}`).set({availableCredits: 500, reservedCredits: 500, subscriptionStatus: "active", subscriptionExpiresAt: Timestamp.fromMillis(Date.now() + 86400000)});
});
after(async () => { await Promise.all(getApps().map(app => app.delete())); });

const cases = [
  ["fundCampaign", {campaignId}],
  ["quoteCampaignFunding", {campaignId, workerAmountCents: 5000}],
  ["publishFundedCampaign", {campaignId}],
  ["createCampaignFundingCheckoutSession", {campaignId}],
  ["applyToCampaign", {campaignId}, scaler],
  ["assignScalerToZone", {campaignId, zoneId, applicationId: scaler}],
  ["assignScalerToCampaignLocations", {campaignId, applicationId: scaler, locationIds: ["own_location"]}],
  ["configureZoneGroupAssignment", {campaignId, zoneId, requiredScalerCount: 1}],
  ["acceptZoneGroupSlot", {campaignId, zoneId, applicationId: scaler}, scaler],
  ["startAssignedZone", {campaignId, zoneId}, scaler],
  ["startTrackingSession", {campaignId, zoneId}, scaler],
  ["initializeCampaignCompletion", {campaignId}, scaler],
  ["startCampaignCompletion", {completionId}, scaler],
  ["appendCampaignCompletionEvidence", {completionId, proof: {id: "proof", type: "manual_note", note: "untrusted"}}, scaler],
  ["submitCampaignCompletion", {completionId}, scaler],
  ["submitZoneCompletion", {completionId}, scaler],
  ["reviewCampaignCompletion", {completionId, decision: "approve"}],
  ["finalizeZoneReview", {zoneId, decision: "approve"}],
  ["approveZonePayout", {payoutId: "own_payout"}],
  ["settleZoneGroupAssignment", {zoneId}],
  ["createScalerTransfer", {zoneId}],
  ["getCampaignDiscovery", {campaignId}, scaler],
];
for (const [name, data, uid] of cases) test(`${name} rejects own-team despite forged marketplace state before economic writes`, async () => {
  await assert.rejects(call(name, data, uid), error => error.code === "failed-precondition" &&
    (error.details?.reason === "MARKETPLACE_EXECUTION_REQUIRED" || (name === "approveZonePayout" && /retired/.test(error.message))));
});
test("failed own-team entry calls produce no financial, Scaler, tracking, or public authority", async () => {
  for (const collection of ["campaignPayments", "financialOperations", "walletTransactions", "scalerTransfers", "scalerEarnings", "trackingSessions", "campaignDiscovery"]) {
    assert.equal((await db.collection(collection).where("campaignId", "==", campaignId).get()).size, 0, collection);
  }
  assert.equal((await db.doc(`wallets/${owner}`).get()).data().availableCredits, 500);
  assert.equal((await db.doc(`campaignCompletions/${completionId}`).get()).data().status, "in_progress");
});
test("own-team Smart Zones reaches geographic planning with no membership; marketplace keeps its membership gate", async () => {
  const geography = require("./smart_zone_geography");
  const original = geography.fetchSnapshot;
  let called = 0;
  geography.fetchSnapshot = async () => { called++; throw Error("synthetic_geography_unavailable"); };
  try {
    await db.doc(`campaigns/${campaignId}`).set({businessId: owner, executionMode: "own_team", status: "draft", serviceArea: [{latitude: 39, longitude: -76}, {latitude: 39.001, longitude: -76}, {latitude: 39.001, longitude: -75.999}]});
    await assert.rejects(call("getSmartZonePlan", {campaignId}), error => error.code === "unavailable");
    assert.equal(called, 1);
    await db.doc(`campaigns/${campaignId}`).update({executionMode: "marketplace"});
    await assert.rejects(call("getSmartZonePlan", {campaignId}), error => error.code === "failed-precondition" && /membership/.test(error.message));
    assert.equal(called, 1);
  } finally { geography.fetchSnapshot = original; }
});


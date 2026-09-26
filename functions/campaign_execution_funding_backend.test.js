"use strict";
const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) assert.match(process.env[key] || "", /^(127\.0\.0\.1|localhost):\d+$/);
process.env.GCLOUD_PROJECT = "demo-scaledcircle";
process.env.GOOGLE_CLOUD_PROJECT = "demo-scaledcircle";
process.env.APP_ENV = "local";
const localRequire = createRequire(require.resolve("../functions-campaign-funding/index.js"));
const functions = localRequire("./index.js");
const db = localRequire("firebase-admin/firestore").getFirestore();
const auth = localRequire("firebase-admin/auth").getAuth();
const authority = require("./campaign_execution_authority");
const owner = "mode_funding_owner";
const geometry = [{latitude: 39, longitude: -76}, {latitude: 39.001, longitude: -76}, {latitude: 39.001, longitude: -75.999}];
const call = (name, id) => functions[name].run({data: {campaignId: id}, auth: {uid: owner, token: {email_verified: true}}});
before(async () => {
  await auth.createUser({uid: owner, email: `${owner}@example.test`, emailVerified: true}).catch(error => {if (error.code !== "auth/uid-already-exists") throw error;});
  await db.doc(`users/${owner}`).set({role: "business", active: true});
});
after(async () => { await Promise.all(localRequire("firebase-admin/app").getApps().map(app => app.delete())); });
async function seed(id, fields = {}) {
  const zone = {id, businessId: owner, campaignId: id, serviceArea: geometry, serviceAreaPointCount: 3, mapped: true, analysisStatus: "complete", estimatedHomes: 20, serverEstimatedWalkingMinutes: 12, serverZoneMetricsVersion: "geometry_v1_server", serverZoneGeometryDigest: require("./operational_layer").zoneGeometryDigest(geometry)};
  const campaign = {businessId: owner, campaignName: "Mode fixture", status: "draft", basePay: 50, serviceArea: geometry, ...fields};
  if (campaign.planningStage === "review") campaign.materialsAreaDigest = authority.planningDigest(campaign, [zone]);
  await db.doc(`campaigns/${id}`).set(campaign);
  await db.doc(`campaignZones/${id}`).set(zone);
  return {campaign, zone};
}
test("maintained funding exports reject own-team before Stripe/payment creation, including fake funded/open state", async () => {
  for (const status of ["draft", "own_team_scheduled", "open"]) {
    const id = `mode_funding_own_${status}`;
    await seed(id, {executionMode: "own_team", status, fundingStatus: "funded", fundingPaymentId: "forged"});
    for (const name of ["quoteCampaignFunding", "createCampaignFundingCheckoutSession", "publishFundedCampaign"]) {
      await assert.rejects(call(name, id), error => error.code === "failed-precondition" && error.details?.reason === "MARKETPLACE_EXECUTION_REQUIRED");
    }
    assert.equal((await db.collection("campaignPayments").where("campaignId", "==", id).get()).size, 0);
    assert.equal((await db.doc(`campaigns/${id}`).get()).data().status, status);
  }
});
test("legacy and explicit marketplace quote retain identical economics", async () => {
  await seed("mode_funding_legacy");
  await seed("mode_funding_market", {executionMode: "marketplace"});
  assert.deepEqual(await call("quoteCampaignFunding", "mode_funding_legacy"), await call("quoteCampaignFunding", "mode_funding_market"));
});
test("new marketplace planning requires reviewed current area before quote, preserving legacy compatibility", async () => {
  const id = "mode_funding_review";
  await seed(id, {executionMode: "marketplace", planningSchemaVersion: 1, planningStage: "materials"});
  await assert.rejects(call("quoteCampaignFunding", id), error => error.details?.reason === "CURRENT_AREA_MATERIAL_REVIEW_REQUIRED");
  await seed(id, {executionMode: "marketplace", planningSchemaVersion: 1, planningStage: "review"});
  assert.equal((await call("quoteCampaignFunding", id)).workerCompensationCents, 5000);
  await db.doc(`campaignZones/${id}`).update({serviceArea: geometry.map(point => ({...point, latitude: point.latitude + 0.001}))});
  await assert.rejects(call("quoteCampaignFunding", id), error => error.details?.reason === "CURRENT_AREA_MATERIAL_REVIEW_REQUIRED");
});

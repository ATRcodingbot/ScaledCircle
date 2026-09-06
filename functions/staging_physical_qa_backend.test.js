"use strict";
const assert = require("node:assert/strict");
const {before, after, test} = require("node:test");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Local emulator required");
process.env.GCLOUD_PROJECT = "demo-scaledcircle";
const fft = require("firebase-functions-test")({projectId: "demo-scaledcircle"});
const functions = require("./index");
const {getFirestore} = require("firebase-admin/firestore");
const {getApps} = require("firebase-admin/app");
const qa = require("./staging_physical_qa");
const legal = require("./legal_consent");
const db = getFirestore();
const call = (name, uid, data) => fft.wrap(functions[name])({data,
  auth: {uid, token: {email_verified: true, email: `${uid}@example.invalid`}}});
before(async () => {
  process.env.GCLOUD_PROJECT = "scaledcircle-staging";
  for (const [id, role] of [["business", "business"], ["scaler", "scaler"], ["other", "scaler"]]) {
    await db.doc(`users/${id}`).set({role, active: true});
  }
  await db.doc(qa.AUTHORITY_PATH).set({projectId: "scaledcircle-staging", immutable: true,
    certificationFixture: true, campaignId: qa.CAMPAIGN_ID, zoneId: qa.ZONE_ID,
    businessUid: "business", scalerUid: "scaler"});
  await db.doc(`campaigns/${qa.CAMPAIGN_ID}`).set({businessId: "business", status: "open"});
});
after(async () => { fft.cleanup(); await Promise.all(getApps().map((a) => a.delete())); });
test("QA application keeps consent gate, creates once, and rejects unrelated Scaler", async () => {
  const data = {campaignId: qa.CAMPAIGN_ID};
  await assert.rejects(call("applyToCampaign", "scaler", data), (e) => e.code === "failed-precondition");
  for (const type of legal.ROLE_REQUIREMENTS.scaler_work) {
    const version = legal.AGREEMENTS[type];
    await db.doc(`legalConsents/scaler_${type}_${version}`).set({uid: "scaler",
      agreementType: type, agreementVersion: version});
  }
  await Promise.all([call("applyToCampaign", "scaler", data), call("applyToCampaign", "scaler", data)]);
  assert.equal((await db.collection(`campaigns/${qa.CAMPAIGN_ID}/applications`).get()).size, 1);
  await assert.rejects(call("applyToCampaign", "other", data), (e) => e.code === "permission-denied");
  await assert.rejects(call("assignScalerToZone", "business", {...data, zoneId: qa.ZONE_ID,
    applicationId: "other"}), (e) => e.code === "permission-denied");
  process.env.GCLOUD_PROJECT = "scaled-circle";
  await assert.rejects(call("applyToCampaign", "scaler", data), (e) => e.code === "permission-denied");
  process.env.GCLOUD_PROJECT = "scaledcircle-staging";
  assert.equal((await db.collection("walletTransactions").get()).size, 0);
});


test("QA assignment uses the real compensation and tracking authority", async () => {
  const operations = require("./operational_layer");
  const serviceArea = [{latitude: 39, longitude: -76}, {latitude: 39.001, longitude: -76},
    {latitude: 39.001, longitude: -76.001}, {latitude: 39, longitude: -76.001}];
  const estimate = operations.calculateGeometryWalkingEstimate(serviceArea);
  await db.doc(`campaigns/${qa.CAMPAIGN_ID}`).update({basePay: 10, bonus: 0,
    timeZone: "UTC", workWindowStart: "00:00", workWindowEnd: "23:59"});
  await db.doc(`campaignZones/${qa.ZONE_ID}`).set({campaignId: qa.CAMPAIGN_ID,
    businessId: "business", status: "unassigned", assignedScalerId: null,
    serviceArea, serviceAreaPointCount: 4, estimatedHomes: 1,
    analysisStatus: "complete", serverZoneMetricsVersion: "geometry_v1_server",
    serverZoneGeometryDigest: operations.zoneGeometryDigest(serviceArea),
    serverEstimatedWalkingMinutes: estimate.estimatedWalkingMinutes});
  await call("assignScalerToZone", "business", {campaignId: qa.CAMPAIGN_ID,
    zoneId: qa.ZONE_ID, applicationId: "scaler"});
  const contract = (await db.doc(`assignmentCompensations/${qa.ZONE_ID}`).get()).data();
  assert.equal(contract.scalerId, "scaler");
  assert.equal(contract.immutable, true);
  assert.equal(contract.baseAmountCents, 1000);
  const notifications = await db.collection("notifications").get();
  assert.ok(notifications.docs.every((d) => ["business", "scaler"].includes(d.data().userId)));
  await db.doc(`legalConsents/scaler_location_notice_${legal.AGREEMENTS.location_notice}`).set({
    uid: "scaler", agreementType: "location_notice", agreementVersion: legal.AGREEMENTS.location_notice});
  const session = await call("startTrackingSession", "scaler", {
    campaignId: qa.CAMPAIGN_ID, zoneId: qa.ZONE_ID});
  assert.ok(session.sessionId);
  await assert.rejects(call("startTrackingSession", "other", {
    campaignId: qa.CAMPAIGN_ID, zoneId: qa.ZONE_ID}), (e) => e.code === "permission-denied");
  assert.equal((await db.collection("assignmentCompensations").get()).size, 1);
  assert.equal((await db.collection("walletTransactions").get()).size, 0);
});

test('second QA fixture denies both cross-application directions before writes',async()=>{
 const android=qa.FIXTURES[1];
 await db.doc('users/android').set({role:'scaler',active:true});
 await db.doc(qa.authorityPath(android.campaignId)).set({projectId:'scaledcircle-staging',immutable:true,certificationFixture:true,...android,businessUid:'business',scalerUid:'android'});
 await db.doc(`campaigns/${android.campaignId}`).set({businessId:'business',status:'open'});
 for(const [uid,campaignId]of [['scaler',android.campaignId],['android',qa.CAMPAIGN_ID],['other',android.campaignId]]){
  await assert.rejects(call('applyToCampaign',uid,{campaignId}),e=>e.code==='permission-denied');
  assert.equal((await db.doc(`campaigns/${campaignId}/applications/${uid}`).get()).exists,false);
 }
});

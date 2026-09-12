"use strict";
const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {createRequire} = require("node:module");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Local emulator required");
process.env.GCLOUD_PROJECT = "scaledcircle-staging";
process.env.APP_ENV = "staging";
const fundingRequire = createRequire(require.resolve("../functions-campaign-funding/index.js"));
const fn = fundingRequire("./index.js").publishFundedCampaign;
const db = fundingRequire("firebase-admin/firestore").getFirestore();
const originalFetch = global.fetch;
before(async () => {
 if(!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth emulator required');
 const auth=fundingRequire('firebase-admin/auth').getAuth();
 for(const uid of ['publish_business','publish_other']) {
  try {await auth.createUser({uid,email:`${uid}@example.test`,emailVerified:true});}
  catch(e){if(e.code!=='auth/uid-already-exists')throw e;}
 }
 global.fetch = async (url, options) => {
  if (String(url).startsWith('https://tigerweb.geo.census.gov/'))
   return {ok:true,json:async()=>({features:[{attributes:{STATE:'24'}}]})};
  return originalFetch(url, options);
 };
});
after(async () => {global.fetch=originalFetch;await Promise.all(fundingRequire("firebase-admin/app").getApps().map((app) => app.delete()));});
const call = (id, uid = "publish_business") => fn.run({data: {campaignId: id},
  auth: {uid, token: {email_verified: true}}});
async function seed(id, overrides = {}, zoneOverrides = {}) {
  await db.doc("users/publish_business").set({role: "business", active: true});
  await db.doc("users/publish_other").set({role: "business", active: true});
  await db.doc('marketRollout/config').set(require('./market_rollout').initialConfig());
  await db.doc('marketProfiles/publish_business').set({stateId:'us_census_tigerweb:state:24',
    role:'business',selectionSource:'explicit_user_selection'});
  await db.doc(`campaigns/${id}`).set({businessId: "publish_business", status: "draft",
    fundingStatus: "funded", fundingPaymentId: id, basePay: 15, ...overrides});
  await db.doc(`campaignPayments/${id}`).set({campaignId: id, businessUid: "publish_business",
    stripeMode: "test", status: "paid"});
  const serviceArea = [{latitude: 39, longitude: -76}, {latitude: 39.001, longitude: -76},
    {latitude: 39.001, longitude: -75.999}];
  await db.doc(`campaignZones/${id}`).set({campaignId: id, businessId: "publish_business",
    serviceArea, serviceAreaPointCount: 3, mapped: true, analysisStatus: "complete",
    estimatedHomes: 20, serverEstimatedWalkingMinutes: 12, serverZoneMetricsVersion: "geometry_v1_server",
    serverZoneGeometryDigest: crypto.createHash("sha256").update(JSON.stringify(serviceArea.map(p =>
      [p.latitude.toFixed(7), p.longitude.toFixed(7)]))).digest("hex"), ...zoneOverrides});
}
test("actual exported publication resolves validation, preserves data and replays without writes", async () => {
  const id = "publish_ordinary";
  await seed(id);
  assert.equal((await call(id)).zonesLocked, 1);
  const first = await db.doc(`campaigns/${id}`).get();
  const zone = await db.doc(`campaignZones/${id}`).get();
  assert.equal(first.data().status, "open");
  assert.equal(first.data().basePay, 15);
  assert.equal(zone.data().mapLocked, true);
  assert.equal((await call(id)).status, "open");
  assert.ok(first.updateTime.isEqual((await first.ref.get()).updateTime));
  assert.ok(zone.updateTime.isEqual((await zone.ref.get()).updateTime));
  for (const collection of ["walletTransactions", "scalerEarnings", "assignmentCompensations"]) {
    assert.equal((await db.collection(collection).where("campaignId", "==", id).get()).size, 0);
  }
});
test("unfunded, invalid, missing and mixed valid/invalid zones fail closed", async () => {
  for (const kind of ["unfunded", "invalid", "missing", "mixed"]) {
    const id = `publish_${kind}`;
    await seed(id, kind === "unfunded" ? {fundingStatus: "unfunded"} : {},
      kind === "invalid" ? {analysisStatus: "failed"} : {});
    if (kind === "missing") await db.doc(`campaignZones/${id}`).delete();
    if (kind === "mixed") await db.doc(`campaignZones/${id}_bad`).set({campaignId: id});
    await assert.rejects(call(id), e => e.code === "failed-precondition");
    assert.equal((await db.doc(`campaigns/${id}`).get()).data().status, "draft");
  }
});
test("wrong Business cannot publish", async () => {
  await seed("publish_owner");
  await assert.rejects(call("publish_owner", "publish_other"), e => e.code === "permission-denied");
});
test("reserved QA requires exact authority and preserves its binding", async () => {
  const id = "ios_physical_qa_v1";
  await seed(id, {certificationFixture: true, certificationScalerUid: "qa_scaler"});
  await assert.rejects(call(id), e => e.code === "permission-denied");
  await db.doc(`internalCertificationAuthorities/${id}`).set({projectId: "scaledcircle-staging",
    immutable: true, certificationFixture: true, campaignId: id, zoneId: "ios_physical_qa_zone_v1",
    businessUid: "publish_business", scalerUid: "qa_scaler"});
  assert.equal((await call(id)).status, "open");
  assert.equal((await db.doc(`campaigns/${id}`).get()).data().certificationScalerUid, "qa_scaler");
});
test('funding package enforces team responsibilities and attributes the actor', async()=>{
 const {Timestamp}=fundingRequire('firebase-admin/firestore'),auth=fundingRequire('firebase-admin/auth').getAuth();
 const b='publish_business',id='publish_member_authority';await seed(id);await db.doc(`users/${b}`).set({role:'business',active:true},{merge:true});await db.doc(`businessSubscriptions/${b}`).set({plan:'growth',status:'active',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
 for(const [uid,permissions]of [['publish_analyst',['analytics']],['publish_manager',['campaigns','authorizeCampaigns']]]){await auth.createUser({uid,email:`${uid}@example.test`,emailVerified:true});await db.doc(`users/${uid}`).set({role:'business',active:true});await db.doc(`businessWorkspaces/${b}/members/${uid}`).set({uid,businessId:b,status:'active',seatIndex:uid==='publish_analyst'?1:2,permissions});}
 await assert.rejects(call(id,'publish_analyst'),e=>e.code==='permission-denied');
 await assert.rejects(fundingRequire('./index.js').quoteCampaignFunding.run({auth:{uid:'publish_manager',token:{email_verified:true}},data:{campaignId:id}}),e=>e.code==='permission-denied');
 assert.equal((await call(id,'publish_manager')).status,'open');assert.equal((await db.doc(`campaigns/${id}`).get()).data().publishedByActorUid,'publish_manager');await db.doc(`businessWorkspaces/${b}/members/publish_manager`).update({status:'removed'});await assert.rejects(call(id,'publish_manager'),e=>e.code==='permission-denied');assert.equal((await db.collection('walletTransactions').where('campaignId','==',id).get()).size,0);
});

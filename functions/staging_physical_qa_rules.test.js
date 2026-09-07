"use strict";
const fs = require("node:fs");
const {before, after, test} = require("node:test");
const {initializeTestEnvironment, assertFails, assertSucceeds} = require("@firebase/rules-unit-testing");

let environment;
const qaId = "ios_physical_qa_v1";
before(async () => {
  environment = await initializeTestEnvironment({projectId: "demo-scaledcircle-qa",
    firestore: {rules: fs.readFileSync("../firestore.staging.rules", "utf8")}});
  await environment.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, role] of [["business", "business"], ["scaler", "scaler"], ["other", "scaler"]]) {
      await db.doc(`users/${id}`).set({role, active: true});
    }
    await db.doc(`internalCertificationAuthorities/${qaId}`).set({
      projectId: "scaledcircle-staging", immutable: true, certificationFixture: true,
      campaignId: qaId, zoneId: "ios_physical_qa_zone_v1", businessUid: "business", scalerUid: "scaler"});
    await db.doc(`campaigns/${qaId}`).set({businessId: "business", status: "open",
      certificationFixture: true, certificationScalerUid: "scaler", createdAt: new Date()});
    await db.doc("campaigns/ordinary").set({businessId: "business", status: "open", createdAt: new Date()});
    await db.doc("campaignZones/ios_physical_qa_zone_v1").set({businessId: "business",
      campaignId: qaId, assignedScalerId: null, status: "unassigned"});
    for (const id of [qaId, 'ordinary']) {
      const source = await db.doc(`campaigns/${id}`).get();
      await db.doc(`campaignDiscovery/${id}`).set(
        require('./operational_layer').publicCampaignDocument(id, source.data()));
    }
  });
});
after(async () => environment?.cleanup());
const db = (uid) => environment.authenticatedContext(uid, {email_verified: true}).firestore();

test('Scaler Privacy inspection is owner-only, exact-version and read-only',async()=>{
 const path='legalConsents/scaler_privacy_privacy-2026-08-v1';
 await assertSucceeds(db('scaler').doc(path).get());
 await assertFails(db('other').doc(path).get());
 await assertFails(db('business').doc('legalConsents/business_privacy_privacy-2026-08-v1').get());
 await assertFails(db('scaler').doc('legalConsents/scaler_privacy_unknown').get());
 await assertFails(db('scaler').collection('legalConsents').get());
 await assertFails(db('scaler').doc(path).set({uid:'scaler',agreementType:'privacy'}));
 await assertFails(environment.unauthenticatedContext().firestore().doc(path).get());
});
test("intended actors can read QA; unrelated Scaler cannot get or list it", async () => {
  await assertSucceeds(db("scaler").doc(`campaignDiscovery/${qaId}`).get());
  await assertSucceeds(db("business").doc(`campaignDiscovery/${qaId}`).get());
  await assertFails(db("other").doc(`campaignDiscovery/${qaId}`).get());
  await assertFails(db("other").collection("campaignDiscovery").where("status", "==", "open").get());
  await assertFails(db("other").doc("campaignZones/ios_physical_qa_zone_v1").get());
});
test("ordinary staging discovery remains usable when reserved ID is excluded", async () => {
  await assertSucceeds(db("other").collection("campaignDiscovery").where("status", "==", "open")
    .where("__name__", "not-in", [qaId, "android_physical_qa_v1", "ios_physical_qa_v2", "android_physical_qa_v2"]).get());
  await assertSucceeds(db("other").doc("campaignDiscovery/ordinary").get());
});
test("clients cannot write authority, mutate bindings, or bypass application authority", async () => {
  await assertFails(db("business").doc(`internalCertificationAuthorities/${qaId}`).update({scalerUid: "other"}));
  await assertFails(db("business").doc(`campaigns/${qaId}`).update({certificationScalerUid: "other"}));
  await assertFails(db("business").doc("campaigns/ordinary").update({certificationFixture: true}));
  await assertFails(db("scaler").doc(`campaigns/${qaId}/applications/scaler`).set({status: "pending"}));
});


test("ordinary and authorized QA descriptive edits remain allowed", async () => {
  await assertSucceeds(db("business").doc("campaigns/ordinary").update({description: "Ordinary edit"}));
  await assertSucceeds(db("business").doc(`campaigns/${qaId}`).update({description: "QA edit"}));
});

test('QA compensation, lifecycle and binding commitments cannot be edited by clients',async()=>{
 for(const field of ['basePay','bonus','workerBudget','status','certificationContract','geometryHash','certificationPurpose'])
  await assertFails(db('business').doc(`campaigns/${qaId}`).update({[field]:'changed'}));
 await assertFails(db('business').doc('internalCertificationGeometry/dual_mobile_v1').set({geometry:[]}));
 await assertFails(db('scaler').doc('internalCertificationGeometry/dual_mobile_v1').get());
});


test("ordinary Business and assigned-zone queries retain access", async () => {
  await assertSucceeds(db("business").collection("campaigns").where("businessId", "==", "business").get());
  await assertSucceeds(db("other").collection("campaignZones").where("assignedScalerId", "==", "other").get());
  await assertSucceeds(db("other").collection("campaignZones").where("assignedScalerIds", "array-contains", "other").get());
  await assertSucceeds(db("other").collection("campaignZones").where("campaignId", "==", "ordinary").get());
  await assertFails(db("other").collection("campaignZones").where("campaignId", "==", qaId).get());
});

test("pending profile stays callable-only; approved owner cannot read another owner's preferences", async () => {
  await environment.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('users/pending-profile').set({role:'scaler',active:false,betaAccess:'pending'});
    await ctx.firestore().doc('discoveryPreferences/scaler').set({userUid:'scaler'});
  });
  await assertFails(db('pending-profile').doc('discoveryPreferences/pending-profile').get());
  await assertFails(db('pending-profile').doc('discoveryPreferences/pending-profile').set({areas:[]}));
  await assertSucceeds(db('scaler').doc('discoveryPreferences/scaler').get());
  await assertFails(db('other').doc('discoveryPreferences/scaler').get());
  await assertFails(db('scaler').doc('discoveryPreferences/scaler').update({areas:[]}));
});

test('two fixtures stay isolated across both Scalers and normal discovery',async()=>{
 await environment.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await db.doc('users/android').set({role:'scaler',active:true});
  await db.doc('internalCertificationAuthorities/android_physical_qa_v1').set({projectId:'scaledcircle-staging',immutable:true,certificationFixture:true,campaignId:'android_physical_qa_v1',zoneId:'android_physical_qa_zone_v1',businessUid:'business',scalerUid:'android'});
  await db.doc('campaigns/android_physical_qa_v1').set({businessId:'business',status:'open',createdAt:new Date()});
  await db.doc('campaignDiscovery/android_physical_qa_v1').set({businessId:'business',status:'open'});
  await db.doc('campaignZones/android_physical_qa_zone_v1').set({businessId:'business',campaignId:'android_physical_qa_v1',assignedScalerId:null,status:'unassigned'});
 });
 await assertSucceeds(db('android').doc('campaignDiscovery/android_physical_qa_v1').get());
 await assertFails(db('android').doc('campaignDiscovery/ios_physical_qa_v1').get());
 await assertFails(db('scaler').doc('campaignDiscovery/android_physical_qa_v1').get());
 for(const uid of ['scaler','android','other']){
  const result=await assertSucceeds(db(uid).collection('campaignDiscovery').where('status','==','open').where('__name__','not-in',['ios_physical_qa_v1','android_physical_qa_v1','ios_physical_qa_v2','android_physical_qa_v2']).get());
  if(result.docs.some(d=>d.id.includes('physical_qa')))throw Error('QA leaked');
 }
 for(const fixture of ['ios','android']) {
  await assertFails(db('other').doc(`campaignDiscovery/${fixture}_physical_qa_v1`).get());
  await assertFails(db('other').doc(`campaignZones/${fixture}_physical_qa_zone_v1`).get());
 }
 await assertFails(db('scaler').doc('campaignZones/android_physical_qa_zone_v1').get());
 await assertFails(db('android').doc('campaignZones/ios_physical_qa_zone_v1').get());
});

test('fresh retests preserve owner-only reads without changing historical fixtures',async()=>{
 await environment.withSecurityRulesDisabled(async ctx=>{
  const store=ctx.firestore();
  await store.doc('users/android').set({role:'scaler',active:true});
  for(const [device,uid] of [['ios','scaler'],['android','android']]){
   const campaignId=`${device}_physical_qa_v2`,zoneId=`${device}_physical_qa_zone_v2`;
   await store.doc(`internalCertificationAuthorities/${campaignId}`).set({projectId:'scaledcircle-staging',immutable:true,certificationFixture:true,campaignId,zoneId,businessUid:'business',scalerUid:uid});
   await store.doc(`campaigns/${campaignId}`).set({businessId:'business',status:'open'});
   await store.doc(`campaignDiscovery/${campaignId}`).set({businessId:"business",status:"open"});
   await store.doc(`campaignZones/${zoneId}`).set({businessId:'business',campaignId,assignedScalerId:null,status:'unassigned'});
  }
 });
 for(const [device,owner,other] of [['ios','scaler','android'],['android','android','scaler']]){
  for(const path of [`campaignDiscovery/${device}_physical_qa_v2`,`campaignZones/${device}_physical_qa_zone_v2`]){
   await assertSucceeds(db(owner).doc(path).get());
   await assertFails(db(other).doc(path).get());
   await assertFails(db('other').doc(path).get());
  }
  await assertFails(db(other).doc(`campaigns/${device}_physical_qa_v2/applications/${other}`).set({status:'pending'}));
 }
});

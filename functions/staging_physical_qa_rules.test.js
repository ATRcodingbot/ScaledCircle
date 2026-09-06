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
  });
});
after(async () => environment?.cleanup());
const db = (uid) => environment.authenticatedContext(uid, {email_verified: true}).firestore();
test("intended actors can read QA; unrelated Scaler cannot get or list it", async () => {
  await assertSucceeds(db("scaler").doc(`campaigns/${qaId}`).get());
  await assertSucceeds(db("business").doc(`campaigns/${qaId}`).get());
  await assertFails(db("other").doc(`campaigns/${qaId}`).get());
  await assertFails(db("other").collection("campaigns").where("status", "==", "open").get());
  await assertFails(db("other").doc("campaignZones/ios_physical_qa_zone_v1").get());
});
test("ordinary staging discovery remains usable when reserved ID is excluded", async () => {
  await assertSucceeds(db("other").collection("campaigns").where("status", "==", "open")
    .where("__name__", "!=", qaId).get());
  await assertSucceeds(db("other").doc("campaigns/ordinary").get());
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


test("ordinary Business and assigned-zone queries retain access", async () => {
  await assertSucceeds(db("business").collection("campaigns").where("businessId", "==", "business").get());
  await assertSucceeds(db("other").collection("campaignZones").where("assignedScalerId", "==", "other").get());
  await assertSucceeds(db("other").collection("campaignZones").where("assignedScalerIds", "array-contains", "other").get());
  await assertSucceeds(db("other").collection("campaignZones").where("campaignId", "==", "ordinary").get());
  await assertFails(db("other").collection("campaignZones").where("campaignId", "==", qaId).get());
});

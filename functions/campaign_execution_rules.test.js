"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {initializeTestEnvironment, assertFails, assertSucceeds} = require("@firebase/rules-unit-testing");
const {doc, setDoc, getDoc, getDocs, updateDoc, deleteField, collection, query, where, Timestamp, serverTimestamp} = require("firebase/firestore");

for (const flavor of ["production", "staging", "legacy"]) test(`${flavor}: mode and planning authority are immutable; own-team campaign/geometry stays tenant-private`, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
  const file = flavor === "legacy" ? "firestore.rules" : `firestore.${flavor}.rules`;
  const env = await initializeTestEnvironment({projectId: `demo-mode-rules-${flavor}`, firestore: {rules: fs.readFileSync(path.join(__dirname, "..", file), "utf8")}});
  const points = [{latitude: 39, longitude: -76}, {latitude: 39.001, longitude: -76}, {latitude: 39.001, longitude: -75.999}];
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [uid, role] of [["owner", "business"], ["other", "business"], ["member", "business"], ["scaler", "scaler"], ["admin", "admin"]]) await setDoc(doc(db, `users/${uid}`), {role, active: true});
      await setDoc(doc(db, "marketRollout/config"), require("./market_rollout").initialConfig());
      await setDoc(doc(db, "marketProfiles/owner"), {role: "business", stateId: "us_census_tigerweb:state:24", selectionSource: "explicit_user_selection"});
      await setDoc(doc(db, "businessSubscriptions/owner"), {status: "active", plan: "growth", expiresAt: Timestamp.fromMillis(Date.now() + 86400000)});
      await setDoc(doc(db, "businessWorkspaces/owner/members/member"), {uid: "member", businessId: "owner", status: "active", seatIndex: 1, permissions: ["campaigns"]});
      for (const mode of ["own_team", "marketplace", "legacy"]) {
        await setDoc(doc(db, `campaigns/${mode}`), {businessId: "owner", status: "draft", campaignName: "Private", ...(mode === "legacy" ? {} : {executionMode: mode}), certificationFixture: false});
        await setDoc(doc(db, `campaignZones/${mode}`), {businessId: "owner", campaignId: mode, assignedScalerId: null, status: "unassigned", serviceArea: points, serviceAreaPointCount: 3, serviceAreaType: "polygon", shapeType: "polygon", zoneName: "Zone"});
        await setDoc(doc(db, `campaignLocations/${mode}`), {businessId: "owner", campaignId: mode, assignedScalerId: "scaler", status: "assigned"});
      }
      await setDoc(doc(db, "campaigns/scheduled"), {businessId: "owner", executionMode: "own_team", status: "own_team_scheduled", certificationFixture: false});
    });
    const db = uid => uid ? env.authenticatedContext(uid, {email_verified: true}).firestore() : env.unauthenticatedContext().firestore();
    for (const uid of ["other", "scaler", "admin", null]) {
      for (const col of ["campaigns", "campaignZones", "campaignLocations"]) await assertFails(getDoc(doc(db(uid), `${col}/own_team`)));
      await assertFails(getDocs(query(collection(db(uid), "campaigns"), where("executionMode", "==", "own_team"))));
    }
    for (const col of ["campaigns", "campaignZones", "campaignLocations"]) await assertSucceeds(getDoc(doc(db("owner"), `${col}/own_team`)));
    await assertSucceeds(getDocs(query(collection(db("owner"), "campaigns"), where("businessId", "==", "owner"))));
    await assertSucceeds(getDocs(query(collection(db("owner"), "campaignZones"), where("campaignId", "==", "own_team"), where("businessId", "==", "owner"))));
    if (flavor !== "legacy") {
      await assertSucceeds(getDoc(doc(db("member"), "campaigns/own_team")));
      await assertSucceeds(getDoc(doc(db("member"), "campaignZones/own_team")));
    }
    await assertSucceeds(getDoc(doc(db("scaler"), "campaignZones/marketplace")));
    await assertSucceeds(getDoc(doc(db("scaler"), "campaignZones/legacy")));
    for (const id of ["own_team", "marketplace", "legacy"]) {
      for (const patch of [{executionMode: "marketplace"}, {executionMode: "own_team"}, {executionMode: deleteField()}, {planningSchemaVersion: 1}, {planningStage: "review"}, {planningVersion: 9}, {materialsAreaDigest: "forged"}, {fundingStatus: "funded"}, {scheduleItemId: "forged"}, {status: "open"}]) {
        // Equal-value writes are harmless and have no changed field to reject.
        if (patch.executionMode === id) continue;
        if (id === "legacy" && patch.executionMode?.isEqual?.(deleteField())) continue;
        await assertFails(updateDoc(doc(db("owner"), `campaigns/${id}`), patch));
      }
    }
    await assertFails(setDoc(doc(db("owner"), "campaigns/client_mode"), {businessId: "owner", status: "draft", createdAt: serverTimestamp(), executionMode: "own_team"}));
    await assertSucceeds(updateDoc(doc(db("owner"), "campaigns/own_team"), {campaignName: "Editable draft"}));
    await assertSucceeds(updateDoc(doc(db("owner"), "campaignZones/own_team"), {zoneName: "Editable area"}));
    await assertFails(updateDoc(doc(db("owner"), "campaigns/scheduled"), {serviceArea: points}));
    await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), "businessWorkspaces/owner/members/member"), {status: "removed"}));
    await assertFails(getDoc(doc(db("member"), "campaigns/own_team")));
  } finally { await env.cleanup(); }
});

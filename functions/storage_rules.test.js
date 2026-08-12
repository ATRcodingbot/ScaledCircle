"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {after, before, beforeEach, test} = require("node:test");
const {assertFails, assertSucceeds, initializeTestEnvironment} =
  require("@firebase/rules-unit-testing");

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    // Cross-service Storage rules read the Firestore emulator in the same
    // Firebase project namespace, so this must match emulators:exec.
    projectId: "demo-scaledcircle",
    firestore: {rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")},
    storage: {rules: fs.readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8")},
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  if (environment.clearStorage) await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc("users/scaler-one").set({role: "scaler", active: true});
    await db.doc("users/scaler-two").set({role: "scaler", active: true});
    await db.doc("users/business-one").set({role: "business", active: true});
    await db.doc("users/admin-one").set({role: "admin", active: true});
    await db.doc("trackingSessions/session-active").set({
      scalerId: "scaler-one", businessId: "business-one", status: "active",
    });
    await db.doc("trackingSessions/session-closed").set({
      scalerId: "scaler-one", businessId: "business-one", status: "finalizing",
    });
    await db.doc("jobRooms/zone-one").set({
      scalerId: "scaler-one", businessId: "business-one", status: "assigned",
    });
    await db.doc("materialHandoffs/zone-one").set({
      zoneId: "zone-one", campaignId: "campaign-one",
      scalerId: "scaler-one", businessId: "business-one",
      fulfillmentType: "third_party_pickup", status: "scheduled",
    });
  });
});

after(async () => environment?.cleanup());

function ref(uid, storagePath) {
  return environment.authenticatedContext(uid).storage().ref(storagePath);
}

test("owner can upload a bounded image only to their active session", async () => {
  await assertSucceeds(ref("scaler-one", "tracking_checkpoints/scaler-one/session-active/photo.jpg")
    .put(new Uint8Array([1, 2, 3]), {contentType: "image/jpeg"}));
  await assertFails(ref("scaler-two", "tracking_checkpoints/scaler-one/session-active/stolen.jpg")
    .put(new Uint8Array([1]), {contentType: "image/jpeg"}));
  await assertFails(ref("scaler-one", "tracking_checkpoints/scaler-one/session-closed/late.jpg")
    .put(new Uint8Array([1]), {contentType: "image/jpeg"}));
  await assertFails(ref("scaler-one", "tracking_checkpoints/scaler-one/wrong-session/photo.jpg")
    .put(new Uint8Array([1]), {contentType: "image/jpeg"}));
});

test("checkpoint upload rejects wrong content type and oversized images", async () => {
  await assertFails(ref("scaler-one", "tracking_checkpoints/scaler-one/session-active/file.txt")
    .put(new Uint8Array([1]), {contentType: "text/plain"}));
  await assertFails(ref("scaler-one", "tracking_checkpoints/scaler-one/session-active/huge.jpg")
    .put(new Uint8Array(10 * 1024 * 1024 + 1), {contentType: "image/jpeg"}));
});

test("checkpoint objects are immutable and private to authorized reviewers", async () => {
  const ownerRef = ref("scaler-one", "tracking_checkpoints/scaler-one/session-active/photo.png");
  await assertSucceeds(ownerRef.put(new Uint8Array([1, 2]), {contentType: "image/png"}));
  await assertSucceeds(ownerRef.getDownloadURL());
  await assertSucceeds(ref("business-one", ownerRef.fullPath).getDownloadURL());
  await assertSucceeds(ref("admin-one", ownerRef.fullPath).getDownloadURL());
  await assertFails(ref("scaler-two", ownerRef.fullPath).getDownloadURL());
  await assertFails(ownerRef.put(new Uint8Array([3]), {contentType: "image/png"}));
  await assertFails(ownerRef.delete());
});

test("material handoff proof is bounded, immutable, and participant-private", async () => {
  const proof = ref("scaler-one", "material_handoffs/scaler-one/zone-one/proof.jpg");
  await assertSucceeds(proof.put(new Uint8Array([1, 2, 3]), {contentType: "image/jpeg"}));
  await assertSucceeds(proof.getDownloadURL());
  await assertSucceeds(ref("business-one", proof.fullPath).getDownloadURL());
  await assertSucceeds(ref("admin-one", proof.fullPath).getDownloadURL());
  await assertFails(ref("scaler-two", proof.fullPath).getDownloadURL());
  await assertFails(ref("scaler-two", "material_handoffs/scaler-two/zone-one/stolen.jpg")
    .put(new Uint8Array([1]), {contentType: "image/jpeg"}));
  await assertFails(ref("scaler-one", "material_handoffs/scaler-one/zone-two/missing-room.jpg")
    .put(new Uint8Array([1]), {contentType: "image/jpeg"}));
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc("jobRooms/zone-no-handoff").set({
      scalerId: "scaler-one", businessId: "business-one", status: "assigned",
    });
  });
  await assertFails(ref("scaler-one", "material_handoffs/scaler-one/zone-no-handoff/no-record.jpg")
    .put(new Uint8Array([1]), {contentType: "image/jpeg"}));
  await assertFails(ref("scaler-one", "material_handoffs/scaler-one/zone-one/file.txt")
    .put(new Uint8Array([1]), {contentType: "text/plain"}));
  await assertFails(proof.put(new Uint8Array([4]), {contentType: "image/jpeg"}));
  await assertFails(proof.delete());
});

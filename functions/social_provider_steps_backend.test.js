"use strict";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") ||
    [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some(x => x && x !== "demo-scaledcircle")) {
  throw new Error("provider_steps_require_local_demo_emulator");
}
const {test, beforeEach, after} = require("node:test");
const assert = require("node:assert/strict");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {descriptor, createStepStore, executeStep} = require("../functions-social-operations/social_provider_steps");
const app = initializeApp({projectId: "demo-scaledcircle"}, "provider-step-tests");
const db = getFirestore(app);
let clock, store, step, creates, reconciles;
const receipt = {id: "123", status: "FINISHED"};
const jobRef = db.doc("socialGrowthJobs/step_fixture");
beforeEach(async () => {
  await db.recursiveDelete(jobRef);
  clock = 1000000; creates = 0; reconciles = 0;
  const job = {id: jobRef.id, businessUid: "fixture", provider: "instagram", bindingHash: "approved", enabled: true};
  await jobRef.set(job);
  step = descriptor(job, {key: "child:0", kind: "child", requestHash: "a".repeat(64)});
  store = createStepStore(db, {now: () => clock, authorize: async (_tx, current, action) => {
    if (action === "create" && !current.enabled) throw new Error("paused");
  }});
});
after(async () => { await db.terminate(); await deleteApp(app); });
function run(overrides = {}) {
  return executeStep({store, step,
    create: async () => { creates++; return receipt; },
    reconcile: async () => { reconciles++; return receipt; },
    verify: async value => { assert.equal(value.id, receipt.id); }, ...overrides});
}
test("concurrent claims create once and preserve one immutable provider receipt", async () => {
  await Promise.all(Array.from({length: 5}, () => run()));
  assert.equal(creates, 1);
  await run(); assert.equal(creates, 1);
  const ref = jobRef.collection("providerSteps").doc(step.id);
  assert.equal((await ref.collection("receipts").get()).size, 1);
  assert.equal((await ref.collection("audit").get()).size, 1);
});
test("lost provider response reconciles after lease expiry even when new sends are paused", async () => {
  assert.equal((await run({create: async () => { creates++; throw new Error("timeout"); }})).status, "needs_attention");
  assert.equal((await run()).status, "busy");
  await jobRef.update({enabled: false}); clock += 120001;
  assert.equal((await run()).status, "received");
  assert.equal(creates, 1); assert.equal(reconciles, 1);
});
test("unresolved or expired container is never recreated", async () => {
  await run({create: async () => { creates++; throw new Error("timeout"); }});
  for (let i = 0; i < 3; i++) {
    clock += 120001;
    assert.equal((await run({reconcile: async () => { reconciles++; return null; }})).status, "needs_attention");
  }
  assert.equal(creates, 1); assert.equal(reconciles, 3);
});
test("stale generation cannot persist or overwrite a newer receipt", async () => {
  const first = await store.begin(step); clock += 120001;
  const second = await store.begin(step);
  await assert.rejects(store.finish(first.record, receipt), /stale/);
  await store.finish(second.record, receipt);
  await assert.rejects(store.finish(second.record, {id: "456", status: "FINISHED"}), /stale/);
});
test("changed approved job, request, owner, or step descriptor fails before provider calls", async () => {
  await store.begin(step);
  await assert.rejects(store.begin({...step, requestHash: "b".repeat(64)}), /changed/);
  await assert.rejects(store.begin({...step, kind: "publish"}), /changed/);
  await assert.rejects(store.begin({...step, id: "forged"}), /invalid/);
  await jobRef.update({businessUid: "other"});
  await assert.rejects(run(), /job_changed/);
  assert.equal(creates, 0);
});
test("kill switch denies a new step and authority is mandatory", async () => {
  assert.throws(() => createStepStore(db), /authority_required/);
  await jobRef.update({enabled: false});
  await assert.rejects(run(), /paused/); assert.equal(creates, 0);
});
test("provider identity verification failure never stores a successful receipt", async () => {
  assert.equal((await run({verify: async () => { throw new Error("wrong_account"); }})).status, "needs_attention");
  assert.equal((await jobRef.collection("providerSteps").doc(step.id).get()).data().receipt, undefined);
  clock += 120001;
  await run(); assert.equal(creates, 1); assert.equal(reconciles, 1);
});
test("stored receipt is reverified and cannot authorize use of an expired container", async () => {
  await run();
  await assert.rejects(run({verify: async () => { throw new Error("expired"); }}), /expired/);
  assert.equal(creates, 1);
});

test("carousel resumes a lost child response, preserves order, and publishes once under concurrent workers", async () => {
  const growth = require("../functions-social-operations/social_growth_cycle");
  const meta = require("../functions-social-operations/social_meta_candidate");
  const {execute} = require("../functions-social-operations/social_meta_steps");
  const account = {businessUid: "fixture", providerUserId: "123", linkedPageId: "456"};
  const revision = meta.mediaRevision({businessUid: "fixture", assetId: "asset", provider: "instagram",
    productionOrigin: "https://scaledcircle.com", images: [1, 2].map(i => ({sha256: String(i).repeat(64),
      bytes: 100, width: 1080, height: 1350, mime: "image/jpeg",
      url: `https://scaledcircle.com/social/${String(i).repeat(64)}.jpg`}))});
  const approval = {id: "fixture_approval", businessUid: "fixture", approvedByUid: "fixture",
    providerAccounts: {instagram: account}, items: [{versionId: "v1", bindingHash: "approved",
      scheduledFor: "2030-01-01T00:00:00Z", variants: [{provider: "instagram", copy: "Link in bio.",
        mediaAssetId: revision.assetId, mediaRevisionId: revision.id}]}]};
  const job = growth.jobs(approval)[0], ref = db.doc(`socialGrowthJobs/${job.id}`);
  await db.recursiveDelete(ref); await ref.set({...job, enabled: true});
  const calls = [], ids = new Map();
  let lost = false;
  const adapter = {
    create: async ({kind, request}) => {
      calls.push({kind, request}); const value = {id: String(100 + calls.length), status: kind === "publish" ? "PUBLISHED" : "FINISHED"};
      ids.set(growth.hash(request), value);
      if (!lost) { lost = true; throw new Error("lost_child_response"); }
      return value;
    },
    reconcile: async ({request}) => ids.get(growth.hash(request)),
    verify: async ({request, receipt: value}) => assert.deepEqual(value, ids.get(growth.hash(request))),
  };
  const executePlan = () => execute({job, revision, account, approval, store, adapter});
  assert.equal((await executePlan()).status, "needs_attention");
  clock += 120001;
  await Promise.all([executePlan(), executePlan(), executePlan()]);
  await executePlan();
  assert.deepEqual(calls.map(call => call.kind), ["child", "child", "parent", "publish"]);
  assert.deepEqual(calls[2].request.body.children, ["101", "102"]);
  assert.equal(calls[3].request.body.creation_id, "103");
  assert.equal((await ref.collection("providerSteps").get()).size, 4);
  await db.recursiveDelete(ref);
});

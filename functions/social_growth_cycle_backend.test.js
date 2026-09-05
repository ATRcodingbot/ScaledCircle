"use strict";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") ||
    [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some(x => x && x !== "demo-scaledcircle")) {
  throw new Error("growth_tests_require_local_demo_emulator");
}
const {test, beforeEach, after} = require("node:test");
const assert = require("node:assert/strict");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const growth = require("../functions-social-operations/social_growth_cycle");
const {createPublisher} = require("../functions-social-operations/social_growth_publisher");
const app = initializeApp({projectId: "demo-scaledcircle"}, "growth-cycle-tests");
const db = getFirestore(app);
const now = Date.parse("2030-01-01T00:00:00Z");
let clock, store, record, approvalInput;
beforeEach(async () => {
  for (const name of ["socialPublishingAuthorities", "socialConnections", "users", "agentHealth", "socialGrowthCycles", "socialGrowthApprovals", "socialGrowthJobs", "socialContentVersions", "socialContentQualityAssessments"]) {
    const snapshots = await db.collection(name).get();
    for (const snapshot of snapshots.docs) await db.recursiveDelete(snapshot.ref);
  }
  clock = now; store = growth.createStore(db, () => clock);
  const version = {businessUid: "fixture", contentHash: "content", version: 1,
    scheduledFor: "2030-01-02T12:00:00Z", variants: [{provider: "x", copy: "Exact approved copy"}]};
  await db.doc("socialContentVersions/fixture_v1").set(version);
  await db.doc("socialContentQualityAssessments/fixture_v1").set({businessUid: "fixture", readyToPublish: true, immutableSourceHash: "content"});
  record = growth.cycle({businessUid: "fixture", planId: "fixture_plan", providerAccounts: {x: {providerUserId: "123", handle: "fixture"}}, strategy: {themes: ["education"], objectives: ["Measure visits"]},
    versions: [{id: "fixture_v1", record: version}], startsAt: "2030-01-01", endsAt: "2030-01-31", timeZone: "America/New_York", now});
  await store.save(record);
  approvalInput = {cycleId: record.id, businessUid: "fixture", expectedDigest: record.digest,
    versionIds: ["fixture_v1"], windowStart: "2030-01-01", windowEnd: "2030-01-08", now};
});
after(async () => { await db.terminate(); await deleteApp(app); });
test("concurrent approval creates exactly one approval and one immutable platform job", async () => {
  const results = await Promise.all([1, 2, 3].map(() => store.approve(approvalInput)));
  assert.equal(new Set(results.map(x => x.approvalId)).size, 1);
  assert.equal((await db.collection("socialGrowthJobs").get()).size, 1);
  assert.equal((await db.collection("socialGrowthApprovals").get()).size, 1);
});
test("changed canonical content or wrong tenant fails before job creation", async () => {
  await assert.rejects(store.approve({...approvalInput, businessUid: "other"}));
  await db.doc("socialContentVersions/fixture_v1").update({variants: [{provider: "x", copy: "Substituted"}]});
  await assert.rejects(store.approve(approvalInput), /content_changed/);
  assert.equal((await db.collection("socialGrowthJobs").get()).size, 0);
});
test("durable send claim prevents duplicate create and reconciles ambiguous send after pause", async () => {
  const {jobIds: [jobId]} = await store.approve(approvalInput);
  clock = Date.parse("2030-01-02T12:00:00Z");
  let creates = 0, reconciles = 0, paused = false;
  const receipt = {providerPostId: "fixturePost", providerPostUrl: "https://example.invalid/post", contentHash: "content"};
  const context = async () => ({now: clock, supervisor: {killSwitchActive: paused},
    authority: {externalPublishingEnabled: true, reviewed: true, businessUid: "fixture", mode: "approval_required", providerUserId: "fixtureUser"},
    connection: {businessUid: "fixture", provider: "x", providerUserId: "fixtureUser", status: "connected_write",
      writeScopesGranted: true, tokenHealth: "healthy", grantedScopes: ["users.read", "tweet.read", "offline.access", "tweet.write", "media.write"]}});
  const adapter = {verifyApprovedAssets: async () => {}, verifyReceipt: async () => {},
    create: async () => { creates++; throw new Error("Lost response"); },
    reconcile: async () => { reconciles++; return receipt; }};
  await Promise.all([1, 2, 3].map(() => growth.executeCandidate({store, adapter, context, jobId})));
  assert.equal(creates, 1);
  paused = true; clock += 3600000;
  await growth.executeCandidate({store, adapter, context, jobId});
  await growth.executeCandidate({store, adapter, context, jobId});
  assert.equal(creates, 1); assert.ok(reconciles >= 1);
  assert.equal((await store.get(jobId)).status, "published");
  assert.equal((await db.doc(`socialGrowthJobs/${jobId}`).collection("receipts").get()).size, 1);
});
test("expired lease cannot overwrite a newer send claim", async () => {
  const {jobIds: [jobId]} = await store.approve(approvalInput);
  const first = await store.claim(jobId); clock += 130000;
  const second = await store.claim(jobId);
  await assert.rejects(store.markSendStarted(first), /stale_claim/);
  await store.markSendStarted(second);
  assert.equal((await store.get(jobId)).sendStarted, true);
});
test("quality assessment must approve the exact source version before weekly approval", async () => {
  await db.doc("socialContentQualityAssessments/fixture_v1").update({immutableSourceHash: "stale"});
  await assert.rejects(store.approve(approvalInput), /quality_review/);
  assert.equal((await db.collection("socialGrowthJobs").get()).size, 0);
});

test("revocation, changed source, or withdrawn quality after claim blocks the final send transaction", async () => {
  const {jobIds: [jobId], approvalId} = await store.approve(approvalInput);
  const claim = await store.claim(jobId);
  await db.doc(`socialGrowthApprovals/${approvalId}`).update({revokedAt: clock});
  await assert.rejects(store.markSendStarted(claim), /approval_required/);
  await db.doc(`socialGrowthApprovals/${approvalId}`).update({revokedAt: null});
  await db.doc("socialContentVersions/fixture_v1").update({variants: [{provider: "x", copy: "Changed after claim"}]});
  await assert.rejects(store.markSendStarted(claim), /content_changed/);
  assert.equal((await store.get(jobId)).sendStarted, undefined);
});

test("revocation after an ambiguous create preserves read-only receipt reconciliation", async () => {
  const {jobIds: [jobId], approvalId} = await store.approve(approvalInput);
  const claim = await store.claim(jobId); const started = await store.markSendStarted(claim);
  await store.attention(started, "unknown_provider_outcome");
  await db.doc(`socialGrowthApprovals/${approvalId}`).update({revokedAt: clock});
  assert.equal((await store.claim(jobId)).sendStarted, true);
});

test("normal persistent publisher stays paused until bounded activation and rechecks kill switch after provider identity read", async () => {
  const {approvalId, jobIds: [jobId]} = await store.approve(approvalInput);
  await db.doc("users/fixture").set({role: "admin"});
  await db.doc("socialConnections/fixture/providers/x").set({environment: "production", provider: "x",
    providerUserId: "123", handle: "fixture", status: "connected_write", tokenHealth: "healthy", writeScopesGranted: true,
    grantedScopes: ["users.read", "tweet.read", "offline.access", "tweet.write", "media.write"]});
  let creates = 0;
  const publisher = createPublisher({db, project: "scaled-circle", now: () => clock,
    credentials: async () => ({accessToken: "fixture-only", providerUserId: "123", handle: "fixture"}),
    fetchImpl: async (_, options) => {
      if (options.method === "POST") creates++;
      await publisher.pause("fixture");
      return {ok: true, json: async () => ({data: {id: "123", username: "fixture"}})};
    }});
  assert.deepEqual(await publisher.prepare("fixture"), {prepared: true, paused: true});
  assert.equal((await publisher.execute(jobId)).status, "supervisor_paused");
  await assert.rejects(publisher.activate({businessUid: "other", approvalId}));
  await publisher.activate({businessUid: "fixture", approvalId});
  clock = Date.parse("2030-01-02T12:00:00Z");
  assert.equal((await publisher.execute(jobId)).status, "supervisor_paused");
  assert.equal(creates, 0); assert.equal((await store.get(jobId)).sendStarted, undefined);
});

test("normal activated publisher creates once under concurrency and stores one verified receipt", async () => {
  const {approvalId, jobIds: [jobId]} = await store.approve(approvalInput);
  await db.doc("users/fixture").set({role: "admin"});
  const connectionRef = db.doc("socialConnections/fixture/providers/x");
  await connectionRef.set({environment: "production", provider: "x", providerUserId: "999", handle: "fixture",
    status: "connected_write", tokenHealth: "healthy", writeScopesGranted: true,
    grantedScopes: ["users.read", "tweet.read", "offline.access", "tweet.write", "media.write"]});
  let creates = 0;
  const publisher = createPublisher({db, project: "scaled-circle", now: () => clock,
    credentials: async () => ({accessToken: "fixture-only", providerUserId: "123", handle: "fixture"}),
    fetchImpl: async (url, options) => {
      if (url.includes("users/me")) return {ok: true, json: async () => ({data: {id: "123", username: "fixture"}})};
      if (options.method === "POST") {
        creates++; assert.deepEqual(JSON.parse(options.body), {text: "Exact approved copy"});
        return {ok: true, json: async () => ({data: {id: "456"}})};
      }
      return {ok: true, json: async () => ({data: {id: "456", author_id: "123",
        text: "Exact approved copy", created_at: "2030-01-02T12:00:00Z"}})};
    }});
  await publisher.prepare("fixture");
  await assert.rejects(publisher.activate({businessUid: "fixture", approvalId}), /identity_mismatch/);
  await connectionRef.update({providerUserId: "123"});
  await publisher.activate({businessUid: "fixture", approvalId});
  clock = Date.parse("2030-01-02T12:00:00Z");
  await Promise.all([1, 2, 3].map(() => publisher.execute(jobId)));
  await publisher.execute(jobId);
  assert.equal(creates, 1);
  assert.equal((await store.get(jobId)).status, "published");
  assert.equal((await db.doc(`socialGrowthJobs/${jobId}`).collection("receipts").get()).size, 1);
  assert.equal((await db.doc(`socialGrowthJobs/${jobId}/receipts/publication`).get()).data().providerPostUrl,
    "https://x.com/fixture/status/456");
});

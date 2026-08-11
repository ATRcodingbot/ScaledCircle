"use strict";

const assert = require("node:assert/strict");
const {after, before, beforeEach, test} = require("node:test");
const fftFactory = require("firebase-functions-test");
const {getApps} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

process.env.GCLOUD_PROJECT ||= "scaled-circle";
process.env.GOOGLE_CLOUD_PROJECT ||= "scaled-circle";

const fft = fftFactory({projectId: "scaled-circle", storageBucket: "scaled-circle.appspot.com"});
const functions = require("./index");
const db = getFirestore();

const call = (fn, uid, data, verified = true) => fft.wrap(fn)({
  data,
  auth: uid ? {uid, token: {email_verified: verified, email: `${uid}@test.invalid`}} : undefined,
});

const start = (uid = "scaler", campaignId = "campaign", zoneId = "zone") =>
  call(functions.startTrackingSession, uid, {campaignId, zoneId});
const upload = (sessionId, points, uid = "scaler") => call(
  functions.uploadTrackingChunk,
  uid,
  {
    sessionId,
    chunkId: "client-id-is-ignored",
    startSequence: points[0].sequence,
    endSequence: points.at(-1).sequence,
    points,
  },
);
const point = (sequence, offset = sequence) => ({
  sequence,
  latitude: 39 + offset * 0.00001,
  longitude: -76,
  timestampMs: Date.now() - 60_000 + offset * 20_000,
  horizontalAccuracy: 5,
  speed: 1.2,
  heading: 90,
});

async function seed() {
  await Promise.all([
    db.doc("users/scaler").set({role: "scaler"}),
    db.doc("users/other").set({role: "scaler"}),
    db.doc("users/business").set({role: "business"}),
    db.doc("users/admin").set({role: "admin"}),
    db.doc("campaigns/campaign").set({businessId: "business", status: "active"}),
    db.doc("campaigns/otherCampaign").set({businessId: "business", status: "active"}),
    db.doc("campaignZones/zone").set({
      campaignId: "campaign", businessId: "business", assignedScalerId: "scaler",
      status: "assigned", zoneName: "Zone 1",
    }),
    db.doc("campaignZones/otherZone").set({
      campaignId: "otherCampaign", businessId: "business", assignedScalerId: "scaler",
      status: "assigned", zoneName: "Zone 2",
    }),
  ]);
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Run through the Firestore emulator script.");
});

beforeEach(async () => {
  const collections = await db.listCollections();
  for (const collection of collections) {
    const snapshots = await collection.listDocuments();
    for (const snapshot of snapshots) await db.recursiveDelete(snapshot);
  }
  await seed();
});

after(async () => {
  fft.cleanup();
  for (const app of getApps()) await app.delete();
});

test("anonymous, business, and unassigned scaler cannot start", async () => {
  await assert.rejects(start(null), (error) => error.code === "unauthenticated");
  await assert.rejects(start("business"), (error) => error.code === "permission-denied");
  await assert.rejects(start("other"), (error) => error.code === "permission-denied");
});

test("duplicate and simultaneous same start recover exactly one session", async () => {
  const [a, b] = await Promise.all([start(), start()]);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal((await db.collection("trackingSessions").get()).size, 1);
  assert.equal((await start()).sessionId, a.sessionId);
});

test("simultaneous different jobs cannot create two active sessions", async () => {
  const results = await Promise.allSettled([
    start(), start("scaler", "otherCampaign", "otherZone"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await db.collection("trackingSessions").get()).size, 1);
});

test("stale active pointer is cleaned and replaced server-side", async () => {
  await db.doc("activeTrackingSessions/scaler").set({sessionId: "missing"});
  const result = await start();
  assert.notEqual(result.sessionId, "missing");
  assert.equal((await db.doc("activeTrackingSessions/scaler").get()).data().sessionId, result.sessionId);
});

test("valid chunk is ordered, exact retry is harmless, conflicting retry fails", async () => {
  const {sessionId} = await start();
  const points = [point(1), point(2)];
  assert.deepEqual(await upload(sessionId, points), {duplicate: false, endSequence: 2});
  assert.deepEqual(await upload(sessionId, points), {duplicate: true, endSequence: 2});
  const changed = [point(1), {...point(2), latitude: 39.5}];
  await assert.rejects(upload(sessionId, changed), (error) => error.code === "already-exists");
  assert.equal((await db.doc(`trackingSessions/${sessionId}`).get()).data().pointCount, 2);
});

test("gap, backwards, overlap, and duplicate internal sequences are rejected", async () => {
  const {sessionId} = await start();
  await upload(sessionId, [point(1), point(2)]);
  await assert.rejects(upload(sessionId, [point(4)]), (error) => error.code === "failed-precondition");
  await assert.rejects(upload(sessionId, [point(2), point(3)]));
  await assert.rejects(upload(sessionId, [point(1)]));
  await assert.rejects(upload(sessionId, [point(3), point(3)]),
    (error) => error.code === "invalid-argument");
});

test("concurrent next chunks accept only the authoritative next range", async () => {
  const {sessionId} = await start();
  await upload(sessionId, [point(1)]);
  const results = await Promise.allSettled([
    upload(sessionId, [point(2)]),
    upload(sessionId, [point(2), point(3)]),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const session = (await db.doc(`trackingSessions/${sessionId}`).get()).data();
  assert.ok(session.nextExpectedSequence === 3 || session.nextExpectedSequence === 4);
});

test("complete is idempotent and terminal state rejects late evidence", async () => {
  const {sessionId} = await start();
  await upload(sessionId, [point(1), point(2)]);
  const [a, b] = await Promise.all([
    call(functions.completeTrackingSession, "scaler", {sessionId}),
    call(functions.completeTrackingSession, "scaler", {sessionId}),
  ]);
  assert.equal(a.routeId, sessionId);
  assert.equal(b.routeId, sessionId);
  assert.equal((await db.doc(`trackingSessions/${sessionId}`).get()).data().status, "completed");
  await assert.rejects(upload(sessionId, [point(3)]),
    (error) => error.code === "failed-precondition");
  const cancel = await call(functions.cancelTrackingSession, "scaler", {sessionId, reason: "late"});
  assert.equal(cancel.status, "completed");
});

test("cancel is idempotent, terminal, and cannot be overwritten by completion", async () => {
  const {sessionId} = await start();
  const [a, b] = await Promise.all([
    call(functions.cancelTrackingSession, "scaler", {sessionId, reason: "user"}),
    call(functions.cancelTrackingSession, "scaler", {sessionId, reason: "user"}),
  ]);
  assert.equal(a.status, "cancelled");
  assert.equal(b.status, "cancelled");
  await assert.rejects(call(functions.completeTrackingSession, "scaler", {sessionId}),
    (error) => error.code === "failed-precondition");
  await assert.rejects(upload(sessionId, [point(1)]),
    (error) => error.code === "failed-precondition");
});

test("transactional resource ceilings reject further evidence", async () => {
  const {sessionId} = await start();
  await db.doc(`trackingSessions/${sessionId}`).update({
    pointCount: 21600, uploadedPointCount: 21600, chunkCount: 432,
    nextExpectedSequence: 1, startedAt: Timestamp.now(),
  });
  await assert.rejects(upload(sessionId, [point(1)]),
    (error) => error.code === "resource-exhausted");
});

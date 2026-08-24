"use strict";

const assert = require("node:assert/strict");
const {after, before, beforeEach, test} = require("node:test");
const fftFactory = require("firebase-functions-test");
const {getApps} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

process.env.GCLOUD_PROJECT ||= "demo-scaledcircle";
process.env.GOOGLE_CLOUD_PROJECT ||= "demo-scaledcircle";

const fft = fftFactory({
  projectId: "demo-scaledcircle",
  storageBucket: "demo-scaledcircle.appspot.com",
});
const functions = require("./index");
const {classifyCutoffAction} = require("./operational_layer");
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
    db.doc("legalConsents/scaler_location_notice_location-notice-2026-08-v1").set({
      uid: "scaler", userRole: "scaler", agreementType: "location_notice",
      agreementVersion: "location-notice-2026-08-v1", source: "scaler_tracking",
      acceptedAt: Timestamp.now(),
    }),
    db.doc("campaigns/campaign").set({
      businessId: "business",
      status: "active",
      timeZone: "UTC",
      workWindowStart: "00:00",
      workWindowEnd: "23:59",
    }),
    db.doc("campaigns/otherCampaign").set({
      businessId: "business",
      status: "active",
      timeZone: "UTC",
      workWindowStart: "00:00",
      workWindowEnd: "23:59",
    }),
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

test("current location notice is required only when creating a new session", async () => {
  const consent = db.doc(
    "legalConsents/scaler_location_notice_location-notice-2026-08-v1",
  );
  await consent.delete();
  await assert.rejects(start(), (error) =>
    error.code === "failed-precondition" &&
    error.details?.reason === "LEGAL_CONSENT_REQUIRED" &&
    error.details?.missing?.[0]?.version === "location-notice-2026-08-v1");
  assert.equal((await db.collection("trackingSessions").get()).empty, true);

  await consent.set({
    uid: "scaler", userRole: "scaler", agreementType: "location_notice",
    agreementVersion: "location-notice-2026-08-v1", source: "scaler_tracking",
    acceptedAt: Timestamp.now(),
  });
  const active = await start();
  await consent.delete();
  const recovered = await start();
  assert.equal(recovered.sessionId, active.sessionId);
  assert.equal(recovered.recovered, true);
});

test("duplicate and simultaneous same start recover exactly one session", async () => {
  const [a, b] = await Promise.all([start(), start()]);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal(a.workWindowCutoffAtMs > Date.now(), true);
  assert.equal(b.workWindowCutoffAtMs > Date.now(), true);
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

test("work cutoff pauses one session, next window resumes a new immutable segment", async () => {
  await db.doc("assignmentCompensations/zone").set({
    campaignId: "campaign", zoneId: "zone", businessId: "business", scalerId: "scaler",
    baseAmountCents: 10000, bonusAmountCents: 0, currency: "usd", contractVersion: 1,
  });
  const first = await start();
  await upload(first.sessionId, [point(1), point(2)]);
  await db.doc("campaignZones/zone").update({
    workWindowWarningAt: Timestamp.fromMillis(Date.now() - 60_000),
    workWindowCutoffAt: Timestamp.fromMillis(Date.now() - 1_000),
  });
  const beforeCutoff = (await db.doc("campaignZones/zone").get()).data();
  assert.equal(beforeCutoff.status, "in_progress");
  assert.equal(beforeCutoff.workWindowCutoffAt.toMillis() < Date.now(), true);
  assert.equal(classifyCutoffAction({
    status: beforeCutoff.status, now: new Date(),
    warningAt: beforeCutoff.workWindowWarningAt,
    cutoffAt: beforeCutoff.workWindowCutoffAt,
  }), "pause");
  assert.equal((await db.collection("campaignZones").where("status", "==", "in_progress").get()).size, 1);

  const cutoffResult = await functions.enforceOperationalWorkCutoffs.__testRun();
  assert.deepEqual(cutoffResult, {
    scanned: 1, warned: 0, paused: 1, skipped: 0,
    groupParticipantsScanned: 0,
  });

  const pausedZone = (await db.doc("campaignZones/zone").get()).data();
  const pausedSession = (await db.doc(`trackingSessions/${first.sessionId}`).get()).data();
  assert.equal(pausedZone.status, "paused_work_window");
  assert.equal(pausedZone.resumableTrackingSessionId, first.sessionId);
  assert.equal(pausedZone.gpsTracking, false);
  assert.equal(pausedSession.status, "paused");
  assert.equal((await db.doc(`trackingSessions/${first.sessionId}/segments/segment_0001`).get())
    .data().status, "closed_cutoff");
  assert.equal((await db.collection("scalerTransfers").get()).size, 0);
  assert.equal((await db.collection("campaignCompletions").get()).size, 0);

  const resumed = await start();
  assert.equal(resumed.sessionId, first.sessionId);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.segmentId, "segment_0002");
  assert.equal((await start()).segmentId, undefined);
  assert.equal((await db.doc(`trackingSessions/${first.sessionId}`).get())
    .data().currentSegmentId, "segment_0002");
  await upload(first.sessionId, [point(3), point(4)]);
  const completed = await call(functions.completeTrackingSession, "scaler", {sessionId: first.sessionId});
  assert.equal(completed.routeId, first.sessionId);
  const route = (await db.doc(`campaignRoutes/${first.sessionId}`).get()).data();
  assert.equal(route.points.length, 4);
  assert.equal(route.trackingSegmentCount, 2);
  assert.equal((await db.doc(`trackingSessions/${first.sessionId}/segments/segment_0002`).get())
    .data().status, "completed");
  assert.equal((await db.collection("assignmentCompensations").get()).size, 1);
  assert.equal((await db.collection("scalerTransfers").get()).size, 0);
});

test("next-window start reconciles a missed scheduled cutoff into a new segment", async () => {
  const first = await start();
  await upload(first.sessionId, [point(1), point(2)]);
  const expired = Timestamp.fromMillis(Date.now() - 1_000);
  await Promise.all([
    db.doc("campaignZones/zone").update({workWindowCutoffAt: expired}),
    db.doc(`trackingSessions/${first.sessionId}`).update({workWindowCutoffAt: expired}),
  ]);

  const resumed = await start();
  assert.equal(resumed.sessionId, first.sessionId);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.segmentId, "segment_0002");
  assert.equal((await db.doc(`trackingSessions/${first.sessionId}/segments/segment_0001`).get())
    .data().status, "closed_cutoff");
  assert.equal((await db.doc(`trackingSessions/${first.sessionId}/segments/segment_0002`).get())
    .data().status, "active");
  assert.equal((await db.collection("trackingSessions").get()).size, 1);
  assert.equal((await db.collection("campaignCompletions").get()).size, 0);
  assert.equal((await db.collection("scalerTransfers").get()).size, 0);
});

async function seedPausedSession() {
  await db.doc("campaignZones/zone").update({
    status: "paused_work_window", resumableTrackingSessionId: "paused-session",
  });
  await db.doc("trackingSessions/paused-session").set({
    campaignId: "campaign", zoneId: "zone", businessId: "business", scalerId: "scaler",
    status: "paused", syncStatus: "paused_work_window", segmentCount: 1,
    nextExpectedSequence: 1, pointCount: 0, chunkCount: 0, startedAt: Timestamp.now(),
  });
  await db.doc("trackingSessions/paused-session/segments/segment_0001").set({
    segmentId: "segment_0001", segmentIndex: 1, status: "closed_cutoff",
  });
}

test("paused tracking rejects early, expired, other-scaler, and cancelled resumes", async () => {
  await seedPausedSession();
  const nowHour = new Date().getUTCHours();
  const pad = (value) => String(value).padStart(2, "0");
  await db.doc("campaigns/campaign").update({
    workWindowStart: `${pad((nowHour + 1) % 24)}:00`,
    workWindowEnd: `${pad((nowHour + 2) % 24)}:00`,
  });
  await assert.rejects(start(), (error) => error.code === "failed-precondition");

  await db.doc("campaigns/campaign").update({
    workWindowStart: "00:00", workWindowEnd: "23:59",
    deadline: Timestamp.fromMillis(Date.now() - 1_000),
  });
  await assert.rejects(start(), (error) => error.code === "failed-precondition");
  await assert.rejects(start("other"), (error) => error.code === "permission-denied");

  await db.doc("campaigns/campaign").update({deadline: null});
  await db.doc("campaignZones/zone").update({status: "cancelled"});
  await assert.rejects(start(), (error) => error.code === "failed-precondition");
});

test("group Business delivery receipt changes only the participant handoff", async () => {
  const groupAssignment = require("./group_assignment");
  const participantId = groupAssignment.participantId("group-zone", "scaler");
  const otherParticipantId = groupAssignment.participantId("group-zone", "other");
  const handoffId = `group-zone__${participantId}`;
  const otherHandoffId = `group-zone__${otherParticipantId}`;
  await Promise.all([
    db.doc("campaignZones/group-zone").set({
      campaignId: "campaign", businessId: "business",
      assignedScalerIds: ["scaler", "other"], status: "assigned",
    }),
    db.doc("jobRooms/group-zone").set({
      campaignId: "campaign", zoneId: "group-zone", businessId: "business",
      scalerIds: ["scaler", "other"], status: "open",
    }),
    db.doc(`zoneScalerParticipations/${participantId}`).set({
      participantId, zoneId: "group-zone", campaignId: "campaign",
      businessId: "business", scalerUid: "scaler", materialHandoffId: handoffId,
      status: "accepted",
    }),
    db.doc(`zoneScalerParticipations/${otherParticipantId}`).set({
      participantId: otherParticipantId, zoneId: "group-zone", campaignId: "campaign",
      businessId: "business", scalerUid: "other", materialHandoffId: otherHandoffId,
      status: "accepted",
    }),
    db.doc(`materialHandoffs/${handoffId}`).set({
      zoneId: "group-zone", campaignId: "campaign", businessId: "business",
      scalerId: "scaler", fulfillmentType: "business_delivery", required: true,
      status: "scheduled",
    }),
    db.doc(`materialHandoffs/${otherHandoffId}`).set({
      zoneId: "group-zone", campaignId: "campaign", businessId: "business",
      scalerId: "other", fulfillmentType: "business_delivery", required: true,
      status: "scheduled",
    }),
  ]);
  const businessResult = await call(functions.transitionMaterialHandoff, "business", {
    zoneId: "group-zone", handoffId, nextStatus: "received",
  });
  assert.equal(businessResult.status, "handoff_in_progress");
  let participantHandoff = (await db.doc(`materialHandoffs/${handoffId}`).get()).data();
  assert.ok(participantHandoff.businessConfirmedAt);
  assert.equal(participantHandoff.businessConfirmedBy, "business");
  assert.equal(participantHandoff.scalerConfirmedAt, undefined);
  assert.equal(participantHandoff.arrivalProof, undefined);
  const result = await call(functions.transitionMaterialHandoff, "scaler", {
    zoneId: "group-zone", handoffId, nextStatus: "received",
  });
  assert.equal(result.status, "received");
  participantHandoff = (await db.doc(`materialHandoffs/${handoffId}`).get()).data();
  assert.equal(participantHandoff.status, "received");
  assert.ok(participantHandoff.scalerConfirmedAt);
  assert.equal(participantHandoff.scalerConfirmedBy, "scaler");
  assert.ok(participantHandoff.receivedAt);
  assert.equal((await db.doc(`materialHandoffs/${otherHandoffId}`).get()).data().status, "scheduled");
  assert.equal((await db.doc(`notifications/material-received_${handoffId}`).get()).exists, true);
  await call(functions.transitionMaterialHandoff, "scaler", {
    zoneId: "group-zone", handoffId, nextStatus: "received",
  });
  assert.equal((await db.collection("notifications")
    .where("type", "==", "material_received").get()).size, 1);
  await assert.rejects(call(functions.transitionMaterialHandoff, "other", {
    zoneId: "group-zone", handoffId, nextStatus: "received",
  }), (error) => error.code === "permission-denied");
  assert.equal((await db.collection("trackingSessions").get()).size, 0);
  assert.equal((await db.collection("campaignCompletions").get()).size, 0);
  assert.equal((await db.collection("scalerTransfers").get()).size, 0);
});

test("Business delivery confirmation cannot forge participant receipt", async () => {
  const handoffId = "zone-business-delivery";
  await Promise.all([
    db.doc("jobRooms/zone-business-delivery").set({
      campaignId: "campaign", zoneId: "zone-business-delivery",
      businessId: "business", scalerId: "scaler", status: "open",
    }),
    db.doc(`materialHandoffs/${handoffId}`).set({
      zoneId: "zone-business-delivery", campaignId: "campaign",
      businessId: "business", scalerId: "scaler", required: true,
      fulfillmentType: "business_delivery", status: "scheduled",
    }),
  ]);
  const result = await call(functions.transitionMaterialHandoff, "business", {
    zoneId: "zone-business-delivery", handoffId,
    nextStatus: "received",
  });
  assert.equal(result.status, "handoff_in_progress");
  assert.notEqual((await db.doc(`materialHandoffs/${handoffId}`).get()).data().status, "received");
});

test("all physical fulfillment methods use location-free dual confirmation", async () => {
  for (const fulfillmentType of [
    "business_delivery", "scaler_pickup_business", "scaler_pickup_print_shop",
  ]) {
    const suffix = fulfillmentType.replaceAll("_", "-");
    const zoneId = `zone-${suffix}`;
    const handoffId = `handoff-${suffix}`;
    await Promise.all([
      db.doc(`jobRooms/${zoneId}`).set({
        campaignId: "campaign", zoneId, businessId: "business",
        scalerId: "scaler", status: "open",
      }),
      db.doc(`materialHandoffs/${handoffId}`).set({
        zoneId, campaignId: "campaign", businessId: "business", scalerId: "scaler",
        required: true, fulfillmentType, status: "scheduled",
      }),
    ]);
    assert.equal((await call(functions.transitionMaterialHandoff, "scaler", {
      zoneId, handoffId, nextStatus: "received",
    })).status, "handoff_in_progress");
    const oneSided = (await db.doc(`materialHandoffs/${handoffId}`).get()).data();
    assert.equal(oneSided.status, "handoff_in_progress");
    assert.equal(oneSided.proof, undefined);
    assert.equal(oneSided.arrivalProof, undefined);
    assert.equal((await call(functions.transitionMaterialHandoff, "business", {
      zoneId, handoffId, nextStatus: "received",
    })).status, "received");
  }
});

test("business handoff fault reserves one $50/$50 split and blocks later settlement", async () => {
  const old = Timestamp.fromMillis(Date.now() - 20 * 60 * 1000);
  await Promise.all([
    db.doc("campaigns/campaign").update({
      status: "active", fundingPaymentId: "payment-one", workerAmountCents: 10000,
    }),
    db.doc("campaignZones/zone").update({
      status: "accepted", fundingPaymentId: "payment-one", assignedScalerId: "scaler",
    }),
    db.doc("assignmentCompensations/zone").set({
      campaignId: "campaign", zoneId: "zone", businessId: "business", scalerId: "scaler",
      baseAmountCents: 10000, bonusAmountCents: 0, currency: "usd", contractVersion: 1,
    }),
    db.doc("materialHandoffs/zone").set({
      zoneId: "zone", campaignId: "campaign", businessId: "business", scalerId: "scaler",
      fulfillmentType: "business_pickup", status: "waiting_for_counterparty",
      scheduledAt: old, arrivedAt: old, arrivalProof: {latitude: 39, longitude: -76},
      // Deliberately false/stale: the funded campaignPayment must remain the
      // authority for the retained fee.
      platformFeeCents: 9999,
    }),
    db.doc("jobRooms/zone").set({
      zoneId: "zone", campaignId: "campaign", businessId: "business", scalerId: "scaler",
      status: "assigned",
    }),
    db.doc("campaignPayments/payment-one").set({
      campaignId: "campaign", businessId: "business", status: "funded", currency: "usd",
      workerAmountCents: 10000, platformFeeCents: 2000, businessChargeCents: 12000,
      transferredWorkerAmountCents: 0, refundedWorkerAmountCents: 0,
      reservedWorkerAmountCents: 0, platformFeeRecognizedCents: 0,
      platformFeeRefundedCents: 0, platformFeePendingCents: 2000,
      settlementFrozen: false,
    }),
  ]);

  const results = await Promise.all([
    call(functions.reportMaterialHandoffFailure, "scaler", {
      zoneId: "zone", failureType: "failed_business", summary: "Business did not arrive.",
    }),
    call(functions.reportMaterialHandoffFailure, "scaler", {
      zoneId: "zone", failureType: "failed_business", summary: "Duplicate support report.",
    }),
  ]);
  assert.equal(results.length, 2);
  const operation = (await db.doc("financialOperations/business-no-show_zone").get()).data();
  assert.equal(operation.scalerCompensationCents, 5000);
  assert.equal(operation.workerRefundCents, 5000);
  assert.equal(operation.platformRetainedCents, 2000);
  const payment = (await db.doc("campaignPayments/payment-one").get()).data();
  assert.equal(payment.reservedWorkerAmountCents, 10000);
  assert.equal(payment.platformFeeRecognizedCents, 2000);
  assert.equal(payment.platformFeePendingCents, 0);
  assert.equal(payment.transferredWorkerAmountCents + payment.refundedWorkerAmountCents +
    payment.reservedWorkerAmountCents, payment.workerAmountCents);
  const zone = (await db.doc("campaignZones/zone").get()).data();
  assert.equal(zone.status, "failed_business");
  assert.equal(zone.settlementBlocked, true);

  await Promise.all([
    db.doc("campaignRoutes/failed-route").set({
      campaignId: "campaign", zoneId: "zone", businessId: "business",
      scalerId: "scaler", tracking: false, points: [],
    }),
    db.doc("campaignCompletions/failed-completion").set({
      campaignId: "campaign", zoneId: "zone", businessId: "business",
      scalerId: "scaler", routeId: "failed-route", status: "draft",
    }),
  ]);
  await assert.rejects(call(functions.submitZoneCompletion, "scaler", {
    completionId: "failed-completion",
  }), (error) => error.code === "failed-precondition");

  await assert.rejects(call(functions.createScalerTransfer, "business", {zoneId: "zone"}),
    (error) => error.code === "failed-precondition");
  await assert.rejects(call(functions.requestCampaignCancellationRefund, "business", {
    campaignId: "campaign",
  }), (error) => ["failed-precondition", "internal"].includes(error.code));
  assert.equal((await db.collection("scalerTransfers").get()).size, 0);
  assert.equal((await db.collection("financialOperations")
    .where("type", "==", "campaign_refund").get()).size, 0);
});

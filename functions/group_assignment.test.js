"use strict";
const assert = require("node:assert/strict"); const test = require("node:test");
const group = require("./group_assignment");

test("single Scaler default preserves the full worker pool", () => {
  const value = group.validateGroupConfiguration({workerPoolCents: 40000,
    requiredScalerCount: 1, estimatedGroupWorkMinutes: 360});
  assert.deepEqual(value.initialSharesCents, [40000]);
});
test("group pool does not multiply and cent division is deterministic", () => {
  assert.deepEqual(group.splitCents(40000, 4), [10000, 10000, 10000, 10000]);
  assert.deepEqual(group.splitCents(10000, 3), [3334, 3333, 3333]);
});
test("minimum participant share prevents unreasonable group size", () => {
  assert.throws(() => group.validateGroupConfiguration({workerPoolCents: 2000,
    requiredScalerCount: 10, estimatedGroupWorkMinutes: 60}), /below_minimum/);
});
test("slots cannot overfill or duplicate a Scaler and replacement reuses slot", () => {
  const participants = [{scalerUid: "a", slotNumber: 1, status: "accepted"}];
  assert.throws(() => group.assertSlotAvailable({requiredScalerCount: 2, participants, scalerUid: "a"}), /duplicate/);
  assert.equal(group.assertSlotAvailable({requiredScalerCount: 2, participants, scalerUid: "b"}), 2);
  assert.equal(group.assertSlotAvailable({requiredScalerCount: 2, participants: [{...participants[0], status: "cancelled_before_window"}], scalerUid: "b"}), 1);
});
test("overlapping verified route cells are not double-counted", () => {
  const values = group.calculateVerifiedContributions([
    {participantId: "a", verifiedRoutePoints: [{latitude: 1, longitude: 1}, {latitude: 2, longitude: 2}]},
    {participantId: "b", verifiedRoutePoints: [{latitude: 1, longitude: 1}, {latitude: 3, longitude: 3}]},
  ]);
  assert.equal(values[0].groupCoverageUnits, 3);
  assert.equal(values.reduce((sum, item) => sum + item.participantContributionRatioBps, 0), 10000);
});
function participants(attendance = ["completed", "completed", "completed", "no_show"], weights = [1, 1, 1, 0]) {
  return attendance.map((state, index) => ({zoneId: "zone", participantId: String.fromCharCode(97 + index),
    initialShareCents: 10000, attendanceStatus: state, participantCoverageUnits: weights[index]}));
}
test("4 of 4 normal settlement pays each initial share", () => {
  const result = group.settleGroup({workerPoolCents: 40000, participants: participants(["completed", "completed", "completed", "completed"], [1, 1, 1, 1]), verifiedZoneCompletionBps: 10000});
  assert.deepEqual(result.allocations.map((item) => item.finalPayCents), [10000, 10000, 10000, 10000]);
});
test("3 of 4 full completion redistributes exactly with largest remainder", () => {
  const result = group.settleGroup({workerPoolCents: 40000, participants: participants(), verifiedZoneCompletionBps: 10000});
  assert.deepEqual(result.allocations.map((item) => item.finalPayCents), [13334, 13333, 13333]);
  assert.equal(result.finalWorkerPayCents, 40000);
});
test("75 percent unlocks while insufficient completion preserves pool for support", () => {
  assert.equal(group.settleGroup({workerPoolCents: 40000, participants: participants(), verifiedZoneCompletionBps: 7500}).settlementAllowed, true);
  const low = group.settleGroup({workerPoolCents: 40000, participants: participants(), verifiedZoneCompletionBps: 3500});
  assert.equal(low.settlementAllowed, false); assert.equal(low.noShowReallocationPoolCents, 10000);
});
test("2 of 4 full completion may divide full pool by verified contribution", () => {
  const result = group.settleGroup({workerPoolCents: 40000,
    participants: participants(["completed", "completed", "no_show", "no_show"], [3, 1, 0, 0]), verifiedZoneCompletionBps: 10000});
  assert.deepEqual(result.allocations.map((item) => item.finalPayCents), [25000, 15000]);
});
test("support hold business fault and cancellation take precedence", () => {
  const input = {workerPoolCents: 40000, participants: participants(), verifiedZoneCompletionBps: 10000};
  assert.equal(group.settleGroup({...input, supportHold: true}).settlementAllowed, false);
  assert.equal(group.settleGroup({...input, businessFault: true}).status, "blocked_by_business_fault");
  assert.equal(group.settleGroup({...input, cancelled: true}).status, "blocked_by_cancellation");
});

test("no-show requires the full grace period and authoritative absence", () => {
  const scheduledAt = new Date("2026-08-12T12:00:00.000Z");
  assert.equal(group.participantNoShowEligibility({scheduledAt,
    now: new Date("2026-08-12T12:14:59.000Z"), status: "accepted"}).eligible, false);
  assert.equal(group.participantNoShowEligibility({scheduledAt,
    now: new Date("2026-08-12T12:15:00.000Z"), status: "accepted"}).eligible, true);
  assert.equal(group.participantNoShowEligibility({scheduledAt,
    now: new Date("2026-08-12T12:30:00.000Z"), status: "accepted",
    hasAuthoritativeWorkEvidence: true}).reason, "work_evidence_exists");
  assert.equal(group.participantNoShowEligibility({scheduledAt,
    now: new Date("2026-08-12T12:30:00.000Z"), status: "accepted",
    supportHold: true}).reason, "support_hold");
});

test("settlement is deterministic and never reallocates platform money", () => {
  const participants = [
    {participantId: "a", zoneId: "z", initialShareCents: 10000,
      attendanceStatus: "completed", participantCoverageUnits: 1},
    {participantId: "b", zoneId: "z", initialShareCents: 10000,
      attendanceStatus: "completed", participantCoverageUnits: 1},
    {participantId: "c", zoneId: "z", initialShareCents: 10000,
      attendanceStatus: "completed", participantCoverageUnits: 1},
    {participantId: "d", zoneId: "z", initialShareCents: 10000,
      attendanceStatus: "no_show", participantCoverageUnits: 0},
  ];
  const first = group.settleGroup({workerPoolCents: 40000, participants,
    verifiedZoneCompletionBps: 10000});
  const retry = group.settleGroup({workerPoolCents: 40000, participants,
    verifiedZoneCompletionBps: 10000});
  assert.deepEqual(first, retry);
  assert.equal(first.finalWorkerPayCents, 40000);
  assert.equal(first.allocations.reduce((sum, item) => sum + item.finalPayCents, 0), 40000);
  assert.equal("platformFeeCents" in first, false);
});

test("allocation never accepts negative money or exceeds the worker pool", () => {
  assert.throws(() => group.splitCents(-1, 2), /non-negative integer cents/);
  assert.throws(() => group.settleGroup({workerPoolCents: 10000,
    verifiedZoneCompletionBps: 10000, participants: [
      {participantId: "a", zoneId: "z", initialShareCents: 10000,
        attendanceStatus: "completed", participantCoverageUnits: 1},
      {participantId: "b", zoneId: "z", initialShareCents: 10000,
        attendanceStatus: "completed", participantCoverageUnits: 1},
    ]}), /group_worker_allocation_exceeded/);
});

test("workload-aware participant policy accepts reasonable examples", () => {
  const four = group.validateGroupConfiguration({workerPoolCents: 40000,
    requiredScalerCount: 4, estimatedGroupWorkMinutes: 360});
  assert.deepEqual(four.initialSharesCents, [10000, 10000, 10000, 10000]);
  assert.equal(four.minimumParticipantPolicyVersion,
    group.MINIMUM_PARTICIPANT_POLICY_VERSION);
  assert.equal(four.recommendedScalerCount, 1);

  const twelve = group.validateGroupConfiguration({workerPoolCents: 30000,
    requiredScalerCount: 12, estimatedGroupWorkMinutes: 360});
  assert.equal(twelve.estimatedIndividualShareCents, 2500);

  const fourSmall = group.validateGroupConfiguration({workerPoolCents: 10000,
    requiredScalerCount: 4, estimatedGroupWorkMinutes: 240});
  assert.deepEqual(fourSmall.initialSharesCents, [2500, 2500, 2500, 2500]);
});

test("workload-aware participant policy rejects unreasonable splits", () => {
  assert.throws(() => group.validateGroupConfiguration({workerPoolCents: 10000,
    requiredScalerCount: 12, estimatedGroupWorkMinutes: 360}), /below_minimum/);
  assert.throws(() => group.validateGroupConfiguration({workerPoolCents: 10000,
    requiredScalerCount: 4, estimatedGroupWorkMinutes: 360,
    recommendedWorkerPoolCents: 20000}), /workload_minimum/);
});

test("78 percent settlement remains 78 percent while allocating the worker pool", () => {
  const result = group.settleGroup({workerPoolCents: 40000, participants: participants(),
    verifiedZoneCompletionBps: 7800});
  assert.equal(result.verifiedZoneCompletionBps, 7800);
  assert.equal(result.finalWorkerPayCents, 40000);
  assert.equal(result.completionClassification, "substantial_verified_completion");
});

test("74 percent remains incomplete and does not unlock the no-show pool", () => {
  const result = group.settleGroup({workerPoolCents: 40000, participants: participants(),
    verifiedZoneCompletionBps: 7400});
  assert.equal(result.settlementAllowed, false);
  assert.equal(result.finalWorkerPayCents, 30000);
  assert.equal(result.unresolvedWorkerCents, 10000);
  assert.equal(result.completionClassification, "incomplete_support_review");
});

test("required Business and Scaler disclosures describe conditional settlement", () => {
  assert.match(group.BUSINESS_GROUP_POLICY_DISCLOSURE, /at least 75%/);
  assert.match(group.BUSINESS_GROUP_POLICY_DISCLOSURE, /does not increase/);
  assert.match(group.SCALER_GROUP_POLICY_DISCLOSURE, /not guaranteed/);
  assert.match(group.SCALER_GROUP_POLICY_DISCLOSURE, /cannot exceed the funded worker pool/);
});

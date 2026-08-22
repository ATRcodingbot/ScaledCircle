"use strict";

const crypto = require("node:crypto");

const GROUP_ASSIGNMENT_VERSION = "ZoneGroupAssignmentV1";
const GROUP_SETTLEMENT_POLICY_VERSION = "GroupSettlementPolicyV1";
const VERIFIED_CONTRIBUTION_VERSION = "VerifiedUniqueRouteCellsV1";
const SUBSTANTIAL_COMPLETION_THRESHOLD_BPS = 7500;
const MINIMUM_PARTICIPANT_POLICY_VERSION = "WorkloadAwareParticipantMinimumV1";
const PLATFORM_FEE_CONTRACT_VERSION = "MarketplacePlatformFeeV1";
// Existing product recommendations cluster around $25/hour. This conservative
// one-hour floor is a scheduling guard, not a wage or employment classification.
const MINIMUM_PARTICIPANT_SHARE_CENTS = 2500;
const MAX_GROUP_SCALERS = 12;
const PARTICIPANT_NO_SHOW_GRACE_MINUTES = 15;
const BUSINESS_GROUP_POLICY_DISCLOSURE = "Group jobs reserve one total worker-pay amount. If an assigned Scaler does not participate and the remaining team substantially completes at least 75% of the verified area, the absent Scaler's reserved share may be redistributed to the Scalers who performed the work. This does not increase your funded worker-pay amount.";
const SCALER_GROUP_POLICY_DISCLOSURE = "Your scheduled share is fixed before acceptance. No-show pay is not guaranteed; final pay may increase only after verified contribution and settlement, and total group pay cannot exceed the funded worker pool.";

function cents(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) {
    throw new Error(`${field} must be non-negative integer cents.`);
  }
  return value;
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_GROUP_SCALERS) {
    throw new Error(`requiredScalerCount must be between 1 and ${MAX_GROUP_SCALERS}.`);
  }
  return value;
}

function deterministicId(...parts) {
  return crypto.createHash("sha256").update(parts.map(String).join("|")).digest("hex").slice(0, 40);
}

function splitCents(totalCents, participantCount) {
  const total = cents(totalCents, "workerPoolCents"); count(participantCount);
  const base = Math.floor(total / participantCount); const remainder = total % participantCount;
  return Array.from({length: participantCount}, (_, index) => base + (index < remainder ? 1 : 0));
}

function recommendedWorkerPoolForMinutes(estimatedGroupWorkMinutes) {
  if (!Number.isSafeInteger(estimatedGroupWorkMinutes) || estimatedGroupWorkMinutes < 1 ||
      estimatedGroupWorkMinutes > 360) throw new Error("estimatedGroupWorkMinutes is invalid.");
  // Mirrors the existing $25/hour planning recommendation, rounded to the
  // nearest $5 with a $25 floor. This is a marketplace reasonableness guard,
  // not an hourly wage or earnings guarantee.
  const raw = estimatedGroupWorkMinutes * 2500 / 60;
  return Math.max(2500, Math.round(raw / 500) * 500);
}

function validateGroupConfiguration({workerPoolCents, requiredScalerCount,
  estimatedGroupWorkMinutes, recommendedWorkerPoolCents,
  minimumParticipantShareCents = MINIMUM_PARTICIPANT_SHARE_CENTS}) {
  const pool = cents(workerPoolCents, "workerPoolCents"); const required = count(requiredScalerCount ?? 1);
  const absoluteMinimum = cents(minimumParticipantShareCents, "minimumParticipantShareCents");
  const workloadMinutes = Number(estimatedGroupWorkMinutes);
  if (!Number.isSafeInteger(workloadMinutes) || workloadMinutes < 1 || workloadMinutes > 360) {
    throw new Error("estimatedGroupWorkMinutes is invalid.");
  }
  const recommendation = recommendedWorkerPoolCents == null ?
    recommendedWorkerPoolForMinutes(workloadMinutes) :
    cents(recommendedWorkerPoolCents, "recommendedWorkerPoolCents");
  const workloadMinimum = Math.ceil(recommendation / required);
  const minimum = Math.max(absoluteMinimum, workloadMinimum);
  if (pool <= 0 || minimum <= 0) throw new Error("Worker pool and participant minimum must be positive.");
  const maximumScalerCountForPool = Math.min(MAX_GROUP_SCALERS,
    Math.floor(pool / absoluteMinimum));
  if (required > maximumScalerCountForPool) throw new Error("participant_share_below_minimum");
  const shares = splitCents(pool, required);
  if (shares.some((share) => share < minimum)) throw new Error("participant_share_below_workload_minimum");
  return {requiredScalerCount: required, workerPoolCents: pool, initialSharesCents: shares,
    estimatedIndividualShareCents: Math.floor(pool / required), maximumScalerCountForPool,
    minimumParticipantShareCents: minimum,
    absoluteMinimumParticipantShareCents: absoluteMinimum,
    workloadBasedMinimumParticipantShareCents: workloadMinimum,
    estimatedGroupWorkMinutes: workloadMinutes,
    estimatedParticipantMinutes: Math.ceil(workloadMinutes / required),
    recommendedWorkerPoolCents: recommendation,
    minimumParticipantPolicyVersion: MINIMUM_PARTICIPANT_POLICY_VERSION,
    recommendedScalerCount: 1,
    version: GROUP_ASSIGNMENT_VERSION};
}

function participantId(zoneId, scalerUid) {
  if (!zoneId || !scalerUid) throw new Error("Zone and Scaler are required.");
  return `participant_${deterministicId(zoneId, scalerUid)}`;
}

function initialParticipant({zoneId, campaignId, businessId, scalerUid, slotNumber, shareCents}) {
  count(slotNumber); cents(shareCents, "initialShareCents");
  return {participantId: participantId(zoneId, scalerUid), zoneId, campaignId, businessId, scalerUid,
    slotNumber, initialShareCents: shareCents, status: "accepted", attendanceStatus: "scheduled",
    finalPayCents: 0, reallocatedPayCents: 0, settlementStatus: "unsettled",
    compensationVersion: 1, immutableCompensation: true};
}

function assertSlotAvailable({requiredScalerCount, participants, scalerUid}) {
  count(requiredScalerCount);
  const active = participants.filter((item) => !["declined", "cancelled_before_window", "replaced"].includes(item.status));
  if (active.some((item) => item.scalerUid === scalerUid)) throw new Error("duplicate_participation");
  if (active.length >= requiredScalerCount) throw new Error("group_slots_full");
  const used = new Set(active.map((item) => item.slotNumber));
  for (let slot = 1; slot <= requiredScalerCount; slot += 1) if (!used.has(slot)) return slot;
  throw new Error("group_slots_full");
}

function routeCell(point, precision = 5) {
  const latitude = Number(point?.latitude); const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(precision)}:${longitude.toFixed(precision)}`;
}

function calculateVerifiedContributions(participants) {
  const ownership = new Map();
  const normalized = participants.map((participant) => {
    const uniqueCells = new Set((participant.verifiedRoutePoints || []).map(routeCell).filter(Boolean));
    for (const cell of uniqueCells) {
      const owners = ownership.get(cell) || []; owners.push(participant.participantId); ownership.set(cell, owners);
    }
    return {...participant, uniqueCells};
  });
  const units = new Map(normalized.map((item) => [item.participantId, 0]));
  for (const owners of ownership.values()) {
    // One route cell is one group unit. Overlap is shared rather than counted
    // repeatedly, with deterministic micro-unit allocation by participant ID.
    const ordered = [...owners].sort(); const micro = 1000000;
    const base = Math.floor(micro / ordered.length); let remainder = micro % ordered.length;
    for (const id of ordered) units.set(id, units.get(id) + base + (remainder-- > 0 ? 1 : 0));
  }
  const totalMicroUnits = [...units.values()].reduce((sum, value) => sum + value, 0);
  return normalized.map((item) => ({participantId: item.participantId,
    participantCoverageUnits: units.get(item.participantId), groupCoverageUnits: ownership.size,
    participantContributionRatioBps: totalMicroUnits ? Math.floor(units.get(item.participantId) * 10000 / totalMicroUnits) : 0,
    verifiedContributionVersion: VERIFIED_CONTRIBUTION_VERSION}));
}

function allocateProportionally(totalCents, weightedParticipants) {
  const total = cents(totalCents, "allocationCents");
  const ordered = [...weightedParticipants].sort((a, b) => String(a.participantId).localeCompare(String(b.participantId)));
  const weightTotal = ordered.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
  if (total && weightTotal <= 0) throw new Error("verified_contribution_required");
  const shares = ordered.map((item) => {
    const numerator = total * Math.max(0, Number(item.weight) || 0);
    const floor = Math.floor(numerator / weightTotal);
    return {participantId: item.participantId, cents: floor, remainder: numerator - floor * weightTotal};
  });
  let remaining = total - shares.reduce((sum, item) => sum + item.cents, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.participantId.localeCompare(b.participantId));
  for (let index = 0; index < shares.length && remaining > 0; index += 1, remaining -= 1) shares[index].cents += 1;
  return shares.sort((a, b) => a.participantId.localeCompare(b.participantId));
}

function settleGroup({workerPoolCents, participants, verifiedZoneCompletionBps,
  supportHold = false, businessFault = false, cancelled = false,
  substantialCompletionThresholdBps = SUBSTANTIAL_COMPLETION_THRESHOLD_BPS,
  settlementPolicyVersion = GROUP_SETTLEMENT_POLICY_VERSION}) {
  const pool = cents(workerPoolCents, "workerPoolCents");
  if (!Number.isSafeInteger(verifiedZoneCompletionBps) || verifiedZoneCompletionBps < 0 || verifiedZoneCompletionBps > 10000) {
    throw new Error("verifiedZoneCompletionBps is invalid.");
  }
  if (businessFault) return {status: "blocked_by_business_fault", settlementAllowed: false};
  if (cancelled) return {status: "blocked_by_cancellation", settlementAllowed: false};
  if (supportHold) return {status: "support_review", settlementAllowed: false};
  const active = participants.filter((item) => ["started", "participating", "completed"].includes(item.attendanceStatus));
  const noShows = participants.filter((item) => item.attendanceStatus === "no_show");
  const baseTotal = active.reduce((sum, item) => sum + cents(item.initialShareCents, "initialShareCents"), 0);
  const noShowPool = noShows.reduce((sum, item) => sum + cents(item.initialShareCents, "initialShareCents"), 0);
  if (!Number.isSafeInteger(substantialCompletionThresholdBps) ||
      substantialCompletionThresholdBps < 1 || substantialCompletionThresholdBps > 10000) {
    throw new Error("substantialCompletionThresholdBps is invalid.");
  }
  const unlocked = verifiedZoneCompletionBps >= substantialCompletionThresholdBps;
  const redistribution = unlocked ? allocateProportionally(noShowPool,
    active.map((item) => ({participantId: item.participantId, weight: item.participantCoverageUnits || 0}))) : [];
  const reallocated = new Map(redistribution.map((item) => [item.participantId, item.cents]));
  const allocations = active.map((item) => ({participantId: item.participantId,
    initialPayCents: item.initialShareCents, reallocatedPayCents: reallocated.get(item.participantId) || 0,
    finalPayCents: item.initialShareCents + (reallocated.get(item.participantId) || 0)}));
  const finalWorkerPayCents = allocations.reduce((sum, item) => sum + item.finalPayCents, 0);
  if (finalWorkerPayCents > pool) throw new Error("group_worker_allocation_exceeded");
  return {status: unlocked ? "settlement_ready" : "support_review", settlementAllowed: unlocked,
    substantialCompletionThresholdBps,
    verifiedZoneCompletionBps, noShowReallocationPoolCents: noShowPool,
    unresolvedWorkerCents: pool - finalWorkerPayCents, initialParticipatingPayCents: baseTotal,
    completionClassification: verifiedZoneCompletionBps === 10000 ? "full_verified_completion" :
      unlocked ? "substantial_verified_completion" : "incomplete_support_review",
    finalWorkerPayCents, allocations, policyVersion: settlementPolicyVersion,
    operationId: `group-settlement_${deterministicId(participants[0]?.zoneId || "zone", 1)}`};
}

function participantNoShowEligibility({scheduledAt, now = new Date(), status,
  supportHold = false, hasAuthoritativeWorkEvidence = false}) {
  const scheduled = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(scheduled.getTime()) || !Number.isFinite(current.getTime())) {
    return {eligible: false, reason: "work_window_unavailable"};
  }
  if (supportHold) return {eligible: false, reason: "support_hold"};
  if (!['accepted', 'scheduled'].includes(String(status))) {
    return {eligible: false, reason: "participant_already_transitioned"};
  }
  if (hasAuthoritativeWorkEvidence) return {eligible: false, reason: "work_evidence_exists"};
  const eligibleAt = new Date(scheduled.getTime() + PARTICIPANT_NO_SHOW_GRACE_MINUTES * 60000);
  return current >= eligibleAt ? {eligible: true, eligibleAt} :
    {eligible: false, reason: "grace_period_active", eligibleAt};
}

module.exports = {GROUP_ASSIGNMENT_VERSION, GROUP_SETTLEMENT_POLICY_VERSION, VERIFIED_CONTRIBUTION_VERSION,
  MINIMUM_PARTICIPANT_POLICY_VERSION, PLATFORM_FEE_CONTRACT_VERSION,
  SUBSTANTIAL_COMPLETION_THRESHOLD_BPS, MINIMUM_PARTICIPANT_SHARE_CENTS, MAX_GROUP_SCALERS,
  PARTICIPANT_NO_SHOW_GRACE_MINUTES, BUSINESS_GROUP_POLICY_DISCLOSURE,
  SCALER_GROUP_POLICY_DISCLOSURE,
  splitCents, validateGroupConfiguration, participantId, initialParticipant, assertSlotAvailable,
  routeCell, calculateVerifiedContributions, allocateProportionally, settleGroup,
  participantNoShowEligibility, recommendedWorkerPoolForMinutes};

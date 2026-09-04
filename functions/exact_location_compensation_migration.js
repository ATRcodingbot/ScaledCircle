"use strict";

const crypto = require("node:crypto");

const MIGRATION_VERSION = "exact_location_compensation_migration_v1";
const CATEGORIES = Object.freeze({
  migratable: "A_DETERMINISTICALLY_MIGRATABLE",
  review: "B_REQUIRES_FOUNDER_BUSINESS_REVIEW",
  nonPayable: "C_MUST_REMAIN_NON_PAYABLE",
});

function cleanId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,256}$/.test(text) ? text : "";
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function deterministicContractId(campaignId, scalerId) {
  const campaign = cleanId(campaignId);
  const scaler = cleanId(scalerId);
  if (!campaign || !scaler) throw new Error("migration_assignment_identity_invalid");
  return `exact_assignment_${digest({campaign, scaler}).slice(0, 40)}_v1`;
}

function deterministicReceiptId(contractId) {
  const id = cleanId(contractId);
  if (!id) throw new Error("migration_contract_identity_invalid");
  return `exact_compensation_migration_${digest(id).slice(0, 40)}_v1`;
}

function validMoneyCents(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100000000;
}

function acceptedSnapshot(application) {
  const snapshot = application?.acceptedCompensation;
  if (!snapshot || snapshot.immutable !== true || snapshot.version !== 1 ||
      !validMoneyCents(snapshot.baseAmountCents) ||
      !validMoneyCents(snapshot.bonusAmountCents ?? 0) ||
      String(snapshot.currency || "").toLowerCase() !== "usd" ||
      !snapshot.acceptedAt || !cleanId(snapshot.sourceAuthorityId)) return null;
  return {
    baseAmountCents: snapshot.baseAmountCents,
    bonusAmountCents: snapshot.bonusAmountCents ?? 0,
    acceptedCounterofferAmountCents: validMoneyCents(snapshot.acceptedCounterofferAmountCents) ?
      snapshot.acceptedCounterofferAmountCents : null,
    currency: "usd",
    acceptedAt: snapshot.acceptedAt,
    sourceAuthorityId: cleanId(snapshot.sourceAuthorityId),
    sourceAuthorityVersion: String(snapshot.sourceAuthorityVersion || "v1"),
  };
}

function classifyLegacyAssignment(input) {
  const assignment = input?.assignment || {};
  const campaignId = cleanId(assignment.campaignId);
  const businessId = cleanId(assignment.businessId);
  const scalerId = cleanId(assignment.scalerId);
  const application = input?.application || {};
  const identityMatches = campaignId && businessId && scalerId &&
    (!application.campaignId || application.campaignId === campaignId) &&
    (!application.businessId || application.businessId === businessId) &&
    (!application.scalerId || application.scalerId === scalerId);
  if (input?.existingContract) {
    return {affected: false, category: null, reason: "contract_already_exists"};
  }
  if (!identityMatches || Number(input?.earningCount || 0) > 0 ||
      Number(input?.walletEffectCount || 0) > 0) {
    return {affected: true, category: CATEGORIES.nonPayable,
      reason: identityMatches ? "economic_effect_without_contract" : "assignment_identity_conflict"};
  }
  const accepted = acceptedSnapshot(application);
  if (application.status === "accepted" && application.acceptedAt && accepted) {
    return {affected: true, category: CATEGORIES.migratable,
      reason: "immutable_accepted_compensation_evidence", accepted};
  }
  if (application.status === "accepted" && application.acceptedAt) {
    return {affected: true, category: CATEGORIES.review,
      reason: "accepted_assignment_missing_immutable_compensation"};
  }
  return {affected: true, category: CATEGORIES.nonPayable,
    reason: "accepted_assignment_authority_missing"};
}

function buildMigrationPlan(input) {
  const classification = classifyLegacyAssignment(input);
  if (!classification.affected || classification.category !== CATEGORIES.migratable) {
    throw new Error("migration_not_deterministically_authorized");
  }
  const assignment = input.assignment;
  const locationIds = [...new Set((assignment.locationIds || []).map(cleanId).filter(Boolean))].sort();
  if (!locationIds.length || !cleanId(assignment.applicationId)) {
    throw new Error("migration_assignment_evidence_incomplete");
  }
  const contractId = deterministicContractId(assignment.campaignId, assignment.scalerId);
  const sourceEvidence = {
    campaignId: assignment.campaignId,
    businessId: assignment.businessId,
    scalerId: assignment.scalerId,
    applicationId: assignment.applicationId,
    locationIds,
    assignedAt: assignment.assignedAt,
    acceptedCompensation: classification.accepted,
  };
  const sourceEvidenceDigest = digest(sourceEvidence);
  const contract = {
    campaignId: assignment.campaignId,
    businessId: assignment.businessId,
    scalerId: assignment.scalerId,
    assignmentMode: "exact_locations",
    applicationId: assignment.applicationId,
    locationIds,
    currency: classification.accepted.currency,
    baseAmountCents: classification.accepted.baseAmountCents,
    bonusAmountCents: classification.accepted.bonusAmountCents,
    acceptedCounterofferAmountCents: classification.accepted.acceptedCounterofferAmountCents,
    acceptedAt: classification.accepted.acceptedAt,
    compensationVersion: 1,
    immutable: true,
    migrated: true,
    migrationVersion: MIGRATION_VERSION,
    migrationReason: "LEGACY_EXACT_LOCATION_ACCEPTED_COMPENSATION_RECOVERY",
    sourceAuthorityId: classification.accepted.sourceAuthorityId,
    sourceAuthorityVersion: classification.accepted.sourceAuthorityVersion,
    sourceEvidenceDigest,
  };
  const contractDigest = digest(contract);
  return {
    contractId,
    receiptId: deterministicReceiptId(contractId),
    contract,
    receipt: {
      contractId,
      campaignId: assignment.campaignId,
      businessId: assignment.businessId,
      scalerId: assignment.scalerId,
      migrationVersion: MIGRATION_VERSION,
      sourceEvidenceDigest,
      contractDigest,
      immutable: true,
    },
  };
}

function reconcileMigration(plan, existingContract, existingReceipt) {
  if (!existingContract && !existingReceipt) return {action: "create", plan};
  if (!existingContract || !existingReceipt) throw new Error("migration_partial_state_conflict");
  if (digest(existingContract) !== plan.receipt.contractDigest ||
      existingReceipt.contractId !== plan.contractId ||
      existingReceipt.sourceEvidenceDigest !== plan.receipt.sourceEvidenceDigest ||
      existingReceipt.contractDigest !== plan.receipt.contractDigest) {
    throw new Error("migration_replay_conflict");
  }
  return {action: "reuse", plan};
}

module.exports = {
  MIGRATION_VERSION,
  CATEGORIES,
  digest,
  deterministicContractId,
  deterministicReceiptId,
  classifyLegacyAssignment,
  buildMigrationPlan,
  reconcileMigration,
};

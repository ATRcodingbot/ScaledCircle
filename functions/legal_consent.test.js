"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AGREEMENTS,
  ROLE_REQUIREMENTS,
  validateRequest,
  createLegalConsentService,
} = require("./legal_consent");

test("legal consent validates role-specific current agreements", () => {
  assert.deepEqual(validateRequest({agreementTypes: ["terms", "privacy"], source: "account_creation"}, "business"), {
    types: ["terms", "privacy"], source: "account_creation",
  });
  assert.throws(() => validateRequest({agreementTypes: ["scaler_work"], source: "account_creation"}, "business"), /scaler_agreement_requires_scaler/);
  assert.throws(() => validateRequest({agreementTypes: ["future"], source: "account_creation"}, "scaler"), /unknown_agreement/);
});

test("legal consent writes deterministic immutable records once", async () => {
  const records = new Map();
  const db = {
    collection: () => ({doc: (id) => ({id})}),
    runTransaction: async (work) => work({
      get: async (ref) => ({exists: records.has(ref.id), data: () => records.get(ref.id)}),
      create: (ref, value) => records.set(ref.id, value),
    }),
  };
  const service = createLegalConsentService({db, FieldValue: {serverTimestamp: () => "SERVER"}});
  const input = {uid: "scaler-1", role: "scaler", data: {agreementTypes: ["terms", "privacy", "scaler_work"], source: "account_creation"}};
  await service.accept(input);
  await service.accept(input);
  assert.equal(records.size, 3);
  assert.equal(records.get(`scaler-1_terms_${AGREEMENTS.terms}`).acceptedAt, "SERVER");
  assert.equal(records.get(`scaler-1_scaler_work_${AGREEMENTS.scaler_work}`).userRole, "scaler");
});

test("current consent status requires exact versions and reports structured missing agreements", async () => {
  const records = new Map([
    [`business-1_terms_terms-2026-08-v0`, {
      uid: "business-1", agreementType: "terms", agreementVersion: "terms-2026-08-v0",
    }],
    [`business-1_privacy_${AGREEMENTS.privacy}`, {
      uid: "business-1", agreementType: "privacy", agreementVersion: AGREEMENTS.privacy,
    }],
  ]);
  const db = {collection: () => ({doc: (id) => ({
    id,
    get: async () => ({exists: records.has(id), data: () => records.get(id)}),
  })})};
  const service = createLegalConsentService({db, FieldValue: {}});
  const result = await service.status({
    uid: "business-1", agreementTypes: ROLE_REQUIREMENTS.business_funding,
  });
  assert.deepEqual(result.accepted, [{type: "privacy", version: AGREEMENTS.privacy}]);
  assert.deepEqual(result.missing, [{type: "terms", version: AGREEMENTS.terms}]);
  await assert.rejects(
    service.requireCurrent({
      uid: "business-1", agreementTypes: ROLE_REQUIREMENTS.business_funding,
    }),
    (error) => error.message === "legal_consent_required" &&
      error.missing[0].version === AGREEMENTS.terms,
  );
});

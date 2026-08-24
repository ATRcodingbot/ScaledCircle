"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {AGREEMENTS, validateRequest, createLegalConsentService} = require("./legal_consent");

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

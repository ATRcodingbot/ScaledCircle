"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const migration = require("./exact_location_compensation_migration");

function fixture() {
  return {
    assignment: {
      campaignId: "campaign_one", businessId: "business_one", scalerId: "scaler_one",
      applicationId: "application_one", locationIds: ["location_two", "location_one"],
      assignedAt: "2026-08-01T14:00:00.000Z",
    },
    application: {
      campaignId: "campaign_one", businessId: "business_one", scalerId: "scaler_one",
      status: "accepted", acceptedAt: "2026-08-01T14:00:00.000Z",
      acceptedCompensation: {
        immutable: true, version: 1, baseAmountCents: 10000, bonusAmountCents: 2000,
        currency: "usd", acceptedAt: "2026-08-01T14:00:00.000Z",
        sourceAuthorityId: "assignment_acceptance_one", sourceAuthorityVersion: "v1",
      },
    },
    earningCount: 0, walletEffectCount: 0,
  };
}

test("accepted immutable economics are deterministically migratable", () => {
  const result = migration.classifyLegacyAssignment(fixture());
  assert.equal(result.category, migration.CATEGORIES.migratable);
});

test("mutable campaign pay is never accepted as historical compensation", () => {
  const input = fixture();
  delete input.application.acceptedCompensation;
  input.campaign = {basePay: 100, bonus: 20};
  assert.equal(migration.classifyLegacyAssignment(input).category, migration.CATEGORIES.review);
});

test("missing accepted assignment authority remains non-payable", () => {
  const input = fixture();
  input.application.status = "pending";
  delete input.application.acceptedAt;
  delete input.application.acceptedCompensation;
  assert.equal(migration.classifyLegacyAssignment(input).category,
    migration.CATEGORIES.nonPayable);
});

test("economic effects without a contract fail closed", () => {
  const input = fixture();
  input.walletEffectCount = 1;
  assert.equal(migration.classifyLegacyAssignment(input).category,
    migration.CATEGORIES.nonPayable);
});

test("migration identity, evidence, contract, and receipt are deterministic", () => {
  const first = migration.buildMigrationPlan(fixture());
  const second = migration.buildMigrationPlan(fixture());
  assert.deepEqual(first, second);
  assert.equal(first.contract.locationIds.join(","), "location_one,location_two");
  assert.equal(first.contract.immutable, true);
  assert.equal(first.receipt.immutable, true);
});

test("migration creates no earning, Wallet, payout, or provider fields", () => {
  const text = JSON.stringify(migration.buildMigrationPlan(fixture()));
  assert.doesNotMatch(text, /wallet|earning|payout|transfer|provider/i);
});

test("exact replay reuses the immutable contract and receipt", () => {
  const plan = migration.buildMigrationPlan(fixture());
  assert.equal(migration.reconcileMigration(plan, plan.contract, plan.receipt).action, "reuse");
});

test("partial or conflicting replay fails closed", () => {
  const plan = migration.buildMigrationPlan(fixture());
  assert.throws(() => migration.reconcileMigration(plan, plan.contract, null),
    /partial_state_conflict/);
  assert.throws(() => migration.reconcileMigration(plan,
    {...plan.contract, baseAmountCents: 1}, plan.receipt), /replay_conflict/);
});

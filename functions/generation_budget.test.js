"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const budget = require("./generation_budget");
const base = {config: {providerGenerationEnabled: true, businessDailyMaximum: 8, globalDailyMaximum: 100,
  globalMonthlyMaximum: 1000, maximumCostMicros: 165000, globalDailyCostMicros: 16500000,
  globalMonthlyCostMicros: 165000000}, business: {eligible: true, monthlyAllowance: 20},
usage: {businessRollingDay: 0, businessMonth: 0, globalDay: 0, globalMonth: 0,
  globalDayCostMicros: 0, globalMonthCostMicros: 0}};

test("daily monthly and global product budgets fail closed", () => {
  assert.equal(budget.evaluateGenerationBudget(base).allowed, true);
  assert.equal(budget.evaluateGenerationBudget({...base, config: {...base.config, providerGenerationEnabled: false}}).reason, "generation_disabled");
  assert.equal(budget.evaluateGenerationBudget({...base, business: {...base.business, eligible: false}}).reason, "business_ineligible");
  assert.equal(budget.evaluateGenerationBudget({...base, usage: {...base.usage, businessRollingDay: 8}}).reason, "generation_rate_limited");
  assert.equal(budget.evaluateGenerationBudget({...base, usage: {...base.usage, businessMonth: 20}}).reason, "monthly_limit_reached");
  assert.equal(budget.evaluateGenerationBudget({...base, usage: {...base.usage, globalMonth: 1000}}).reason, "global_budget_exhausted");
  assert.equal(budget.evaluateGenerationBudget({...base, usage: {...base.usage,
    globalDayCostMicros: 16500000}}).reason, "global_budget_exhausted");
});

test("reservation is idempotent and unknown outcomes stay reserved", async () => {
  const writes = []; let existingReservation = null;
  const authority = budget.createBudgetAuthority({readState: async () => ({...base, existingReservation}),
    writeReservation: async (value) => { writes.push(value); existingReservation = value; return value; }});
  const first = await authority.reserve({actor: {uid: "b"}, jobId: "job"});
  const replay = await authority.reserve({actor: {uid: "b"}, jobId: "job"});
  assert.equal(replay.idempotentReplay, true); await authority.holdUnknown({reservation: first});
  assert.equal(writes.at(-1).status, "unknown_provider_outcome");
});

test("reservation transitions separate outstanding holds from actual usage", () => {
  const reservation = {status: "reserved", reservedUnits: 1, reservedCostMicros: 165000};
  assert.deepEqual(budget.reservationTransition(reservation, {status: "released"}), {
    apply: true, outstandingUnitsDelta: -1, outstandingCostMicrosDelta: -165000,
    actualUnitsDelta: 0, actualCostMicrosDelta: 0, customerConsumedUnitsDelta: 0,
  });
  assert.deepEqual(budget.reservationTransition(reservation, {status: "settled",
    providerAccepted: true, customerConsumed: true, cost: {actualCostMicros: 41725}}), {
    apply: true, outstandingUnitsDelta: -1, outstandingCostMicrosDelta: -165000,
    actualUnitsDelta: 1, actualCostMicrosDelta: 41725, customerConsumedUnitsDelta: 1,
  });
  assert.equal(budget.reservationTransition(reservation, {status: "settled",
    providerAccepted: true, customerConsumed: false, cost: {actualCostMicros: 41725}})
  .customerConsumedUnitsDelta, 0);
  assert.equal(budget.reservationTransition({status: "settled"}, {status: "released"}).invalidTransition, true);
  assert.equal(budget.reservationTransition({status: "released"}, {status: "settled"}).invalidTransition, true);
  assert.equal(budget.reservationTransition({status: "released"}, {status: "released"}).idempotentReplay, true);
});

test("two successes and one pre-provider release leave one three-request unit", () => {
  const keys = {day: "2026-08-30", month: "2026-08"};
  const projections = budget.summarizeReservations([
    {businessUid: "business-a", status: "released", reservedUnits: 1,
      reservedCostMicros: 165000, keys},
    {businessUid: "business-a", status: "settled", reservedUnits: 1,
      reservedCostMicros: 165000, providerAccepted: true, usage: {imageOutputTokens: 1372},
      customerConsumed: true, cost: {actualCostMicros: 41725}, keys},
    {businessUid: "business-a", status: "settled", reservedUnits: 1,
      reservedCostMicros: 165000, providerAccepted: true, usage: {imageOutputTokens: 1372},
      customerConsumed: true, cost: {actualCostMicros: 41725}, keys},
  ], keys);
  const global = projections.get("global_month_2026-08");
  assert.deepEqual(global, {outstandingUnits: 0, outstandingCostMicros: 0,
    actualUnits: 2, actualCostMicros: 83450, customerConsumedUnits: 2});
  assert.equal(budget.evaluateGenerationBudget({...base, config: {...base.config,
    businessDailyMaximum: 3, globalDailyMaximum: 3, globalMonthlyMaximum: 3},
  business: {...base.business, monthlyAllowance: 3}, usage: {...base.usage,
    businessMonth: 2, globalDay: 2, globalMonth: 2}}).allowed, true);
});

test("UTC calendar reset is deterministic with no rollover", () => {
  assert.equal(budget.monthlyResetAt(Date.parse("2026-08-31T23:59:59.999Z")),
    Date.parse("2026-09-01T00:00:00.000Z"));
  assert.equal(budget.periodKeys(Date.parse("2026-09-01T00:00:00.000Z")).month, "2026-09");
});

test("system rejection records provider cost without consuming customer allowance", () => {
  const keys = {day: "2026-08-30", month: "2026-08"};
  const projection = budget.summarizeReservations([{businessUid: "business-a", status: "settled",
    reservedUnits: 1, reservedCostMicros: 165000, providerAccepted: true,
    customerConsumed: false, usage: {imageOutputTokens: 1372},
    cost: {actualCostMicros: 41725}, keys}], keys).get("business_business-a_2026-08");
  assert.deepEqual(projection, {outstandingUnits: 0, outstandingCostMicros: 0,
    actualUnits: 1, actualCostMicros: 41725, customerConsumedUnits: 0});
});

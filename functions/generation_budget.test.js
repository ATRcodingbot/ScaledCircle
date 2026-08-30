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

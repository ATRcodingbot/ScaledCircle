"use strict";

const DAY_MS = 86400000;
function periodKeys(at = Date.now()) { const date = new Date(at); return {day: date.toISOString().slice(0, 10), month: date.toISOString().slice(0, 7)}; }
function evaluateGenerationBudget({config = {}, business = {}, usage = {}, now = Date.now()}) {
  if (config.providerGenerationEnabled !== true) return {allowed: false, reason: "generation_disabled"};
  if (business.eligible !== true) return {allowed: false, reason: "business_ineligible"};
  const keys = periodKeys(now); const monthlyAllowance = Number(business.monthlyAllowance || 0);
  const checks = [
    [Number(usage.businessRollingDay || 0), Number(config.businessDailyMaximum || 8), "generation_rate_limited"],
    [Number(usage.businessMonth || 0), monthlyAllowance, "monthly_limit_reached"],
    [Number(usage.globalDay || 0), Number(config.globalDailyMaximum || 0), "global_budget_exhausted"],
    [Number(usage.globalMonth || 0), Number(config.globalMonthlyMaximum || 0), "global_budget_exhausted"],
  ];
  for (const [used, maximum, reason] of checks) if (maximum <= 0 || used >= maximum) return {allowed: false, reason, keys};
  const reservationCost = Number(config.maximumCostMicros || 165000);
  if (Number(config.globalDailyCostMicros || 0) <= 0 ||
      Number(usage.globalDayCostMicros || 0) + reservationCost > Number(config.globalDailyCostMicros)) {
    return {allowed: false, reason: "global_budget_exhausted", keys};
  }
  if (Number(config.globalMonthlyCostMicros || 0) <= 0 ||
      Number(usage.globalMonthCostMicros || 0) + reservationCost > Number(config.globalMonthlyCostMicros)) {
    return {allowed: false, reason: "global_budget_exhausted", keys};
  }
  return {allowed: true, keys, reservationUnits: 1, reservationCostMicros: reservationCost};
}
function createBudgetAuthority({readState, writeReservation}) {
  return {async reserve({actor, jobId}) { const state = await readState({actor, jobId});
    if (state.existingReservation) return {...state.existingReservation, idempotentReplay: true};
    const decision = evaluateGenerationBudget(state); if (!decision.allowed) throw new Error(decision.reason);
    return writeReservation({actor, jobId, ...decision, status: "reserved"}); },
  async settle({reservation, usage, cost}) { return writeReservation({...reservation, usage, cost, status: "settled"}); },
  async release({reservation}) { return writeReservation({...reservation, status: "released"}); },
  async holdUnknown({reservation}) { return writeReservation({...reservation, status: "unknown_provider_outcome"}); }};
}
module.exports = {DAY_MS, periodKeys, evaluateGenerationBudget, createBudgetAuthority};

"use strict";

const DAY_MS = 86400000;
function periodKeys(at = Date.now()) { const date = new Date(at); return {day: date.toISOString().slice(0, 10), month: date.toISOString().slice(0, 7)}; }
function monthlyResetAt(at = Date.now()) {
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
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
const HOLDING_STATUSES = new Set(["reserved", "unknown_provider_outcome"]);
function reservationTransition(current = {}, next = {}) {
  const from = String(current.status || ""); const to = String(next.status || "");
  if (from === to) return {apply: false, idempotentReplay: true};
  if (!HOLDING_STATUSES.has(from) || !["released", "settled", "unknown_provider_outcome"].includes(to)) {
    return {apply: false, invalidTransition: true};
  }
  if (to === "unknown_provider_outcome") return {apply: true, holdOnly: true,
    outstandingUnitsDelta: 0, outstandingCostMicrosDelta: 0, actualUnitsDelta: 0,
    actualCostMicrosDelta: 0, customerConsumedUnitsDelta: 0};
  const reservedUnits = Math.max(0, Number(current.reservedUnits || 0));
  const reservedCostMicros = Math.max(0, Number(current.reservedCostMicros || 0));
  const consumed = to === "settled" && next.providerAccepted === true;
  const customerConsumed = consumed && next.customerConsumed === true;
  return {apply: true, outstandingUnitsDelta: -reservedUnits,
    outstandingCostMicrosDelta: -reservedCostMicros, actualUnitsDelta: consumed ? reservedUnits : 0,
    actualCostMicrosDelta: consumed ? Math.max(0, Number(next.cost?.actualCostMicros || 0)) : 0,
    customerConsumedUnitsDelta: customerConsumed ? reservedUnits : 0};
}
function summarizeReservations(reservations = [], {day, month} = periodKeys()) {
  const projections = new Map();
  const add = (id, reservation) => {
    const current = projections.get(id) || {outstandingUnits: 0, outstandingCostMicros: 0,
      actualUnits: 0, actualCostMicros: 0, customerConsumedUnits: 0};
    if (HOLDING_STATUSES.has(reservation.status)) {
      current.outstandingUnits += Math.max(0, Number(reservation.reservedUnits || 0));
      current.outstandingCostMicros += Math.max(0, Number(reservation.reservedCostMicros || 0));
    } else if (reservation.status === "settled" &&
        (reservation.providerAccepted === true || reservation.usage || reservation.cost)) {
      current.actualUnits += Math.max(0, Number(reservation.reservedUnits || 0));
      current.actualCostMicros += Math.max(0, Number(reservation.cost?.actualCostMicros || 0));
      if (reservation.customerConsumed === true) {
        current.customerConsumedUnits += Math.max(0, Number(reservation.reservedUnits || 0));
      }
    }
    projections.set(id, current);
  };
  for (const reservation of reservations) {
    if (reservation?.keys?.month !== month) continue;
    add(`business_${reservation.businessUid}_${month}`, reservation);
    add(`global_month_${month}`, reservation);
    if (reservation.keys.day === day) add(`global_day_${day}`, reservation);
  }
  return projections;
}
function createBudgetAuthority({readState, writeReservation, recordDenial = async () => {}}) {
  return {async reserve({actor, jobId}) { const state = await readState({actor, jobId});
    if (state.existingReservation) return {...state.existingReservation, idempotentReplay: true};
    const decision = evaluateGenerationBudget(state); if (!decision.allowed) {
      await recordDenial({actor, jobId, decision, state}); throw new Error(decision.reason);
    }
    return writeReservation({actor, jobId, plan: state.business?.plan || null,
      ...decision, status: "reserved"}); },
  async lookup({actor, jobId}) { return (await readState({actor, jobId})).existingReservation; },
  async settle({reservation, usage, cost, providerAccepted = true, customerConsumed = false}) {
    return writeReservation({...reservation, usage, cost, providerAccepted, customerConsumed,
      status: "settled"}); },
  async release({reservation}) { return writeReservation({...reservation, status: "released"}); },
  async holdUnknown({reservation}) { return writeReservation({...reservation, status: "unknown_provider_outcome"}); }};
}
module.exports = {DAY_MS, periodKeys, monthlyResetAt, evaluateGenerationBudget, reservationTransition,
  summarizeReservations, createBudgetAuthority};

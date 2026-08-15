"use strict";

const POLICY_VERSION = "ScalerNotificationMatchingCapacityV1";
const SUPPORTED_POPULATION = 400;
const WARNING_POPULATION = Math.floor(SUPPORTED_POPULATION * 0.8);

function capacityAssessment(population) {
  const count = Number(population);
  if (!Number.isInteger(count) || count < 0) throw new Error("invalid_scaler_preference_population");
  if (count >= SUPPORTED_POPULATION) return {level: "reached", severity: "high",
    summary: `Scaler notification matching capacity reached (${count}/${SUPPORTED_POPULATION}). Geographic partitioning is required before further rollout.`};
  if (count >= WARNING_POPULATION) return {level: "warning", severity: "normal",
    summary: `Scaler notification matching is approaching capacity (${count}/${SUPPORTED_POPULATION}). Plan geographic partitioning.`};
  return null;
}

function issueIdentity(level, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `scaler_matching_capacity_${level}_${day}`;
}

module.exports = {POLICY_VERSION, SUPPORTED_POPULATION, WARNING_POPULATION,
  capacityAssessment, issueIdentity};

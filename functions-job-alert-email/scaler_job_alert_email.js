"use strict";

const crypto = require("node:crypto");

const EMAIL_JOB_COLLECTION = "scalerJobAlertEmailJobs";
const SUPPORT_EMAIL = "support@scaledcircle.com";
const SUPPORT_FROM_NAME = "ScaledCircle";
const POLICY_VERSION = "ScalerJobAlertEmailPolicyV1";
const DAILY_LIMIT = 5;

function jobId(campaignId, scalerUid) {
  return `job-alert_${String(campaignId).trim()}_${String(scalerUid).trim()}`;
}

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function rateLimitId(scalerUid, now = new Date()) {
  return `${String(scalerUid).trim()}_${utcDay(now)}`;
}

function canQueue({jobExists, dailyCount}) {
  return jobExists !== true && Number(dailyCount || 0) < DAILY_LIMIT;
}

function createJob({campaignId, scalerUid, recipient, campaignName, jobType, areaLabel, reasons}) {
  const to = String(recipient || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("invalid_recipient");
  const id = jobId(campaignId, scalerUid);
  const safeType = String(jobType || "Local field opportunity").trim().slice(0, 100);
  const safeArea = String(areaLabel || "your saved work area").trim().slice(0, 120);
  const safeReasons = Array.isArray(reasons) ? reasons.slice(0, 3).map((reason) =>
    String(reason).trim().slice(0, 160)).filter(Boolean).join(" ") : "";
  return {id, schemaVersion: "ScalerJobAlertEmailJobV1", policyVersion: POLICY_VERSION,
    status: "queued",
    scalerUid, campaignId, to, fromAddress: SUPPORT_EMAIL, template: "scaler_job_alert_v1",
    subject: "New ScaledCircle job near your work area",
    text: `A new ${safeType} job${campaignName ? ` (${String(campaignName).slice(0, 120)})` : ""} matches your saved preferences.\n\nArea: ${safeArea}${safeReasons ? `\nWhy it matched: ${safeReasons}` : ""}\n\nThis is an opportunity, not an assignment. Open ScaledCircle to review and apply: https://scaledcircle.com/#/jobs\n\nManage job alerts in ScaledCircle → My Work Areas & Alerts.`,
    dedupeKey: id, bodyHash: crypto.createHash("sha256").update(`${id}:${to}`).digest("hex")};
}

function validateJob(job) {
  if (!job || job.schemaVersion !== "ScalerJobAlertEmailJobV1" ||
      job.policyVersion !== POLICY_VERSION || job.status !== "queued" ||
      job.template !== "scaler_job_alert_v1" || job.fromAddress !== SUPPORT_EMAIL ||
      job.dedupeKey !== job.id || !/^[a-f0-9]{64}$/.test(String(job.bodyHash || "")) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(job.to || ""))) return false;
  return true;
}

module.exports = {EMAIL_JOB_COLLECTION, SUPPORT_EMAIL, SUPPORT_FROM_NAME, POLICY_VERSION,
  DAILY_LIMIT, utcDay, rateLimitId, canQueue, jobId, createJob, validateJob};

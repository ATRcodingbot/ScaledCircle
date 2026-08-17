"use strict";

const crypto = require("node:crypto");

const EMAIL_JOB_COLLECTION = "scalerJobAlertEmailJobs";
const SUPPORT_EMAIL = "support@scaledcircle.com";
const SUPPORT_FROM_NAME = "ScaledCircle";

function jobId(campaignId, scalerUid) {
  return `job-alert_${String(campaignId).trim()}_${String(scalerUid).trim()}`;
}

function createJob({campaignId, scalerUid, recipient, campaignName}) {
  const to = String(recipient || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("invalid_recipient");
  const id = jobId(campaignId, scalerUid);
  return {id, schemaVersion: "ScalerJobAlertEmailJobV1", status: "queued",
    scalerUid, campaignId, to, fromAddress: SUPPORT_EMAIL, template: "scaler_job_alert_v1",
    subject: "A ScaledCircle job matches your work preferences",
    text: `A new ScaledCircle job${campaignName ? ` (${String(campaignName).slice(0, 120)})` : ""} matches your saved work areas and preferences. Sign in to review it.`,
    dedupeKey: id, bodyHash: crypto.createHash("sha256").update(`${id}:${to}`).digest("hex")};
}

function validateJob(job) {
  if (!job || job.schemaVersion !== "ScalerJobAlertEmailJobV1" || job.status !== "queued" ||
      job.template !== "scaler_job_alert_v1" || job.fromAddress !== SUPPORT_EMAIL ||
      job.dedupeKey !== job.id || !/^[a-f0-9]{64}$/.test(String(job.bodyHash || "")) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(job.to || ""))) return false;
  return true;
}

module.exports = {EMAIL_JOB_COLLECTION, SUPPORT_EMAIL, SUPPORT_FROM_NAME, jobId, createJob, validateJob};

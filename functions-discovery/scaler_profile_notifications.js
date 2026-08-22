"use strict";

const marketplaceWorkTypes = require("./marketplace_work_types");
const signupNotifications = require("./signup_notifications");

function cleanText(value, maximumLength = 320) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").slice(0, maximumLength);
}

function accessStatus(profile) {
  return profile?.active === true || profile?.betaAccess === "approved" ?
    "Approved" : "Pending";
}

function yesNo(value) {
  return value === true ? "Yes" : "No";
}

function formatWorkArea(area) {
  const displayName = cleanText(area?.displayName || area?.name, 180);
  if (area?.type === "around_business" && Number.isFinite(Number(area?.radiusMiles))) {
    const center = cleanText(area?.centerLabel || displayName, 140) || "saved location";
    return `${Number(area.radiusMiles)}-mile radius around ${center}`;
  }
  if (area?.type === "postal_codes" && Array.isArray(area?.postalCodes)) {
    const codes = area.postalCodes.map((value) => cleanText(value, 12)).filter(Boolean);
    if (codes.length) return codes.join(", ");
  }
  return displayName || "Saved Work Area";
}

function travelLabel(preferences) {
  const miles = Number(preferences?.maxTravelMiles);
  const mode = cleanText(preferences?.travelMode, 40);
  if (mode === "never") return "Saved Work Areas only";
  if (mode === "anywhere") return "Open to travel opportunities";
  if (mode === "worth_drive") return "Farther for worthwhile opportunities";
  return Number.isFinite(miles) ? `Up to ${miles} miles` : "Not provided";
}

function vehicleLabel(value) {
  return ({car: "Car", pickup_truck: "Pickup Truck", van: "Van",
    box_truck: "Box Truck", no_vehicle: "No Vehicle"})[value] || "Not provided";
}

function cargoLabel(value) {
  return ({open: "Open Bed", covered: "Covered / Enclosed"})[value] || "Not provided";
}

function scalerProfileCompletionJob({uid, authUser, profile, preferences, occurredAt}) {
  const email = signupNotifications.normalizeEmail(authUser?.email);
  const name = cleanText(profile?.displayName || authUser?.displayName, 120);
  if (!uid || cleanText(profile?.role, 40).toLowerCase() !== "scaler" || !email) return null;
  const areas = (Array.isArray(preferences?.areas) ? preferences.areas : [])
    .filter((area) => area?.enabled !== false).map(formatWorkArea);
  const types = (Array.isArray(preferences?.jobTypes) ? preferences.jobTypes : [])
    .map((value) => marketplaceWorkTypes.resolve(value)?.customerLabel).filter(Boolean);
  const other = cleanText(preferences?.otherWorkInterests, 500) || "None provided";
  const alerts = preferences?.alertDelivery || {};
  const timestamp = occurredAt || "server-recorded";
  return {
    id: `scaler-profile-completed_${uid}`,
    data: {
      to: signupNotifications.SUPPORT_EMAIL,
      fromAddress: signupNotifications.SUPPORT_EMAIL,
      fromName: signupNotifications.SUPPORT_FROM_NAME,
      replyTo: signupNotifications.SUPPORT_EMAIL,
      subject: `Scaler profile completed — ${name || "Scaler"}`,
      template: "support_scaler_profile_completed",
      eventType: "signup.scaler.profile_completed",
      text: [
        "SCALER PROFILE COMPLETED", "",
        `Name: ${name || "Not provided"}`, `Email: ${email}`, "Account: Scaler",
        `Access: ${accessStatus(profile)}`, "", "WHERE THEY WANT TO WORK",
        ...(areas.length ? areas : ["None provided"]),
        `Travel: ${travelLabel(preferences)}`, "", "INTERESTED WORK",
        ...(types.length ? types : ["None selected"]), "", "OTHER WORK INTERESTS",
        other, "", "VEHICLE / CAPABILITY",
        `Vehicle: ${vehicleLabel(preferences?.vehicleType)}`,
        `Cargo: ${cargoLabel(preferences?.vehicleBed)}`, "", "WORK PREFERENCES",
        `Crew Work: ${yesNo(preferences?.crewOptIn === true)}`,
        `Door-to-Door Outreach: ${yesNo(preferences?.outreachOptIn === true)}`,
        "", "JOB ALERTS",
        `In ScaledCircle: ${alerts.inApp === false ? "Off" : "On"}`,
        `Email: ${alerts.email === true ? "On" : "Off"}`, "Push: Coming Soon",
        "", "ACCOUNT", `Email Verified: ${yesNo(authUser?.emailVerified === true)}`,
        `Access Status: ${accessStatus(profile)}`, `Firebase UID: ${uid}`,
        `Created: ${authUser?.metadata?.creationTime || "Not available"}`,
        `Profile Completed: ${timestamp}`,
      ].join("\n"),
      metadata: {uid, role: "scaler", accessStatus: accessStatus(profile)},
      status: "queued",
    },
  };
}

async function queueScalerProfileCompletion({db, serverTimestamp, uid, authUser,
  profile, preferences, occurredAt}) {
  const completionJob = scalerProfileCompletionJob({uid, authUser, profile,
    preferences, occurredAt});
  return signupNotifications.queueEmailJobs({
    db, serverTimestamp, jobs: completionJob ? [completionJob] : [],
  });
}

module.exports = {scalerProfileCompletionJob, queueScalerProfileCompletion};

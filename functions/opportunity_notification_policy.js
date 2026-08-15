"use strict";

const discoveryPreferences = require("./discovery_preferences");

function scalerOpportunityDecision(rawPreferences, campaign) {
  const preferences = discoveryPreferences.sanitizePreferences(rawPreferences, "scaler");
  const jobType = String(campaign.jobType || campaign.workType || "flyer_distribution");
  const opportunity = {location: campaign.location || campaign.center || campaign.serviceAreaCenter || null,
    place: campaign.city || campaign.county || campaign.locationName || "",
    postalCode: campaign.postalCode || campaign.zipCode || "", jobType,
    pay: Number(campaign.basePay || campaign.pay || 0)};
  const match = discoveryPreferences.matchOpportunity(preferences, opportunity, "push");
  const notifications = preferences.notifications;
  if (jobType === "door_to_door" && (!preferences.outreachOptIn || !notifications.doorToDoorOpportunities))
    return {...match, matched: false, reasons: ["Door-to-door opportunities require explicit opt-in."]};
  if (jobType === "crew_jobs" && (!preferences.crewOptIn || !notifications.crewOpportunities))
    return {...match, matched: false, reasons: ["Scaler Crew opportunity notifications are off."]};
  if (jobType === "material_pickup" && !notifications.materialPickupJobs)
    return {...match, matched: false, reasons: ["Material pickup notifications are off."]};
  if (!match.serviceAreaMatch && match.travelMatch && !notifications.travelOpportunities)
    return {...match, matched: false, reasons: ["Travel opportunity notifications are off."]};
  if (match.serviceAreaMatch && !notifications.newJobsInMyAreas)
    return {...match, matched: false, reasons: ["Local job notifications are off."]};
  return match;
}

module.exports = {scalerOpportunityDecision};

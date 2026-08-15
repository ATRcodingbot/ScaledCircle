"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {scalerOpportunityDecision} = require("./opportunity_notification_policy");

function prefs(overrides = {}) {
  return {areas: [{id: "home", name: "Home Area", type: "around_business", enabled: true,
    primary: true, center: {latitude: 39, longitude: -76.6}, radiusMiles: 20}],
  jobTypes: ["flyer_distribution"], travelMode: "never", maxTravelMiles: 20,
  crewOptIn: false, outreachOptIn: false,
  notifications: {newJobsInMyAreas: true, travelOpportunities: false, crewOpportunities: false,
    materialPickupJobs: true, doorToDoorOpportunities: false}, ...overrides};
}
test("actual job producer policy notifies local matches and suppresses 100-mile jobs", () => {
  assert.equal(scalerOpportunityDecision(prefs(), {jobType: "flyer_distribution",
    location: {latitude: 39.01, longitude: -76.6}}).matched, true);
  assert.equal(scalerOpportunityDecision(prefs(), {jobType: "flyer_distribution",
    location: {latitude: 40.5, longitude: -76.6}}).matched, false);
});
test("higher-paying travel opt-in permits a qualifying distant opportunity", () => {
  const result = scalerOpportunityDecision(prefs({travelMode: "worth_drive",
    notifications: {...prefs().notifications, travelOpportunities: true}}),
  {jobType: "flyer_distribution", pay: 600, location: {latitude: 40, longitude: -76.6}});
  assert.equal(result.matched, true);
  assert.match(result.reasons.join(" "), /travel/i);
});
test("wrong job type, crew, and outreach are suppressed", () => {
  assert.equal(scalerOpportunityDecision(prefs(), {jobType: "material_pickup",
    location: {latitude: 39.01, longitude: -76.6}}).matched, false);
  assert.equal(scalerOpportunityDecision(prefs({jobTypes: ["crew_jobs"]}), {jobType: "crew_jobs",
    location: {latitude: 39.01, longitude: -76.6}}).matched, false);
  assert.equal(scalerOpportunityDecision(prefs({jobTypes: ["door_to_door"]}), {jobType: "door_to_door",
    location: {latitude: 39.01, longitude: -76.6}}).matched, false);
});

"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const preferences = require("./discovery_preferences");

const business = preferences.sanitizePreferences({areas: [{id: "main", name: "Main Service Area",
  type: "around_business", primary: true, center: {latitude: 39.29, longitude: -76.61}, radiusMiles: 25}],
priorityServices: ["Decks"], outsideOpportunityScope: "none"}, "business");
const scaler = preferences.sanitizePreferences({areas: [{name: "Home Area", type: "around_business",
  center: {latitude: 39.29, longitude: -76.61}, radiusMiles: 20}], jobTypes: ["flyer_distribution"],
travelMode: "nearby"}, "scaler");

test("Business preferences support multiple named areas and plain service priorities", () => {
  const result = preferences.sanitizePreferences({...business, areas: [...business.areas,
    {name: "Expansion Area", type: "place", places: ["Anne Arundel County"]}]}, "business");
  assert.equal(result.areas.length, 2);
  assert.deepEqual(result.priorityServices, ["Decks"]);
  assert.equal(result.schemaVersion, "ServiceAreaPreferencesV1");
});
test("inside Business opportunity matches while distant push is suppressed", () => {
  assert.equal(preferences.matchOpportunity(business, {location: {latitude: 39.30, longitude: -76.62},
    service: "Decks"}).matched, true);
  assert.equal(preferences.matchOpportunity(business, {location: {latitude: 38.0, longitude: -75.0},
    service: "Decks"}).matched, false);
});
test("manual Business exploration remains unrestricted", () => {
  assert.equal(preferences.matchOpportunity(business, {location: {latitude: 30, longitude: -80}}, "manual").matched, true);
});
test("Business can intentionally broaden outside-area opportunities", () => {
  const statewide = preferences.sanitizePreferences({...business, outsideOpportunityScope: "maryland"}, "business");
  const result = preferences.matchOpportunity(statewide, {location: {latitude: 38.3, longitude: -75.2},
    state: "MD", service: "Decks"});
  assert.equal(result.matched, true);
  assert.match(result.reasons.join(" "), /beyond your usual area/i);
});
test("Scaler defaults suppress distant and outreach jobs", () => {
  assert.equal(preferences.matchOpportunity(scaler, {location: {latitude: 38, longitude: -78},
    jobType: "flyer_distribution", pay: 50}).matched, false);
  assert.equal(preferences.matchOpportunity(scaler, {location: {latitude: 39.3, longitude: -76.62},
    jobType: "door_to_door", pay: 500}).matched, false);
});
test("explicit travel and outreach preferences work without GPS authority", () => {
  const willing = preferences.sanitizePreferences({...scaler, travelMode: "anywhere",
    outreachOptIn: true, jobTypes: ["door_to_door"]}, "scaler");
  const result = preferences.matchOpportunity(willing, {location: {latitude: 38, longitude: -78},
    jobType: "door_to_door", pay: 425});
  assert.equal(result.matched, true);
  assert.match(result.reasons.join(" "), /travel opportunities/i);
});
test("manual Scaler search sees distant jobs regardless of preferences", () => {
  assert.equal(preferences.matchOpportunity(scaler, {location: {latitude: 30, longitude: -80}}, "manual").matched, true);
});
test("three sequential saved areas remain distinct with one primary", () => {
  const result = preferences.sanitizePreferences({...business, areas: [
    business.areas[0],
    {id: "howard", name: "Howard County", type: "place", places: ["Howard County"]},
    {id: "baltimore", name: "Baltimore County", type: "place", places: ["Baltimore County"]},
  ]}, "business");
  assert.deepEqual(result.areas.map((area) => area.id), ["main", "howard", "baltimore"]);
  assert.equal(result.areas.filter((area) => area.primary).length, 1);
});
test("Scaler alert delivery is explicit and push fails closed", () => {
  const optedIn = preferences.sanitizePreferences({...scaler,
    alertDelivery: {inApp: true, email: true, push: true}}, "scaler");
  assert.deepEqual(optedIn.alertDelivery, {inApp: true, email: true, push: false,
    emailFrequency: "immediate"});
  const business = preferences.sanitizePreferences({areas: [],
    alertDelivery: {email: true}}, "business");
  assert.equal(business.alertDelivery.email, false);
});
test("Business and Scaler role payloads cannot cross roles", () => {
  const result = preferences.sanitizePreferences({jobTypes: ["flyer_distribution"]}, "business");
  assert.equal(result.role, "business");
  assert.equal(result.jobTypes, undefined);
});

test("Business saved goals and resolved area metadata remain backend validated", () => {
  const result = preferences.sanitizePreferences({areas: [{id: "main", name: "Main Area",
    type: "place", geometry: [{latitude: 39, longitude: -76.7},
      {latitude: 39.1, longitude: -76.6}, {latitude: 39, longitude: -76.5}],
    geometryParts: [[{latitude: 39, longitude: -76.7},
      {latitude: 39.1, longitude: -76.6}, {latitude: 39, longitude: -76.5}]],
    geometryType: "MultiPolygon", geographyType: "county", geographicId: "24003",
    sourceVintage: "January 1, 2025",
    areaType: "county", displayName: "Anne Arundel County, Maryland",
    county: "Anne Arundel County", state: "Maryland",
    resolutionSource: "openstreetmap_nominatim",
    resolutionVersion: "ServiceAreaResolutionV1"}], savedGoals: [
    {id: "deck", label: "Get more deck jobs", service: "Decks", enabled: true},
    {id: "custom", label: "Get more screened porch jobs", custom: true}],
  preferredCampaignTypes: ["flyer_distribution"],
  defaultResponseGoal: "Request a free estimate"}, "business");
  assert.equal(result.areas[0].county, "Anne Arundel County");
  assert.equal(result.areas[0].geometry.length, 3);
  assert.equal(result.areas[0].geometryParts.length, 1);
  assert.equal(result.areas[0].geographicId, "24003");
  assert.equal(result.savedGoals.length, 2);
  assert.equal(result.savedGoals[1].schemaVersion, "BusinessOpportunityGoalV1");
  assert.deepEqual(result.preferredCampaignTypes, ["flyer_distribution"]);
});

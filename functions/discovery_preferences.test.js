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
test("canonical work taxonomy resolves Business and Scaler aliases", () => {
  const dumpScaler = preferences.sanitizePreferences({...scaler, jobTypes: ["dump_runs"]}, "scaler");
  assert.deepEqual(dumpScaler.jobTypes, ["dump_run"]);
  assert.equal(preferences.matchOpportunity(dumpScaler, {
    location: {latitude: 39.3, longitude: -76.62}, jobType: "dump_run"}).matched, true);
  const hangerScaler = preferences.sanitizePreferences({...scaler,
    jobTypes: ["door_hangers"]}, "scaler");
  assert.deepEqual(hangerScaler.jobTypes, ["door_hanger_distribution"]);
  assert.equal(preferences.matchOpportunity(hangerScaler, {
    location: {latitude: 39.3, longitude: -76.62}, jobType: "door_hanger_distribution"}).matched, true);
});
test("unknown work values fail safely and disabled Junk Removal is not advertised", () => {
  const unknown = preferences.sanitizePreferences({...scaler, jobTypes: ["mystery_job"]}, "scaler");
  assert.deepEqual(unknown.jobTypes, []);
  assert.equal(preferences.matchOpportunity(unknown, {
    location: {latitude: 39.3, longitude: -76.62}, jobType: "mystery_job"}).matched, false);
  const junk = preferences.sanitizePreferences({...scaler, jobTypes: ["junkRemoval"]}, "scaler");
  assert.deepEqual(junk.jobTypes, []);
});
test("vehicle capability is optional but explicit no-vehicle suppresses vehicle work", () => {
  const noVehicle = preferences.sanitizePreferences({...scaler,
    jobTypes: ["dump_run"], vehicleType: "no_vehicle"}, "scaler");
  assert.equal(preferences.matchOpportunity(noVehicle, {
    location: {latitude: 39.3, longitude: -76.62}, jobType: "dump_run"}).matched, false);
});
test("Scaler other work interests are bounded plain text and survive sanitization", () => {
  const value = preferences.sanitizePreferences({...scaler,
    otherWorkInterests: "  <script>alert('x')</script> Junk removal and hauling  "}, "scaler");
  assert.equal(value.otherWorkInterests,
    "<script>alert('x')</script> Junk removal and hauling");
  assert.equal(preferences.sanitizePreferences({...value}, "scaler").otherWorkInterests,
    value.otherWorkInterests);
  assert.equal(preferences.sanitizePreferences({...scaler, otherWorkInterests: ""}, "scaler")
    .otherWorkInterests, "");
  assert.throws(() => preferences.sanitizePreferences({...scaler,
    otherWorkInterests: "x".repeat(preferences.MAX_OTHER_WORK_INTERESTS + 1)}, "scaler"),
  /invalid_other_work_interests/);
  assert.throws(() => preferences.sanitizePreferences({...scaler,
    otherWorkInterests: {unexpected: true}}, "scaler"), /invalid_other_work_interests/);
});
test("Business payloads cannot write Scaler other interests", () => {
  const value = preferences.sanitizePreferences({otherWorkInterests: "Dump Runs"}, "business");
  assert.equal(value.otherWorkInterests, undefined);
});
test("free-text interests never affect OpportunityMatchV1", () => {
  const withText = preferences.sanitizePreferences({...scaler,
    jobTypes: ["flyer_distribution"], otherWorkInterests: "mystery_job dump runs"}, "scaler");
  const opportunity = {location: {latitude: 39.3, longitude: -76.62}, jobType: "dump_run"};
  assert.equal(preferences.matchOpportunity(withText, opportunity).matched, false);
  assert.deepEqual(preferences.matchOpportunity(withText, opportunity),
    preferences.matchOpportunity({...withText, otherWorkInterests: ""}, opportunity));
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

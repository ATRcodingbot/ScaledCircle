const test = require("node:test");
const assert = require("node:assert/strict");
const {Timestamp} = require("firebase-admin/firestore");

// Loading the module defines the scheduled function but does not invoke providers.
const policy = require("./weather_preference_policy");

const county = {id: "anne_arundel", name: "Anne Arundel County", latitude: 38.99, longitude: -76.57};

function preferences(overrides = {}) {
  return {
    role: "business",
    notifications: {weatherInMyAreas: true, outsideMyAreas: false},
    outsideOpportunityScope: "none",
    areas: [{name: "Main", enabled: true, primary: true, places: ["Anne Arundel County"]}],
    ...overrides,
  };
}

test("managed growth subscriptions, including comped QA, inherit weather access", () => {
  const future = Timestamp.fromMillis(Date.now() + 60_000);
  assert.equal(policy.hasWeatherSubscription({role: "business"}, {
    plan: "managed_growth", status: "active", source: "internal_qa", billingStatus: "comped", expiresAt: future,
  }), true);
  assert.equal(policy.hasWeatherSubscription({role: "business"}, {
    plan: "scale", status: "active", expiresAt: future,
  }), true);
  assert.equal(policy.hasWeatherSubscription({role: "business"}, {
    plan: "managed_growth", status: "revoked", expiresAt: future,
  }), false);
});

test("actual weather producer policy allows inside areas and suppresses outside by default", () => {
  assert.equal(policy.weatherPreferenceDecision({preferences: preferences(), countyIds: new Set()}, county).matched, true);
  const outside = {...county, id: "garrett", name: "Garrett County", latitude: 39.53, longitude: -79.27};
  assert.equal(policy.weatherPreferenceDecision({preferences: preferences(), countyIds: new Set()}, outside).matched, false);
});

test("broader Maryland opt-in records a human reason", () => {
  const broad = preferences({
    outsideOpportunityScope: "maryland",
    notifications: {weatherInMyAreas: true, outsideMyAreas: true},
  });
  const result = policy.weatherPreferenceDecision({preferences: broad, countyIds: new Set()}, {
    ...county, id: "garrett", name: "Garrett County", latitude: 39.53, longitude: -79.27,
  });
  assert.equal(result.matched, true);
  assert.match(result.reason, /enabled Maryland opportunities/);
});

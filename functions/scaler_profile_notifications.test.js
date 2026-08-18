"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const notifications = require("./scaler_profile_notifications");

function fakeDatabase() {
  const documents = new Map();
  return {documents, collection(name) { return {doc(id) { return {path: `${name}/${id}`}; }}; },
    async runTransaction(callback) {
      const pending = [];
      const transaction = {async get(ref) { return {exists: documents.has(ref.path)}; },
        create(ref, data) { pending.push([ref.path, data]); }};
      const result = await callback(transaction);
      for (const [path, data] of pending) if (!documents.has(path)) documents.set(path, data);
      return result;
    }};
}

function preferences(overrides = {}) {
  return {areas: [
    {type: "place", displayName: "Baltimore County, Maryland", enabled: true,
      geometry: [{latitude: 39, longitude: -76}]},
    {type: "postal_codes", postalCodes: ["21224"], enabled: true}],
  travelMode: "up_to_miles", maxTravelMiles: 40,
  jobTypes: ["dump_run", "flyer_distribution"],
  otherWorkInterests: "Junk removal, hauling, cleanup", vehicleType: "pickup_truck",
  vehicleBed: "covered", crewOptIn: true, outreachOptIn: false,
  alertDelivery: {inApp: true, email: true}, ...overrides};
}

function input(overrides = {}) {
  return {uid: "scaler-1", authUser: {email: "scaler@example.test",
    displayName: "Sam Scaler", emailVerified: true,
    metadata: {creationTime: "2026-08-18T10:00:00Z"}},
  profile: {role: "scaler", displayName: "Sam Scaler", betaAccess: "pending"},
  preferences: preferences(), occurredAt: "2026-08-18T11:00:00Z", ...overrides};
}

test("profile email contains sanitized customer-facing work profile", () => {
  const job = notifications.scalerProfileCompletionJob(input());
  assert.equal(job.id, "scaler-profile-completed_scaler-1");
  assert.equal(job.data.subject, "Scaler profile completed — Sam Scaler");
  assert.match(job.data.text, /Baltimore County, Maryland\n21224/);
  assert.match(job.data.text, /Travel: Up to 40 miles/);
  assert.match(job.data.text, /Dump Runs\nFlyer Distribution/);
  assert.match(job.data.text, /Junk removal, hauling, cleanup/);
  assert.match(job.data.text, /Vehicle: Pickup Truck\nCargo: Covered \/ Enclosed/);
  assert.match(job.data.text, /Crew Work: Yes\nDoor-to-Door Outreach: No/);
  assert.match(job.data.text, /In ScaledCircle: On\nEmail: On/);
  assert.doesNotMatch(job.data.text, /latitude|longitude|geometry|39|-76|dump_run/);
});

test("completion job is first-write deterministic across retries and later edits", async () => {
  const db = fakeDatabase();
  const args = {...input(), db, serverTimestamp: "SERVER_TIMESTAMP"};
  assert.deepEqual(await notifications.queueScalerProfileCompletion(args),
    {created: 1, existing: 0});
  assert.deepEqual(await notifications.queueScalerProfileCompletion(args),
    {created: 0, existing: 1});
  assert.equal(db.documents.size, 1);
});

test("empty optionals are safe and Business identity cannot create Scaler mail", () => {
  const job = notifications.scalerProfileCompletionJob(input({
    preferences: preferences({otherWorkInterests: "", vehicleType: "", vehicleBed: ""}),
  }));
  assert.match(job.data.text, /OTHER WORK INTERESTS\nNone provided/);
  assert.match(job.data.text, /Vehicle: Not provided\nCargo: Not provided/);
  assert.equal(notifications.scalerProfileCompletionJob(input({
    profile: {role: "business", displayName: "Business"},
  })), null);
});

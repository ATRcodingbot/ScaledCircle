"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");

test("pending preference authority is verified, role-bound, and remains pending", () => {
  const guard = source.slice(source.indexOf("async function requirePendingScaler"),
    source.indexOf("async function grantAdminScaleSubscription"));
  assert.match(guard, /requireVerifiedUser/);
  assert.match(guard, /context\.role !== "scaler"/);
  assert.match(guard, /context\.user\.active === true/);
  assert.match(guard, /context\.user\.betaAccess === "approved"/);
});

test("pending preference callables only read or write the caller-owned projection", () => {
  const start = source.indexOf("exports.getPendingScalerPreferences");
  const end = source.indexOf("/** Resolves user-submitted places", start);
  const callables = source.slice(start, end);
  assert.match(callables, /doc\(context\.uid\)/);
  assert.match(callables, /sanitizePreferences\([^)]*, "scaler"\)/);
  assert.match(callables, /collection\("discoveryPreferences"\)\.doc\(context\.uid\)/);
  assert.match(callables, /request\.data\?\.preferences/);
  for (const forbidden of ["campaigns", "campaignApplications", "jobRooms", "trackingSessions",
    "wallets", "payments", "payout", "betaAccess:", "active:", "role:"])
    assert.doesNotMatch(callables, new RegExp(forbidden));
});

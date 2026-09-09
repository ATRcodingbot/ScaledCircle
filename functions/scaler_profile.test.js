"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const profile = require("./scaler_profile");

function harness(stored = {role: "scaler", active: true, betaAccess: "approved"}) {
  const writes = [];
  const ref = {
    get: async () => ({data: () => ({...stored})}),
    set: async (value, options) => writes.push({value, options}),
  };
  const service = profile.createScalerProfileService({
    db: {collection: () => ({doc: () => ref})},
    FieldValue: {serverTimestamp: () => "server-time"},
  });
  return {service, writes};
}

test("Scaler updates the existing displayName without changing authority fields", async () => {
  const {service, writes} = harness();
  const result = await service.update({
    uid: "scaler-1",
    input: {displayName: "  Gregory   Harkins  ", bio: "Local field worker"},
  });
  assert.equal(result.displayName, "Gregory Harkins");
  assert.equal(result.role, "scaler");
  assert.equal(result.active, true);
  assert.equal(result.betaAccess, "approved");
  assert.deepEqual(Object.keys(writes[0].value).sort(), ["bio", "displayName", "updatedAt"]);
  assert.equal(writes[0].options.merge, true);
});

test("blank, structured, over-length, and extra authority fields fail closed", async () => {
  const {service} = harness();
  await assert.rejects(() => service.update({uid: "x", input: {displayName: "   "}}), /display_name_required/);
  await assert.rejects(() => service.update({uid: "x", input: {displayName: ["Name"]}}), /profile_text_invalid/);
  await assert.rejects(() => service.update({uid: "x", input: {displayName: "x".repeat(81)}}), /profile_text_too_long/);
  await assert.rejects(() => service.update({uid: "x", input: {displayName: "Name", role: "admin"}}), /profile_field_not_allowed/);
});

test("HTML-like text remains inert plain text and non-Scalers are denied", async () => {
  const sanitized = profile.sanitizeScalerProfileInput({
    displayName: "<script>alert(1)</script>",
    bio: "<b>Available</b>",
  });
  assert.equal(sanitized.displayName, "<script>alert(1)</script>");
  assert.equal(sanitized.bio, "<b>Available</b>");
  const {service} = harness({role: "business", active: true});
  await assert.rejects(
    () => service.update({uid: "business-1", input: sanitized}),
    /scaler_role_required/,
  );
});

test("presentation edits cannot alter Auth, legal, payout, or payment identity", () => {
  const source = fs.readFileSync(require.resolve("./scaler_profile"), "utf8");
  assert.doesNotMatch(source, /updateUser|legal|tax|stripe|wallet|payout/i);
});

test("every non-presentation field is rejected before a profile write", async () => {
  for (const key of ['role', 'active', 'betaAccess', 'approved', 'wallet', 'availableBalance',
    'reputation', 'businessId', 'activeBusinessId', 'consents', 'admin', 'uid']) {
    const {service, writes} = harness();
    await assert.rejects(service.update({uid: 'self', input: {
      displayName: 'A Scaler', bio: 'About my work', [key]: 'forbidden',
    }}), /profile_field_not_allowed/);
    assert.equal(writes.length, 0);
  }
});

test("Display Name and Bio bounds and sanitization preserve only self text", async () => {
  const {service, writes} = harness();
  const saved = await service.update({uid: 'self', input: {displayName: 'A'.repeat(80), bio: 'B'.repeat(500)}});
  assert.equal(saved.displayName.length, 80);
  assert.equal(saved.bio.length, 500);
  assert.equal(writes.length, 1);
  await assert.rejects(service.update({uid: 'self', input: {displayName: 'A', bio: 'B'.repeat(501)}}), /profile_text_too_long/);
  assert.equal(writes.length, 1);
  assert.equal(profile.sanitizeScalerProfileInput({displayName: ' A\u0000 B ', bio: 'Work\u0000\nnotes'}).bio, 'Work\nnotes');
});

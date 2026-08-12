const assert = require("node:assert/strict");
const test = require("node:test");
const identity = require("./waitlist_identity");

const EMAIL = "skotiatrades@proton.me";
const EMAIL_HASH = "a570f06e793a3c18c6df04b86b06a460f1b383dcfaae467b3c48b4b03ae23ceb";
const SCALER_ID = "c1212d88704411cf67f9bfc36fe206aad254a8e119f2158e3b5bf3cfdb4be56d";

test("waitlist normalization is deterministic across case and whitespace", () => {
  for (const variant of [EMAIL, "SKOTIATRADES@PROTON.ME", `  ${EMAIL} \r\n`]) {
    assert.equal(identity.normalizeWaitlistEmail(variant), EMAIL);
    assert.equal(identity.subscriberEmailHash(variant), EMAIL_HASH);
    assert.equal(identity.waitlistDocumentId({role: "scaler", email: variant}), SCALER_ID);
  }
});

test("proton.me and protonmail.com remain distinct", () => {
  assert.notEqual(identity.subscriberEmailHash(EMAIL), identity.subscriberEmailHash("skotiatrades@protonmail.com"));
});

test("role is part of the waitlist identity", () => {
  assert.notEqual(identity.waitlistDocumentId({role: "business", email: EMAIL}), SCALER_ID);
});

test("reset plan contains exactly one waitlist record and two jobs", () => {
  assert.deepEqual(identity.waitlistResetPaths({role: "scaler", email: EMAIL}), [
    `waitlist/${SCALER_ID}`,
    `outboundEmailJobs/welcome-subscriber_${EMAIL_HASH}`,
    `outboundEmailJobs/admin-new-subscriber_${EMAIL_HASH}`,
  ]);
});

test("simulated reset permits the same signup to behave as first signup again", () => {
  const documents = new Set(identity.waitlistResetPaths({role: "scaler", email: EMAIL}));
  const waitlistPath = `waitlist/${SCALER_ID}`;
  assert.equal(documents.has(waitlistPath), true);
  for (const path of identity.waitlistResetPaths({role: "scaler", email: EMAIL})) documents.delete(path);
  assert.equal(documents.has(waitlistPath), false);
  documents.add(waitlistPath);
  assert.equal(documents.has(waitlistPath), true);
});

test("invalid roles cannot produce reset paths", () => {
  for (const role of ["", "all", "admin", "*"]) assert.throws(() => identity.waitlistResetPaths({role, email: EMAIL}));
});

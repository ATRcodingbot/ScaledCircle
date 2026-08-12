const assert = require("node:assert/strict");
const {PassThrough} = require("node:stream");
const test = require("node:test");
const reset = require("./reset_waitlist_test");
const EMAIL = "skotiatrades@proton.me";

test("production reset requires every explicit guard", () => {
  assert.throws(() => reset.buildResetPlan({email: EMAIL, role: "scaler", projectId: "scaled-circle", production: false, execute: false, confirmEmail: EMAIL}));
  assert.throws(() => reset.buildResetPlan({email: EMAIL, role: "scaler", projectId: "scaled-circle", production: true, execute: false, confirmEmail: "other@example.test"}));
  assert.equal(reset.buildResetPlan({email: EMAIL, role: "scaler", projectId: "scaled-circle", production: true, execute: false, confirmEmail: EMAIL}).paths.length, 3);
});

test("broad all-role delete cannot be constructed", () => {
  assert.throws(() => reset.buildResetPlan({email: EMAIL, role: "all", projectId: "scaled-circle", production: true, execute: true, confirmEmail: EMAIL}));
});

test("dry run displays exact paths and performs no write", async () => {
  const plan = reset.buildResetPlan({email: EMAIL, role: "scaler", projectId: "scaled-circle", production: true, execute: false, confirmEmail: EMAIL});
  let batchCalled = false; const output = new PassThrough(); let text = "";
  output.on("data", (chunk) => { text += chunk.toString(); });
  const result = await reset.executeResetPlan(plan, {db: {batch() { batchCalled = true; }}, output});
  assert.deepEqual(result, {deleted: 0, dryRun: true});
  assert.equal(batchCalled, false);
  assert.match(text, /waitlist\/c1212d/);
  assert.match(text, /DRY RUN/);
});

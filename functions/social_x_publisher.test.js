"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {approvedText, createAdapter} = require("../functions-social-operations/social_x_publisher");
const job = () => ({id: "fixture_job", provider: "x", sendStarted: true,
  sendStartedAt: Date.parse("2030-01-01T12:00:00Z"), binding: {contentHash: "exact_hash",
    variants: [{provider: "x", copy: "A useful local business update. Link in bio."}]}});
const credentials = async () => ({accessToken: "fixture-not-a-token", providerUserId: "12345", handle: "fixture"});
const post = () => ({id: "67890", author_id: "12345", text: approvedText(job()), created_at: "2030-01-01T12:00:01Z"});
const ok = (body) => ({ok: true, json: async () => body});
test("normal text transport accepts bio CTA without a URL and rejects unbound media and unsupported lengths", () => {
  assert.match(approvedText(job()), /Link in bio/);
  for (const patch of [{mediaAssetId: "asset"}, {mediaRevisionId: "v1"}, {mediaRequirement: "image"},
    {copy: "x".repeat(281)}, {copy: "Emoji \u{1F600}"}]) {
    const changed = job(); Object.assign(changed.binding.variants[0], patch);
    assert.throws(() => approvedText(changed));
  }
});
test("normal publisher verifies actual provider identity and exact receipt with one create", async () => {
  const calls = [];
  const adapter = createAdapter({credentials, fetchImpl: async (url, options) => {
    calls.push({url, options});
    if (url.includes("users/me")) return ok({data: {id: "12345", username: "fixture"}});
    if (options.method === "POST") return ok({data: {id: "67890"}});
    return ok({data: post()});
  }});
  await adapter.verifyApprovedAssets(job());
  const receipt = await adapter.create(job()); await adapter.verifyReceipt(job(), receipt);
  assert.equal(calls.filter(x => x.options.method === "POST").length, 1);
  assert.deepEqual(JSON.parse(calls.find(x => x.options.method === "POST").options.body), {text: approvedText(job())});
  assert.ok(calls.every(x => x.url.startsWith("https://api.x.com/2/") && x.options.redirect === "error"));
});
test("wrong provider identity and missing durable send marker never create", async () => {
  let creates = 0;
  const adapter = createAdapter({credentials, fetchImpl: async (_, options) => {
    if (options.method === "POST") creates++;
    return ok({data: {id: "wrong", username: "fixture"}});
  }});
  await assert.rejects(adapter.create(job()), /identity_mismatch/);
  const valid = createAdapter({credentials, fetchImpl: async (_, options) => {
    if (options.method === "POST") creates++;
    return ok({data: {id: "12345", username: "fixture"}});
  }});
  await assert.rejects(valid.create({...job(), sendStarted: false}), /send_window_missing/);
  assert.equal(creates, 0);
});
test("lost response is never retried by the transport; reconciliation requires complete exact evidence", async () => {
  let creates = 0, paginated = true;
  const adapter = createAdapter({credentials, now: () => Date.parse("2030-01-02"), fetchImpl: async (url, options) => {
    if (url.includes("users/me")) return ok({data: {id: "12345", username: "fixture"}});
    if (options.method === "POST") { creates++; throw new Error("lost response"); }
    return ok({data: [post()], meta: paginated ? {next_token: "more"} : {}});
  }});
  await assert.rejects(adapter.create(job()), /lost response/);
  await assert.rejects(adapter.reconcile(job()), /incomplete/);
  paginated = false; assert.equal((await adapter.reconcile(job())).providerPostId, "67890");
  assert.equal(creates, 1);
});

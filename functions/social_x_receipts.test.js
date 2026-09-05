"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const receipts = require("../functions-social-operations/social_x_receipts");
const expected = {expectedUserId: "123", expectedHandle: "Example", approvedText: "Read https://example.com/r?code=approved",
  mediaKeys: ["media1"], startedAt: "2030-01-01T12:00:00Z", endedAt: "2030-01-01T12:01:00Z"};
const post = () => ({id: "456", author_id: "123", created_at: "2030-01-01T12:00:01Z",
  text: "Read https://t.co/abc https://t.co/photo", attachments: {media_keys: ["media1"]}, entities: {urls: [
    {url: "https://t.co/abc", expanded_url: "https://example.com/r?code=approved"},
    {url: "https://t.co/photo", expanded_url: "https://twitter.com/Example/status/456/photo/1"}]}});
test("generic receipt accepts exact URL expansion and provider photo normalization", () => {
  assert.equal(receipts.verify({post: post(), ...expected}).providerPostId, "456");
});
test("changed destination, tenant identity, photo owner and media fail closed", () => {
  for (const mutate of [p => p.author_id = "other", p => p.entities.urls[0].expanded_url += "wrong",
    p => p.entities.urls[1].expanded_url = "https://x.com/Other/status/456/photo/1",
    p => p.attachments.media_keys = ["other"]]) {
    const altered = post(); mutate(altered);
    assert.throws(() => receipts.verify({post: altered, ...expected}));
  }
});
test("short URL without expansion evidence is not an approved URL wildcard", () => {
  const altered = post(); delete altered.entities;
  assert.equal(receipts.matchingText({post: altered, ...expected}), false);
});
test("pagination and duplicate matches block reconciliation; no match grants no retry", () => {
  assert.throws(() => receipts.reconcile({posts: [post()], hasMore: true, ...expected}));
  assert.throws(() => receipts.reconcile({posts: [post(), post()], hasMore: false, ...expected}));
  assert.equal(receipts.reconcile({posts: [], hasMore: false, ...expected}), null);
});
test("historical identical copy outside this send window cannot complete a new job", () => {
  assert.throws(() => receipts.verify({post: {...post(), created_at: "2029-01-01T12:00:00Z"}, ...expected}));
});

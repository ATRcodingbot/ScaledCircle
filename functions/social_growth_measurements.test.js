"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {plan, collect} = require("../functions-social-operations/social_growth_measurements");
test("measurement plan binds five snapshots to exactly three approved jobs", () => {
  const approval = {id: "approval", businessUid: "owner", approvedByUid: "owner", cycleId: "cycle",
    windowStart: "2030-01-01T05:00:00Z", windowEnd: "2030-01-08T05:00:00Z", providerAccounts: {x: {providerUserId: "123"}},
    items: [2, 4, 6].map(day => ({versionId: `v${day}`, scheduledFor: `2030-01-0${day}T14:30:00Z`, variants: [{provider: "x"}]}))};
  const jobs = plan(approval); assert.equal(jobs.length, 5); assert.equal(new Set(jobs.map(job => job.id)).size, 5);
  assert.equal(jobs[1].scheduledFor, "2030-01-03T14:30:00.000Z");
  assert.equal(jobs[4].scheduledFor, "2030-01-08T15:00:00.000Z");
  assert.deepEqual(plan(approval), jobs);
  assert.throws(() => plan({...approval, revokedAt: 1}));
  assert.throws(() => plan({...approval, items: [...approval.items, approval.items[0]]}));
});
const input = () => ({job: {id: "snapshot", businessUid: "owner", approvalId: "approval", cycleId: "cycle", kind: "post_1_24h"},
  identity: {providerUserId: "123", handle: "fixture"}, postBindings: [{providerPostId: "456", versionId: "version"}], accessToken: "fixture-only"});
test("snapshot uses GET only and preserves real zero, lifetime counters, and unknown attribution", async () => {
  let reads = 0;
  const snapshot = await collect({...input(), fetchImpl: async (url, options) => {
    reads++; assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    return {ok: true, json: async () => ({data: url.includes("users/me") ? {id: "123", username: "fixture", public_metrics: {followers_count: 0, tweet_count: 4}} :
      [{id: "456", author_id: "123", public_metrics: {impression_count: 10, like_count: 1, retweet_count: 0, reply_count: 0, quote_count: 0}}]})};
  }});
  assert.equal(reads, 2); assert.equal(snapshot.account.followers.value, 0);
  assert.equal(snapshot.posts[0].engagementRate.value, 0.1);
  assert.equal(snapshot.observations[1].measurement, "cumulative");
  assert.equal(snapshot.traffic.status, "NO_DATA"); assert.equal(snapshot.reach.value, null);
});
test("wrong identity fails closed; missing counters never become fabricated zero", async () => {
  await assert.rejects(collect({...input(), fetchImpl: async () => ({ok: true, json: async () => ({data: {id: "other", username: "fixture"}})})}), /identity_mismatch/);
  const snapshot = await collect({...input(), fetchImpl: async url => ({ok: true, json: async () => ({data: url.includes("users/me") ? {id: "123", username: "fixture"} : []})})});
  assert.equal(snapshot.account.followers.status, "UNAVAILABLE");
  assert.equal(snapshot.posts[0].impressions.value, null); assert.equal(snapshot.posts[0].engagementRate.value, null);
});

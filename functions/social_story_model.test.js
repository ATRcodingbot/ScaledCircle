"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const story = require("./social_story_model");
const bytes = Buffer.from("mock story image"), sha = crypto.createHash("sha256").update(bytes).digest("hex");
const media = (provider = "instagram") => story.media({owner: "owner", provider, sha256: sha,
  sourceHashes: ["a".repeat(64)], width: 1080, height: 1920, mime: "image/jpeg", bytes: bytes.length,
  url: `https://scaledcircle.com/social/${sha}.jpg`, renditionRecipe: "story_layout_v1", intentionalRendition: true,
  textBounds: {x: 100, y: 300, width: 880, height: 1200}});
const input = (provider = "instagram") => ({surface: "story", owner: "owner", provider, accountId: "123",
  startsAt: "2030-01-07T05:00:00Z", endsAt: "2030-01-14T05:00:00Z", timeZone: "America/New_York",
  items: ["product_authority", "business_value", "two_sided_model"].map((pillar, i) => ({surface: "story",
    contentId: `story_${i}`, version: 1, text: `Story ${i}`, pillar, media: media(provider),
    scheduledFor: `2030-01-${String(8 + i).padStart(2, "0")}T17:00:00Z`, ctaBehavior: "profile_text"}))});

test("Story namespaces isolate both providers from all feed authority", () => {
  for (const p of ["facebook", "instagram"]) assert.equal(story.paths("owner", p).authority, `socialStoryAuthorities/owner/providers/${p}`);
  assert.throws(() => story.paths("../owner", "instagram"));
  assert.throws(() => story.paths("owner", "x"));
  assert.equal(story.execute, undefined);
  assert.equal(story.approve, undefined);
});
test("three deterministic draft jobs bind separate Story versions without execution authority", () => {
  const i = input(), before = JSON.stringify(i), p = story.week(i), jobs = story.draftJobs(p);
  assert.equal(jobs.length, 3); assert.equal(new Set(jobs.map(j => j.id)).size, 3);
  assert.deepEqual(story.draftJobs(story.week(i)), jobs);
  assert.ok(jobs.every(j => j.surface === "story" && j.approvalId === null && j.publishingEnabled === false));
  assert.equal(JSON.stringify(i), before);
  assert.notEqual(story.week(input("facebook")).id, p.id);
});
test("feed surface, changed digest and substituted media fail closed", () => {
  assert.throws(() => story.week({...input(), surface: "feed"}));
  const p = story.week(input());
  assert.throws(() => story.draftJobs({...p, surface: "feed"}));
  assert.throws(() => story.draftJobs({...p, digest: "f".repeat(64)}));
  assert.throws(() => story.draftJobs({...p, executionEnabled: true}));
  const i = input(); i.items[0].media.owner = "other"; assert.throws(() => story.week(i));
});
test("copy, time, source lineage and rendition changes produce distinct immutable identities", () => {
  const i = input(), original = story.week(i).id;
  i.items[0].text += " changed"; assert.notEqual(story.week(i).id, original);
  const m = media(); assert.notEqual(story.media({...m, sourceHashes: ["b".repeat(64)]}).id, m.id);
  assert.notEqual(story.media({...m, renditionRecipe: "story_layout_v2"}).id, m.id);
});
test("Story media rejects feed geometry, unsafe text, missing lineage and staging origins", () => {
  for (const change of [{height: 1350}, {sourceHashes: []}, {intentionalRendition: false},
    {textBounds: {x: 0, y: 0, width: 1080, height: 1920}}, {mime: "image/png"},
    {url: "https://scaledcircle-staging.web.app/image.jpg"}]) assert.throws(() => story.media({...media(), ...change}));
});
test("anonymous media fetch verifies exact bytes and rejects changed bytes without POST", async () => {
  let calls = 0;
  const fetch = async (url, options) => { calls++; assert.equal(url, media().url); assert.equal(options.method, "GET");
    assert.equal(options.headers, undefined); assert.equal(options.redirect, "error");
    return new Response(bytes, {headers: {"content-type": "image/jpeg"}}); };
  assert.equal((await story.verifyFetch(media(), fetch)).anonymousFetchVerified, true); assert.equal(calls, 1);
  await assert.rejects(story.verifyFetch(media(), async () => new Response("different", {headers: {"content-type": "image/jpeg"}})));
});
test("invalid count, duplicate pillars and out-of-week schedules fail", () => {
  assert.throws(() => story.week({...input(), items: input().items.slice(0, 2)}));
  const i = input(); i.items[0].pillar = i.items[1].pillar; assert.throws(() => story.week(i));
  i.items[0].scheduledFor = "2031-01-01T00:00:00Z"; assert.throws(() => story.week(i));
});
test("unknown outcomes HOLD and expired objects never authorize replacement", () => {
  assert.equal(story.recovery({started: true}, 10), "HOLD_UNKNOWN_OUTCOME");
  assert.equal(story.recovery({providerId: "123", expiresAt: 5}, 10), "EXPIRED_NO_REPLACEMENT");
  assert.equal(story.recovery({providerId: "123", expiresAt: 20}, 10), "RECONCILE_KNOWN_ID");
  assert.equal(story.recovery(null, 10), "NOT_STARTED_NO_AUTHORITY");
});
const observationInput = () => {
  const job = story.draftJobs(story.week(input()))[0];
  return {job, receipt: {surface: "story", jobId: job.id, versionId: job.versionId, mediaRevisionId: job.mediaRevisionId,
    provider: job.provider, accountId: job.accountId, storyId: "456"}, evidence: {surface: "story",
    storyId: "456", accountId: job.accountId, provider: job.provider, observedAt: "2030-01-08T19:00:00Z",
    windowStart: "2030-01-08T17:00:00Z", windowEnd: "2030-01-08T19:00:00Z",
    metrics: [{name: "views", providerMetric: "views", period: "lifetime", status: "OBSERVED", value: 0}]}};
};
test("Story observations preserve zero, unavailable, empty and failed metric distinctions", () => {
  const i = observationInput();
  for (const status of ["NO_DATA", "UNAVAILABLE", "ERROR"]) {
    i.evidence.metrics[0] = {...i.evidence.metrics[0], status, value: null};
    assert.equal(story.observation(i).metrics[0].status, status);
  }
  const zero = observationInput(); assert.equal(story.observation(zero).metrics[0].value, 0);
});
test("feed/account metrics and mismatched Story receipts cannot enter Story learning", () => {
  for (const field of ["surface", "storyId", "accountId", "provider"]) {
    const i = observationInput(); i.evidence[field] = "wrong"; assert.throws(() => story.observation(i));
  }
  const i = observationInput(); i.receipt.mediaRevisionId = "wrong"; assert.throws(() => story.observation(i));
});

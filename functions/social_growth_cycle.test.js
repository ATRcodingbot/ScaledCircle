"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const growth = require("../functions-social-operations/social_growth_cycle");
const reporting = require("../functions-social-operations/social_growth_reporting");
const social = require("../functions-social-operations/social_operations");
const now = Date.parse("2030-01-01T00:00:00Z");
const version = (id = "item_v1", at = "2030-01-02T12:00:00Z") => ({id, record: {
  businessUid: "biz", contentHash: "reviewed-content", version: 1, scheduledFor: at,
  variants: [{provider: "x", copy: "Approved exact copy", mediaAssetId: "media", mediaRevisionId: "revision1"}]}});
const input = () => ({businessUid: "biz", planId: "plan", startsAt: "2030-01-01T00:00:00Z",
  endsAt: "2030-01-31T00:00:00Z", timeZone: "America/New_York", versions: [version()],
  strategy: {themes: ["education"], objectives: ["Observe attributable visits"]}, now});
const approve = (record, patch = {}) => growth.approval({record, businessUid: "biz", expectedDigest: record.digest,
  versionIds: ["item_v1"], windowStart: record.startsAt, windowEnd: "2030-01-08T00:00:00Z", now, ...patch});

test("cycle binds exact content, media, CTA and schedule and preserves four modes", () => {
  assert.deepEqual(growth.MODES, ["observe", "draft", "approval_required", "bounded_managed"]);
  const original = growth.cycle(input());
  for (const change of [x => x.variants[0].copy = "Changed", x => x.variants[0].mediaRevisionId = "revision2",
    x => x.variants[0].responseAssetId = "other", x => x.scheduledFor = "2030-01-03T12:00:00Z"]) {
    const altered = input(); change(altered.versions[0].record);
    assert.notEqual(growth.cycle(altered).digest, original.digest);
  }
  assert.equal(original.externalPublishingEnabled, false);
  assert.equal(original.strategy.timingConfidence, "NO_DATA");
});
test("one-post and weekly approval are bounded; stale hash, wrong tenant and managed escalation fail", () => {
  const record = growth.cycle(input());
  assert.equal(approve(record).approvalClass, "single_post");
  for (const patch of [{businessUid: "other"}, {expectedDigest: "old"}, {versionIds: ["unknown"]},
    {windowEnd: "2030-01-20T00:00:00Z"}, {now: Date.parse("2030-01-03")}]) assert.throws(() => approve(record, patch));
  assert.throws(() => approve({...record, mode: "bounded_managed"}));
  const weekly = growth.cycle({...input(), versions: [version(), version("item2_v1")]});
  assert.equal(approve(weekly, {versionIds: ["item_v1", "item2_v1"]}).approvalClass, "bounded_week");
});
test("duplicate approvals and changed schedule cannot create a second platform-version job", () => {
  const record = growth.cycle(input()), approved = approve(record);
  const first = growth.jobs(approved)[0];
  assert.equal(first.id, growth.jobs({...approved, id: "second_approval"})[0].id);
  assert.equal(first.id, growth.jobs({...approved, items: [{...approved.items[0], scheduledFor: "2030-01-03T12:00:00Z"}]})[0].id);
});
test("Supervisor, production review and schedule fail closed without transport", async () => {
  const job = growth.jobs(approve(growth.cycle(input())))[0];
  assert.equal(growth.publicationGate({job}), "supervisor_paused");
  assert.equal(growth.publicationGate({job, supervisor: {killSwitchActive: false}}), "authority_pending");
  let calls = 0;
  await growth.executeCandidate({store: {get: async () => job}, adapter: {create: () => calls++}, jobId: job.id,
    context: async () => ({supervisor: {killSwitchActive: true}})});
  assert.equal(calls, 0);
});
test("repeated observations of one post and unavailable metrics are not learning samples", () => {
  const snap = social.normalizePerformance({businessUid: "biz", provider: "x", contentItemId: "same", metrics: {engagements: 1}});
  assert.equal(social.weeklyLearning({businessUid: "biz", snapshots: [snap, snap, snap]}).status, "insufficient_evidence");
  const empty = [1, 2, 3].map(x => social.normalizePerformance({businessUid: "biz", provider: "x", contentItemId: `post${x}`}));
  assert.equal(social.weeklyLearning({businessUid: "biz", snapshots: empty}).sampleSize, 0);
});
const observation = (patch = {}) => ({id: "one", businessUid: "biz", provider: "x", metric: "followers",
  definition: "followers_total", sourceRef: "account", evidenceClass: "provider_reported", status: "AVAILABLE",
  value: 0, measurement: "snapshot", observedAt: "2030-01-01T00:00:00Z", ...patch});
const report = (observations, outcomes = []) => reporting.report({businessUid: "biz", provider: "x",
  startsAt: "2030-01-01T00:00:00Z", endsAt: "2030-01-08T00:00:00Z", timeZone: "America/New_York",
  observations, outcomes, now: Date.parse("2030-01-09")});
test("followers use snapshot delta including real zero; chart gaps remain null", () => {
  const result = report([observation(), observation({id: "two", value: 4, observedAt: "2030-01-08T00:00:00Z"})]);
  assert.equal(result.metrics.followers.delta, 4);
  assert.equal(result.metrics.impressions.value, null);
  assert.equal(result.futureChart.connectGaps, false);
  assert.equal(result.attributionIsCausation, false);
});
test("cumulative, overlapping and incompatible measurements never become invented weekly totals", () => {
  const metric = observation({metric: "impressions", measurement: "cumulative", value: 10});
  assert.equal(report([metric]).metrics.impressions.value, null);
  const interval = {...metric, measurement: "interval", periodStart: "2030-01-01T00:00:00Z", periodEnd: "2030-01-08T00:00:00Z"};
  assert.equal(report([interval, interval]).metrics.impressions.value, 10);
  assert.equal(report([interval, {...interval, id: "overlap"}]).metrics.impressions.value, null);
  assert.throws(() => report([interval, {...interval, value: 11}]), /conflict/);
});
test("unsupported observations, cross-tenant evidence and fake leads stay unavailable", () => {
  assert.throws(() => reporting.observation(observation({value: -1})));
  assert.equal(report([observation({businessUid: "other"})]).metrics.followers.value, null);
  assert.equal(report([],[{kind: "lead", eventId: "impression"}]).attributedOutcomes.length, 0);
  const event = {businessUid: "biz", provider: "x", kind: "lead", eventId: "lead1", sourceRecordId: "crm1",
    responseAssetId: "asset1", contentVersionId: "version1", subjectId: "person1", verified: true, occurredAt: "2030-01-02T00:00:00Z"};
  assert.equal(report([], [event, {...event, eventId: "replayed"}]).attributedOutcomes.length, 1);
});
test("zero denominator, partial periods and no evidence do not produce engagement rates", () => {
  assert.equal(report([]).engagementRate.value, null);
  const span = {measurement: "interval", periodStart: "2030-01-01T00:00:00Z", periodEnd: "2030-01-08T00:00:00Z"};
  const result = report([observation({...span, metric: "impressions"}),
    observation({...span, id: "eng", metric: "engagements", value: 2})]);
  assert.equal(result.engagementRate.value, null);
});

module.exports = {input, version, approve};

'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {summarizeJobs} = require('./social_admin_health');
test('canonical queue separates expired approvals from future work without mutating history', () => {
  const now = Date.parse('2026-09-19T12:00:00Z');
  const rows = [
    {status:'published', completedAt:now-1000, providerPostId:'retained'},
    {status:'approved', scheduledFor:'2026-09-10T12:00:00Z'},
    {status:'scheduled', scheduledFor:'2026-09-20T12:00:00Z'},
    {status:'authority_review_required'},
    {status:'canceled'},
    {status:'executing', leaseUntil:now+10000},
  ];
  const before = JSON.stringify(rows), result = summarizeJobs(rows, now);
  assert.equal(result.published, 1); assert.equal(result.scheduled, 1);
  assert.equal(result.needsReview, 3); assert.equal(result.activeLeases, 1);
  assert.equal(result.nextPublishAt, Date.parse('2026-09-20T12:00:00Z'));
  assert.equal(result.lastPublishedAt, now-1000);
  assert.equal(JSON.stringify(rows), before);
});
test('empty and unknown dates never invent a successful publication', () => {
  const result = summarizeJobs([{status:'published'}, {status:'approved'}]);
  assert.equal(result.lastPublishedAt,null); assert.equal(result.nextPublishAt,null);
  assert.equal(result.needsReview,1);
});

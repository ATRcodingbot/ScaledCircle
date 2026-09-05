const test = require('node:test');
const assert = require('node:assert/strict');
const oauth = require('../functions-social-operations/social_oauth');
test('X missing engagement data stays missing; impression counts retain their provider meaning', async () => {
  const snapshots = await oauth.readHistoricalPerformance({provider: 'x', surface: 'x', tokens: {accessToken: 'offline'},
    account: {accountId: 'fixture'}, fetchImpl: async () => ({ok: true, json: async () => ({data: [
      {id: 'one', public_metrics: {impression_count: 0}},
      {id: 'two', public_metrics: {impression_count: 5, like_count: 1, retweet_count: 0, reply_count: 0, quote_count: 0}}
    ]})})});
  assert.equal(snapshots[0].metrics.engagements, null);
  assert.equal(snapshots[0].metrics.impressions, 0);
  assert.equal(snapshots[1].metrics.impressions, 5);
  assert.equal(snapshots[1].metrics.engagements, 1);
});

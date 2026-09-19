'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const bounded = require('../functions-social-operations/social_bounded_authority');
const now = Date.parse('2026-09-19T12:00:00Z');
function fixture() {
  const uid = 'business_owner';
  const plan = {businessUid: uid, status: 'approved', planVersion: 3, approvedVersion: 3,
    strategy: {services: ['decks'], cadence: 2}};
  const policy = bounded.createPolicy({uid, actorUid: uid, planId: 'plan', plan,
    services: ['decks'], destinations: ['https://example.com/decks'], providers: ['facebook'],
    startsAt: now, endsAt: now + 30 * 86400000, now});
  const version = {businessUid: uid, contentHash: 'exact-content', goal: 'More decks',
    scheduledFor: new Date(now + 86400000).toISOString(), variants: [{provider: 'facebook',
      copy: 'Explore options for your outdoor space and decks with our team.',
      destinationUrl: 'https://example.com/decks'}]};
  const quality = {businessUid: uid, immutableSourceHash: 'exact-content', readyToPublish: true,
    advisoryReady: true, reviewChecks: {passed: true}};
  return {uid, planId: 'plan', plan, policy, version, quality, provider: 'facebook', now};
}
test('routine content fits explicit current strategy without individual approval', () => {
  assert.equal(bounded.assess(fixture()).ready, true);
});
test('strategy authority is never inferred from another owner or old strategy', () => {
  const f = fixture();
  assert.throws(() => bounded.createPolicy({...f, actorUid: 'someone_else'}));
  for (const patch of [{businessUid: 'other'}, {status: 'paused'}, {revokedAt: now}, {endsAt: now}]) {
    assert.equal(bounded.assess({...f, policy: {...f.policy, ...patch}}).ready, false);
  }
  assert.equal(bounded.assess({...f, plan: {...f.plan, strategy: {services: ['roofs']}}}).ready, false);
});
test('internal copy, unsupported claims and low quality need attention', () => {
  const f = fixture();
  for (const copy of ['INITIAL_EXPERIMENT for decks', 'We just completed these decks for another happy customer.', 'AI-generated decks']) {
    const version = {...f.version, variants: [{...f.version.variants[0], copy}]};
    assert.equal(bounded.assess({...f, version}).ready, false);
  }
  assert.equal(bounded.assess({...f, quality: {...f.quality, advisoryReady: false}}).ready, false);
  assert.equal(bounded.assess({...f, quality: {...f.quality, immutableSourceHash: 'old'}}).ready, false);
});
test('cadence, repetition, destination, platform and time are bounded', () => {
  const f = fixture();
  const job = {businessUid: f.uid, provider: f.provider, scheduledFor: f.version.scheduledFor, status: 'scheduled'};
  assert.equal(bounded.assess({...f, history: [job, job]}).ready, false);
  assert.equal(bounded.assess({...f, history: [{...job, binding: {variants: f.version.variants}}]}).ready, false);
  assert.equal(bounded.assess({...f, provider: 'youtube'}).ready, false);
  assert.equal(bounded.assess({...f, version: {...f.version, scheduledFor: new Date(now).toISOString()}}).ready, false);
  assert.equal(bounded.assess({...f, version: {...f.version, variants: [{...f.version.variants[0], destinationUrl: 'https://other.example/'}]}}).ready, false);
});

test('case-sensitive destination paths are preserved and missing authority fails closed', () => {
  const f=fixture();
  const policy=bounded.createPolicy({...f,actorUid:f.uid,services:['decks'],
    destinations:['https://example.com/Decks?Campaign=Spring'],providers:['facebook'],
    startsAt:now,endsAt:now+86400000});
  assert.deepEqual(policy.destinations,['https://example.com/Decks?Campaign=Spring']);
  for(const patch of [{startsAt:undefined},{endsAt:undefined},{maxPerWeek:undefined},
    {services:[]},{providers:['youtube']},{destinations:[]}]) {
    assert.equal(bounded.assess({...f,policy:{...f.policy,...patch}}).ready,false);
  }
});

test('publisher rechecks pause, expiry, tenant and exact approved strategy', () => {
  const f=fixture();
  const approval={businessUid:f.uid,planId:f.planId,managedPolicyId:f.policy.id,
    managedStrategyDigest:f.policy.strategyDigest};
  assert.doesNotThrow(()=>bounded.assertRuntimePolicy({...f,approval}));
  for(const patch of [{status:'paused'},{revokedAt:now},{endsAt:now},{startsAt:undefined}]) {
    assert.throws(()=>bounded.assertRuntimePolicy({...f,approval,policy:{...f.policy,...patch}}));
  }
  for(const patch of [{businessUid:'other'},{planId:'other'},{managedStrategyDigest:'stale'}]) {
    assert.throws(()=>bounded.assertRuntimePolicy({...f,approval:{...approval,...patch}}));
  }
  assert.throws(()=>bounded.assertRuntimePolicy({...f,approval,plan:{...f.plan,strategy:{services:['roofs']}}}));
});

test('publication presentation requires actual provider activity and keeps ambiguous attempts in attention',()=>{
 const {publicationPresentation}=require('../functions-social-operations/social_customer_scheduling');
 assert.equal(publicationPresentation({status:'scheduled'},[],100),'scheduled');
 assert.equal(publicationPresentation({status:'scheduled'},[{leaseUntil:200}],100),'publishing');
 assert.equal(publicationPresentation({status:'scheduled'},[{leaseUntil:50}],100),'reconciliation_required');
 assert.equal(publicationPresentation({status:'published'},[{leaseUntil:200}],100),'published');
});

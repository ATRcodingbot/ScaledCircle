'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {VERSION, planSnapshot, createService} = require('./production_hygiene_admin.cjs');
const review = () => ({version:VERSION, projectId:'scaled-circle', operatorEmail:'admin@example.invalid',
  stripeAccountId:'acct_fixture', reason:'Reviewed synthetic cleanup',
  protectedEmails:['owner@example.invalid','admin@example.invalid','worker@example.invalid','billing@example.invalid'],
  protectedUids:['owner','admin','worker','billing'],
  accounts:[{uid:'test-user',email:'test@example.invalid',reviewedSynthetic:true,evidence:'Synthetic emulator fixture'}],
  campaigns:[]});
const snapshot = () => ({projectId:'scaled-circle', users:[{uid:'test-user',email:'test@example.invalid',
  creationTime:'2026-01-01',lastSignInTime:'2026-01-01',customClaims:{}}], rows:[],
  provider:{mode:'live',accountId:'acct_fixture',complete:true,records:[]}});
const row = (path,data) => ({path,data,version:'2026-01-01'});

test('Identity matching never replaces explicit reviewed evidence or protects arbitrary name matches', () => {
  const r=review(),s=snapshot();assert.equal(planSnapshot(s,r).accounts.length,1);
  r.accounts[0].reviewedSynthetic=false;assert.equal(planSnapshot(s,r).holds.length,1);
  r.accounts[0].reviewedSynthetic=true;r.accounts[0].email='real@example.invalid';
  assert.equal(planSnapshot(s,r).holds.length,1);
});
test('Protected and privileged identities are held', () => {
  const r=review(),s=snapshot();r.protectedUids.push('test-user');
  assert.equal(planSnapshot(s,r).holds.length,1);r.protectedUids.pop();
  s.users[0].customClaims={admin:true};assert.equal(planSnapshot(s,r).holds.length,1);
});
test('Provider binding, partial provider inventory and wrong environment fail closed', () => {
  const s=snapshot();s.provider.records=[{metadata:{uid:'test-user'}}];
  assert.equal(planSnapshot(s,review()).holds.length,1);
  s.provider.records=[];s.provider.complete=false;assert.throws(()=>planSnapshot(s,review()));
  s.provider.complete=true;s.projectId='scaledcircle-staging';assert.throws(()=>planSnapshot(s,review()));
});
test('Zero Wallet, audit, consent, subscription, referral and shared references all hold deletion', () => {
  for(const path of ['wallets/test-user','legalConsents/entry','adminAuditEvents/entry',
    'businessSubscriptions/test-user','referralRewards/entry','socialConnections/test-user',
    'businessWorkspaces/shared/members/test-user']) {
    const s=snapshot();s.rows=[row(path,{uid:'test-user',balance:0})];
    assert.equal(planSnapshot(s,review()).holds.length,1,path);
  }
});
test('Only owned ordinary profiles and unaccepted applications are removable', () => {
  const s=snapshot();s.rows=[row('users/test-user',{email:'test@example.invalid',role:'scaler'}),
    row('applications/pending',{scalerId:'test-user',status:'pending'})];
  assert.equal(planSnapshot(s,review()).deletes.length,2);
  s.rows[1].data.status='accepted';assert.equal(planSnapshot(s,review()).holds.length,1);
  s.rows[1].data.status='rejected';s.rows[1].data.acceptedAt='historical';
  assert.equal(planSnapshot(s,review()).holds.length,1);
});
test('Reviewed unfunded campaign is removable; historical funding, accepted zones and shared assets are held', () => {
  const r=review();r.accounts=[];r.campaigns=[{id:'c',businessId:'owner',reviewedSynthetic:true,evidence:'Explicit QA draft'}];
  const s=snapshot();s.rows=[row('campaigns/c',{businessId:'owner',status:'draft',fundingStatus:'unfunded'}),
    row('campaignZones/z',{campaignId:'c',status:'unassigned'})];
  assert.equal(planSnapshot(s,r).deletes.length,2);
  s.rows[0].data.fundedAt='historical';assert.equal(planSnapshot(s,r).holds.length,1);
  delete s.rows[0].data.fundedAt;s.rows[1].data.assignedScalerId='worker';
  assert.equal(planSnapshot(s,r).holds.length,1);
  delete s.rows[1].data.assignedScalerId;s.rows.push(row('marketingMaterials/m',{campaignId:'c'}));
  assert.equal(planSnapshot(s,r).holds.length,1);
});
test('Any source change invalidates the exact preview seal', () => {
  const s=snapshot(),r=review();s.rows=[row('users/test-user',{role:'scaler',email:'test@example.invalid'})];
  const before=planSnapshot(s,r);s.rows[0].data.bio='Changed';
  assert.notEqual(before.seal,planSnapshot(s,r).seal);
});
test('Shared privacy migration receipt is preserved, never deleted or relabeled', () => {
  const r=review();r.accounts=[];r.campaigns=[{id:'c',businessId:'owner',reviewedSynthetic:true,evidence:'QA draft'}];
  const s=snapshot();s.rows=[row('campaigns/c',{businessId:'owner',status:'draft'}),
    row('privacyMigrationAudit/original',{campaigns:['c','other']})];
  const p=planSnapshot(s,r);assert.equal(p.holds.length,0);assert.equal(p.deletes.length,1);
  assert.equal(p.retains.length,1);assert.equal(p.retains[0].path,'privacyMigrationAudit/original');
});
test('No unauthenticated or different operator and no other Firebase project', () => {
  assert.throws(()=>createService({projectId:'scaled-circle',review:review(),actor:{kind:'user',email:'admin@example.invalid'}}));
  assert.throws(()=>createService({projectId:'scaled-circle',review:review(),actor:{kind:'google_iam_admin',email:'other@example.invalid'}}));
  assert.throws(()=>createService({projectId:'scaledcircle-staging',review:review(),actor:{}}));
});

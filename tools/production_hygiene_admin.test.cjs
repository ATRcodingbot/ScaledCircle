'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {VERSION, planSnapshot, createService,draftArchivePlan,legacyVisibilityArchivePlan} = require('./production_hygiene_admin.cjs');
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
test('Explicitly reviewed empty Business Wallet can be removed with its synthetic identity only', () => {
  const r=review(),s=snapshot();r.accounts[0].zeroWalletDisposition='delete_verified_empty';
  const wallet={ownerId:'test-user',ownerType:'business',availableBalance:0,availableCredits:0,
    balance:0,pendingBalance:0,promotionalCreditsGranted:0,reservedCredits:0};
  s.rows=[row('users/test-user',{email:'test@example.invalid',role:'business'}),row('wallets/test-user',wallet)];
  const p=planSnapshot(s,r);assert.equal(p.holds.length,0);assert.equal(p.accounts.length,1);
  assert.deepEqual(p.deletes.map(x=>x.path),['users/test-user','wallets/test-user']);
  for(const key of ['availableBalance','availableCredits','balance','pendingBalance','promotionalCreditsGranted','reservedCredits']) {
    wallet[key]=1;assert.equal(planSnapshot(s,r).holds.length,1,key);wallet[key]=0;
  }
  wallet.stripeCustomerId='cus_history';assert.equal(planSnapshot(s,r).holds.length,1);delete wallet.stripeCustomerId;
  s.rows.push(row('wallets/test-user/transactions/zero-history',{amount:0}));
  assert.equal(planSnapshot(s,r).holds.length,1);
});
test('Email-only economic references also prevent synthetic identity deletion',()=>{
  const s=snapshot();s.rows=[row('payouts/history',{recipientEmail:'test@example.invalid',amount:100})];
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
test('Draft archival preserves records and requires exact expired/unpaid provider proof',()=>{
  const r={...review(),archives:[{id:'c',businessId:'owner',reviewedSynthetic:true,evidence:'QA draft'}]};
  const s=snapshot();s.rows=[row('campaigns/c',{businessId:'owner',status:'draft',fundingStatus:'unfunded',fundingPaymentId:'p'}),
    row('campaignPayments/p',{campaignId:'c',status:'checkout_created'})];
  assert.throws(()=>draftArchivePlan(s,r));
  s.provider.records=[{type:'checkout/sessions',id:'cs',metadata:{campaignId:'c',paymentId:'p'},status:'expired',payment_status:'unpaid'}];
  const p=draftArchivePlan(s,r);assert.equal(p.records.length,1);assert.equal(p.records[0].refs.length,2);
  s.provider.records[0].payment_status='paid';assert.throws(()=>draftArchivePlan(s,r));
  s.provider.records[0].payment_status='unpaid';s.rows[0].data.fundingStatus='reserved';
  assert.throws(()=>draftArchivePlan(s,r));
});
test('Unclassified, assigned and completed work cannot be archived by the draft path',()=>{
  const r={...review(),archives:[{id:'c',businessId:'owner',reviewedSynthetic:true,evidence:'QA draft'}]};
  for(const extra of [row('unknownObligations/u',{campaignId:'c'}),
    row('campaignZones/z',{campaignId:'c',status:'assigned'}),row('campaignCompletions/job',{campaignId:'c',status:'approved'})]){
    const s=snapshot();s.rows=[row('campaigns/c',{businessId:'owner',status:'draft'}),extra];
    assert.throws(()=>draftArchivePlan(s,r));
  }
});
test('Legacy launch archive preserves outstanding economics and requires explicit single-record review',()=>{
  const s=snapshot(),r={...review(),archives:[{id:'c',businessId:'owner',reviewedSynthetic:true,
    evidence:'Reviewed legacy synthetic opportunity',preserveOutstandingObligations:true}]};
  s.rows=[row('campaigns/c',{businessId:'owner',status:'open',reservedAmount:50}),
    row('campaignZones/z',{campaignId:'c',assignedScalerId:'test-user',status:'in_progress'}),
    row('payouts/p',{campaignId:'c',amount:15,status:'paid'})];
  const p=legacyVisibilityArchivePlan(s,r);assert.equal(p.records[0].refs.length,3);
  assert.equal(p.records[0].obligations,'unresolved_preserved');assert.equal(p.deletes,undefined);
  s.rows[1].data.activeTrackingSessionId='session';assert.throws(()=>legacyVisibilityArchivePlan(s,r));
  delete s.rows[1].data.activeTrackingSessionId;r.archives[0].preserveOutstandingObligations=false;
  assert.throws(()=>legacyVisibilityArchivePlan(s,r));
});

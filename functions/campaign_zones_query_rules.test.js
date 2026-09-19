'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {initializeTestEnvironment, assertFails, assertSucceeds} = require('@firebase/rules-unit-testing');
let env;
const store = uid => env.authenticatedContext(uid, {email_verified: true}).firestore();
const zones = (db, campaignId = 'draft', businessId = 'owner') => db.collection('campaignZones').where('campaignId', '==', campaignId).where('businessId', '==', businessId);
const boundary = [{latitude:39,longitude:-76},{latitude:39.001,longitude:-76},{latitude:39,longitude:-75.999}];
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
  env = await initializeTestEnvironment({projectId:'demo-campaign-zone-boundary',firestore:{rules:fs.readFileSync(path.join(__dirname,process.env.CAMPAIGN_RULES_FILE || '../firestore.production.rules'),'utf8')}});
  await env.withSecurityRulesDisabled(async ctx => {
    const db=ctx.firestore();
    for (const uid of ['owner','member','other','revoked']) await db.doc(`users/${uid}`).set({role:'business',active:true});
    await db.doc('businessSubscriptions/owner').set({status:'active',plan:'growth',expiresAt:new Date(Date.now()+86400000)});
    for (const uid of ['member','revoked']) await db.doc(`businessWorkspaces/owner/members/${uid}`).set({uid,businessId:'owner',status:uid==='revoked'?'removed':'active',seatIndex:1,permissions:['campaigns']});
    for (const id of ['draft','empty']) await db.doc(`campaigns/${id}`).set({businessId:'owner',status:'draft',certificationFixture:false,serviceArea:boundary,propertyIntelligenceAnalysisId:'analysis'});
    await db.doc('campaigns/foreign').set({businessId:'other',status:'draft'});
    await db.doc('campaignZones/saved').set({campaignId:'draft',businessId:'owner',status:'unassigned',assignedScalerId:null,serviceArea:boundary,serviceAreaPointCount:3});
    await db.doc('campaignZones/foreign').set({campaignId:'foreign',businessId:'other',status:'unassigned',assignedScalerId:null});
  });
});
after(async()=>env?.cleanup());
test('reproduces old campaign-only query denial, including empty draft',async()=>{
  for(const id of ['draft','empty']) await assertFails(store('owner').collection('campaignZones').where('campaignId','==',id).get());
});
test('tenant-bound queries initialize empty map and return only intended campaign geometry',async()=>{
  for(const uid of ['owner','member']) {
    assert.equal((await assertSucceeds(zones(store(uid),'empty').get())).size,0);
    const result=await assertSucceeds(zones(store(uid)).get());
    assert.deepEqual(result.docs.map(d=>d.id),['saved']);
    assert.deepEqual(result.docs[0].data().serviceArea,boundary);
    const campaign=await assertSucceeds(store(uid).doc('campaigns/draft').get());
    assert.deepEqual(campaign.data().serviceArea,boundary);
    assert.equal(campaign.data().propertyIntelligenceAnalysisId,'analysis');
  }
});
test('tenant predicate cannot grant unrelated, revoked, or signed-out access',async()=>{
  for(const uid of ['other','revoked']) await assertFails(zones(store(uid)).get());
  await assertFails(zones(env.unauthenticatedContext().firestore()).get());
  await assertFails(zones(store('member'),'foreign','other').get());
  await assertFails(zones(store('owner'),'foreign','other').get());
});
test('map read authorization does not allow ownership or funding transitions',async()=>{
  for(const uid of ['owner','member']) {
    await assertSucceeds(store(uid).doc('campaigns/draft').update({campaignName:`Draft edited by ${uid}`}));
    await assertFails(store(uid).doc('campaigns/draft').update({businessId:'other'}));
    await assertFails(store(uid).doc('campaigns/draft').update({fundingStatus:'funded',status:'open'}));
    await assertFails(store(uid).doc('campaignZones/saved').update({businessId:'other'}));
  }
});

// Production already enforces closure revocation; preserve that live safeguard
// when releasing the independent campaign ownership/query repair.
if (!process.env.CAMPAIGN_RULES_FILE || process.env.CAMPAIGN_RULES_FILE.includes('production')) {
  test('closed owner and closed member cannot read campaigns or tenant-scoped zones', async () => {
    for (const uid of ['owner', 'member']) {
      await assertSucceeds(store(uid).doc('campaigns/draft').get());
      await assertSucceeds(zones(store(uid)).get());
      await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`accountClosures/${uid}`).set({status:'closed'}));
      try {
        await assertFails(store(uid).doc('campaigns/draft').get());
        await assertFails(zones(store(uid)).get());
        await assertFails(store(uid).doc('campaignZones/saved').get());
      } finally {
        await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`accountClosures/${uid}`).delete());
      }
    }
  });
}

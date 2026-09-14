'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'diversity'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('diversifies only unscheduled versions; disabled generation never substitutes reused media or approves',async()=>{
 const uid='diversity_owner',itemId='diversity_post',now=Date.parse('2026-09-14T01:00:00Z');
 const source=require('../functions-social-operations/social_operations').contentItemVersion({businessUid:uid,planId:'diversity_plan',now,
  item:{itemKey:'post',scheduledFor:'2026-10-01T16:00:00Z',goal:'Invite a useful conversation',pillar:'Your priorities',variants:
   ['facebook','instagram'].map(provider=>({provider,copy:'Which matters most for your next deck project: function, materials or timing? Share your priorities with us.',mediaRequirement:'image'}))}});
 const frozen={businessUid:uid,versionId:itemId+'_v1',provider:'instagram',status:'scheduled',scheduledFor:source.scheduledFor};
 await Promise.all([db.doc('socialContentItems/'+itemId).set({businessUid:uid,planId:'diversity_plan',currentVersion:1}),
  db.doc('socialContentVersions/'+itemId+'_v1').set({...source,scheduledFor:Timestamp.fromDate(new Date(source.scheduledFor))}),
  db.doc('businessBrandProfiles/'+uid).set({businessUid:uid,approvedServiceCategories:['decks']}),
  db.doc('socialGrowthJobs/diversity_frozen').set(frozen)]);
 const editor=require('../functions-social-operations/social_customer_editor').createEditor({db,now:()=>now,enabledUids:[uid]});
 const prepare=require('../functions-social-operations/social_customer_preparation').createPreparation({db,editor,now:()=>now,media:{attach(){throw Error('must not attach');}}});
 const text=await prepare.prepare(uid,{itemId,provider:'facebook',version:1});
 assert.equal(text.creativeStatus,'text_only');assert.equal(text.version,2);
 const v=(await db.doc('socialContentVersions/'+itemId+'_v2').get()).data();
 assert.equal(v.variants.find(r=>r.provider==='facebook').mediaRequirement,'none');
 assert.equal(v.scheduledFor,source.scheduledFor);assert.equal(v.approvedAt,null);
 assert.equal((await db.doc('socialContentItems/'+itemId).get()).data().platformVersions.instagram,1);
 assert.deepEqual((await db.doc('socialGrowthJobs/diversity_frozen').get()).data(),frozen);
 const replay=await prepare.prepare(uid,{itemId,provider:'facebook',version:2});assert.equal(replay.creativeStatus,'prepared');
 const newId='diversity_new';await db.doc('socialContentItems/'+newId).set({businessUid:uid,planId:'diversity_plan',currentVersion:1});
 await db.doc('socialContentVersions/'+newId+'_v1').set({...source,pillar:'Explore decks',goal:'Explore a service'});
 const held=await prepare.prepare(uid,{itemId:newId,provider:'instagram',version:1});
 assert.equal(held.creativeStatus,'needs_creative');assert.equal(held.generationStatus,'configuration_unavailable');assert.equal(held.generationRequest,null);
 const d=require('../functions-social-operations/social_creative_diversity');
 const lease=(await db.doc('socialCreativePreparation/'+d.leaseId(uid,{itemId:newId,provider:'instagram'})).get()).data();
 assert.equal(lease.state,'needs_attention');assert.equal(lease.recommendation.format,'generated');
 for(const collection of ['socialGrowthApprovals','visualGenerationJobs','financialOperations'])assert.equal((await db.collection(collection).where('businessUid','==',uid).get()).size,0);
});

'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const {createEditor}=require('../functions-social-operations/social_customer_editor');
const {createStore}=require('../functions-social-operations/social_customer_scheduling');
const social=require('../functions-social-operations/social_operations');
const {fixture}=require('./social_customer_scheduling.test');
const app=initializeApp({projectId:'demo-scaledcircle'},'customer-editor'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('transactional edit/assessment isolation; one new version; no approval, history or other-platform changes',async()=>{
 const f=fixture(),uid='editor_business',itemId='editor_plan_post',planId='editor_plan';
 const initial=social.contentItemVersion({businessUid:uid,planId,item:{itemKey:'post',scheduledFor:f.version.scheduledFor,
  goal:'Local business services',variants:[{provider:'facebook',format:'text',copy:'Editor Company provides careful local repair services. Read our service details and contact the team.',
  callToAction:'Learn more',destinationUrl:'https://example.com/services',mediaRequirement:'none'},
  {provider:'instagram',format:'feed',copy:'Instagram separate draft',mediaRequirement:'image'}]}});
 const writes={['socialContentPlans/'+planId]:{...f.plan,businessUid:uid},['socialContentItems/'+itemId]:{businessUid:uid,planId,currentVersion:1},
  ['socialContentVersions/'+itemId+'_v1']:initial,['businessGrowthProfiles/'+uid]:{businessName:'Editor Company',services:['repair'],city:'local'},
  [`socialConnections/${uid}/providers/facebook`]:{...f.connection,businessUid:uid},['agentHealth/'+uid]:f.health,
  ['socialProviderConfigs/production_meta']:f.config,['businessSubscriptions/'+uid]:f.entitlement};
 await Promise.all(Object.entries(writes).map(([p,v])=>db.doc(p).set(v)));
 const editor=createEditor({db,enabledUids:[uid],now:()=>f.now}),store=createStore({db,enabledUids:[uid],environment:'production',now:()=>f.now});
 const input={itemId,provider:'facebook',version:1,copy:initial.variants[0].copy+' New draft.',callToAction:'Learn more',destinationUrl:'https://example.com/services',
  scheduledFor:new Date(f.now+3600000).toISOString(),textOnly:true};
 const concurrent=await Promise.allSettled([editor.save(uid,input),editor.save(uid,input)]);
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.doc('socialContentItems/'+itemId).get()).data().platformVersions.instagram,1);
 assert.deepEqual((await db.doc('socialContentVersions/'+itemId+'_v1').get()).data(),initial);
 assert.deepEqual((await db.doc('socialContentPlans/'+planId).get()).data(),writes['socialContentPlans/'+planId]);
 const instagram=await store.preview(uid,{itemId,provider:'instagram'});assert.equal(instagram.version,1);assert.equal(instagram.scheduledFor,initial.scheduledFor);
 assert.equal((await store.preview(uid,{itemId,provider:'facebook'})).version,2);
 const assessed=await editor.assess(uid,{itemId,provider:'facebook',version:2});assert.equal(assessed.variantAssessments.length,1);
 assert.equal(assessed.provider,'facebook');assert.equal(assessed.providerMutationsEnabled,false);
 assert.equal((await db.doc('socialContentQualityAssessments/'+itemId+'_v1_instagram').get()).exists,false);
 await assert.rejects(editor.save('other',input));await assert.rejects(editor.save(uid,input));
 assert.equal((await db.collection('socialGrowthApprovals').where('businessUid','==',uid).get()).size,0);
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,0);
 const before=(await db.doc('socialContentItems/'+itemId).get()).data();
 await db.doc('socialGrowthJobs/editor_existing').set({businessUid:uid,provider:'facebook',versionId:itemId+'_v2',status:'scheduled'});
 await assert.rejects(editor.save(uid,{...input,version:2}));
 assert.deepEqual((await db.doc('socialContentItems/'+itemId).get()).data(),before);
 const other=await editor.save(uid,{...input,provider:'instagram',version:1,textOnly:false});assert.equal(other.version,3);
 const state=(await db.doc('socialContentItems/'+itemId).get()).data();assert.equal(state.platformVersions.facebook,2);assert.equal(state.platformVersions.instagram,3);
});

'use strict';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('emulator required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-internal-social'},'internal-social'),db=getFirestore(app);after(async()=>{await db.terminate();await deleteApp(app)});
test('exact internal owner previews without writes then atomically authorizes context and policy; no publication or billing',async()=>{
 const uid='internal_'+Date.now(),now=Date.parse('2026-09-20T15:00:00Z');
 const config={provider:'meta',environment:'production',enabled:true,writeScopesEnabled:true,metaDogfood:{businessUid:uid,pageId:'123',pageName:'Scaled Circle',instagramId:'456',instagramUsername:'scaledcircleapp'}};
 await db.doc('users/'+uid).set({role:'admin',active:false});await db.doc('socialProviderConfigs/production_meta').set(config);
 for(const provider of ['facebook','instagram']){
 await db.doc(`socialConnections/${uid}/providers/${provider}`).set({businessUid:uid,environment:'production',status:'connected_write',tokenHealth:'healthy',providerUserId:provider==='facebook'?'123':'456',linkedPageId:'123',connectionRevision:1,credentialRotationGeneration:1,grantedScopes:require('../functions-social-operations/social_oauth').META_PUBLISH_SCOPES});
 await db.doc('socialContentPlans/'+uid+'_'+provider).set({businessUid:uid,approvedByUid:uid,status:'approved',planVersion:1,approvedVersion:1,contentHash:'a'.repeat(64),items:[{variants:[{provider,destinationUrl:'https://scaledcircle.com/'}]}]});
 }
 const service=require('../functions-social-operations/social_managed_settings').createSettings({db,environment:'production',now:()=>now});
 const args={planId:'internal_meta_strategy',maxPerWeek:5,cadenceSettings:{mode:'adaptive'}};
 const preview=await service.preview(uid,args);assert.deepEqual(preview.providers,['facebook','instagram']);assert.equal(preview.businessName,'ScaledCircle');assert.equal(preview.providerAccounts.length,2);
 assert.equal((await db.doc('businessGrowthProfiles/'+uid).get()).exists,false);
 await assert.rejects(service.preview('wrong',args));await assert.rejects(service.change(uid,'member',{...args,action:'enable'}));
 const confirm={...args,action:'enable',confirmAutomaticPublishing:true,reviewDigest:preview.reviewDigest};
 assert.equal((await service.change(uid,uid,confirm)).status,'active');assert.equal((await service.change(uid,uid,confirm)).reused,true);
 const policy=(await db.doc('socialManagedPolicies/'+uid).get()).data(),profile=(await db.doc('businessGrowthProfiles/'+uid).get()).data(),plan=(await db.doc('socialContentPlans/'+policy.planId).get()).data();
 assert.equal(profile.businessUid,uid);assert.equal(plan.approvedByUid,uid);assert.equal(policy.cadence.mode,'adaptive');assert.equal(policy.maxPerWeek,5);assert.equal(plan.items.length,6);
 assert.equal((await db.collection('socialContentVersions').where('businessUid','==',uid).get()).size,6);
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,0);assert.equal((await db.doc('businessSubscriptions/'+uid).get()).exists,false);
 assert.deepEqual((await db.doc('businessBrandProfiles/'+uid).get()).data().approvedServiceCategories,profile.servicesOffered.slice().sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())));
 const categories=require('../functions-social-operations/social_managed_categories');
 await db.doc('businessBrandProfiles/'+uid).delete(); // emulator: simulate pre-repair authorized profile
 assert.equal((await categories.reconcile({db,uid,now})).status,'configured');
 assert.equal((await categories.reconcile({db,uid,now})).status,'preserved');
 assert.deepEqual((await db.doc('socialManagedPolicies/'+uid).get()).data(),policy);
 const supply=require('../functions-social-operations/social_managed_supply');
 const first=await supply.replenish({db,uid,now});assert.equal(first.status,'planning_buffer_covered');assert.equal(first.constraints.length,4);assert.ok(first.constraints.some(x=>x.includes('earlier provider costs')));
 const firstItem=plan.items[0],versionId=policy.planId+'_'+firstItem.itemKey+'_v1';
 await db.doc('socialGrowthJobs/emulator_'+uid).set({businessUid:uid,provider:'facebook',versionId,status:'published',providerPostId:'emulator-proof',scheduledFor:new Date(now-86400000).toISOString()});
 const fresh=await supply.replenish({db,uid,now});assert.equal(fresh.status,'draft_created');assert.ok(fresh.topicId.startsWith('scaledcircle:'));
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,1);
 assert.deepEqual((await db.doc('socialManagedSupplyStatus/'+uid).get()).data().constraints,first.constraints);
 assert.deepEqual((await db.doc('socialContentPlans/'+policy.planId).get()).data(),plan);
 assert.equal((await db.doc('businessSubscriptions/'+uid).get()).exists,false);
 assert.equal((await service.change(uid,uid,{action:'pause'})).status,'paused');assert.equal((await service.change(uid,uid,{action:'resume'})).status,'active');
});



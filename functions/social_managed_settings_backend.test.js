'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'managed-settings'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('owner explicitly authorizes exact scope; stale review and other tenant fail; pause/resume audit is idempotent',async()=>{
 const f=require('./social_customer_scheduling.test').fixture(),uid='settings_'+Date.now(),planId=uid+'_plan';
 const write=(p,d)=>db.doc(p).set(d);
 await Promise.all([write('socialContentPlans/'+planId,{...f.plan,businessUid:uid,strategy:{services:['Decks']},
  items:[{itemKey:'one',variants:[{provider:'facebook',destinationUrl:'https://example.com/Decks'}]}]}),
  write('businessGrowthProfiles/'+uid,{businessUid:uid,businessName:'Test Business'}),write('businessSubscriptions/'+uid,f.entitlement),
  write('socialProviderConfigs/production_meta',f.config),write('agentHealth/'+uid,f.health),
  write(`socialConnections/${uid}/providers/facebook`,{...f.connection,businessUid:uid})]);
 const service=require('../functions-social-operations/social_managed_settings').createSettings({db,environment:'production',now:()=>f.now});
 const scope=await service.preview(uid,{planId,maxPerWeek:2});
 assert.deepEqual(scope.providers,['facebook']);assert.equal(scope.destinations[0],'https://example.com/Decks');
 const input={action:'enable',planId,maxPerWeek:2,reviewDigest:scope.reviewDigest,confirmAutomaticPublishing:true};
 await assert.rejects(service.change(uid,'other',input));
 await assert.rejects(service.change(uid,uid,{...input,maxPerWeek:7}));
 await assert.rejects(service.change(uid,uid,{...input,confirmAutomaticPublishing:false}));
 assert.equal((await service.change(uid,uid,input)).status,'active');
 assert.equal((await service.change(uid,uid,input)).reused,true);
 assert.equal((await service.change(uid,uid,{action:'pause'})).status,'paused');
 assert.equal((await service.change(uid,uid,{action:'resume'})).status,'active');
 const audits=await db.collection('socialManagedPolicyAudit').where('businessUid','==',uid).get();assert.equal(audits.size,3);
 await db.doc('socialContentPlans/'+planId).update({'strategy.services':['Roofs']});
 await assert.rejects(service.change(uid,uid,{action:'resume'}));
});

test('cadence slot allocation stays in the authorized window and skips occupied slots',()=>{
 const {nextSlot}=require('../functions-social-operations/social_bounded_authority');
 const now=Date.now(),policy={businessUid:'owner',startsAt:now,endsAt:now+30*86400000,maxPerWeek:2};
 const first=nextSlot({policy,history:[],provider:'facebook',now});assert.ok(Date.parse(first)>=now+3600000);
 const history=[{businessUid:'owner',provider:'facebook',scheduledFor:first,status:'scheduled'}];
 const next=nextSlot({policy,history,provider:'facebook',now,preferred:first});
 assert.ok(Date.parse(next)-Date.parse(first)>=6*3600000);
 assert.equal(nextSlot({policy:{...policy,endsAt:now+1000},history:[],provider:'facebook',now}),null);
});

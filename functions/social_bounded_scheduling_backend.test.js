'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const {fixture}=require('./social_customer_scheduling.test');
const {createStore}=require('../functions-social-operations/social_customer_scheduling');
const bounded=require('../functions-social-operations/social_bounded_authority');
const app=initializeApp({projectId:'demo-scaledcircle'},'bounded-scheduling'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('managed scheduling serializes cadence, retains strategy attribution and deduplicates retries',async()=>{
 const f=fixture(),uid='bounded_'+Date.now(),planId=uid+'_plan';
 const plan={...f.plan,businessUid:uid,strategy:{services:['decks']}};
 const policy=bounded.createPolicy({uid,actorUid:uid,planId,plan,services:['decks'],
   destinations:['https://example.com/decks'],providers:['facebook'],maxPerWeek:1,
   startsAt:f.now,endsAt:f.now+30*86400000,now:f.now});
 const write=(p,d)=>db.doc(p).set(d);
 await Promise.all([write('socialContentPlans/'+planId,plan),write('socialManagedPolicies/'+uid,policy),
   write(`socialConnections/${uid}/providers/facebook`,{...f.connection,businessUid:uid}),
   write('agentHealth/'+uid,f.health),write('socialProviderConfigs/production_meta',f.config),
   write('businessSubscriptions/'+uid,f.entitlement)]);
 const inputs=[];
 for(let n=0;n<2;n++){
   const itemId=uid+'_post'+n;
   const version=require('../functions-social-operations/social_operations').contentItemVersion({businessUid:uid,planId,now:f.now,
     item:{itemKey:itemId,goal:'Decks',pillar:'Decks',scheduledFor:f.version.scheduledFor,
       variants:[{provider:'facebook',format:'text',mediaRequirement:'none',copy:'Explore decks for your outdoor space. Design option '+n+'.'}]}});
   await Promise.all([write('socialContentItems/'+itemId,{...f.item,businessUid:uid,planId}),
     write('socialContentVersions/'+itemId+'_v1',version),write('socialContentQualityAssessments/'+itemId+'_v1',
       {...f.quality,businessUid:uid,immutableSourceHash:version.contentHash,advisoryReady:true})]);
   inputs.push({itemId,provider:'facebook'});
 }
 const store=createStore({db,planEntitled:true,environment:'production',now:()=>f.now});
 const results=await Promise.all(inputs.map(input=>store.scheduleManaged(uid,input,policy.id)));
 assert.equal(results.filter(r=>r.status==='scheduled').length,1,JSON.stringify(results));
 assert.equal(results.filter(r=>r.status==='blocked').length,1);
 const jobs=await db.collection('socialGrowthJobs').where('businessUid','==',uid).get();
 assert.equal(jobs.size,1);
 const approvals=await db.collection('socialGrowthApprovals').where('businessUid','==',uid).get();
 assert.equal(approvals.size,1);
 const approval=approvals.docs[0].data();
 assert.equal(approval.authorizationSource,'approved_strategy');
 assert.equal(approval.executionActor,'managed_social_scheduler');
 assert.equal(approval.managedPolicyId,policy.id);
 const winner=inputs[results.findIndex(r=>r.status==='scheduled')];
 assert.equal((await store.scheduleManaged(uid,winner,policy.id)).reused,true);
 await write('socialManagedPolicies/'+uid,{...policy,status:'paused'});
 const loser=inputs[results.findIndex(r=>r.status==='blocked')];
 assert.equal((await store.scheduleManaged(uid,loser,policy.id)).status,'blocked');
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,1);
});

test('managed preparation cycle resumes its cursor and preserves already scheduled posts',async()=>{
 const f=fixture(),uid='managed_cycle_'+Date.now(),planId=uid+'_plan';
 const plan={...f.plan,businessUid:uid,strategy:{services:['decks']},items:[
   {itemKey:'one',variants:[{provider:'facebook'}]},
   {itemKey:'two',variants:[{provider:'facebook'}]},
   {itemKey:'three',variants:[{provider:'facebook'}]}]};
 const policy=bounded.createPolicy({uid,actorUid:uid,planId,plan,services:['decks'],
   destinations:['https://example.com/decks'],providers:['facebook'],startsAt:f.now,endsAt:f.now+86400000,now:f.now});
 await db.doc('socialContentPlans/'+planId).set(plan);
 await db.doc('socialManagedPolicies/'+uid).set(policy);
 const prepared=[],scheduled=[];
 const cycle=require('../functions-social-operations/social_managed_cycle').createCycle({db,now:()=>f.now,
   store:{preview:async(_,input)=>({version:1,reasons:[],creativeNeedsPreparation:true,
     publicationStatus:input.itemId.endsWith('_one')?'scheduled':null}),
     scheduleManaged:async(_,input,id)=>{assert.equal(id,policy.id);scheduled.push(input.itemId);return {status:'scheduled'};}},
   preparation:{prepare:async(_,input)=>prepared.push(input.itemId)}});
 const first=await cycle.run(uid,{limit:2});
 assert.equal(first.results[0].preserved,true);
 assert.deepEqual(prepared,[planId+'_two']);
 await cycle.run(uid,{limit:1});
 assert.deepEqual(scheduled,[planId+'_two',planId+'_three']);
 await db.doc('socialManagedPolicies/'+uid).update({status:'paused'});
 await assert.rejects(cycle.run(uid),/authority_changed/);
 assert.equal(scheduled.length,2);
 assert.equal((await db.doc('socialManagedCycles/'+uid).get()).data().status,'needs_attention');
});

test('unactivated workspace never prepares or schedules content',async()=>{
 const uid='managed_no_authority_'+Date.now();
 const cycle=require('../functions-social-operations/social_managed_cycle').createCycle({db,
   store:{preview:async()=>assert.fail('no preview without authority')},
   preparation:{prepare:async()=>assert.fail('no generation without authority')}});
 await assert.rejects(cycle.run(uid),/authority_missing/);
});

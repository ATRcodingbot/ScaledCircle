'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,after}=require('node:test'),assert=require('assert/strict'),crypto=require('crypto');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-managed-supply'},'managed-supply'),db=getFirestore(app);
const bounded=require('../functions-social-operations/social_bounded_authority');
const supply=require('../functions-social-operations/social_managed_supply');
after(async()=>{await db.terminate();await deleteApp(app)});
async function fixture(){const uid='supply_'+crypto.randomUUID(),planId=uid+'_plan',now=1900000000000;
 const plan={businessUid:uid,status:'approved',planVersion:1,approvedVersion:1,strategy:{services:['decks']},items:[]};
 const policy={...bounded.createPolicy({uid,actorUid:uid,planId,plan,services:['decks'],providers:['facebook','instagram'],destinations:['https://example.com/'],startsAt:now,endsAt:now+30*86400000,now}),reviewedScope:{businessName:'Example Builder'}};
 const data={['socialManagedPolicies/'+uid]:policy,['socialContentPlans/'+planId]:plan,['users/'+uid]:{role:'business',active:true},
 ['businessSubscriptions/'+uid]:{plan:'managed_growth',status:'active',expiresAt:new Date(now+40*86400000)},
 ['businessGrowthProfiles/'+uid]:{businessUid:uid,businessName:'Example Builder',servicesOffered:['decks'],website:'https://example.com'},
 ['discoveryPreferences/'+uid]:{schemaVersion:'ServiceAreaPreferencesV1',userUid:uid,role:'business',areas:[{id:'county',type:'place',geographyType:'county',county:'Example County',state:'Maryland',displayName:'Example County',enabled:true}]},
 ['agentHealth/'+uid]:{killSwitchActive:false}};
 for(const provider of policy.providers)data[`socialConnections/${uid}/providers/${provider}`]={businessUid:uid,status:'connected_write',tokenHealth:'healthy'};
 for(const [p,v]of Object.entries(data))await db.doc(p).set(v);
 return {uid,planId,now,policy,plan};}
const rows=async(c,uid)=>(await db.collection(c).where('businessUid','==',uid).get()).docs.map(d=>({id:d.id,...d.data()}));
test('recurring supply creates one immutable source idea with platform variants, no approvals/jobs or plan mutation',async()=>{
 const f=await fixture(),before=(await db.doc('socialContentPlans/'+f.planId).get()).data();
 const results=await Promise.all([supply.replenish({db,uid:f.uid,now:f.now}),supply.replenish({db,uid:f.uid,now:f.now})]);
 assert.equal(results.filter(r=>r.status==='draft_created').length,1);
 const items=await rows('socialContentItems',f.uid),versions=await rows('socialContentVersions',f.uid);
 assert.equal(items.length,1);assert.equal(versions.length,1);assert.equal(versions[0].variants.length,2);
 assert.equal(items[0].managedPolicyId,f.policy.id);assert.equal((await rows('socialManagedDraftAudit',f.uid)).length,1);
 assert.deepEqual((await db.doc('socialContentPlans/'+f.planId).get()).data(),before);
 for(const c of ['socialGrowthApprovals','socialGrowthJobs','generatedMediaJobs'])assert.equal((await rows(c,f.uid)).length,0);
 for(const v of versions[0].variants){assert.match(v.copy,/decks/);assert.equal(bounded.internalCopy.test(v.copy),false);assert.equal(bounded.unsupportedClaim.test(v.copy),false);}
 const supplemental=await supply.supplemental({db,uid:f.uid,planId:f.planId});assert.equal(supplemental.length,1);
 assert.equal((await supply.supplemental({db,uid:f.uid,planId:'other'})).length,0);
 // Canonical read model exposes new drafts without adding them to strategy.
 const projected=await require('../functions-social-operations/social_customer_post_projection').load({db,uid:f.uid,plans:[{id:f.planId,...before}],store:{preview:async()=>({version:1,scheduledFor:versions[0].scheduledFor,ready:false})}});
 assert.equal(projected[0].items.length,1);assert.equal(before.items.length,0);
});
test('pause, revoked/expired policy, wrong owner, inactive customer and unpaid access deny supply',async()=>{
 for(const change of ['paused','revoked','expired','owner','inactive','starter']){
  const f=await fixture(),ref=db.doc('socialManagedPolicies/'+f.uid);
  if(change==='paused')await ref.update({status:'paused'});
  if(change==='revoked')await ref.update({revokedAt:f.now});
  if(change==='expired')await ref.update({endsAt:f.now-1});
  if(change==='owner')await ref.update({approvedByUid:'other'});
  if(change==='inactive')await db.doc('users/'+f.uid).update({active:false});
  if(change==='starter')await db.doc('businessSubscriptions/'+f.uid).update({plan:'starter'});
  await assert.rejects(supply.replenish({db,uid:f.uid,now:f.now}));assert.equal((await rows('socialContentItems',f.uid)).length,0);
 }
});
test('completed legacy versions stay immutable and next draft uses a different topic within remaining cadence',async()=>{
 const f=await fixture();await supply.replenish({db,uid:f.uid,now:f.now});
 const [item]=await rows('socialContentItems',f.uid),[version]=await rows('socialContentVersions',f.uid);
 for(const v of version.variants)await db.doc('socialGrowthJobs/'+item.id+'_'+v.provider).set({businessUid:f.uid,versionId:version.id,provider:v.provider,status:'scheduled',scheduledFor:version.scheduledFor,binding:{variants:[v]}});
 const result=await supply.replenish({db,uid:f.uid,now:f.now});assert.equal(result.status,'draft_created');assert.notEqual(result.itemId,item.id);
 const versions=await rows('socialContentVersions',f.uid);assert.equal(versions.length,2);assert.deepEqual(versions.find(v=>v.id===version.id),version);
 assert.notEqual(versions[0].variants[0].copy,versions[1].variants[0].copy);
 assert.equal((await rows('socialGrowthJobs',f.uid)).length,2);
});
test('changed brand voice stops replenishment without rewriting the approved strategy',async()=>{
 const f=await fixture();
 await db.doc('socialManagedPolicies/'+f.uid).update({'reviewedScope.voice':'Calm and factual'});
 await db.doc('businessGrowthProfiles/'+f.uid).update({brandVoice:'Unsupported sales claims'});
 assert.equal((await supply.replenish({db,uid:f.uid,now:f.now})).status,'context_changed');
 assert.equal((await rows('socialContentItems',f.uid)).length,0);
});
test('real scheduling readback accepts supplemental canonical draft without granting publication authority',async()=>{
 const f=await fixture();await supply.replenish({db,uid:f.uid,now:f.now});
 const [item]=await rows('socialContentItems',f.uid);
 const store=require('../functions-social-operations/social_customer_scheduling').createStore({db,planEntitled:true,environment:'production',now:()=>f.now});
 const preview=await store.preview(f.uid,{itemId:item.id,provider:'facebook'});
 assert.equal(preview.version,1);assert.equal(preview.ready,false);
 assert.match(preview.reviewedPost.variant.copy,/decks/);
 assert.equal((await rows('socialGrowthJobs',f.uid)).length,0);
});

test('101 immutable revisions of few ideas do not exhaust content supply or omit history',async()=>{
 const f=await fixture();const batch=db.batch();
 for(let n=0;n<101;n++)batch.set(db.doc('socialContentVersions/'+f.uid+'_old'+n),{businessUid:f.uid,variants:[{provider:'facebook',copy:'Archived bookkeeping revision '+n}]});
 await batch.commit();const before=await rows('socialContentVersions',f.uid);
 const result=await supply.replenish({db,uid:f.uid,now:f.now});assert.equal(result.status,'draft_created');
 const after=await rows('socialContentVersions',f.uid);assert.equal(after.length,102);
 for(const old of before)assert.deepEqual(after.find(v=>v.id===old.id),old);
});

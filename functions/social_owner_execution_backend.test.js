'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,after}=require('node:test'),a=require('node:assert/strict');
const admin=require('firebase-admin'),app=admin.initializeApp({projectId:'demo-scaledcircle'},'owner-social'),db=app.firestore();
const {enableOwnerExecution}=require('../functions-social-operations/social_owner_execution');
const {createAuthority}=require('../functions-social-operations/social_workspace_authority');
const {createStore}=require('../functions-social-operations/social_customer_scheduling');
const {fixture}=require('./social_customer_scheduling.test');
after(()=>app.delete());
test('one legacy hold transition preserves draft/history, never approves or schedules, and refuses support holds',async()=>{
 const uid='owner_execution_qa',h={schemaVersion:'CustomerGrowthWorkspaceV1',workspaceKind:'customer',businessUid:uid,createdBy:uid,killSwitchActive:true,externalActionsEnabled:false,researchPaused:false};
 await db.doc('agentHealth/'+uid).set(h);await db.doc('agentApprovals/owner_social_execution_'+uid).delete();
 await a.rejects(enableOwnerExecution({db,uid,actorUid:'unrelated'}));
 const results=await Promise.all([enableOwnerExecution({db,uid,actorUid:uid}),enableOwnerExecution({db,uid,actorUid:uid})]);
 a.equal(results.filter(r=>r.changed).length,1);a.equal((await db.doc('agentHealth/'+uid).get()).data().externalActionsEnabled,false);
 a.equal((await db.doc('agentApprovals/owner_social_execution_'+uid).get()).data().postApprovalGranted,false);
 for(const c of ['socialGrowthJobs','socialGrowthApprovals','financialOperations'])a.equal((await db.collection(c).where('businessUid','==',uid).get()).size,0);
 await db.doc('agentHealth/'+uid).set({...h,restriction:'security'});await a.rejects(enableOwnerExecution({db,uid,actorUid:uid}),/safety/);
});
test('owner or authorized active team member can approve exact Social version without Admin; removal blocks provider execution',async()=>{
 const f=fixture(),uid='member_social_qa',member='member_social_actor',itemId='member_social_post',planId='member_social_plan';
 const write=(p,v)=>db.doc(p).set(v);
 const version={...f.version,businessUid:uid,planId};
 await Promise.all([write('users/'+uid,{role:'business',active:true}),write('socialContentPlans/'+planId,{...f.plan,businessUid:uid}),
 write('socialContentItems/'+itemId,{...f.item,businessUid:uid,planId}),write('socialContentVersions/'+itemId+'_v1',version),
 write(`socialConnections/${uid}/providers/facebook`,{...f.connection,businessUid:uid}),write('socialContentQualityAssessments/'+itemId+'_v1',{...f.quality,businessUid:uid}),
 write('agentHealth/'+uid,f.health),write('socialProviderConfigs/production_meta',f.config),write('businessSubscriptions/'+uid,{...f.entitlement,expiresAt:admin.firestore.Timestamp.fromMillis(f.now+86400000)})]);
 const mr=db.doc(`businessWorkspaces/${uid}/members/${member}`);
 await mr.set({businessId:uid,uid:member,status:'active',seatIndex:1,permissions:['intelligence']});
 const auth={getUser:async id=>({uid:id,email:id+'@example.test',emailVerified:true,disabled:false})};
 const authorizeActor=createAuthority({db,auth,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp});
 const store=createStore({db,now:()=>f.now,enabledUids:[uid],environment:'production',authorizeActor});
 const preview=await store.preview(uid,{itemId,provider:'facebook'}),input={...preview,itemId};
 await a.rejects(store.approve(uid,input,{actorUid:member}),/responsibility/);
 await a.rejects(store.approve(uid,input,{actorUid:'stranger'}),/access/);
 await mr.update({permissions:['intelligence','outreachApproval']});
 const r=await store.approve(uid,input,{actorUid:member});a.equal(r.status,'scheduled');
 const job=(await db.doc('socialGrowthJobs/'+r.jobId).get()).data(),approval=(await db.doc('socialGrowthApprovals/'+job.approvalId).get()).data();
 a.equal(approval.approvedByUid,member);a.equal(approval.actorAuthority.businessUid,uid);
 await mr.update({status:'removed'});await a.rejects(store.approve(uid,input,{actorUid:member}),/access/);
 let creates=0;const publisher=require('../functions-social-operations/social_meta_runtime').createPublisher({db,project:'scaled-circle',actorAuth:auth,now:()=>f.now+600000,
  customerUids:[uid],providerCreatesEnabled:true,credentials:async()=>{creates++;throw Error('must not reach provider');},fetchImpl:async()=>{creates++;throw Error('must not reach provider');}});
 await a.rejects(publisher.execute(r.jobId),/access/);a.equal(creates,0);
});
test('opening a stale text-only post prepares a future version and automatic quality, without approval',async()=>{
 const uid='auto_social_qa',itemId='auto_social_post',f=fixture();
 const original={...f.version,businessUid:uid,planId:'auto_plan',scheduledFor:'2026-01-01T12:00:00Z'};
 await db.doc('socialContentItems/'+itemId).set({...f.item,businessUid:uid,planId:'auto_plan'});
 await db.doc('socialContentVersions/'+itemId+'_v1').set(original);
 const editor=require('../functions-social-operations/social_customer_editor').createEditor({db,now:()=>f.now,enabledUids:[uid]});
 const prep=require('../functions-social-operations/social_customer_preparation').createPreparation({db,editor,media:{attach:()=>{throw Error('not needed');}},now:()=>f.now});
 const result=await prep.prepare(uid,{itemId,provider:'facebook',version:1});
 a.equal(result.approved,false);a.equal(result.scheduled,false);a.equal(result.creativeStatus,'text_only');a.equal(result.version,2);
 a.deepEqual((await db.doc('socialContentVersions/'+itemId+'_v1').get()).data(),original);
 a((await db.doc('socialContentQualityAssessments/'+itemId+'_v2_facebook').get()).exists);
 a.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,0);
});

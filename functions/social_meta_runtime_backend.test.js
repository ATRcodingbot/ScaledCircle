"use strict";
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||"")||
 [process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(v=>v&&v!=="demo-scaledcircle"))throw Error("local_demo_emulator_required");
const {test,after}=require("node:test"),assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app"),{getFirestore}=require("firebase-admin/firestore");
const growth=require("../functions-social-operations/social_growth_cycle");
const {createPublisher}=require("../functions-social-operations/social_meta_runtime");
const scopes=require("../functions-social-operations/social_oauth").META_PUBLISH_SCOPES;
const app=initializeApp({projectId:"demo-scaledcircle"},"meta-runtime"),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app)});
test("persistent Meta week remains paused until exact approval; concurrent jobs publish once",async()=>{
 const uid="meta_runtime_fixture",at=Date.parse("2030-01-02T12:00:00Z");let clock=at-10000,creates=0;
 const record={businessUid:uid,version:1,contentHash:"approved-copy",scheduledFor:new Date(at).toISOString(),
  variants:[{provider:"facebook",format:"text",copy:"Approved Page copy."}]};
 const item=growth.contentBinding({id:"meta_runtime_v1",record},uid);
 const approval={id:"meta_runtime_approval",businessUid:uid,approvedByUid:uid,
  providerAccounts:{facebook:{providerUserId:"123"}},items:[item]};
 const job=growth.jobs(approval)[0],jobRef=db.doc(`socialGrowthJobs/${job.id}`);
 await db.recursiveDelete(jobRef);await db.recursiveDelete(db.doc(`socialPublishingAuthorities/${uid}`));
 const config={provider:"meta",environment:"production",enabled:true,writeScopesEnabled:true,externalPublishingEnabled:false,
  metaDogfood:{businessUid:uid,pageId:"123",pageName:"Page",instagramId:"456",instagramUsername:"brand"}};
 await Promise.all([db.doc("socialProviderConfigs/production_meta").set(config),jobRef.set(job),
  db.doc("socialGrowthApprovals/meta_runtime_approval").set(approval),
  db.doc("socialContentVersions/meta_runtime_v1").set(record),
  db.doc("socialContentQualityAssessments/meta_runtime_v1").set({businessUid:uid,readyToPublish:true,immutableSourceHash:"approved-copy"}),
  db.doc(`socialConnections/${uid}/providers/facebook`).set({environment:"production",status:"connected_write",tokenHealth:"healthy",
   providerUserId:"123",linkedPageId:"123",grantedScopes:scopes,credentialId:"fixture",connectionRevision:1}),
  db.doc(`agentHealth/${uid}`).set({killSwitchActive:false})]);
 const runtime=createPublisher({db,project:"scaled-circle",now:()=>clock,
  credentials:async()=>({businessUid:uid,providerUserId:"123",accessToken:"mock-only"}),
  fetchImpl:async(_url,options)=>{if(options.method==="POST")creates++;
   return {ok:true,json:async()=>options.method==="POST"?{id:"123_789"}:{id:"123_789",from:{id:"123"},message:"Approved Page copy."}};}});
 await runtime.prepare(uid);
 await assert.rejects(runtime.execute(job.id),/supervisor_paused/);assert.equal(creates,0);
 await runtime.activate(uid,approval.id);clock=at;
 await Promise.all([runtime.execute(job.id),runtime.execute(job.id)]);
 assert.equal(creates,1);assert.equal((await jobRef.get()).data().status,"published");
 assert.equal((await jobRef.collection("receipts").get()).size,1);
 await runtime.execute(job.id);assert.equal(creates,1);
 await runtime.pause(uid);
 assert.equal((await db.doc(`socialPublishingAuthorities/${uid}/providers/meta`).get()).data().externalPublishingEnabled,false);
});

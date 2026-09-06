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
 const runtime=createPublisher({db,project:"scaled-circle",now:()=>clock,providerCreatesEnabled:true,
  credentials:async()=>({businessUid:uid,providerUserId:"123",accessToken:"mock-only"}),
  fetchImpl:async(_url,options)=>{if(options.method==="POST")creates++;
   return {ok:true,json:async()=>options.method==="POST"?{id:"123_789"}:{id:"123_789",from:{id:"123"},message:"Approved Page copy."}};}});
 await runtime.prepare(uid,"facebook");
 const disabled=createPublisher({db,project:"scaled-circle",now:()=>clock,
  credentials:async()=>{throw Error("certification_must_not_load_tokens");},fetchImpl:async()=>{throw Error("certification_must_not_call_provider");}});
 const inspected=await require("../functions-social-operations/social_meta_scheduler").run({db,publisher:disabled,businessUid:uid});
 assert.equal(inspected.results.length,1);assert.equal(inspected.results[0].status,"gated");
 assert.equal(inspected.results[0].providerBoundary,"validated_request_not_sent");
 await assert.rejects(disabled.activate(uid,approval.id,"facebook"),/deployment_creates_disabled/);
 await assert.rejects(disabled.execute(job.id),/deployment_creates_disabled/);
 assert.equal((await jobRef.collection("providerSteps").get()).size,0);
 await assert.rejects(runtime.execute(job.id),/supervisor_paused/);assert.equal(creates,0);
 await runtime.activate(uid,approval.id,"facebook");clock=at;
 await Promise.all([runtime.execute(job.id),runtime.execute(job.id)]);
 assert.equal(creates,1);assert.equal((await jobRef.get()).data().status,"published");
 assert.equal((await jobRef.collection("receipts").get()).size,1);
 assert.equal((await db.collection("socialMetaMeasurementJobs").where("publicationJobId","==",job.id).get()).size,2);
 await runtime.execute(job.id);assert.equal(creates,1);
 clock+=86400001;let reads=0;
 const collector=require("../functions-social-operations/social_meta_measurements").createCollector({db,now:()=>clock,
  readEvidence:async()=>{reads++;return {provider:"facebook",providerAccountId:"123",providerPostId:"123_789",scope:"post",
   metrics:[{name:"comments",status:"OBSERVED",value:0,period:"lifetime"}]};}});
 const measurements=(await db.collection("socialMetaMeasurementJobs").where("publicationJobId","==",job.id).get()).docs;
 const due=measurements.find(x=>x.data().hoursAfterPublication===24);
 await Promise.all([collector(due.id),collector(due.id)]);await collector(due.id);
 assert.equal(reads,1);assert.equal(creates,1);
 assert.equal((await db.doc(`socialMetaMeasurementSnapshots/${due.id}`).get()).data().contentVersionId,job.versionId);
 await runtime.pause(uid,"facebook");
 assert.equal((await db.doc(`socialPublishingAuthorities/${uid}/providers/facebook`).get()).data().externalPublishingEnabled,false);
});

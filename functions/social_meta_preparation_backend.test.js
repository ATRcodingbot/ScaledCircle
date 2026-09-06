"use strict";
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||"")||
 [process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(v=>v&&v!=="demo-scaledcircle"))throw Error("local_demo_emulator_required");
const {test,after}=require("node:test"),assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app"),{getFirestore}=require("firebase-admin/firestore");
const {fixture}=require("./social_meta_preparation.test");
const preparation=require("../functions-social-operations/social_meta_preparation");
const {createPublisher}=require("../functions-social-operations/social_meta_runtime");
const app=initializeApp({projectId:"demo-scaledcircle"},"meta-preparation"),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test("real draft transaction, scheduler discovery, exact approval transition and future measurement binding",async()=>{
 const f=fixture(),d=preparation.build(f),uid=f.uid;
 for(const collection of ["socialContentPlans","socialGrowthCycles","socialContentVersions","socialContentQualityAssessments","socialGrowthJobs","socialContentItems","socialGrowthApprovals"]){
  const old=await db.collection(collection).where("businessUid","==",uid).get();
  for(const doc of old.docs)await db.recursiveDelete(doc.ref);
 }
 await db.recursiveDelete(db.doc(`socialPublishingAuthorities/${uid}`));
 await Promise.all([db.doc("socialProviderConfigs/production_meta").set(f.config),
  db.doc(`businessGrowthProfiles/${uid}`).set(f.profile),db.doc(`socialConnections/${uid}/providers/facebook`).set(f.connection),
  db.doc(`socialPublishingAuthorities/${uid}`).set({untouched:"x"}),
  db.doc(`socialPublishingAuthorities/${uid}/providers/instagram`).set({untouched:"instagram"}),
  db.doc(`agentHealth/${uid}`).set({killSwitchActive:false})]);
 const prepare=preparation.createPreparer({db,now:()=>f.now,fetchImpl:async()=>{throw Error("unexpected_provider_request");}});
 const [first,second]=await Promise.all([prepare(f.input),prepare(f.input)]);assert.deepEqual(first,second);
 assert.equal((await db.collection("socialGrowthApprovals").where("businessUid","==",uid).get()).size,0);
 const runtime=createPublisher({db,project:"scaled-circle",now:()=>f.now,
  credentials:async()=>{throw Error("credentials_forbidden");},fetchImpl:async()=>{throw Error("provider_forbidden");}});
 const discovered=await require("../functions-social-operations/social_meta_scheduler").run({db,publisher:runtime,businessUid:uid});
 assert.deepEqual(discovered.results.map(x=>x.jobId).sort(),first.jobIds.sort());
 for(const result of discovered.results){assert.equal(result.status,"gated");assert.equal(result.approvalState,"missing");assert.equal(result.pauseState,"paused");}
 const job=(await db.doc(`socialGrowthJobs/${first.jobIds[0]}`).get()).data();
 for(const patch of [{versionId:"wrong"},{businessUid:"wrong"},{approvalId:"wrong"}])await assert.rejects(preparation.inspect({db,job:{...job,...patch}}));
 await assert.rejects(runtime.execute(job.id),/creates_disabled/);
 await runtime.pause(uid,"facebook");
 assert.deepEqual((await db.doc(`socialPublishingAuthorities/${uid}`).get()).data(),{untouched:"x"});
 assert.deepEqual((await db.doc(`socialPublishingAuthorities/${uid}/providers/instagram`).get()).data(),{untouched:"instagram"});
 const approve=preparation.createApprovalStore({db,now:()=>f.now});
 const input={businessUid:uid,cycleId:d.cycle.id,expectedDigest:d.cycle.digest,versionIds:d.versions.map(v=>v.id),windowStart:d.weekStart,windowEnd:d.weekEnd};
 await assert.rejects(approve({...input,businessUid:"other"}));
 await assert.rejects(approve({...input,expectedDigest:"wrong"}));
 const approved=await approve(input);assert.deepEqual(await approve(input),approved);
 assert.deepEqual(approved.jobIds.sort(),first.jobIds.sort());
 assert.equal((await db.collection("socialGrowthApprovals").where("businessUid","==",uid).get()).size,1);
 const record=(await db.doc(`socialGrowthApprovals/${approved.approvalId}`).get()).data();
 for(const id of first.jobIds){
  const current=(await db.doc(`socialGrowthJobs/${id}`).get()).data();
  assert.equal(current.status,"approved");assert.equal(current.approvalId,record.id);
  assert.equal((await runtime.inspect(id)).deploymentAllowsCreates,false);
  assert.equal((await db.doc(`socialGrowthJobs/${id}`).collection("receipts").get()).size,0);
  const receipt={provider:"facebook",providerPostId:"123_999",contentHash:current.binding.contentHash,observedAt:f.now};
  const planned=require("../functions-social-operations/social_meta_measurements").plan({...current,status:"published",providerPostId:"123_999"},receipt,record);
  assert.deepEqual(planned.map(m=>m.hoursAfterPublication),[24,168]);
  assert.ok(planned.every(m=>m.contentVersionId===current.versionId&&m.publicationJobId===id));
 }
});

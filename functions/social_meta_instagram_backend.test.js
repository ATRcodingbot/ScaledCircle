"use strict";
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||"")||
 [process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(v=>v&&v!=="demo-scaledcircle"))throw Error("local_demo_emulator_required");
const {test,after}=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {initializeApp,deleteApp}=require("firebase-admin/app"),{getFirestore}=require("firebase-admin/firestore");
const growth=require("../functions-social-operations/social_growth_cycle");
const meta=require("../functions-social-operations/social_meta_candidate");
const {createPublisher}=require("../functions-social-operations/social_meta_runtime");
const {run}=require("../functions-social-operations/social_meta_scheduler");
const scopes=require("../functions-social-operations/social_oauth").META_PUBLISH_SCOPES;
const app=initializeApp({projectId:"demo-scaledcircle"},"meta-instagram-runtime"),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app)});
test("carousel scheduler resumes partial readiness after reconnect; concurrent workers retain exact order and one publication",async()=>{
 const uid="instagram_runtime_fixture",at=Date.parse("2030-01-02T12:00:00Z");let clock=at-1000,ready=false,creates=0;
 const account={businessUid:uid,providerUserId:"17841441730285620",linkedPageId:"1198660363339503",handle:"scaledcircleapp"};
 const files=Array.from({length:4},(_,i)=>Buffer.from(`image fixture ${i}`));
 const revision=meta.mediaRevision({businessUid:uid,assetId:"igfixture",provider:"instagram",productionOrigin:"https://scaledcircle.com",
  images:files.map(bytes=>{const sha256=crypto.createHash("sha256").update(bytes).digest("hex");return {sha256,bytes:bytes.length,width:1080,height:1350,mime:"image/jpeg",url:`https://scaledcircle.com/social/${sha256}.jpg`};})});
 const record={businessUid:uid,version:1,contentHash:"ig-approved-copy",scheduledFor:new Date(at).toISOString(),variants:[{provider:"instagram",format:"carousel",copy:"Local stories. Link in bio.",mediaRevisionId:revision.id,mediaAssetId:revision.assetId}]};
 const item=growth.contentBinding({id:"ig_runtime_version",record},uid);
 const approval={id:"ig_runtime_approval",businessUid:uid,approvedByUid:uid,providerAccounts:{instagram:account},items:[item]};
 const job=growth.jobs(approval)[0],ref=db.doc(`socialGrowthJobs/${job.id}`),connection=db.doc(`socialConnections/${uid}/providers/instagram`);
 // Run backend files with --test-concurrency=1 because they each own the
 // emulator's singleton provider configuration for the duration of their test.
 await Promise.all([ref.set(job),db.doc("socialGrowthApprovals/ig_runtime_approval").set(approval),db.doc("socialContentVersions/ig_runtime_version").set(record),
  db.doc("socialContentQualityAssessments/ig_runtime_version").set({businessUid:uid,readyToPublish:true,immutableSourceHash:record.contentHash}),
  db.doc(`socialMediaLibraries/${uid}/items/${revision.id}`).set(revision),connection.set({...account,environment:"production",status:"connected_write",tokenHealth:"healthy",grantedScopes:scopes,credentialId:"before",connectionRevision:1,credentialRotationGeneration:1}),
  db.doc(`agentHealth/${uid}`).set({killSwitchActive:false}),
  db.doc("socialProviderConfigs/production_meta").set({provider:"meta",environment:"production",enabled:true,writeScopesEnabled:true,externalPublishingEnabled:false,metaDogfood:{businessUid:uid,pageId:account.linkedPageId,pageName:"Scaled Circle",instagramId:account.providerUserId,instagramUsername:account.handle}})]);
 const bodies=[],generations=[];
 const runtime=createPublisher({db,project:"scaled-circle",providerCreatesEnabled:true,now:()=>clock,
  credentials:async(_job,current)=>{generations.push(current.connectionRevision);return {...account,accessToken:"fixture-only"};},
  fetchImpl:async(url,options)=>{
   const u=new URL(url);
   if(u.origin==="https://scaledcircle.com"){const i=revision.images.findIndex(image=>image.url===u.href);return {ok:true,headers:new Map([["content-type","image/jpeg"]]),arrayBuffer:async()=>files[i]};}
   if(options.method==="POST"){creates++;bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:u.pathname.endsWith("media_publish")?"999":String(100+creates)})};}
   if(u.pathname.endsWith("/media"))return {ok:true,json:async()=>({data:[{id:"999",caption:record.variants[0].copy}]})};
   const id=u.pathname.split("/").at(-1);return {ok:true,json:async()=>({id,status_code:id==="102"&&!ready?"IN_PROGRESS":"FINISHED"})};
  }});
 await runtime.prepare(uid,"facebook");await runtime.prepare(uid,"instagram");
 const fbRef=db.doc(`socialPublishingAuthorities/${uid}/providers/facebook`),fbBefore=(await fbRef.get()).data();
 await runtime.activate(uid,approval.id,"instagram");clock=at;
 await run({db,publisher:runtime,businessUid:uid,now:clock});assert.equal(creates,2);assert.equal((await ref.get()).data().status,"approved");
 await connection.update({providerUserId:"999999"});
 const mismatch=await run({db,publisher:runtime,businessUid:uid,now:clock});assert.equal(creates,2);assert.equal(mismatch.results[0].status,"authority_review_required");
 await connection.update({providerUserId:account.providerUserId,credentialId:"after",connectionRevision:2,credentialRotationGeneration:2});ready=true;clock+=120001;
 await Promise.all([run({db,publisher:runtime,businessUid:uid,now:clock}),run({db,publisher:runtime,businessUid:uid,now:clock})]);
 assert.equal(creates,6);assert.deepEqual(bodies[4].children,["101","102","103","104"]);assert.equal(bodies[5].creation_id,"105");
 assert.equal((await ref.get()).data().status,"published");assert.equal((await ref.collection("receipts").get()).size,1);assert.ok(generations.includes(2));
 assert.equal((await db.collection("socialMetaMeasurementJobs").where("publicationJobId","==",job.id).get()).size,2);
 await runtime.pause(uid,"instagram");assert.deepEqual((await fbRef.get()).data(),fbBefore);
});

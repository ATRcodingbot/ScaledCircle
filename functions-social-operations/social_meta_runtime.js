"use strict";
const growth=require("./social_growth_cycle");
const meta=require("./social_meta_candidate");
const connectionPolicy=require("./social_meta_connection");
const oauth=require("./social_oauth");
const steps=require("./social_provider_steps");
const {execute}=require("./social_meta_steps");
const {createAdapter}=require("./social_meta_transport");

// Same immutable growth jobs/approvals, with a separate provider allowance so
// preparing Meta cannot replace the active X week. No allowance is auto-enabled.
function createPublisher({db,project,credentials,fetchImpl,now=Date.now}) {
 const environment=project==="scaled-circle"?"production":project==="scaledcircle-staging"?"staging":null;
 if(!environment)throw Error("meta_runtime_unavailable");
 const stateRef=uid=>db.doc(`socialPublishingAuthorities/${uid}/providers/meta`);
 async function context(tx,job,action) {
  if(!["facebook","instagram"].includes(job.provider))throw Error("meta_provider_required");
  const read=ref=>tx?tx.get(ref):ref.get();
  const variant=job.binding?.variants?.find(v=>v.provider===job.provider);
  const refs=[db.doc(`socialGrowthApprovals/${job.approvalId}`),
   db.doc(`socialConnections/${job.businessUid}/providers/${job.provider}`),
   db.doc(`socialProviderConfigs/${environment}_meta`),stateRef(job.businessUid),
   db.doc(`agentHealth/${job.businessUid}`),db.doc(`socialContentVersions/${job.versionId}`),
   db.doc(`socialContentQualityAssessments/${job.versionId}`)];
  const [a,c,p,s,h,v,q]=(await Promise.all(refs.map(read))).map(x=>x.data());
  connectionPolicy.authorize(p,job.businessUid);
  if(!a || a.businessUid!==job.businessUid || a.approvedByUid!==job.businessUid ||
   !growth.jobs(a).some(x=>x.id===job.id&&x.bindingHash===job.bindingHash&&growth.hash(x.binding)===growth.hash(job.binding)))throw Error("meta_approval_mismatch");
  const identity=a.providerAccounts?.[job.provider];
  if(c?.environment!==environment||c.tokenHealth!=="healthy"||c.status!=="connected_write"||
   c.providerUserId!==identity?.providerUserId||c.linkedPageId!==p.metaDogfood.pageId||
   c.providerUserId!==(job.provider==="facebook"?p.metaDogfood.pageId:p.metaDogfood.instagramId)||
   (job.provider==="instagram"&&c.handle!==identity.handle))throw Error("meta_connection_mismatch");
  oauth.exactScopeSet(c.grantedScopes,oauth.META_PUBLISH_SCOPES);
  if(action!=="reconcile") {
   if(a.revokedAt!=null||h?.killSwitchActive===true)throw Error("meta_supervisor_paused");
   if(action==="create") {
   if(a.revokedAt!=null||s?.schemaVersion!=="MetaPublisherAllowanceV1"||s.businessUid!==job.businessUid||
    s.environment!==environment||s.approvalId!==job.approvalId||s.mode!=="approval_required"||
    s.externalPublishingEnabled!==true||s.killSwitchActive!==false||h?.killSwitchActive===true||
    !Array.isArray(s.jobIds)||s.jobIds.length>6||!s.jobIds.includes(job.id))throw Error("meta_supervisor_paused");
   if(!Number.isFinite(Date.parse(job.scheduledFor))||now()<Date.parse(job.scheduledFor)||
    now()>Date.parse(job.scheduledFor)+15*60000)throw Error("meta_schedule_closed");
   }
   if(growth.contentBinding({id:job.versionId,record:v},job.businessUid).bindingHash!==job.bindingHash||
    q?.businessUid!==job.businessUid||q.readyToPublish!==true||q.immutableSourceHash!==job.binding.contentHash)throw Error("meta_version_or_quality_changed");
  }
  let revision=null;
  if(variant?.mediaRevisionId) revision=(await read(db.doc(`socialMediaLibraries/${job.businessUid}/items/${variant.mediaRevisionId}`))).data();
  const account={businessUid:job.businessUid,providerUserId:c.providerUserId,linkedPageId:c.linkedPageId,handle:c.handle};
  meta.prepare({job,revision,account,approval:{...a,revokedAt:action==="create"?a.revokedAt:null}});
  return {account,approval:a,revision,connection:c};
 }
 const store=steps.createStepStore(db,{now,authorize:context});
 return {
  async prepare(uid) {
   return db.runTransaction(async tx=>{
    const ref=stateRef(uid),prior=await tx.get(ref);
    if(prior.exists)return {prepared:true,enabled:prior.data().externalPublishingEnabled===true};
    tx.create(ref,{schemaVersion:"MetaPublisherAllowanceV1",businessUid:uid,environment,
     mode:"approval_required",externalPublishingEnabled:false,killSwitchActive:true,jobIds:[],approvalId:null});
    return {prepared:true,enabled:false};
   });
  },
  async activate(uid,approvalId) {
   return db.runTransaction(async tx=>{
    const ref=stateRef(uid),state=(await tx.get(ref)).data();
    const approved=(await tx.get(db.doc(`socialGrowthApprovals/${approvalId}`))).data();
    if(state?.businessUid!==uid||state.schemaVersion!=="MetaPublisherAllowanceV1"||
     !approved||approved.businessUid!==uid||approved.approvedByUid!==uid||approved.revokedAt!=null)throw Error("meta_approval_required");
    const planned=growth.jobs(approved);
    if(!planned.length||planned.length>6||planned.some(job=>!["facebook","instagram"].includes(job.provider)||Date.parse(job.scheduledFor)<=now()))throw Error("meta_week_invalid");
    for(const job of planned) {
     const current=(await tx.get(db.doc(`socialGrowthJobs/${job.id}`))).data();
     if(!current||current.approvalId!==approvalId||current.bindingHash!==job.bindingHash||current.status!=="approved")throw Error("meta_job_conflict");
     await context(tx,current,"activate");
    }
    tx.update(ref,{approvalId,jobIds:planned.map(job=>job.id),externalPublishingEnabled:true,killSwitchActive:false});
    tx.create(ref.collection("audit").doc(),{action:"approved_week_activated",approvalId,at:now()});
    return {approvalId,maximumPosts:planned.length};
   });
  },
  async pause(uid) {
   await stateRef(uid).update({externalPublishingEnabled:false,killSwitchActive:true});
   return {paused:true};
  },
  async execute(jobId,{reconcileOnly=false}={}) {
   const ref=db.doc(`socialGrowthJobs/${jobId}`),snapshot=await ref.get(),job=snapshot.data();
   if(!job||job.id!==jobId)throw Error("meta_job_missing");
   if(["published","canceled"].includes(job.status))return {status:job.status};
   const ctx=await context(null,job,reconcileOnly?"reconcile":"create");
   const adapter=createAdapter({job,...ctx,now,fetchImpl,
    credentials:()=>credentials(job,ctx.connection),
    authorizeCreate:async()=>{
     if(reconcileOnly)throw Error("meta_reconciliation_cannot_create");
     const current=(await ref.get()).data();
     if(current?.bindingHash!==job.bindingHash)throw Error("meta_job_changed");
     const live=await context(null,current,"create");
     if(live.connection.credentialId!==ctx.connection.credentialId||
      live.connection.connectionRevision!==ctx.connection.connectionRevision)throw Error("meta_credential_changed");
    }});
   if(!reconcileOnly)await adapter.verifyAssets();
   const scopedStore=reconcileOnly?{...store,begin:async step=>{
    if(!(await ref.collection("providerSteps").doc(step.id).get()).exists)throw Error("meta_reconciliation_cannot_create");
    return store.begin(step);
   }}:store;
   const result=await execute({job,...ctx,approval:{...ctx.approval,revokedAt:reconcileOnly?null:ctx.approval.revokedAt},store:scopedStore,adapter});
   if(result.status!=="received")return result;
   await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    await context(tx,current,"reconcile");
    if(current.status==="published")return;
    if(current.bindingHash!==job.bindingHash)throw Error("meta_job_changed");
    tx.create(ref.collection("receipts").doc("publication"),{providerPostId:result.receipt.id,
     contentHash:job.binding.contentHash,provider:job.provider,observedAt:now()});
    tx.update(ref,{status:"published",providerPostId:result.receipt.id,completedAt:now()});
   });
   return {status:"published",providerPostId:result.receipt.id};
  },
 };
}
module.exports={createPublisher};

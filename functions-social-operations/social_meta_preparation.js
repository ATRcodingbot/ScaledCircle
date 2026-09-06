"use strict";
const {isDeepStrictEqual}=require("node:util");
const crypto=require("node:crypto");
const growth=require("./social_growth_cycle"),social=require("./social_operations");
const meta=require("./social_meta_candidate"),policy=require("./social_meta_connection"),oauth=require("./social_oauth");
const providers=["facebook","instagram"];
const iso=value=>value?.toDate?value.toDate().toISOString():new Date(value).toISOString();
function identity(config,connection,provider,uid) {
 const p=policy.authorize(config,uid);
 if(!providers.includes(provider)||connection?.environment!=="production"||connection.status!=="connected_write"||connection.tokenHealth!=="healthy"||
  connection.providerUserId!==(provider==="facebook"?p.pageId:p.instagramId)||connection.linkedPageId!==p.pageId||
  (provider==="instagram"&&connection.handle!==p.instagramUsername))throw Error("meta_prepared_identity_mismatch");
 oauth.exactScopeSet(connection.grantedScopes,oauth.META_PUBLISH_SCOPES);
 return {providerUserId:connection.providerUserId,linkedPageId:connection.linkedPageId,...(provider==="instagram"?{handle:connection.handle}:{})};
}
function jobs(cycle) {
 return cycle.items.flatMap(item=>item.variants.map(variant=>({
  id:`social_growth_job_${growth.hash({businessUid:cycle.businessUid,versionId:item.versionId,provider:variant.provider})}`,
  businessUid:cycle.businessUid,provider:variant.provider,versionId:item.versionId,binding:item,bindingHash:item.bindingHash,
  scheduledFor:item.scheduledFor,preparedCycleId:cycle.id,approvalId:null,status:"ready_for_review",externalPublishingEnabled:false
 })));
}
function build({uid,config,connection,profile,input,now=Date.now()}) {
 if(!providers.includes(input?.provider)||!Array.isArray(input.items)||input.items.length!==3||
  !Array.isArray(input.media)||input.media.length>3||input.timeZone!=="America/New_York"||
  Object.keys(input).some(k=>!["provider","items","media","startsOn","timeZone"].includes(k)))throw Error("meta_prepare_input_invalid");
 const provider=input.provider,account=identity(config,connection,provider,uid);
 // No profile means no service/location scoring evidence. The verified Page
 // name remains authoritative brand context; never invent missing evidence.
 profile={...(profile||{}),businessName:profile?.businessName||policy.policy(config).pageName};
 const start=Date.parse(input.startsOn),end=start+7*86400000;
 if(!Number.isFinite(start)||start<=now||input.items.some(i=>!Number.isFinite(Date.parse(i.scheduledFor))||Date.parse(i.scheduledFor)<start||Date.parse(i.scheduledFor)>=end||i.variants?.length!==1||i.variants[0].provider!==provider)||
  new Set(input.items.map(i=>i.itemKey)).size!==3||
  new Set(input.items.map(i=>i.pillar)).size!==3)throw Error("meta_prepare_week_invalid");
 const revisions=input.media.map(r=>{
  const canonical=meta.mediaRevision({...r,businessUid:uid,provider,productionOrigin:"https://scaledcircle.com"});
  if(r.id!==canonical.id)throw Error("meta_prepare_media_changed");return canonical;
 });
 const plan=social.createContentPlan({businessUid:uid,planId:"scale",businessName:profile.businessName,
  goal:"INITIAL_EXPERIMENT: learn from three approved posts without assuming growth outcomes",pillars:input.items.map(i=>i.pillar),
  items:input.items,automationMode:"approve_plan",startsOn:input.startsOn,now});
 const versions=plan.record.items.map(item=>({id:`${plan.id}_${item.itemKey}_v1`,record:social.contentItemVersion({businessUid:uid,planId:plan.id,item,now})}));
 const cycle=growth.cycle({businessUid:uid,planId:plan.id,versions,providerAccounts:{[provider]:account},
  strategy:{themes:input.items.map(i=>i.pillar),objectives:["Observe content response with truthful attribution"],audience:"Maryland local Businesses and prospective Scalers",channelMix:[provider]},
  startsAt:input.startsOn,endsAt:new Date(start+30*86400000).toISOString(),timeZone:input.timeZone,mode:"approval_required",now});
 const planned=jobs(cycle);
 const assessments=versions.map(v=>({id:v.id,record:social.assessScheduledContent({businessUid:uid,contentItemId:v.id.replace(/_v1$/,""),versionRecord:v.record,
  businessContext:{businessName:profile.businessName,services:profile.services||profile.selectedServices||[],geography:[profile.serviceArea,profile.city,profile.county].filter(v=>typeof v==="string"&&v.trim())},
  recentVariants:versions.filter(other=>other.id!==v.id).flatMap(other=>other.record.variants),timingEvidence:{},performanceEvidence:[],now})}));
 if(assessments.some(a=>!a.record.readyToPublish))throw Error("meta_prepare_quality_required");
 for(const job of planned){const variant=job.binding.variants[0];meta.describe({job,account:{businessUid:uid,...account},revision:revisions.find(r=>r.id===variant.mediaRevisionId)||null});}
 return {provider,uid,plan,versions,cycle,jobs:planned,revisions,assessments,
  weekStart:iso(input.startsOn),weekEnd:new Date(end).toISOString()};
}
async function verifyMedia(revisions,fetchImpl=globalThis.fetch) {
 for(const revision of revisions)for(const image of revision.images){
  const response=await fetchImpl(image.url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(20000)});
  if(!response.ok||response.headers.get("content-type")?.split(";")[0]!==image.mime)throw Error("meta_prepare_media_unavailable");
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>image.bytes)throw Error("meta_prepare_media_changed");chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(length!==image.bytes||crypto.createHash("sha256").update(bytes).digest("hex")!==image.sha256)throw Error("meta_prepare_media_changed");
 }
}
function createPreparer({db,now=Date.now,fetchImpl}) {
 return async input=>{
  const config=(await db.doc("socialProviderConfigs/production_meta").get()).data(),uid=policy.policy(config).businessUid;
  const connectionRef=db.doc(`socialConnections/${uid}/providers/${input.provider}`),profileRef=db.doc(`businessGrowthProfiles/${uid}`);
  const connection=(await connectionRef.get()).data(),profile=(await profileRef.get()).data();
  const draft=build({uid,config,connection,profile,input,now:now()});
  await verifyMedia(draft.revisions,fetchImpl);
  const stateRef=db.doc(`socialPublishingAuthorities/${uid}/providers/${draft.provider}`);
  const writes=[{ref:db.doc(`socialContentPlans/${draft.plan.id}`),value:draft.plan.record,key:"contentHash"},
   {ref:db.doc(`socialGrowthCycles/${draft.cycle.id}`),value:draft.cycle,key:"digest"},
   ...draft.versions.map(v=>({ref:db.doc(`socialContentVersions/${v.id}`),value:v.record,key:"contentHash"})),
   ...draft.assessments.map(a=>({ref:db.doc(`socialContentQualityAssessments/${a.id}`),value:a.record,key:"immutableSourceHash"})),
   ...draft.revisions.map(r=>({ref:db.doc(`socialMediaLibraries/${uid}/items/${r.id}`),value:r,key:"id"})),
   ...draft.jobs.map(job=>({ref:db.doc(`socialGrowthJobs/${job.id}`),value:job,key:"bindingHash"})),
   ...draft.versions.map(v=>({ref:db.doc(`socialContentItems/${v.id.replace(/_v1$/,"")}`),value:{schemaVersion:social.SCHEMA_VERSION,businessUid:uid,planId:draft.plan.id,
    itemKey:v.record.itemKey,status:"ready_for_review",currentVersion:1,scheduledFor:v.record.scheduledFor},key:"planId"}))];
  await db.runTransaction(async tx=>{
   const [liveConfig,liveConnection,liveProfile,state,...existing]=await Promise.all([
    tx.get(db.doc("socialProviderConfigs/production_meta")),tx.get(connectionRef),tx.get(profileRef),tx.get(stateRef),...writes.map(w=>tx.get(w.ref))]);
   if(!isDeepStrictEqual(liveProfile.data(),profile)||!isDeepStrictEqual(identity(liveConfig.data(),liveConnection.data(),input.provider,uid),draft.cycle.providerAccounts[input.provider]))throw Error("meta_prepare_context_changed");
   const prior=state.data();
   if(prior&&(prior.externalPublishingEnabled===true||prior.approvalId||prior.preparedCycleId&&prior.preparedCycleId!==draft.cycle.id))throw Error("meta_prepare_allowance_conflict");
   for(const [i,old] of existing.entries())if(old.exists&&(old.data()[writes[i].key]!==writes[i].value[writes[i].key]||
    old.data().approvalId||old.data().approvedAt||["approved","published","canceled"].includes(old.data().status)))throw Error("meta_prepare_record_conflict");
   for(const [i,w] of writes.entries())if(!existing[i].exists)tx.create(w.ref,w.value);
   if(!prior?.preparedCycleId)tx.set(stateRef,{schemaVersion:"MetaPublisherAllowanceV1",businessUid:uid,provider:draft.provider,environment:"production",mode:"approval_required",
    preparedCycleId:draft.cycle.id,approvalId:null,jobIds:draft.jobs.map(j=>j.id),externalPublishingEnabled:false,killSwitchActive:true});
  });
  return {planId:draft.plan.id,cycleId:draft.cycle.id,jobIds:draft.jobs.map(j=>j.id),approvalState:"missing",publishingEnabled:false,providerCreates:0};
 };
}
async function inspect({db,job,healthOverride}) {
 const [cycle,config,connection,version,assessment,allowance,health]=await Promise.all([
  db.doc(`socialGrowthCycles/${job.preparedCycleId}`).get(),db.doc("socialProviderConfigs/production_meta").get(),
  db.doc(`socialConnections/${job.businessUid}/providers/${job.provider}`).get(),db.doc(`socialContentVersions/${job.versionId}`).get(),
  db.doc(`socialContentQualityAssessments/${job.versionId}`).get(),db.doc(`socialPublishingAuthorities/${job.businessUid}/providers/${job.provider}`).get(),db.doc(`agentHealth/${job.businessUid}`).get()]);
 const c=cycle.data(),account=identity(config.data(),connection.data(),job.provider,job.businessUid);
 if(!c||!isDeepStrictEqual(c.providerAccounts[job.provider],account)||!jobs(c).some(j=>isDeepStrictEqual(j,job)))throw Error("meta_prepared_binding_mismatch");
 if(growth.contentBinding({id:job.versionId,record:version.data()},job.businessUid).bindingHash!==job.bindingHash||
  assessment.data()?.immutableSourceHash!==job.binding.contentHash||assessment.data()?.readyToPublish!==true)throw Error("meta_prepared_version_mismatch");
 const variant=job.binding.variants[0],revision=variant.mediaRevisionId?(await db.doc(`socialMediaLibraries/${job.businessUid}/items/${variant.mediaRevisionId}`).get()).data():null;
 const description=meta.describe({job,account:{businessUid:job.businessUid,...account},revision});
 const state=allowance.data(),supervisor=healthOverride||health.data();
 if(state?.preparedCycleId!==job.preparedCycleId||state?.provider!==job.provider||state?.businessUid!==job.businessUid||!state?.jobIds?.includes(job.id))throw Error("meta_prepared_allowance_mismatch");
 return {jobId:job.id,provider:job.provider,scheduledFor:job.scheduledFor,bindingHash:job.bindingHash,approvalState:"missing",pauseState:state.killSwitchActive===true?"paused":"not_paused",
  supervisorStopped:supervisor?.killSwitchActive===true,deploymentAllowsCreates:false,allowanceEnabled:state.externalPublishingEnabled===true,
  providerBoundary:"request_validated_approval_required",maximumEffects:description.maximumEffects,providerCreates:0};
}
// Called only by an authenticated owner approval route, never by preparation.
// Keeps the deterministic draft IDs and consumes an exact weekly digest once.
function createApprovalStore({db,now=Date.now}) {
 return input=>db.runTransaction(async tx=>{
  const cycle=(await tx.get(db.doc(`socialGrowthCycles/${input.cycleId}`))).data();
  if(!cycle||cycle.businessUid!==input.businessUid||cycle.items.length!==3||
   Object.keys(cycle.providerAccounts).length!==1)throw Error("meta_prepared_binding_mismatch");
  const provider=Object.keys(cycle.providerAccounts)[0];
  if(!providers.includes(provider)||input.versionIds?.length!==3)throw Error("meta_prepared_binding_mismatch");
  const approved=growth.approval({...input,record:cycle,now:now()}),planned=growth.jobs(approved);
  const stateRef=db.doc(`socialPublishingAuthorities/${input.businessUid}/providers/${provider}`);
  const state=(await tx.get(stateRef)).data();
  if(state?.preparedCycleId!==cycle.id||state.externalPublishingEnabled!==false||
   state.killSwitchActive!==true||state.approvalId&&state.approvalId!==approved.id)throw Error("meta_prepare_allowance_conflict");
  const prior=(await tx.get(db.doc(`socialGrowthApprovals/${approved.id}`))).data();
  for(const job of planned){
   const current=(await tx.get(db.doc(`socialGrowthJobs/${job.id}`))).data();
   const version=(await tx.get(db.doc(`socialContentVersions/${job.versionId}`))).data();
   const quality=(await tx.get(db.doc(`socialContentQualityAssessments/${job.versionId}`))).data();
   const expected=prior?job:jobs(cycle).find(j=>j.id===job.id);
   if(!isDeepStrictEqual(current,expected)||growth.contentBinding({id:job.versionId,record:version},input.businessUid).bindingHash!==job.bindingHash||
    quality?.businessUid!==input.businessUid||quality.readyToPublish!==true||quality.immutableSourceHash!==job.binding.contentHash)throw Error("meta_prepared_binding_mismatch");
  }
  if(!prior){
   tx.create(db.doc(`socialGrowthApprovals/${approved.id}`),approved);
   for(const job of planned)tx.set(db.doc(`socialGrowthJobs/${job.id}`),job);
   tx.update(stateRef,{approvalId:approved.id});
  }
  return {approvalId:approved.id,jobIds:planned.map(j=>j.id),externalPublishingEnabled:false};
 });
}
module.exports={identity,jobs,build,verifyMedia,createPreparer,inspect,createApprovalStore};

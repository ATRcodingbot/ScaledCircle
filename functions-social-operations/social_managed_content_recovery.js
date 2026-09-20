'use strict';
const social=require('./social_operations'),bounded=require('./social_bounded_authority');
const normalize=v=>String(v||'').trim().toLowerCase();
// Finite, distinct planning angles; no inferred demand, results or completed work.
function topics(service,name){return [
 {key:'upkeep_decisions',pillar:'Plan for ongoing care',goal:`Discuss upkeep choices for ${service}`,copy:`Considering ${service}? Look beyond the first day: ask how material choices affect cleaning, routine care and future repairs. ${name} can discuss those trade-offs with you before you decide on a project scope.`},
 {key:'access_logistics',pillar:'Think through access',goal:`Prepare access questions for ${service}`,copy:`Planning ${service}? Think through access to the work area, where materials could be placed and which parts of the space need to remain usable. Bring those questions to ${name} when discussing your project.`},
 {key:'scope_boundaries',pillar:'Clarify what is included',goal:`Clarify scope boundaries for ${service}`,copy:`When discussing ${service}, ask what is included in the proposed scope and what would be a separate decision. Clear boundaries help you compare options. Talk with ${name} about your priorities before agreeing to work.`}
];}
function repeated(assessment){return assessment?.variantAssessments?.some(v=>v.repetition?.repeated===true)&&assessment.advisoryReady===false;}
function select({uid,policy,profile,current,provider,versions}){
 if(profile?.businessUid!==uid||profile.businessName!==policy.reviewedScope?.businessName||profile.internalSocialContext)return null;
 const old=current.variants.find(v=>v.provider===provider);
 if(!old||!policy.destinations.includes(old.destinationUrl))return null;
 const recent=versions.flatMap(v=>(v.variants||[]).filter(x=>x.provider===provider));
 const context=normalize(current.goal+' '+old.copy);
 for(const service of policy.services.filter(s=>context.includes(normalize(s))&& (profile.servicesOffered||profile.services||[]).some(v=>normalize(v)===normalize(s)))){
  for(const idea of topics(service,profile.businessName)){
   if(versions.some(v=>v.recoveryTopic===idea.key||normalize(v.pillar)===normalize(idea.pillar)))continue;
   const variant={...old,copy:idea.copy,format:'feed',mediaAssetId:null,mediaRevisionId:null,altText:null,
    mediaRequirement:`Prepare a relevant ${service} illustration for: ${idea.pillar}. Do not imply completed Business work.`};
   if(bounded.internalCopy.test(variant.copy)||bounded.unsupportedClaim.test(variant.copy)||social.repetitionAssessment({variant,recentVariants:recent}).repeated)continue;
   return {...idea,service,variant};
  }
 }
 return null;
}
async function recover({db,uid,input,policyId,now=Date.now()}){
 const key=require('node:crypto').createHash('sha256').update([uid,policyId,input.itemId,input.provider,'topic'].join(':')).digest('hex');
 return db.runTransaction(async tx=>{
  const read=r=>tx.get(r),auditRef=db.doc('socialManagedContentRecovery/'+key),previous=await read(auditRef);
  if(previous.exists)return {status:'needs_attention',reason:'The bounded topic replacement has been used. Edit this exception or choose a different topic.',reused:true};
  const policy=(await read(db.doc('socialManagedPolicies/'+uid))).data();
  const plan=(await read(db.doc('socialContentPlans/'+policy?.planId))).data();
  bounded.assertRuntimePolicy({uid,policy,plan,approval:{businessUid:uid,planId:policy?.planId,managedPolicyId:policyId,managedStrategyDigest:policy?.strategyDigest},now});
  if(!await require('./social_customer_enrollment').authorized({db,uid,read,now}))throw Error('managed_content_entitlement');
  if((await read(db.doc('agentHealth/'+uid))).data()?.killSwitchActive===true)throw Error('managed_content_paused');
  const ref=db.doc('socialContentItems/'+input.itemId),item=(await read(ref)).data();
  if(item?.businessUid!==uid||item.planId!==policy.planId||item.managedHolds?.[input.provider]||!policy.providers.includes(input.provider))throw Error('managed_content_scope');
  const version=item.platformVersions?.[input.provider]??item.currentVersion;
  if(version!==input.version)throw Error('managed_content_stale');
  const current=(await read(db.doc('socialContentVersions/'+input.itemId+'_v'+version))).data();
  const assessment=(await read(db.doc('socialContentQualityAssessments/'+input.itemId+'_v'+version+'_'+input.provider))).data();
  if(current?.businessUid!==uid||assessment?.businessUid!==uid||assessment.immutableSourceHash!==current.contentHash||!repeated(assessment))throw Error('managed_content_evidence');
  const profile=(await read(db.doc('businessGrowthProfiles/'+uid))).data();
  const rows=await read(db.collection('socialContentVersions').where('businessUid','==',uid).limit(101));
  const jobs=await read(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
  if(rows.size>100||jobs.size>100)throw Error('managed_content_history_limit');
  if(jobs.docs.some(d=>{const j=d.data();return j.provider===input.provider&&j.versionId?.startsWith(input.itemId+'_v')&&j.status!=='canceled';}))throw Error('managed_content_already_scheduled');
  const prepRef=db.doc('socialCreativePreparation/'+require('./social_creative_diversity').leaseId(uid,input));
  const prep=(await read(prepRef)).data();
  if(prep?.leaseUntil>now)throw Error('managed_content_preparation_busy');
  const chosen=select({uid,policy,profile,current,provider:input.provider,versions:rows.docs.map(d=>d.data())});
  const audit={businessUid:uid,policyId,itemId:input.itemId,provider:input.provider,attempts:1,source:'recurring_strategy_preparation',at:now,rejectedVersion:version,rejectedHash:current.contentHash,assessment,previousPreparation:prep||null,reason:'Replace repetitive service-range content with a distinct approved-service planning angle.'};
  if(!chosen){tx.create(auditRef,{...audit,status:'no_eligible_topic'});return {status:'needs_attention',reason:'No distinct eligible topic remains. Add a new strategy topic or edit this exception.'};}
  const next=social.contentItemVersion({businessUid:uid,planId:current.planId,previousVersion:item.currentVersion,now,item:{...current,goal:chosen.goal,pillar:chosen.pillar,variants:current.variants.map(v=>v.provider===input.provider?chosen.variant:v)}});
  next.recoveryTopic=chosen.key;
  tx.create(db.doc('socialContentVersions/'+input.itemId+'_v'+next.version),next);
  tx.update(ref,{currentVersion:next.version,platformVersions:require('./social_customer_editor').platformVersions(item,current,input.provider,next.version),updatedAt:now});
  // An unrelated topic must re-enter existing media relevance/cooldown/budget authority.
  // The old preparation and rejected immutable version remain in audit/history.
  tx.set(prepRef,{businessUid:uid,itemId:input.itemId,provider:input.provider,version:next.version,state:'needs_preparation',leaseUntil:0,recoveryId:key});
  tx.create(auditRef,{...audit,status:'topic_replaced',topic:chosen.key,service:chosen.service,replacementVersion:next.version});
  return {status:'preparing_replacement',version:next.version,topic:chosen.key};
 });
}
module.exports={topics,repeated,select,recover};

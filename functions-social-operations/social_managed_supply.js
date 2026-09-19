'use strict';
// Supply drafts under an existing strategy. Never rewrite the approved plan or
// create approval/jobs here. The ordinary worker owns preparation and scheduling.
const bounded=require('./social_bounded_authority');
const social=require('./social_operations');
const {hash}=require('./social_growth_cycle');
const normalize=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const duplicate=(copy,history)=>history.some(x=>normalize(x)===normalize(copy)||normalize(x).startsWith(normalize(copy)+' '));
function choose({uid,policy,plan,profile,scope,connections,items,versions,jobs,now}) {
  const draftItems=items.filter(i=>i.planId===policy.planId);
  // Finish the maintained queue first; do not bypass an owner's edit/cancel hold
  // by silently generating a replacement for it.
  for(const i of draftItems){
    const version=versions.find(v=>v.id===i.id+'_v'+i.currentVersion);
    if(!version)return {status:'history_incomplete'};
    for(const v of version?.variants||[]){
      if(!policy.providers.includes(v.provider))continue;
      if(!jobs.some(j=>j.provider===v.provider&&j.versionId?.startsWith(i.id+'_v')))return {status:'existing_drafts'};
    }
  }
  if(items.length>=60||versions.length>=90||jobs.length>=90)return {status:'history_limit'};
  const slots=policy.providers.map(provider=>({provider,at:bounded.nextSlot({policy,history:jobs,provider,now})})).filter(x=>x.at);
  if(!slots.length)return {status:'cadence_full'};
  const reviewed=policy.reviewedScope;
  if(!reviewed?.businessName||profile?.businessUid!==uid||profile.businessName!==reviewed.businessName)return {status:'context_changed'};
  const voice=profile.brandVoice?.trim()||profile.tone?.trim()||'Helpful, professional Business voice; no unsupported personal or completed-work claims.';
  if(reviewed.voice&&reviewed.voice!==voice)return {status:'context_changed'};
  const approvedAreas=(plan.strategy?.geography||[]).map(normalize).sort();
  const currentAreas=(scope?.areas||[]).map(a=>normalize(a.label)).sort();
  if(approvedAreas.length&&JSON.stringify(approvedAreas)!==JSON.stringify(currentAreas))return {status:'context_changed'};
  // Reuse the maintained truthful planner, restricted to each authorized service
  // and the approved destination. No novel claims, offers or inferred outcomes.
  for(const service of policy.services){
    const prepared=require('./social_customer_plan').prepare({uid,planId:'managed_growth',
      profile:{...profile,businessName:reviewed.businessName,priorityServices:[service],website:policy.destinations[0],primaryCta:plan.items?.flatMap(i=>i.variants||[]).find(v=>v.callToAction)?.callToAction||'Learn more'},scope,
      connections:connections.filter(c=>slots.some(s=>s.provider===c.provider)),now});
    for(const idea of prepared.record.items){
      const variants=idea.variants.filter(v=>slots.some(s=>s.provider===v.provider)&&
        !duplicate(v.copy,versions.flatMap(x=>(x.variants||[]).filter(y=>y.provider===v.provider).map(y=>y.copy)))&&
        !bounded.internalCopy.test(v.copy)&&!bounded.unsupportedClaim.test(v.copy)&&
        normalize([idea.goal,idea.pillar,v.copy].join(' ')).includes(service)&&
        policy.destinations.includes(v.destinationUrl));
      if(!variants.length)continue;
      const itemKey='managed_'+hash({policy:policy.id,service,pillar:idea.pillar}).slice(0,32);
      const itemId=policy.planId+'_'+itemKey;
      if(items.some(i=>i.id===itemId))continue;
      const item={...idea,itemKey,scheduledFor:slots.find(s=>s.provider===variants[0].provider).at,variants};
      return {status:'draft_created',itemId,item,service};
    }
  }
  return {status:'fresh_topics_exhausted'};
}
async function replenish({db,uid,now=Date.now()}) {
  return db.runTransaction(async tx=>{
    const read=ref=>tx.get(ref), policy=(await read(db.doc('socialManagedPolicies/'+uid))).data();
    const plan=policy?.planId?(await read(db.doc('socialContentPlans/'+policy.planId))).data():null;
    bounded.assertRuntimePolicy({uid,policy,plan,approval:{businessUid:uid,planId:policy?.planId,
      managedPolicyId:policy?.id,managedStrategyDigest:policy?.strategyDigest},now});
    if(!await require('./social_customer_enrollment').authorized({db,uid,read,now}))throw Error('managed_social_entitlement_required');
    const user=(await read(db.doc('users/'+uid))).data();
    if(user?.role!=='business'||user.active!==true)throw Error('managed_social_active_business_required');
    const profile=(await read(db.doc('businessGrowthProfiles/'+uid))).data();
    const geography=(await read(db.doc('discoveryPreferences/'+uid))).data();
    const health=(await read(db.doc('agentHealth/'+uid))).data();
    if(health?.killSwitchActive===true)throw Error('managed_social_safety_hold');
    const connections=(await read(db.collection('socialConnections').doc(uid).collection('providers'))).docs.map(d=>({provider:d.id,...d.data()}));
    const rows={};for(const c of ['socialContentItems','socialContentVersions','socialGrowthJobs']){
      const q=await read(db.collection(c).where('businessUid','==',uid).limit(101));
      if(q.size>100)throw Error('managed_social_history_limit');rows[c]=q.docs.map(d=>({...d.data(),id:d.id}));
    }
    const result=choose({uid,policy,plan,profile,scope:require('./growth_geography').serviceAreaScope(geography,uid),connections,
      items:rows.socialContentItems,versions:rows.socialContentVersions,jobs:rows.socialGrowthJobs,now});
    if(result.status!=='draft_created')return result;
    const {itemId,item,service}=result;
    const ref=db.doc('socialContentItems/'+itemId);
    if((await read(ref)).exists)return {status:'existing_drafts'};
    tx.update(db.doc('socialManagedPolicies/'+uid),{lastDraftPreparedAt:now});
    tx.create(ref,{schemaVersion:social.SCHEMA_VERSION,businessUid:uid,planId:policy.planId,itemKey:item.itemKey,
      status:'ready_for_review',currentVersion:1,scheduledFor:item.scheduledFor,createdAt:now,updatedAt:now,
      managedPolicyId:policy.id,managedStrategyDigest:policy.strategyDigest,managedDraft:item});
    tx.create(db.doc('socialContentVersions/'+itemId+'_v1'),social.contentItemVersion({businessUid:uid,planId:policy.planId,item,now}));
    tx.create(db.doc('socialManagedDraftAudit/'+itemId),{businessUid:uid,policyId:policy.id,strategyDigest:policy.strategyDigest,
      itemId,service,createdAt:now,source:'recurring_strategy_preparation',approvalCreated:false,schedulingCreated:false});
    return {status:'draft_created',itemId};
  });
}
async function supplemental({db,uid,planId}) {
  const rows=await db.collection('socialContentItems').where('businessUid','==',uid).limit(101).get();
  if(rows.size>100)throw Error('managed_social_history_limit');
  return rows.docs.filter(d=>d.data().planId===planId&&d.data().managedPolicyId&&d.data().managedDraft)
    .map(d=>d.data().managedDraft);
}
module.exports={choose,replenish,supplemental};


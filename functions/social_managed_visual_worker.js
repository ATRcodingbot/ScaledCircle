'use strict';
const crypto=require('node:crypto');
function createWorker({db,auth,generation,now=Date.now}) {
 return {async run(){
  const pending=await db.collection('socialManagedGenerationRequests').where('status','==','pending').limit(2).get();
  const results=[];
  for(const doc of pending.docs){
   const request=doc.data(),uid=request.businessUid;
   try{
    const [p,s,u,h]=await Promise.all(['socialManagedPolicies/'+uid,'socialContentPlans/'+request.planId,
      'users/'+uid,'agentHealth/'+uid].map(path=>db.doc(path).get()));
    const policy=p.data(),plan=s.data(),user=u.data();
    if(policy?.id===request.policyId&&policy.status==='paused'){
     await doc.ref.update({status:'paused',checkedAt:now()});
     results.push({businessUid:uid,status:'paused'});continue;
    }
    const digest=crypto.createHash('sha256').update(JSON.stringify({businessUid:plan?.businessUid,planVersion:plan?.planVersion,strategy:plan?.strategy})).digest('hex');
    if(policy?.schemaVersion!=='BoundedManagedSocialV1'||policy.businessUid!==uid||policy.approvedByUid!==uid||
      policy.id!==request.policyId||policy.planId!==request.planId||policy.status!=='active'||policy.revokedAt!=null||
      !Number.isFinite(policy.startsAt)||!Number.isFinite(policy.endsAt)||policy.endsAt<=now()||policy.startsAt>now()||
      plan?.businessUid!==uid||plan.status!=='approved'||plan.planVersion!==plan.approvedVersion||policy.strategyDigest!==digest||
      user?.role!=='business'||user.active!==true||h.data()?.killSwitchActive===true)throw Error('managed_generation_authority_unavailable');
    const identity=await auth.getUser(uid);
    if(identity.disabled||!identity.emailVerified)throw Error('managed_generation_owner_unavailable');
    const post=request.input?.socialPost;
    if(!post||!policy.providers.includes(post.provider))throw Error('managed_generation_post_required');
    const item=(await db.doc('socialContentItems/'+post.itemId).get()).data();
    if(item?.businessUid!==uid||item.planId!==request.planId||item.managedHolds?.[post.provider]||
      (item.platformVersions?.[post.provider]??item.currentVersion)!==post.version)throw Error('managed_generation_post_changed');
    const actor={uid,user,role:'business',emailVerified:true,managedAuthority:{policyId:policy.id,executionActor:'managed_social_scheduler'}};
    const requested=await generation.request({actor,input:request.input});
    const result=requested.status==='queued'?await generation.process({actor,jobId:requested.jobId}):requested;
    const finished=['review_required','approved'].includes(result.status);
    await doc.ref.update({status:finished?'prepared':['processing','queued'].includes(result.status)?'pending':'needs_attention',
      jobId:requested.jobId,lastProviderStatus:result.status,checkedAt:now()});
    results.push({businessUid:uid,status:finished?'prepared':result.status});
   }catch(error){await doc.ref.update({status:'needs_attention',reason:'Creative generation needs attention. Your saved post is preserved.',checkedAt:now()});
    results.push({businessUid:uid,status:'needs_attention'});}
  }
  return results;
 }};
}
module.exports={createWorker};

'use strict';
// Hydrate presentation from canonical jobs without rewriting strategy history.
function overlay(plans,jobs) {
  return plans.map(plan=>({...plan,items:(plan.items||[]).map(item=>({...item,
    variants:(item.variants||[]).map(variant=>{
      const candidates=jobs.filter(job=>job.businessUid===plan.businessUid && job.provider===variant.provider &&
        job.versionId===`${plan.id}_${item.itemKey}_v${item.currentVersion||1}` && job.customerApproval===true);
      if(candidates.length!==1)return {...variant};
      const job=candidates[0];
      return {...variant,status:job.status,scheduledFor:job.scheduledFor};
    })}))}));
}
async function load({db,uid,plans,store}) {
  const snapshot=await db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101).get();
  if(snapshot.size>100)throw Error('Social history needs a paginated review.');
  const hydrated=structuredClone(plans);
  let count=0;
  for(const plan of hydrated)for(const item of plan.items||[]) {
    if(++count>60)throw Error('Too many proposed posts to review at once.');
    for(const variant of item.variants||[]) {
      if(!['facebook','instagram'].includes(variant.provider))continue;
      const itemId=plan.id+'_'+item.itemKey;
      try {
        const check=await store.preview(uid,{itemId,provider:variant.provider});
        if(check.reviewedPost?.variant)Object.assign(variant,check.reviewedPost.variant);
        item.currentVersion=check.version; item.scheduledFor=check.scheduledFor;
        variant.scheduling={...check,itemId};
      }
      catch {variant.scheduling={ready:false,reasons:[{code:'readback',message:'Current post requirements could not be loaded. Try again.'}]};}
    }
  }
  return overlay(hydrated,snapshot.docs.map(d=>d.data()));
}
module.exports={overlay,load};

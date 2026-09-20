'use strict';
// Approved strategy topics also supply the existing Brand Assets category field.
// This grants no asset approval, provider access, quota or spending authority.
function patch({uid,policy,profile,brand,now}) {
 if(brand?.businessUid&&brand.businessUid!==uid)throw Error('creative_profile_owner_mismatch');
 if(brand?.approvedServiceCategories?.length)return null;
 const offered=profile?.servicesOffered;
 if(!profile||profile.businessUid&&profile.businessUid!==uid||!Array.isArray(offered))throw Error('creative_profile_context_missing');
 const canonical=new Map(offered.filter(s=>typeof s==='string').map(s=>[s.trim().toLowerCase(),s.trim()]));
 const categories=[...new Set((policy.services||[]).map(s=>canonical.get(String(s).trim().toLowerCase())))];
 if(!categories.length||categories.length>12||categories.some(s=>typeof s!=='string'||s.length>80||!/^\p{L}[\p{L}\p{N}\s&/+\-'’().,]*$/u.test(s)))throw Error('creative_categories_outside_strategy');
 return {schemaVersion:'BusinessBrandProfileV1',businessUid:uid,approvedServiceCategories:categories,
   updatedAt:now,updatedBy:policy.approvedByUid,categoryAuthority:{source:'approved_social_strategy',policyId:policy.id,
   strategyDigest:policy.strategyDigest,approvedByUid:policy.approvedByUid,approvedAt:policy.approvedAt,reconciledAt:now}};
}
async function reconcile({db,uid,now=Date.now()}) {
 return db.runTransaction(async tx=>{
  const read=r=>tx.get(r),policy=(await read(db.doc('socialManagedPolicies/'+uid))).data();
  const plan=policy?.planId?(await read(db.doc('socialContentPlans/'+policy.planId))).data():null;
  require('./social_bounded_authority').assertRuntimePolicy({uid,policy,plan,approval:{businessUid:uid,planId:policy?.planId,managedPolicyId:policy?.id,managedStrategyDigest:policy?.strategyDigest},now});
  if(!await require('./social_customer_enrollment').authorized({db,uid,read,now}))throw Error('creative_profile_authority_missing');
  const [profile,brand,health]=await Promise.all(['businessGrowthProfiles/'+uid,'businessBrandProfiles/'+uid,'agentHealth/'+uid].map(p=>read(db.doc(p))));
  if(health.data()?.killSwitchActive)throw Error('creative_profile_paused');
  const value=patch({uid,policy,profile:profile.data(),brand:brand.data(),now});
  if(!value)return {status:'preserved'};
  tx.set(db.doc('businessBrandProfiles/'+uid),value,{merge:true});
  tx.create(db.collection('socialManagedCreativeConfigurationAudit').doc(),{businessUid:uid,action:'strategy_categories_reconciled',...value.categoryAuthority,categories:value.approvedServiceCategories});
  return {status:'configured',categories:value.approvedServiceCategories};
 });
}
module.exports={patch,reconcile};

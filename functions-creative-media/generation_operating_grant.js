'use strict';
const crypto=require('node:crypto');
// Server maintenance entry point: caller must already hold production IAM write
// authority. The operator is the authenticated maintenance principal, not a
// fabricated customer approval. The existing customer strategy is read-only.
async function enroll({db,businessUid,expectedPolicyId,expiresAt,maximumCostMicros,maximumConcepts,operator,authorizationReference,now=Date.now}){
 if(!operator||!authorizationReference||!businessUid||!Number.isSafeInteger(maximumCostMicros)||maximumCostMicros<=0||!Number.isSafeInteger(maximumConcepts)||maximumConcepts<=0)throw Error('invalid_operating_grant');
 const id='operating_'+crypto.createHash('sha256').update(JSON.stringify([businessUid,expectedPolicyId,authorizationReference])).digest('hex').slice(0,40);
 return db.runTransaction(async tx=>{
  const grantRef=db.doc('visualGenerationGrants/'+businessUid),configRef=db.doc('providerConfigurations/generated-service-visuals');
  const [old,p,b,c]=await Promise.all([tx.get(grantRef),tx.get(db.doc('socialManagedPolicies/'+businessUid)),tx.get(db.doc('businessBrandProfiles/'+businessUid)),tx.get(configRef)]);
  const policy=p.data(),config=c.data(),at=now();
  if(policy?.businessUid!==businessUid||policy.id!==expectedPolicyId||policy.status!=='active'||policy.revokedAt!=null||policy.endsAt!==expiresAt||expiresAt<=at||!b.data()?.approvedServiceCategories?.length)throw Error('operating_strategy_not_ready');
  if(old.exists){const g=old.data();if(g.id!==id||g.maximumCostMicros!==maximumCostMicros||g.maximumConcepts!==maximumConcepts||g.expiresAt!==expiresAt)throw Error('operating_grant_conflict');return {...g,reused:true};}
  if(config?.providerGenerationEnabled!==true||config.modelSnapshot!=='gpt-image-2-2026-04-21'||config.size!=='1536x1024'||config.quality!=='medium')throw Error('operating_provider_not_ready');
  const cohort=[...new Set([...(config.betaCohortBusinessUids||[]),businessUid])];
  if(cohort.length>require('./generation_foundation').betaCohortMaximum(config.betaCohortStage))throw Error('generation_cohort_full');
  const grant={id,businessUid,policyId:policy.id,product:'social_creative_generation',source:'internal_operating_grant',status:'active',startsAt:at,expiresAt,maximumCostMicros,maximumConcepts,grantedAt:at,grantedBy:operator,authorizationReference,renewal:false,monthlyReset:false};
  tx.create(grantRef,grant);tx.update(configRef,{betaCohortBusinessUids:cohort});
  tx.create(db.doc('entitlementAuditEvents/'+id),{...grant,event:'internal_operating_grant_created',billingMutation:false});
  return grant;
 });
}
module.exports={enroll};

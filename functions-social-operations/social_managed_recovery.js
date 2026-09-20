'use strict';
// One corrective source request per strategy/item/platform, not transport retries.
async function recover({db,uid,input,policyId,candidate,preparation,now=Date.now()}){
 const quality=candidate?.preparation?.subjectQuality;
 if(quality?.status!=='blocked'||quality.checkedSha256!==candidate.sha256)throw Error('managed_recovery_evidence_invalid');
 const key=require('node:crypto').createHash('sha256').update([uid,policyId,input.itemId,input.provider].join(':')).digest('hex');
 const ref=db.doc('socialManagedRecovery/'+key);
 const claimed=await db.runTransaction(async tx=>{
  const old=await tx.get(ref);if(old.exists)return false;
  const policy=(await tx.get(db.doc('socialManagedPolicies/'+uid))).data();
  if(policy?.id!==policyId||policy.businessUid!==uid||policy.status!=='active'||policy.endsAt<=now)throw Error('managed_recovery_authority');
  tx.create(ref,{businessUid:uid,policyId,itemId:input.itemId,provider:input.provider,version:input.version,attempts:1,status:'requested',failedCandidate:candidate,requestedAt:now,source:'recurring_strategy_preparation',reason:'Visual quality did not meet the maintained threshold; one new source concept permitted within existing budget.'});return true;
 });
 if(!claimed)return {exhausted:true,reason:'The bounded creative replacement has been used. Choose a different Business image or review this exception.'};
 try{
  const result=await preparation.prepare(uid,{...input,action:'regenerate',confirmRegeneration:true,candidateSha256:candidate.sha256});
  await ref.update({status:'replacement_requested',updatedAt:Date.now()});return {result};
 }catch(error){await ref.update({status:'needs_attention',updatedAt:Date.now(),reason:'Corrective preparation could not finish. Review the saved draft; no automatic retry.'});throw error;}
}
module.exports={recover};

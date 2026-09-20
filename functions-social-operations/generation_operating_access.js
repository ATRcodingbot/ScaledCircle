'use strict';
function activeGrant(grant,policy,uid,now=Date.now()){
 return Boolean(grant?.businessUid===uid&&grant.source==='internal_operating_grant'&&grant.product==='social_creative_generation'&&
  grant.status==='active'&&grant.revokedAt==null&&Number.isFinite(grant.startsAt)&&grant.startsAt<=now&&
  Number.isFinite(grant.expiresAt)&&grant.expiresAt>now&&grant.policyId===policy?.id&&policy.businessUid===uid&&
  policy.status==='active'&&policy.revokedAt==null&&policy.endsAt===grant.expiresAt&&policy.startsAt<=now&&
  Number.isSafeInteger(grant.maximumConcepts)&&grant.maximumConcepts>0&&Number.isSafeInteger(grant.maximumCostMicros)&&grant.maximumCostMicros>0);
}
module.exports={activeGrant};

'use strict';
// Performance suggestions are advisory for an owner-reviewed post. Required
// content, provenance and verified delivery media remain blocking conditions.
function reviewChecks({variant,revision,mediaAuthorityValid,recentVariants=[]}) {
  const blockers=[];
  const copy=String(variant?.copy||'').trim();
  if(require('./social_public_caption').internalCopy.test(copy))blockers.push('Remove internal workflow language from the public caption.');
  if(copy.length<20||copy.length>(variant?.provider==='instagram'?2200:5000)||/\{\{|\[insert|lorem ipsum/i.test(copy))blockers.push('Complete the post text.');
  if(variant?.callToAction&&!variant?.destinationUrl)blockers.push('Add the destination for this call to action.');
  if(variant?.destinationUrl){try{const u=new URL(variant.destinationUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{blockers.push('Use a secure public destination.');}}
  const required=variant?.provider==='instagram'||variant?.mediaRequirement!=='none';
  if(required&&(!mediaAuthorityValid||revision?.preparation?.policy!=='SocialFeedCreativeV2'||revision.preparation.pixelCheck!=='passed'||
      revision.preparation.checkedSha256!==revision.images?.[0]?.sha256))blockers.push('Prepare and verify the full-quality image.');
  if(revision?.sourceOrigin==='generated_service_concept' && /\b(?:our\s+(?:latest|recent|completed)\s+(?:project|work|deck|fence)|(?:we|our team)\s+(?:just\s+)?(?:completed|built|installed|finished)|another\s+happy\s+customer|before\s*(?:and|&|\/)\s*after)\b/i.test(copy))blockers.push('The caption describes this generated concept as completed Business work. Change that claim before publishing.');
  if(recentVariants.some(v=>v.provider===variant?.provider&&String(v.copy||'').trim()===copy))blockers.push('This exact text already appears in another post. Review the duplicate.');
  return {policy:'CustomerPostReviewChecksV1',passed:blockers.length===0,blockers};
}
module.exports={reviewChecks};

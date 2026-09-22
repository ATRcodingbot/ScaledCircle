'use strict';
// One automatic infrastructure recovery of an existing completed source. This
// is never a second image generation or a retry of a completed quality verdict.
function eligible(preparation){
 return preparation?.state==='needs_attention'&&!preparation.reviewCandidate&&
  !!preparation.failureReason&&(preparation.infrastructureRecoveryAttempts||0)<1&&
  (preparation.failureStage==='model_catalog'||(!preparation.failureStage&&preparation.generationStatus==null));
}
function claim(old){
 if(old?.state==='needs_attention'&&old.failureReason&&!old.reviewCandidate){
  if(!eligible(old))throw Error('Creative review recovery is held. Review the saved failure before retrying.');
  return (old.infrastructureRecoveryAttempts||0)+1;
 }
 return old?.infrastructureRecoveryAttempts||0;
}
module.exports={eligible,claim};

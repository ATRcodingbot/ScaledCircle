'use strict';
// No implicit grant, project selection, activation or retry. The existing
// Email worker supplies only a conversation already checked by its authority.
function createRuntime({db,apiKey,now=Date.now}){
 return async({a,requestId,recheck,context,conversation})=>{
  if(!apiKey)throw Error('inference_provider_binding_required');
  const config=a.beta.leadAssistanceGrant;
  if(!config?.inferenceGrantId)throw Error('inference_shared_grant_required');
  const grantRef=db.doc('emailAssistanceOperatingGrants/'+config.inferenceGrantId);
  const grant=(await grantRef.get()).data();
  const review=(await db.doc('emailAssistanceProviderReviews/openai_gmail_v1').get()).data();
  if(!require('./provider_review').validReview(review))throw Error('inference_data_review_required');
  const store=require('./inference_budget').createStore({db,grantId:config.inferenceGrantId,now});
  const check=async()=>{
   const latest=(await grantRef.get()).data();
   if(!require('./inference_budget').valid(latest,a.businessId,now())||latest.dataReviewDigest!==require('./lead_assistance_policy').digest(review))throw Error('inference_grant_or_review_changed');
   const currentReview=(await db.doc('emailAssistanceProviderReviews/openai_gmail_v1').get()).data();
   if(require('./lead_assistance_policy').digest(currentReview)!==latest.dataReviewDigest)throw Error('inference_data_review_changed');
   await recheck();
  };
  if(!grant)throw Error('inference_shared_grant_required');
  return require('./inference').createInference({store,apiKey,dataReview:review,recheck:check})({businessId:a.businessId,requestId,context,conversation});
 };
}
module.exports={createRuntime};

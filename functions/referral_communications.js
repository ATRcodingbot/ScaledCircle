'use strict';
const {TEMPLATES}=require('./referral_email_templates');
const URL='https://scaledcircle-staging.web.app/#/referral-portal';
async function queue({db,FieldValue,auth,project,milestoneId}){
  require('./referral_liability').assertRuntime(project);
  const source=db.doc('referralMilestones/'+milestoneId),first=(await source.get()).data();
  if(!first||!TEMPLATES.has('referral_'+first.type+'_v1'))throw Error('referral_milestone_invalid');
  const owner=await auth.getUser(first.beneficiaryUid);
  const {validEmail,SUPPORT_EMAIL}=require('./transactional_email');
  if(owner.disabled||!owner.emailVerified||!validEmail(owner.email))throw Error('referral_email_identity_unavailable');
  return db.runTransaction(async tx=>{
    const ref=db.doc('outboundEmailJobs/referral_'+milestoneId),[current,existing]=await Promise.all([tx.get(source),tx.get(ref)]);
    if(existing.exists)return {duplicate:true};const m=current.data();
    if(m.beneficiaryUid!==first.beneficiaryUid||m.type!==first.type)throw Error('referral_milestone_changed');
    const availability=m.holdUntilMillis?'\nExpected availability: '+new Date(m.holdUntilMillis).toISOString().slice(0,10)+'.':'';
    tx.create(ref,{to:owner.email,fromAddress:SUPPORT_EMAIL,fromName:'ScaledCircle',replyTo:SUPPORT_EMAIL,
      subject:m.title,text:m.message+availability+'\n\nReferral rewards are paid separately by ScaledCircle and do not reduce the referred Scaler\'s pay.\n\nView Referrals: '+URL,
      template:'referral_'+m.type+'_v1',sourceMilestoneId:milestoneId,beneficiaryUid:m.beneficiaryUid,
      status:'queued',attempts:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    return {queued:true};
  });
}
module.exports={TEMPLATES,URL,queue};

'use strict';
const {id}=require('./policy');
async function managed(db,business,item,provider,now){
 const policy=(await db.doc('socialManagedPolicies/'+business).get()).data();
 return !!(policy?.businessUid===business&&policy.status==='active'&&policy.endsAt>now&&
   policy.approvedByUid&&policy.planId===item?.planId&&policy.providers?.includes(provider));
}
// Current presentation only. Original notification, timestamps and receipts stay intact.
async function resolve({db,n,business,now}){
 let entries=n.reviewItems?Object.values(n.reviewItems):[];
 const link=n.deepLink||{};
 if(!entries.length&&id(link.itemId))entries=[link];
 const jobId=id(link.jobId||n.source?.jobId);
 if(jobId){
  const job=(await db.doc('socialGrowthJobs/'+jobId).get()).data();
  if(job&&job.businessUid!==business)return {available:false};
  if(job)return {deepLink:{destination:'social_published',jobId},title:'Social post — '+job.status.replaceAll('_',' '),message:'Open the current post and its publishing history.',currentState:job.status};
 }
 const targets=[];
 for(const entry of entries.slice(0,60)){
  if(!id(entry.itemId)||!['facebook','instagram'].includes(entry.provider))continue;
  const item=(await db.doc('socialContentItems/'+entry.itemId).get()).data();
  if(item&&item.businessUid!==business)return {available:false};
  if(!item)continue;
  const version=item.platformVersions?.[entry.provider]??item.currentVersion;
  const approval=item.platformApprovals?.[entry.provider];
  const job=approval?.jobId?(await db.doc('socialGrowthJobs/'+approval.jobId).get()).data():null;
  if(job&&job.businessUid!==business)return {available:false};
  const automatic=await managed(db,business,item,entry.provider,now);
  const cycle=(await db.doc(`socialManagedCycles/${business}/posts/${entry.itemId}_${entry.provider}`).get()).data();
  const state=job?.status||(automatic?(cycle?.status==='needs_attention'?'needs_attention':'managed_preparation'):
   entry.version&&entry.version!==version?'updated':'review');
  targets.push({...entry,version,state,automatic,reasons:cycle?.reasons||[]});
 }
 if(targets.length===1){const t=targets[0];return {deepLink:{destination:'social_draft',itemId:t.itemId,provider:t.provider},
  title:`${t.provider==='instagram'?'Instagram':'Facebook'} post — ${t.state.replaceAll('_',' ')}`,
  message:t.state==='needs_attention'?(t.reasons.map(r=>r.message).filter(Boolean).join(' ')||'Open this post to review the current exception.'):
   t.automatic?'This post follows your authorized publishing strategy. Open its current status; routine posts do not require individual approval.':'Open the current post and its review status.',currentState:t.state,unresolvedCount:t.state==='review'||t.state==='needs_attention'?1:0};}
 return {deepLink:{destination:'social_review'},title:targets.length?'Social updates':'Earlier Social notification',
  message:targets.length?`${targets.length} posts are linked to this earlier notice. Open Social for their current status.`:'The original target is no longer available. Open your Social workspace for current posts.',
  currentState:targets.length?'current_queue':'target_unavailable',unresolvedCount:targets.filter(t=>['review','needs_attention'].includes(t.state)).length};
}
module.exports={managed,resolve};

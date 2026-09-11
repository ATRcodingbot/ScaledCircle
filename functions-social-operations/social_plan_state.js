'use strict';
// Read-only projection. Approval belongs to the exact current plan version;
// this module never grants post approval or publication authority.
const approved = p => p.status === 'approved' && Number.isSafeInteger(p.planVersion) && p.planVersion > 0 && p.approvedVersion === p.planVersion;
function project(plans = []) {
  const pending = plans.filter(p => !approved(p));
  const items = plans.flatMap(p => Array.isArray(p.items) ? p.items : []);
  const finalStates = ['approved', 'scheduled', 'published'];
  const draftPosts = items.filter(i => Array.isArray(i.variants) && i.variants.length
    ? i.variants.some(v => !finalStates.includes(v.status)) : !finalStates.includes(i.status)).length;
  const allApproved = plans.length > 0 && !pending.length;
  const planApprovalState = !plans.length ? 'not_created' : allApproved ? 'approved' : 'needs_review';
  const variants=items.flatMap(i=>Array.isArray(i.variants)&&i.variants.length?i.variants:[i]);
  const postReviewState = draftPosts ? 'drafts_need_review' : !variants.length ? 'no_posts' : variants.every(v=>v.status==='published') ? 'published' : variants.some(v=>v.status==='scheduled') ? 'scheduled' : 'approved';
  return {schemaVersion:'SocialPlanReviewProjectionV1',planApprovalState,postReviewState,
    approvedPlans:plans.length-pending.length,draftPlans:pending.length,draftPosts,
    versions:plans.map(p=>({planId:p.id,planVersion:p.planVersion,approvedVersion:p.approvedVersion,approved:approved(p)})),
    title:allApproved ? `Plan approved${draftPosts ? ` · ${draftPosts} posts need review` : ''}` : pending.length ? (pending.some(p=>p.approvedVersion>0) ? 'New Plan Version Needs Review' : 'Plan needs review') : 'Prepare a content plan',
    attention:allApproved ? draftPosts ? `${draftPosts} Social posts need review` : 'Social plan approved' : pending.length ? 'Social plan needs review' : 'Prepare a Social plan',
    lastAction:allApproved ? '30-Day strategy approved' : pending.length ? 'Plan version proposed' : 'No plan prepared',
    result:allApproved ? `${draftPosts} draft posts awaiting content review` : `${pending.length} plan versions awaiting strategy review`,
    nextAction:allApproved ? draftPosts ? 'Review proposed posts and creative' : 'View approved plan and content status' : 'Review the proposed 30-Day strategy',
    destination:allApproved && draftPosts ? '/business/social-operations?review=posts' : '/business/social-operations?review=plan',
    publicationAuthorizedByStatus:false};
}
module.exports={approved,project};

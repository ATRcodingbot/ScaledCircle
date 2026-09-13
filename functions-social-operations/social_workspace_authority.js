'use strict';
// Uses the same active membership, seat and responsibility checks as Team.
function createAuthority({db,auth,FieldValue,Timestamp}) {
 const workspace=require('./business_workspace').createWorkspaceService({db,auth,FieldValue,Timestamp});
 return async ({businessUid,actorUid,approve=false,transaction=null})=>{
  await workspace.actor(actorUid);
  const access=await workspace.authority({uid:actorUid,businessId:businessUid,permission:'intelligence',transaction});
  if(approve&&!access.isOwner)await workspace.authority({uid:actorUid,businessId:businessUid,permission:'outreachApproval',transaction});
  return access;
 };
}
// Structural binding only; callers must also recheck membership before execution.
function validApprovalActor(approval,uid) {
 return approval?.approvedByUid===uid || approval?.schemaVersion==='CustomerPostApprovalV1'&&
   approval?.actorAuthority?.type==='workspace_member'&&approval.actorAuthority.businessUid===uid&&
   approval.actorAuthority.actorUid===approval.approvedByUid&&typeof approval.approvedByUid==='string'&&approval.approvedByUid.length>0;
}
module.exports={createAuthority,validApprovalActor};

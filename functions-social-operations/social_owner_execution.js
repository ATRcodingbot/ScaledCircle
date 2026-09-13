'use strict';
const legacyKeys=new Set(['schemaVersion','workspaceKind','businessUid','businessName','externalActionsEnabled','killSwitchActive','researchPaused','createdBy','createdAt','updatedAt','researchEnabled','nextResearchAfter','lastResearchRunId']);
function legacySetupHold(health,uid){return health?.schemaVersion==='CustomerGrowthWorkspaceV1'&&health.workspaceKind==='customer'&&
 health.businessUid===uid&&health.createdBy===uid&&health.killSwitchActive===true&&health.externalActionsEnabled===false&&health.researchPaused===false&&
 Object.keys(health).every(k=>legacyKeys.has(k));}
async function enableOwnerExecution({db,uid,actorUid,now=Date.now()}) {
 if(actorUid!==uid)throw Error('Only the owner can replace the initial workspace setup restriction.');
 return db.runTransaction(async tx=>{
   const ref=db.doc('agentHealth/'+uid),health=(await tx.get(ref)).data();
   if(health?.killSwitchActive===false)return {changed:false};
   if(!legacySetupHold(health,uid))throw Error('An explicit workspace safety restriction needs resolution before publishing.');
   const jobs=await tx.get(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(1));
   if(!jobs.empty)throw Error('Existing publication activity must be reviewed before changing this restriction.');
   tx.update(ref,{killSwitchActive:false,socialExecutionMode:'owner_approval_required',socialExecutionEnabledBy:actorUid,socialExecutionEnabledAt:now});
   tx.create(db.doc('agentApprovals/owner_social_execution_'+uid),{businessUid:uid,actorUid,action:'replace_legacy_setup_hold',
     previous:{killSwitchActive:true,externalActionsEnabled:false},mode:'owner_approval_required',createdAt:now,postApprovalGranted:false});
   return {changed:true,postApprovalGranted:false};
 });
}
module.exports={legacySetupHold,enableOwnerExecution};

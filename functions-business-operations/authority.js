'use strict';
const ws=require('./shared/business_workspace'),legal=require('./shared/legal_consent');
const {hasActivePaidBusinessEntitlement,hasActiveManagedGrowthEntitlement,hasActiveProductEntitlement}=require('./shared/subscription_entitlements');
const {id,fail}=require('./model');
const internalBridge=require('./shared/internal_growth_bridge');
function createAuthority({db,auth,FieldValue,Timestamp,project,agentBusinesses='',internalAdminUid='',now=Date.now}){
 const workspace=ws.createWorkspaceService({db,auth,FieldValue,Timestamp,now});
 const consent=legal.createLegalConsentService({db,FieldValue});
 return async(request,{transaction=null,write=false}={})=>{
  if(!['scaledcircle-staging','scaled-circle'].includes(project)&&!/^demo-/.test(project||''))fail('failed-precondition','Business operations are unavailable in this environment.');
  const uid=request.auth?.uid;if(!uid)fail('unauthenticated','Sign in to your Business.');
  const actor=await workspace.actor(uid),businessId=id(request.data?.businessId||uid);
  const get=r=>transaction?transaction.get(r):r.get();
  // Reuse the distinct, already established internal namespace; no new owner,
  // subscription or customer Business is fabricated for Admin dogfood.
  const user=(await get(db.doc('users/'+uid))).data();
  if(user?.role==='admin'){
   if(project==='scaled-circle'){
    if(businessId!==uid)fail('permission-denied','Choose your maintained internal workspace.');
    const identity=await auth.getUser(uid);
    try{internalBridge.authorizeProductionActor({expectedUid:internalAdminUid,uid,
      tokenVerified:identity.emailVerified,user,identity});}
    catch(_){fail('permission-denied','Choose your maintained internal workspace.');}
   }else{
    const registry=(await get(db.doc('internalGrowthWorkspaces/'+businessId))).data();
    if(user.active!==true||registry?.kind!=='internal_admin_dogfood'||registry.namespace!==businessId||registry.ownerUid!==uid)
     fail('permission-denied','Choose your maintained internal workspace.');
   }
   return {businessId,actorUid:uid,isOwner:true,permissions:[...ws.PERMISSIONS],activePaid:true,internal:true,agentAvailable:true,capacity:1,ownerUid:uid,actorName:actor.name};
  }
  const a=await workspace.authority({uid,businessId,transaction,allowExpired:true});
  const activePaid=hasActivePaidBusinessEntitlement(a.entitlement,{nowMillis:now()});
  if(write&&!activePaid)fail('failed-precondition','Reactivate membership to add or change work. Your history remains available.');
  if(write)await consent.requireCurrent({uid,agreementTypes:['terms','privacy'],transaction});
  const agentAvailable=activePaid&&a.permissions.includes('intelligence')&&agentBusinesses.split(',').map(s=>s.trim()).includes(businessId)&&(hasActiveManagedGrowthEntitlement(a.entitlement,{nowMillis:now()})||hasActiveProductEntitlement(a.entitlement,'business_assistant',{nowMillis:now()}));
  return {...a,activePaid,agentAvailable,internal:false,ownerUid:businessId,actorName:actor.name};
 };
}
module.exports={createAuthority};

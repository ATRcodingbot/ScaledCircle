'use strict';
const workspace=require('./shared/business_workspace'),legal=require('./shared/legal_consent');
const entitlements=require('./shared/subscription_entitlements');
const preferences=require('./growth_opportunity_preferences');
const internalBridge=require('./shared/internal_growth_bridge');
function createAuthority({db,auth,FieldValue,Timestamp,project,beta={},configured=false,internalAdminUid=''}) {
  const ws=workspace.createWorkspaceService({db,auth,FieldValue,Timestamp}),consent=legal.createLegalConsentService({db,FieldValue});
  const deny=message=>{const e=Error(message);e.code='permission-denied';throw e;};
  return async (request,operation)=>{
    const uid=request.auth?.uid;if(!uid)deny('Sign in to your Business.');
    const who=await ws.actor(uid),businessId=request.data?.businessId||uid;
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(businessId)||!beta[businessId]?.mailbox)deny('Business Email is available by private invitation.');
    const config=beta[businessId];
    if(config.ownerUid!==uid)deny('Only the invited workspace owner can manage this private beta.');
    if(config.kind==='internal') {
      const user=await db.doc('users/'+uid).get();
      if(project==='scaled-circle') {
        // Production's existing Admin is the authenticated controller of the
        // internal Growth bridge. Do not copy its staging registry or mailbox.
        if(businessId!==uid)deny('Use the maintained internal ScaledCircle workspace.');
        const identity=await auth.getUser(uid);
        try{internalBridge.authorizeProductionActor({expectedUid:internalAdminUid,uid,
          tokenVerified:identity.emailVerified,user:user.data(),identity});}
        catch(_){deny('Use the maintained internal ScaledCircle workspace.');}
      }else {
        const registry=await db.doc('internalGrowthWorkspaces/'+businessId).get();
        if((project!=='scaledcircle-staging'&&!project?.startsWith('demo-'))||user.data()?.role!=='admin'||user.data()?.active!==true||
          registry.data()?.kind!=='internal_admin_dogfood'||registry.data()?.namespace!==businessId||registry.data()?.ownerUid!==uid)
          deny('Use the maintained internal ScaledCircle workspace.');
      }
    } else {
      const a=await ws.authority({uid,businessId,permission:operation==='load'||operation==='reconcile'?'communicationsRead':'communicationsSend'});
      if(!a.isOwner)deny('The invited Business owner must approve mailbox actions.');
      if(!entitlements.hasActivePaidBusinessEntitlement(a.entitlement))deny('An active paid Business plan is required for Business Email.');
    }
    // The existing internal Admin namespace has no customer Business identity.
    // Normal customer workspaces retain their maintained legal-consent gate.
    if(config.kind!=='internal')await consent.requireCurrent({uid,agreementTypes:['terms','privacy']});
    if(operation!=='load'&&operation!=='disconnect'&&!configured) {
      const e=Error('Business Email setup is pending. Existing account emails continue normally.');e.code='failed-precondition';throw e;
    }
    return {businessId,actorUid:uid,actorEmail:who.email,beta:{...config,configured,sendEnabled:config.sendEnabled===true,
      certificationSendEnabled:(project==='scaledcircle-staging'||project?.startsWith('demo-'))&&config.certificationSendEnabled===true&&config.certificationOnly!==false},preferenceEnabled:preferences.enabled};
  };
}
module.exports={createAuthority};

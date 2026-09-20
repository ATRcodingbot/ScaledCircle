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
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(businessId))deny('Choose a valid Business workspace.');
    const config={...beta[businessId]};
    const invitation=config.onboardingInvitation;
    const invitationValid=!invitation||(invitation.provider==='google'&&invitation.actorUid===uid&&
      invitation.businessId===businessId&&invitation.mailbox===config.mailbox&&
      who.email===config.mailbox&&Number.isSafeInteger(invitation.expiresAt)&&invitation.expiresAt>Date.now()&&
      !!invitation.purpose&&!!invitation.grantedAt&&!!invitation.grantedBy);
    const invited=!!config.mailbox&&config.ownerUid===businessId&&invitationValid;
    const readOnly=['load','loadCampaigns','loadAssistance'].includes(operation);
    const connectionAction=['connect','connectOther','callback','disconnect','checkConnection','preferences'].includes(operation);
    if(config.kind==='internal') {
      config.canManageConnection=true;
      if(config.ownerUid!==uid)deny('Use the maintained internal ScaledCircle workspace.');
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
      const a=await ws.authority({uid,businessId,permission:readOnly||operation==='reconcile'?'communicationsRead':'communicationsSend'});
      config.canManageConnection=a.isOwner;
      if(connectionAction&&!a.isOwner)deny('The Business owner must manage the mailbox connection.');
      const managed=entitlements.hasActiveManagedGrowthEntitlement(a.entitlement);
      const historicalManaged=['managed_growth'].includes(a.entitlement.planId||a.entitlement.plan)&&a.isOwner&&readOnly;
      // Preserve existing invited lower-plan access; do not expand their packaging.
      if(!managed&&!historicalManaged&&!(invited&&entitlements.hasActivePaidBusinessEntitlement(a.entitlement)))deny('Business Email is included with an active Managed Growth membership.');
      if(managed||historicalManaged){config.includedWithManagedGrowth=true;config.campaignReadEnabled=true;}
      config.readOnly=!entitlements.hasActivePaidBusinessEntitlement(a.entitlement);
      config.connectionAllowed=invited&&!config.readOnly;
      if(!invited||config.readOnly){config.sendEnabled=false;config.campaignSendEnabled=false;config.certificationSendEnabled=false;}
      if(['connect','connectOther','callback'].includes(operation)&&!config.connectionAllowed)deny('Google mailbox connection is temporarily limited while verification is pending. Your included Email workspace remains available.');
      if(!managed&&!historicalManaged && /Campaign/.test(operation) && operation!=='restrictCampaignContact')deny('Managed Growth includes Email Campaigns.');
      if(!managed&&!historicalManaged){config.campaignReadEnabled=false;config.campaignSendEnabled=false;}
    }
    // The existing internal Admin namespace has no customer Business identity.
    // Normal customer workspaces retain their maintained legal-consent gate.
    if(config.kind!=='internal')await consent.requireCurrent({uid,agreementTypes:['terms','privacy']});
    if(['manageAssistance'].includes(operation)&&!config.canManageConnection)deny('The Business owner must manage email assistance.');
    if(operation!=='load'&&operation!=='loadAssistance'&&operation!=='disconnect'&&!configured) {
      const e=Error('Business Email setup is pending. Existing account emails continue normally.');e.code='failed-precondition';throw e;
    }
    return {businessId,actorUid:uid,actorEmail:who.email,beta:{...config,configured,sendEnabled:config.sendEnabled===true,
      certificationSendEnabled:((project==='scaledcircle-staging'||project?.startsWith('demo-'))&&config.certificationSendEnabled===true&&config.certificationOnly!==false)||
        (project==='scaled-circle'&&require('./certification').productionPermit(config))},preferenceEnabled:preferences.enabled};
  };
}
module.exports={createAuthority};

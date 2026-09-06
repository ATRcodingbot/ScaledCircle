"use strict";
const crypto = require('node:crypto');
const VERSION = 'StagingScalerApprovalV1';
const AGREEMENTS = {terms:'terms-2026-08-v1',privacy:'privacy-2026-08-v1',scaler_work:'scaler-work-2026-08-v1'};
function fail(code) { throw new Error(code); }
function createApprovalService({db,auth,FieldValue,projectId}) {
 return async function approve({actorUid,targetUid}) {
  if(projectId!=='scaledcircle-staging') fail('staging_only');
  if(!actorUid) fail('admin_required');
  if(typeof targetUid!=='string'||!targetUid||targetUid.length>128||targetUid.includes('/')) fail('invalid_target');
  const actor=await auth.getUser(actorUid).catch(()=>fail('admin_required'));
  if(actor.disabled||actor.emailVerified!==true) fail('admin_required');
  const target=await auth.getUser(targetUid).catch(()=>fail('target_missing'));
  if(target.disabled) fail('target_disabled');
  if(target.emailVerified!==true) fail('email_unverified');
  const auditId='staging_scaler_approval_'+crypto.createHash('sha256').update(VERSION+':'+targetUid).digest('hex');
  const profileRef=db.doc('users/'+targetUid),actorRef=db.doc('users/'+actorUid);
  const prefsRef=db.doc('discoveryPreferences/'+targetUid),auditRef=db.doc('adminAuditEvents/'+auditId);
  return db.runTransaction(async tx=>{
   const refs=[actorRef,profileRef,prefsRef,auditRef,...Object.entries(AGREEMENTS).map(([type,v])=>db.doc(`legalConsents/${targetUid}_${type}_${v}`))];
   const [actorDoc,profile,prefs,audit,...consents]=await Promise.all(refs.map(ref=>tx.get(ref)));
   if(actorDoc.data()?.role!=='admin') fail('admin_required');
   if(!profile.exists) fail('profile_missing');
   const before=profile.data();
   if(before.role!=='scaler') fail('scaler_required');
   if(before.active===true&&before.betaAccess==='approved') {
    if(audit.exists&&audit.data().targetUid===targetUid&&audit.data().actionVersion===VERSION) return {approved:true,replayed:true,targetUid,auditId};
    fail('already_approved');
   }
   if(before.active!==false||before.betaAccess!=='pending'||audit.exists) fail('pending_required');
   if(!prefs.exists||prefs.data().userUid!==targetUid||prefs.data().role!=='scaler'||!prefs.data().initialSetupCompletedAt?.toMillis?.()) fail('profile_incomplete');
   Object.entries(AGREEMENTS).forEach(([type,v],i)=>{
    const c=consents[i].data();if(!c||c.uid!==targetUid||c.agreementType!==type||c.agreementVersion!==v||!c.acceptedAt) fail('consent_required');
   });
   const at=FieldValue.serverTimestamp();
   tx.update(profileRef,{active:true,betaAccess:'approved',updatedAt:at});
   tx.create(auditRef,{actionVersion:VERSION,eventType:'staging_scaler_approved',environment:'staging',projectId,targetUid,actorUid,
    priorState:{active:false,betaAccess:'pending'},resultingState:{active:true,betaAccess:'approved'},createdAt:at});
   return {approved:true,replayed:false,targetUid,auditId};
  });
 };
}
module.exports={createApprovalService,VERSION,AGREEMENTS};

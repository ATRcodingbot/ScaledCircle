"use strict";
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {createApprovalService}=require('./scaler_approval');
initializeApp();
exports.createStagingDualMobileQaFixturesV1=onCall({region:'us-east1',enforceAppCheck:false,maxInstances:1},async request=>{
 if(!request.auth) throw new HttpsError('unauthenticated','Sign in as a staging administrator.');
 try {
  return await require('./fixture_creator').createFixtureService({db:getFirestore(),auth:getAuth(),FieldValue,
   projectId:process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT})({actorUid:request.auth.uid,data:request.data});
 } catch(error) {
  const reason=String(error.message);
  const known=['staging_only','admin_required','empty_request_required','account_ineligible','profile_incomplete',
   'authority_mismatch','consent_required','geometry_mismatch','fixture_conflict'];
  throw new HttpsError(reason==='staging_only'?'unavailable':reason==='admin_required'?'permission-denied':
   reason==='empty_request_required'?'invalid-argument':known.includes(reason)?'failed-precondition':'internal',
   known.includes(reason)?`Fixture creation refused: ${reason}.`:'Fixture outcome unavailable. Inspect existing records before retry.');
 }
});
exports.approveStagingScalerV1=onCall({region:'us-east1',enforceAppCheck:false,maxInstances:2},async request=>{
 if(!request.auth) throw new HttpsError('unauthenticated','Sign in as a staging administrator.');
 if(!request.data||Object.keys(request.data).some(k=>k!=='targetUid')) throw new HttpsError('invalid-argument','Only a target Scaler UID is accepted.');
 try {return await createApprovalService({db:getFirestore(),auth:getAuth(),FieldValue,projectId:process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT})({actorUid:request.auth.uid,targetUid:request.data.targetUid});}
 catch(error){
  const safe={staging_only:'This action is available only in staging.',admin_required:'Verified administrator authority is required.',invalid_target:'Provide a valid Scaler UID.',target_missing:'The target account does not exist.',target_disabled:'The target account is disabled.',email_unverified:'The target email is not verified.',profile_missing:'The target profile is missing.',scaler_required:'The target must be a Scaler.',already_approved:'The Scaler is already approved.',pending_required:'The account is not eligible for a pending-to-approved transition.',profile_incomplete:'Complete the Scaler work profile first.',consent_required:'Current signup agreements are required.'};
  const code=error.message;
  throw new HttpsError(code==='admin_required'?'permission-denied':code==='staging_only'?'unavailable':safe[code]?'failed-precondition':'internal',safe[code]||'Approval could not be completed. No approval should be assumed.');
 }
});

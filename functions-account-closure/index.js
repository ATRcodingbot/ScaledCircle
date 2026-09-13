'use strict';
// Dedicated account closure authority; no payment certification exports.
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue, Timestamp} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
initializeApp();
const closureService = () => require('./account_closure').createService({db:getFirestore(),auth:getAuth(),FieldValue,
  project:process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT,appEnv:process.env.APP_ENV});
exports.accountClosureV1 = onCall({region:'us-east1',maxInstances:2,timeoutSeconds:120},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in to your account.');
  try {
    // Verify revocation with Auth, not just the callable's cached JWT claims.
    const bearer=request.rawRequest.get('authorization')||'';
    const token=await getAuth().verifyIdToken(bearer.replace(/^Bearer /i,''),true);
    if(token.uid!==request.auth.uid)throw Error('identity_mismatch');
    const input=request.data||{};
    if(Object.keys(input).some(k=>!['action','confirmation'].includes(k)))throw new HttpsError('invalid-argument','Unexpected account data.');
    if(input.action==='get')return await closureService().preflight(token.uid);
    if(input.action==='delete')return await closureService().close(token.uid,{confirmation:input.confirmation,authTime:token.auth_time});
    throw new HttpsError('invalid-argument','Choose an account action.');
  }catch(e){
    if(e instanceof HttpsError)throw e;
    if(['permission-denied','failed-precondition','invalid-argument','unauthenticated'].includes(e.code))throw new HttpsError(e.code,e.message);
    if(String(e.code||'').startsWith('auth/'))throw new HttpsError('unauthenticated','Sign in again to continue.');
    logger.error('Account deletion needs recovery.',{actorUid:request.auth.uid,code:e.code||'internal'});
    throw new HttpsError('unavailable','Account deletion is being checked. Retry the status check; no success should be assumed.');
  }
});
exports.finishAccountClosureV1 = onDocumentCreated({document:'accountClosures/{uid}',region:'us-east1',
  maxInstances:2,timeoutSeconds:120,retry:true},async event=>{
  if(event.data?.data()?.status==='closing')await closureService().finish(event.params.uid);
});

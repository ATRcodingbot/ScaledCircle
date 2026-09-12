'use strict';
const {initializeApp,getApps}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {createAuthority}=require('./authority'),{createService}=require('./service');
const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp(),db=getFirestore(app);
exports.businessOperationsV1=onCall({region:'us-east1',maxInstances:4,timeoutSeconds:60},async request=>{
 const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
 try{return await createService({db,FieldValue,authority:createAuthority({db,auth:getAuth(app),FieldValue,Timestamp,project,agentBusinesses:process.env.BUSINESS_OPERATIONS_AGENT_ALLOWED_BUSINESSES||''})}).execute(request);}
 catch(error){if(['unauthenticated','permission-denied','failed-precondition','invalid-argument','not-found','already-exists','aborted','resource-exhausted'].includes(error.code))throw new HttpsError(error.code,error.message,error.details);
  console.warn('Business operation needs review',{code:error.code||'unknown'});throw new HttpsError('unavailable','The change was not confirmed. Refresh and check before retrying.');}
});
exports.businessScheduleRemindersV1=onSchedule({region:'us-east1',maxInstances:1,timeoutSeconds:300,schedule:'every 15 minutes',retryCount:0},async()=>{
 const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
 return require('./reminders').createReminders({db,FieldValue,authority:createAuthority({db,auth:getAuth(app),FieldValue,Timestamp,project})})();
});

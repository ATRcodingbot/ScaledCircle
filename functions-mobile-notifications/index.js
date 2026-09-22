'use strict';
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {getMessaging}=require('firebase-admin/messaging');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentCreated,onDocumentWritten}=require('firebase-functions/v2/firestore');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {createService}=require('./service');
const {validEnvironment}=require('./policy');
if(!getApps().length)initializeApp();
const options={region:'us-east1',maxInstances:2,timeoutSeconds:120,memory:'256MiB'};
function service(){const app=getApps().find(app=>app.name==='[DEFAULT]')||initializeApp();const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT,environment=process.env.APP_ENV;if(!validEnvironment(project,environment))throw new HttpsError('failed-precondition','Notifications are unavailable in this environment.');return createService({db:getFirestore(app),auth:getAuth(app),messaging:getMessaging(app),FieldValue,Timestamp,project,environment});}
exports.mobileNotificationsV1=onCall(options,async request=>{try{const s=service(),{action,input={}}=request.data||{},uid=request.auth?.uid;if(action==='unregister')return await s.unregister(input);await s.actor(uid);if(action==='settings')return await s.settings(uid);if(action==='configure')return await s.configure(uid,input);if(action==='register')return await s.register(uid,input);if(action==='open')return await s.open(uid,input.notificationId);if(action==='check')return await s.check(uid,input);throw new HttpsError('invalid-argument','Choose a notification action.');}catch(e){if(e instanceof HttpsError)throw e;require('firebase-functions/logger').error('notification_action_failure',{code:e.code||null,errorType:e.name||null,frames:String(e.stack||'').split('\n').slice(1,5)});throw new HttpsError(['unauthenticated','permission-denied','invalid-argument','failed-precondition','resource-exhausted'].includes(e.code)?e.code:'unavailable','Notification request could not be completed. Please try again.');}});
exports.queueMobileNotificationV1=onDocumentCreated({...options,document:'notifications/{notificationId}',retry:true},async event=>{await service().enqueue(event.params.notificationId);});
exports.deliverMobileNotificationsV1=onSchedule({...options,maxInstances:1,concurrency:1,schedule:'every 1 minutes',retryCount:0},async()=>service().drain());
function signalEvent(kind,event,key){service();return require('./signals').record({db:getFirestore(),FieldValue,kind,key,before:event.data.before.data(),after:event.data.after.data()});}
exports.notifyBusinessEmailReplyV1=onDocumentCreated({...options,document:'businessMailboxes/{businessId}/replies/{replyId}',retry:true},async e=>{service();return require('./signals').recordEmailReply({db:getFirestore(),FieldValue,businessId:e.params.businessId,replyId:e.params.replyId,reply:e.data.data()});});
exports.notifySocialReviewV1=onDocumentWritten({...options,document:'socialContentQualityAssessments/{assessmentId}',retry:true},e=>signalEvent('social',e,e.params.assessmentId));
exports.notifyManagedSocialAttentionV1=onDocumentWritten({...options,document:'socialManagedCycles/{businessId}/posts/{postId}',retry:true},e=>{service();return require('./signals').recordManagedException({db:getFirestore(),FieldValue,businessId:e.params.businessId,after:e.data.after.data()});});
exports.notifySocialPublishedV1=onDocumentWritten({...options,document:'socialGrowthJobs/{jobId}',retry:true},e=>signalEvent('published',e,e.params.jobId));
exports.notifyEmailCampaignReviewV1=onDocumentWritten({...options,document:'businessMailboxes/{businessId}/campaigns/{campaignId}',retry:true},e=>signalEvent('email_draft',e,`${e.params.businessId}/${e.params.campaignId}`));
exports.notifyScalerPayoutStateV1=onDocumentWritten({...options,document:'financialOperations/{operationId}',retry:true},e=>signalEvent('payout',e,e.params.operationId));
exports.notifyBillingAttentionV1=onDocumentWritten({...options,document:'businessSubscriptions/{businessId}',retry:true},e=>signalEvent('billing',e,e.params.businessId));

"use strict";
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
const {createPublisher}=require('./social_instagram_story_publisher');
const {resolveMetaPageExecutionCredential}=require('../functions-social-operations/social_meta_page_credential');
const {decryptJson}=require('../functions-social-operations/social_oauth');
if(!admin.apps.length)admin.initializeApp();
const key=defineSecret('SOCIAL_OAUTH_TOKEN_ENCRYPTION_KEY');
function runtime(){
  if(process.env.GCLOUD_PROJECT!=='scaled-circle')throw Error('story_project_denied');
  const db=admin.firestore(),config={planId:process.env.STORY_REVIEW_PLAN_ID,digest:process.env.STORY_PLAN_DIGEST,approvalId:process.env.STORY_APPROVAL_ID,
    approvalFingerprint:process.env.STORY_APPROVAL_FINGERPRINT,owner:process.env.STORY_OWNER,accountId:process.env.STORY_INSTAGRAM_ID,
    pageId:process.env.STORY_PAGE_ID,handle:process.env.STORY_HANDLE,enabled:process.env.STORY_EXECUTION_CREATES==='true'};
  if(!/^story_plan_[a-f0-9]{64}$/.test(config.planId||'')||!/^story_approval_[a-f0-9]{64}$/.test(config.approvalId||'')||
    !/^[a-f0-9]{64}$/.test(config.approvalFingerprint||'')||!config.owner||!/^\d+$/.test(config.accountId||'')||!/^\d+$/.test(config.pageId||''))throw Error('story_config_denied');
  const credentials=expected=>resolveMetaPageExecutionCredential({db,businessUid:config.owner,expected,decryptJson,encryptionKey:()=>key.value()});
  return {db,config,credentials,publisher:createPublisher({db,config,credentials})};
}
exports.runInstagramStoryPublisherV1=onSchedule({region:'us-east1',schedule:'every 5 minutes',timeZone:'UTC',maxInstances:1,memory:'256MiB',timeoutSeconds:120,secrets:[key]},async()=>{
  try{console.info('story_execution',JSON.stringify(await runtime().publisher.tick()));}catch{console.error('story_execution_failed_closed');}
});
// IAM-private, GET-only inspection. No claim, sender, or provider POST path.
exports.inspectInstagramStoryPublisherV1=onRequest({region:'us-east1',invoker:'private',maxInstances:1,memory:'256MiB',timeoutSeconds:120,secrets:[key]},async(req,res)=>{
  if(req.method!=='GET')return res.status(405).json({error:'read_only'});
  try{const r=runtime(),state=await r.publisher.inspect();const expected=(await r.db.doc(`socialConnections/${r.config.owner}/providers/instagram`).get()).data();const session=await r.credentials(expected);
    return res.json({...state,pageToken:{tokenType:session.tokenType,pageId:session.pageId,accountId:session.accountId,connectionRevision:session.connectionRevision,credentialRotationGeneration:session.credentialRotationGeneration},sourceCommit:process.env.STORY_EXECUTION_SOURCE_COMMIT});
  }catch{return res.status(409).json({error:'story_inspection_failed_closed'});}
});

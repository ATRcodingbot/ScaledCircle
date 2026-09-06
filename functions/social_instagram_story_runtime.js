"use strict";
// Isolated review deployment: intentionally no provider transport or secrets.
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onRequest}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
const {inspect}=require('./social_instagram_story_review');
if(!admin.apps.length)admin.initializeApp();
async function rehearsal(){
 if(process.env.GCLOUD_PROJECT!=='scaled-circle'||process.env.STORY_PROVIDER_CREATES!=='false'||!/^story_plan_[a-f0-9]{64}$/.test(process.env.STORY_REVIEW_PLAN_ID||''))throw Error('story_review_environment_denied');
 return {...await inspect(admin.firestore(),process.env.STORY_REVIEW_PLAN_ID),sourceCommit:process.env.STORY_SOURCE_COMMIT||null};
}
exports.runInstagramStoryReviewV1=onSchedule({region:'us-east1',schedule:'every 5 minutes',timeZone:'UTC',maxInstances:1,memory:'256MiB',timeoutSeconds:60},async()=>{const result=await rehearsal();console.info('story_review_held',JSON.stringify(result));});
exports.inspectInstagramStoryReviewV1=onRequest({region:'us-east1',invoker:'private',maxInstances:1,memory:'256MiB',timeoutSeconds:60},async(req,res)=>{if(req.method!=='GET')return res.status(405).json({error:'read_only'});try{return res.json(await rehearsal());}catch{return res.status(409).json({error:'story_review_failed_closed'});}});

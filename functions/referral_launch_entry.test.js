'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
for(const [project,key,count] of [['scaled-circle','STRIPE_LIVE_SECRET_KEY',8],['scaledcircle-staging','STRIPE_TEST_SECRET_KEY',5]]){
 test('Firebase discovery declares exact '+project+' credentials before APP_ENV is loaded',()=>{
  const env={...process.env,GCLOUD_PROJECT:project,FIREBASE_CONFIG:JSON.stringify({projectId:project})};delete env.APP_ENV;
  const out=cp.execFileSync(process.execPath,['-e',"const e=require('./referral_launch_entry');console.log(JSON.stringify(e.adminReviewReferralRewardV1.__endpoint.secretEnvironmentVariables.map(s=>s.key)));"],{cwd:__dirname,env,encoding:'utf8'});
  const keys=JSON.parse(out.trim());assert.equal(keys.length,count);assert(keys.includes(key));
  assert(!keys.includes(key==='STRIPE_LIVE_SECRET_KEY'?'STRIPE_TEST_SECRET_KEY':'STRIPE_LIVE_SECRET_KEY'));
 });
}

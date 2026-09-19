'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {load}=require('./admin_launch_runtime');
test('runtime metadata is read-only and allowlisted; paid work follows funding authority',async()=>{
 const methods=[];const out=await load({project:'scaled-circle',credential:{getAccessToken:async()=>({access_token:'PRIVATE'})},fetchImpl:async(url,options)=>{methods.push(options.method||'GET');return {ok:true,json:async()=>url.includes('cloudfunctions')?{functions:[{name:'x/createCampaignFundingCheckoutSession',state:'ACTIVE',serviceConfig:{revision:'r1',environmentVariables:{LIVE_PAID_WORK_ACTIVATION_ENABLED:'false',SECRET:'NEVER'}},secretEnvironmentVariables:['NEVER']}]}:url.includes('firebasehosting')?{releases:[{version:{name:'hosting1'}}]}:url.includes('firebaserules')?{rulesetName:'rules1'}:{jobs:[{name:'x/socialWorker',state:'ENABLED',scheduleTime:'next',httpTarget:{headers:{Authorization:'NEVER'}}}]}};}});
 assert.equal(out.paidWork,'held');assert.equal(out.functions[0].revision,'r1');assert.doesNotMatch(JSON.stringify(out),/PRIVATE|NEVER|Authorization|environmentVariables/);assert(methods.every(m=>m==='GET'));
});
test('control-plane denial and incomplete pagination never certify healthy inventory',async()=>{
 const out=await load({project:'scaled-circle',credential:{getAccessToken:async()=>({access_token:'x'})},fetchImpl:async()=>({ok:false})});assert.equal(out.functions,null);assert.equal(out.paidWork,'unavailable');assert.equal(out.status,'partial');
});

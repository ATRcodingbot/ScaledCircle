'use strict';
// Bounded, read-only control-plane metadata. Credentials and environment maps
// remain private. A denied read is unknown, never a healthy synthetic result.
async function load({project,credential,fetchImpl=fetch,now=Date.now()}) {
 if(project!=='scaled-circle')return {checkedAt:now,status:'unavailable'};
 let token;try{token=(await credential.getAccessToken()).access_token;}catch{return {checkedAt:now,status:'unavailable'};}
 async function read(url){try{const r=await fetchImpl(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});return r.ok?await r.json():null;}catch{return null;}}
 const [functions,hosting,rules,scheduler]=await Promise.all([
  read('https://cloudfunctions.googleapis.com/v2/projects/scaled-circle/locations/us-east1/functions?pageSize=1000'),
  read('https://firebasehosting.googleapis.com/v1beta1/sites/scaled-circle/releases?pageSize=1'),
  read('https://firebaserules.googleapis.com/v1/projects/scaled-circle/releases/cloud.firestore'),
  read('https://cloudscheduler.googleapis.com/v1/projects/scaled-circle/locations/us-east1/jobs?pageSize=500'),
 ]);
 const all=functions&&!functions.nextPageToken?functions.functions:null;
 const funding=all?.find(f=>f.name.endsWith('/createCampaignFundingCheckoutSession'));
 return {checkedAt:now,status:all&&hosting&&rules?'available':'partial',
  hostingSource:(hosting?.releases?.[0]?.message||'').match(/[a-f0-9]{40}/)?.[0]||null,hostingVersion:hosting?.releases?.[0]?.version?.name||null,hostingReleasedAt:hosting?.releases?.[0]?.releaseTime||null,
  rulesVersion:rules?.rulesetName||null,
  functions:all?.map(f=>({name:f.name.split('/').pop(),state:f.state,revision:f.serviceConfig?.revision||null}))||null,
  paidWork:funding?(funding.serviceConfig?.environmentVariables?.LIVE_PAID_WORK_ACTIVATION_ENABLED==='true'?'enabled':'held'):'unavailable',
  workers:scheduler&&!scheduler.nextPageToken?(scheduler.jobs||[]).filter(j=>/social|research|growth/i.test(j.name)).map(j=>({name:j.name.split('/').pop(),state:j.state,lastAttemptTime:j.lastAttemptTime||null,nextRunAt:j.scheduleTime||null,schedule:j.schedule,timeZone:j.timeZone})):null};
}
module.exports={load};

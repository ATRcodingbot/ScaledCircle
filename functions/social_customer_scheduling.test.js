'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readiness,authorizeRuntime}=require('../functions-social-operations/social_customer_scheduling');
const {recommend}=require('../functions-social-operations/social_customer_cadence');
const scopes=require('../functions-social-operations/social_oauth').META_PUBLISH_SCOPES;
test('owned connection path supplies legacy identity but never overrides a conflicting tenant',()=>{
 const {connectionFromOwnedPath}=require('../functions-social-operations/social_customer_scheduling');
 assert.deepEqual(connectionFromOwnedPath({providerUserId:'123'},'owner'),{providerUserId:'123',businessUid:'owner'});
 assert.throws(()=>connectionFromOwnedPath({businessUid:'other'},'owner'),/tenant_mismatch/);
 assert.equal(connectionFromOwnedPath(undefined,'owner'),undefined);
});
function fixture(){return {uid:'owner',provider:'facebook',environment:'production',now:1900000000000,
 plan:{businessUid:'owner',status:'approved',planVersion:1,approvedVersion:1},
 item:{businessUid:'owner',planId:'plan',currentVersion:1},
 version:{businessUid:'owner',planId:'plan',version:1,contentHash:'a'.repeat(64),scheduledFor:new Date(1900000600000).toISOString(),
  variants:[{provider:'facebook',format:'text',copy:'Exact reviewed text',mediaRequirement:'none'}]},
 connection:{businessUid:'owner',environment:'production',status:'connected_write',tokenHealth:'healthy',credentialId:'credential',
  providerUserId:'123',linkedPageId:'123',connectionRevision:1,credentialRotationGeneration:1,grantedScopes:scopes,capabilities:{publishText:true}},
 quality:{businessUid:'owner',immutableSourceHash:'a'.repeat(64),readyToPublish:true},health:{killSwitchActive:false},
 config:{provider:'meta',environment:'production',enabled:true,writeScopesEnabled:true},schedulerEnabled:true,
 entitlement:{plan:'managed_growth',status:'active',expiresAt:new Date(2000000000000)}};}
test('complete future post passes; each missing prerequisite blocks without authority',()=>{
 assert.equal(readiness(fixture()).ready,true);
 const optional=fixture();optional.connection.grantedScopes=[...optional.connection.grantedScopes,'public_profile'];assert.equal(readiness(optional).ready,true);
 optional.connection.grantedScopes=['pages_read_engagement','pages_manage_posts','public_profile'];assert.equal(readiness(optional).ready,true);
 for(const [key,change] of [
  ['plan',f=>f.plan.approvedVersion=0],['creative',f=>f.version.variants[0].mediaRequirement='Image required'],
  ['permission',f=>f.connection.businessUid='other'],['permission',f=>f.connection.environment='staging'],
  ['permission',f=>f.connection.grantedScopes=[]],['time',f=>f.version.scheduledFor=new Date(f.now).toISOString()],
  ['quality',f=>f.quality.immutableSourceHash='old'],['scheduler',f=>f.schedulerEnabled=false],
  ['scheduler',f=>f.entitlement.status='expired'],['paused',f=>f.health.killSwitchActive=true],['existing',f=>f.conflictingSchedule=true],
  ['permission',f=>delete f.connection.credentialRotationGeneration],
  ['content',f=>f.version.variants[0].destinationUrl='javascript:alert(1)']]) {
   const f=fixture();change(f);const result=readiness(f);assert.equal(result.ready,false,key);assert.ok(result.reasons.some(r=>r.code===key),key);
 }
});
test('customer runtime cannot borrow another account or internal allowance',()=>{
 const f=fixture(),approval={schemaVersion:'CustomerPostApprovalV1',businessUid:'owner',approvedByUid:'owner',providers:['facebook'],externalPublishingEnabled:true,
  providerAccounts:{facebook:{...f.connection}}};
 const args={...f,approval,enabledUids:['owner']};
 assert.doesNotThrow(()=>authorizeRuntime(args));
 assert.throws(()=>authorizeRuntime({...args,enabledUids:[]}));
 assert.throws(()=>authorizeRuntime({...args,connection:{...f.connection,credentialRotationGeneration:2}}));
 assert.throws(()=>authorizeRuntime({...args,approval:{...approval,approvedByUid:'other'}}));
});
test('cadence has no invented result, range or automatic publishing authority',()=>{
 for(const provider of ['facebook','instagram']) {
  const r=recommend({uid:'owner',provider});assert.equal(r.decision,'HOLD');assert.equal(r.confidence,'LOW');
  assert.equal(r.approvedRange,null);assert.equal(r.automaticAdjustmentEnabled,false);assert.equal(r.ownerApprovalRequired,true);
 }
});
test('cadence ignores account baselines, wrong tenant and unequal-age observations',()=>{
 const r=recommend({uid:'owner',provider:'facebook',observations:[{businessUid:'owner',provider:'facebook',scope:'account'},
 {businessUid:'other',provider:'facebook',scope:'post'}]});assert.equal(r.recentSample,0);
});
test('one scheduled platform variant removes one draft, with strategy history intact',()=>{
 const plan={id:'plan',businessUid:'owner',status:'approved',planVersion:1,approvedVersion:1,
  strategy:{version:'CustomerSocialDraftStrategyV1'},items:[{itemKey:'one',variants:[{provider:'facebook'},{provider:'instagram'}]}]};
 const before=structuredClone(plan);
 const hydrated=require('../functions-social-operations/social_customer_post_projection').overlay([plan],[{
  businessUid:'owner',customerApproval:true,provider:'facebook',versionId:'plan_one_v1',status:'scheduled',scheduledFor:'2030-01-01',
 }]);
 const state=require('../functions-social-operations/social_plan_state').project(hydrated);
 assert.equal(state.draftPosts,1);assert.equal(state.planApprovalState,'approved');assert.deepEqual(plan,before);
});
test('cadence compares real equal-age platform results and never silently grants a range',()=>{
 const now=Date.parse('2030-06-01'),rows=[];
 for(let n=0;n<16;n++)rows.push({businessUid:'owner',provider:'facebook',source:'meta_graph_read_only',scope:'post',hoursAfterPublication:168,
  publicationJobId:'job'+n,observedAt:new Date(now-(n<8?7:35)*86400000).toISOString(),qualityReady:true,fatigueObserved:false,
  metrics:[{name:'reach',value:100,status:'OBSERVED',period:'lifetime'},
   {name:'total_interactions',value:n<8?20:10,status:'OBSERVED',period:'lifetime'},
   {name:'link_clicks',value:2,status:'OBSERVED',period:'lifetime'}]});
 const r=recommend({uid:'owner',provider:'facebook',observations:rows,now});assert.equal(r.decision,'INCREASE');assert.equal(r.ownerApprovalRequired,true);assert.equal(r.approvedRange,null);
 assert.equal(recommend({uid:'owner',provider:'instagram',observations:rows,now}).decision,'HOLD');
 rows[0].fatigueObserved=true;assert.equal(recommend({uid:'owner',provider:'facebook',observations:rows,now}).decision,'HOLD');
 for(let n=0;n<8;n++){rows[n].metrics[1].value=5;rows[n].fatigueObserved=true;}
 assert.equal(recommend({uid:'owner',provider:'facebook',observations:rows,now}).decision,'REDUCE');
});
module.exports={fixture};

'use strict';
const test=require('node:test'),a=require('node:assert/strict'),p=require('../functions-social-operations/social_lifecycle_presentation');
const plan={id:'plan',businessUid:'owner',goal:'INITIAL_EXPERIMENT: learn',items:[{itemKey:'one',variants:[{provider:'facebook',status:'draft',scheduling:{jobId:'job',version:1,automaticMode:true}}]}]};
const job={id:'job',businessUid:'owner',provider:'facebook',versionId:'plan_one_v1',status:'scheduled',scheduledFor:'2030-07-01T14:00:00Z',binding:{variants:[{provider:'facebook',copy:'Exact approved copy'}]}};
test('one execution feed counts legacy and managed jobs, deduplicates records and overrides stale plans',()=>{
 const r=p.project({uid:'owner',plans:[plan],jobs:[job,job,{...job,id:'history',versionId:'old_one_v1',status:'published',providerPostId:'provider-id'}]});
 a.equal(r.posts.length,2);a.deepEqual(r.counters,{scheduled:1,publishing:0,published:1,needsAttention:0});a.equal(r.posts[0].reviewedPost.variant.copy,'Exact approved copy');a.equal(r.posts[1].historyOnly,true);a.equal(r.posts[0].strategyTitle,'Social strategy');
});
test('publication receipt wins over stale status; publishing and real exceptions are exclusive',()=>{
 a.equal(p.state({...job,providerPostId:'real'}),'published');
 const r=p.project({jobs:[{...job,status:'publishing'},{...job,id:'b',status:'reconciliation_required'}]});a.deepEqual(r.counters,{scheduled:0,publishing:1,published:0,needsAttention:1});
});
test('autonomous preparing is not attention; canceled history remains separate; tenant isolated',()=>{
 const r=p.project({uid:'owner',plans:[plan],jobs:[{...job,businessUid:'other'},{...job,id:'c',status:'canceled'}]});a.equal(r.counters.needsAttention,0);a.equal(r.counters.scheduled,0);a.equal(r.posts.length,2);
});
test('timezone is server-rendered with daylight saving and never inferred from device',()=>{
 a.match(p.timeLabel(job.scheduledFor,'America/New_York'),/10:00 AM EDT/);a.match(p.timeLabel('2030-01-01T14:00:00Z','America/New_York'),/9:00 AM EST/);a.equal(p.zone({timeZone:'bad'}),'UTC');
});
test('asset ownership does not assert photography; internal labels are not shown',()=>{
 a.equal(p.creativeLabel({origin:'business_owned'}),'Business asset');a.equal(p.creativeLabel({origin:'generated_service_concept'}),'Generated graphic');a.equal(p.creativeLabel({format:'branded_graphic'}),'Branded graphic');a.equal(p.creativeLabel({format:'real_business_photo'}),'Real business photo');a.equal(p.creativeLabel({mediaRequirement:'none'}),'Text-only recommendation');a.equal(p.text('INITIAL_EXPERIMENT: goal'),'Social strategy');
});

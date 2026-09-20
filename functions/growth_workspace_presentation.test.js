'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {present,zone}=require('../functions-agentic-growth/workspace_presentation');
test('owned workspace timezone formats evidence without rewriting instants',()=>{
 const at=Date.parse('2026-09-20T13:00:00Z'),data={researchSchedule:{lastCompletedAt:at},runs:[{createdAt:at}]},before=JSON.stringify(data);
 const result=present(data,{profile:{businessHours:{timeZone:'America/New_York'}}});
 assert.equal(result.workspaceTimeZone,'America/New_York');assert.match(result.timeLabels[new Date(at).toISOString()],/9:00 AM EDT/);assert.equal(JSON.stringify(data),before);
});
test('workspace setting precedes profile; absent or invalid zone is explicit UTC fallback',()=>{
 assert.equal(zone({timeZone:'America/New_York'},{timeZone:'America/Chicago'}),'America/Chicago');
 const at=Date.parse('2026-09-20T13:00:00Z'),view=present({completedAt:at},{profile:{timeZone:'wrong/zone'}});
 assert.equal(view.workspaceTimeZone,null);assert.match(view.timeLabels[new Date(at).toISOString()],/UTC fallback/);
});

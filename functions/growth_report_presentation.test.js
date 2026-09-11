'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {renderGrowthReport}=require('../functions-agentic-growth/growth_report_presentation');
const report={businessName:'Example Business',summary:{awaitingApproval:4,businessesFound:3,partnersFound:2,individualScalersFound:0,learned:'Outcomes are not measured yet.',next:'Review the sourced opportunities.'}};
const prospects=Array.from({length:12},(_,i)=>({id:'record '+i,displayName:'Prospect '+i,reason:'Potential fit; interest unknown.',email:'private@example.test',draft:'Do not include full outreach drafts.'}));
test('daily brief is bounded and links to exact report and opportunities',()=>{
 const result=renderGrowthReport({report,reportId:'report / one',prospects,kind:'daily',customer:true});
 assert.match(result.text,/\?report=report%20%2F%20one/);assert.match(result.text,/\?prospect=record%200/);
 assert.equal((result.text.match(/\?prospect=/g)||[]).length,3);assert.doesNotMatch(result.text,/private@example|full outreach drafts/);
 assert.match(result.text,/No verified individual candidates/);assert.match(result.text,/Nothing in this report approves/);
});
test('important alert is brief; weekly includes measured learning without inventing outcomes',()=>{
 const alert=renderGrowthReport({report,reportId:'one',prospects,kind:'important',customer:true});
 assert.doesNotMatch(alert.text,/Selected findings|What we learned/);assert.ok(alert.text.length<1000);
 const weekly=renderGrowthReport({report,reportId:'one',prospects,kind:'weekly',customer:true});
 assert.match(weekly.text,/What we learned\nOutcomes are not measured yet/);assert.equal((weekly.text.match(/\?prospect=/g)||[]).length,5);
});
test('internal report remains staging-bound and presentation does not mutate input',()=>{
 const before=JSON.stringify({report,prospects});const result=renderGrowthReport({report,reportId:'one',prospects,kind:'daily'});
 assert.match(result.text,/https:\/\/scaledcircle-staging.web.app\/#\/growth-agents\?report=one/);
 assert.equal(JSON.stringify({report,prospects}),before);
});

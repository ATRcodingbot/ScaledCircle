const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const learning=require('../functions-business-email/growth_learning');
const now=20*86400000;
const op=(id,more={})=>({id,businessId:'one',state:'sent',version:2,subject:'Final owner edit',body:'Current copy',requestedAt:now-8*86400000,providerThreadId:'t-'+id,crmCustomerId:'c-'+id,...more});
const event=(operationId,outcome,recordedAt=1)=>({businessId:'one',operationId,outcome,recordedAt,evidenceType:'owner_reported'});
const reply=(id,operationId,classification)=>({businessId:'one',providerMessageId:id,operationId,classification});
test('distinct prospects and exact final operations deduplicate replies/followups and exclude controlled/cross-workspace records',()=>{
 const operations=[op('a'),op('b',{crmCustomerId:'c-a',followupTo:'a'}),op('test',{body:'Founder-controlled test of Email'}),op('foreign',{businessId:'two'})];
 const r=learning.project({businessId:'one',operations,outcomes:[event('a','appointment'),event('test','won')],replies:[reply('r','a','substantive'),reply('r','a','substantive'),reply('x','test','substantive')],now}).evidence;
 assert.equal(r.providerAcceptedMessages,2);assert.equal(r.distinctProspects,1);assert.equal(r.humanReplyConversations,1);assert.equal(r.appointments,1);assert.equal(r.ownerReportedWins,0);assert.equal(r.confirmedDeliveredMessages,0);assert.equal(r.adaptiveExecution,false);
});
test('automated responses and optouts never count as qualified outcomes; owner correction replaces earlier classification',()=>{
 const r=learning.evidence({businessId:'one',operations:[op('a'),op('b'),op('c')],outcomes:[event('b','interested'),event('c','interested',1),event('c','not_interested',2)],replies:[reply('r','a','automated_reply'),reply('s','b','opt_out')],now});
 assert.equal(r.qualifiedConversations,0);assert.equal(r.automatedConversations,1);assert.equal(r.optOut,1);assert.equal(r.notInterested,1);assert.equal(r.revenueVerified,false);
});
test('immature or missing evidence holds without inventing failure, confirmed delivery, or model processing',()=>{
 const r=learning.evidence({businessId:'one',operations:[op('a',{requestedAt:now-1000}),op('b',{replyCount:1})],now});
 assert.equal(r.decision,'HOLD');assert.equal(r.matureProspects,1);assert.equal(r.noResponseYet,1);assert.equal(r.uncertainConversations,1);assert.equal(r.humanReplyConversations,0);
 assert.equal(learning.priority({industry:'x'},[{feature:'industry',value:'x',sent:6,noReplyAfterFiveDays:6,negative:0,positive:0}]),0);
});
test('Growth uses identical workspace-local evidence rules',()=>assert.equal(fs.readFileSync('functions-business-email/growth_learning.js','utf8'),fs.readFileSync('functions-agentic-growth/mailbox_growth_learning.js','utf8')));

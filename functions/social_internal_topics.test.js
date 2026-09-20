'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const planner=require('../functions-social-operations/social_internal_topics');
const social=require('../functions-social-operations/social_operations');
function fixture(){const uid='owner',now=Date.parse('2026-09-20T12:00:00Z');return {uid,now,policy:{id:'policy',businessUid:uid,planId:'plan',providers:['facebook','instagram'],services:planner.THEMES.map(s=>s.toLowerCase()),destinations:['https://scaledcircle.com/how-it-works','https://scaledcircle.com/businesses','https://scaledcircle.com/scalers'],startsAt:now,endsAt:now+30*86400000,maxPerWeek:5,reviewedScope:{businessName:'ScaledCircle',voice:'Clear'}},profile:{businessUid:uid,businessName:'ScaledCircle',brandVoice:'Clear',internalSocialContext:{source:'owner_reviewed_meta_strategy'}},plan:{businessUid:uid,strategy:{version:'InternalMetaManagedStrategyV1'}},connections:['facebook','instagram'].map(provider=>({provider,status:'connected_write',tokenHealth:'healthy'})),items:[],versions:[],jobs:[]};}
function add(f,r){f.items.push({id:r.itemId,businessUid:f.uid,planId:f.policy.planId,currentVersion:1,managedTopicId:r.topicId,managedDraft:r.item});f.versions.push({id:r.itemId+'_v1',...social.contentItemVersion({businessUid:f.uid,planId:f.policy.planId,item:r.item,now:f.now})});}
test('balances distinct semantic topics, tops up before exhaustion and never treats drafts as scheduled',()=>{
 const f=fixture(),themes=[];for(let i=0;i<6;i++){const r=planner.choose(f);assert.equal(r.status,'draft_created');themes.push(r.service);add(f,r);}
 assert.deepEqual(themes.slice(0,3),planner.THEMES);const covered=planner.choose(f);assert.equal(covered.status,'planning_buffer_covered');assert.equal(covered.coverage.platforms.facebook.plannedUnscheduled,6);assert.equal(covered.coverage.platforms.facebook.scheduledNextSevenDays,0);assert.equal(covered.coverage.platforms.facebook.scheduledShortfall,5);
 f.items[0].managedHolds={facebook:{status:'owner_canceled'},instagram:{status:'owner_canceled'}};const next=planner.choose(f);assert.equal(next.status,'draft_created');assert.notEqual(next.topicId,f.items[0].managedTopicId);assert.equal(next.coverage.platforms.facebook.ownerHeld,1);
});
test('semantic identity survives edits and new policy; finite supply and higher cadence show truthful shortfall',()=>{
 const f=fixture();f.policy.maxPerWeek=30;const used=[];for(let i=0;i<18;i++){const r=planner.choose(f);assert.equal(r.status,'draft_created');used.push(r.topicId);add(f,r);f.versions.at(-1).variants.forEach(v=>v.copy='Owner edited this copy');}
 assert.equal(new Set(used).size,18);assert.equal(planner.choose(f).status,'fresh_topics_exhausted');assert.equal(planner.choose(f).coverage.platforms.facebook.planningShortfall,13);
 f.policy.planId='renewed_plan';assert.equal(planner.choose(f).status,'fresh_topics_exhausted');
});
test('wrong workspace/context, unsupported channels/destinations and owner holds do not grant publishing authority',()=>{
 const f=fixture();assert.equal(planner.choose({...f,profile:{...f.profile,businessUid:'other'}}).status,'context_changed');assert.equal(planner.choose({...f,profile:{...f.profile,brandVoice:'Changed'}}).status,'context_changed');
 f.policy.services=['not approved'];assert.equal(planner.choose(f).status,'fresh_topics_exhausted');
 for(const topic of planner.topics){assert.equal(require('../functions-social-operations/social_public_caption').internalCopy.test(topic[3]),false);assert.doesNotMatch(topic[3],/we completed|our latest project|guaranteed (?:lead|earning)/i);}
});
module.exports={fixture};

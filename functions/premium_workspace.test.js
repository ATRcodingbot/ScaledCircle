'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const {project}=require('../functions-agentic-growth/premium_workspace');
const {futureSlot,selectAsset}=require('../functions-social-operations/social_customer_preparation');
const {sourceRights}=require('../functions-social-operations/social_customer_media');
const {legacySetupHold}=require('../functions-social-operations/social_owner_execution');
test('Social uses byte-identical maintained Team authority and shared performance projection',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const name of ['business_workspace.js','business_operation_permissions.js','legal_consent.js'])a.deepEqual(fs.readFileSync(path.join(__dirname,name)),fs.readFileSync(path.join(__dirname,'../functions-social-operations',name)));
 a.deepEqual(fs.readFileSync(path.join(__dirname,'../functions-social-operations/social_performance_presentation.js')),fs.readFileSync(path.join(__dirname,'../functions-agentic-growth/social_performance_presentation.js')));
});
test('specialist KPIs exclude certification, other tenants and organizations from people; outcomes are not inferred',()=>{
 const prospects=[{id:'lead',kind:'business',qualified:true},{id:'person',kind:'scaler',qualified:true},{id:'org',kind:'referral_partner',qualified:true},{id:'channel',opportunityType:'recruitment_channel'}];
 const operation={id:'o1',businessId:'b',prospectId:'lead',recipient:'private@example.test',state:'sent',replyCount:1};
 const r=project({businessId:'b',prospects,operations:[operation,{...operation,id:'c',certification:true},{...operation,id:'other',businessId:'other'}],outcomes:[]});
 a.equal(r.premium.leads.found,1);a.equal(r.premium.workforce.found,1);a.equal(r.premium.overall.found,4);
 a.equal(r.premium.leads.replied,1);a.equal(r.premium.leads.appointment,0);a.equal(r.premium.leads.won,0);a.equal(r.premium.leads.revenue,null);
 a.equal(r.prospects[0].lifecycleStage,'replied');a.match(r.premium.access.business_assistant,/not included/);
 const withOutcomes=project({businessId:'b',prospects,operations:[operation],outcomes:['appointment','meeting','won'].map(outcome=>({businessId:'b',operationId:'o1',outcome}))});
 a.equal(withOutcomes.premium.leads.appointment,1);a.equal(withOutcomes.premium.leads.won,1);
});
test('paid add-on labels require canonical provider-backed entitlement; comped plan cannot invent addons',()=>{
 const base={businessId:'b',prospects:[],operations:[],outcomes:[],now:1000};
 const entitlement={planId:'managed_growth',status:'active',expiresAt:new Date(2000),source:'internal_qa',addons:['business_assistant'],productEntitlements:['business_assistant']};
 a.match(project({...base,entitlement}).premium.access.business_assistant,/not included/);
 a.equal(project({...base,entitlement:{...entitlement,source:'stripe'}}).premium.access.business_assistant,'Business Assistant Add-on');
});
test('stale/missing dates move into future and offset/DST timestamps remain precise',()=>{
 const now=Date.parse('2026-09-13T20:00:00Z');
 for(const old of [null,'invalid','2026-09-11T12:00:00-04:00'])a.equal(futureSlot(old,now),'2026-09-13T21:00:00.000Z');
 a.equal(futureSlot('2026-11-01T01:30:00-04:00',now),'2026-11-01T05:30:00.000Z');
 a.equal(futureSlot('2026-11-01T01:30:00-05:00',now),'2026-11-01T06:30:00.000Z');
});
test('only the exact owner-created legacy setup state qualifies; explicit restrictions fail closed',()=>{
 const h={schemaVersion:'CustomerGrowthWorkspaceV1',workspaceKind:'customer',businessUid:'b',createdBy:'b',killSwitchActive:true,externalActionsEnabled:false,researchPaused:false};
 a.equal(legacySetupHold(h,'b'),true);
 for(const patch of [{createdBy:'admin'},{securityReason:'abuse'},{researchPaused:true},{externalActionsEnabled:true}])a.equal(legacySetupHold({...h,...patch},'b'),false);
 a.equal(legacySetupHold(h,'other'),false);
});
test('approved concepts need maintained generation, moderation and owner acknowledgement; logo/test assets never auto-selected',()=>{
 const r={origin:'generated_service_concept',createdBy:'creative-media-core',generatedContentAcknowledged:true,approvedBy:'b',moderationStatus:'passed',moderation:{status:'passed',flags:[]},generationJobId:'visual_job_abc123',truthfulnessDisclosure:'Service concept image — not completed work.'};
 a.equal(sourceRights(r,'b'),true);
 for(const p of [{approvedBy:'other'},{moderation:{status:'passed',flags:['unsafe']}},{moderation:{status:'pending',flags:[]}},{moderation:undefined},{generatedContentAcknowledged:false},{createdBy:'client'}])a.equal(sourceRights({...r,...p},'b'),false);
 const revision={...r,id:'r',businessUid:'b',status:'ready',approvalStatus:'approved',privateOriginalPath:'business_media_private/b/deck/r/original.jpg',contentHash:'a'.repeat(64),storageGeneration:'1',altText:'A deck concept'};
 const asset={id:'deck',businessUid:'b',approvedRevisionId:'r',title:'Deck concept',revisions:[revision]};
 a.equal(selectAsset({uid:'b',assets:[asset],variant:{copy:'Plan a deck project'},goal:'deck'}).asset.id,'deck');
 a.equal(selectAsset({uid:'b',assets:[{...asset,title:'Internal QA deck icon'}],variant:{copy:'deck'},goal:'deck'}),null);
});
test('performance labels compare instantaneous counts but never mismatched rolling windows',()=>{
 const {project:p}=require('../functions-social-operations/social_performance_presentation');
 const x={schemaVersion:'MetaBaselineV1',provider:'facebook',providerAccountId:'123',apiVersion:'v26',observedAt:'2026-09-10T12:00:00Z',requestedRange:{since:1,until:2},metrics:{followers:{value:10},page_media_view:{value:50,period:'day',providerEndTime:'2026-09-10'}}};
 const y={...x,observedAt:'2026-09-13T12:00:00Z',requestedRange:{since:4,until:5},metrics:{followers:{value:12},page_media_view:{value:90,period:'day',providerEndTime:'2026-09-13'}}};
 const result=p([y,x]).platforms[0];a.equal(result.metrics[0].change,2);a.equal(result.metrics[1].change,null);a.equal(result.published,0);
 a.equal(p([x]).platforms[0].metrics[0].change,null);
});

test('provider-accepted contact overrides stale early CRM; same email shares contact and cooldown',()=>{
 const now=1000000,base={businessId:'b',prospects:[{id:'p',email:'ASPEN@example.test',opportunityType:'property_management',qualified:true}],customers:[{id:'c',email:'aspen@example.test',stage:'new_lead'}],operations:[{id:'send',businessId:'b',prospectId:'other',recipient:'aspen@example.test',state:'sent',providerAcceptedAt:now,replyCount:0}],outcomes:[],now};
 const p=project(base).prospects[0];a.equal(p.lifecycleStage,'contacted');a.equal(p.awaitingReply,true);a.equal(p.freshOutreachEligible,false);a.equal(p.followupEligible,false);a.equal(p.pipelineType,'vendor');
 a.equal(project({...base,now:now+5*86400000}).prospects[0].followupEligible,true);
 const replied=project({...base,operations:[{...base.operations[0],replyCount:1}]}).prospects[0];a.equal(replied.lifecycleStage,'replied');a.equal(replied.awaitingReply,false);a.equal(replied.followupEligible,false);
 a.equal(project({...base,customers:[{...base.customers[0],stage:'won'}]}).prospects[0].lifecycleStage,'won');
 a.equal(project({...base,operations:[{...base.operations[0],businessId:'other'}]}).prospects[0].freshOutreachEligible,true);
});

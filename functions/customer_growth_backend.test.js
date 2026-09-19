'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),app=admin.initializeApp({projectId:'demo-customer-growth'},'customer-growth'),db=app.firestore();
const customer=require('../functions-agentic-growth/customer_growth'),legal=require('./legal_consent');
const FieldValue=admin.firestore.FieldValue,Timestamp=admin.firestore.Timestamp;
let service,reads;
const auth={getUser:async uid=>({uid,email:uid+'@example.test',disabled:uid==='disabled',emailVerified:uid!=='unverified'})};
const call=(operation='load',uid='owner',businessId='owner',input)=>service.execute({auth:uid?{uid}:null,data:{operation,businessId,...(input?{input}:{})}});
beforeEach(async()=>{
 for(const c of ['customerGrowthProductGrants','customerResearchSchedules','entitlementAuditEvents','users','businessWorkspaces','businessSubscriptions','legalConsents','discoveryPreferences','businessGrowthProfiles','agentProfiles','agentHealth','agentApprovals','agentProspects','agentCrmProspects','agentActions','agentRuns','agentReports','agentObservations','agentCommunicationPreferences','notifications','wallets','outboundEmailJobs'])await db.recursiveDelete(db.collection(c));
 await db.doc('users/owner').set({role:'business',active:true,name:'Example Builder'});
 await db.doc('businessSubscriptions/owner').set({planId:'managed_growth',status:'active',source:'stripe',addons:['lead_generation_research'],productEntitlements:['lead_generation_research'],expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
 await db.doc('businessGrowthProfiles/owner').set({businessUid:'owner',businessName:'Example Builder',servicesOffered:['decks','fences'],plannedAdBudget:'$0'});
 await db.doc('discoveryPreferences/owner').set({schemaVersion:'ServiceAreaPreferencesV1',userUid:'owner',role:'business',preferenceVersion:1,areas:[{id:'aa',type:'place',geographyType:'county',county:'Anne Arundel County',state:'Maryland',displayName:'Anne Arundel County',enabled:true}]});
 for(const uid of ['owner','member'])for(const type of ['terms','privacy'])await db.doc(`legalConsents/${uid}_${type}_${legal.AGREEMENTS[type]}`).set({uid,agreementType:type,agreementVersion:legal.AGREEMENTS[type]});
 reads=0;service=customer.createService({db,auth,FieldValue,Timestamp,project:'scaled-circle',readSource:async source=>{reads++;return source.signals.join(' ')+' '+(source.email||'');}});
});
after(()=>app.delete());
test('exact dogfood Lead overlay preserves comped MG and financial records; audited replay and revocation isolate authority',async()=>{
 const grants=require('../functions-agentic-growth/customer_growth_grants'),time=Date.now();
 const base={planId:'managed_growth',status:'active',source:'internal_qa',comped:true,billingStatus:'comped',expiresAt:Timestamp.fromMillis(time+7*86400000)};
 await db.doc('businessSubscriptions/owner').set(base);await db.doc('wallets/owner').set({balance:777});await db.doc('users/admin').set({role:'admin'});
 const make=allowedBusinessId=>grants.createService({db,auth,FieldValue,Timestamp,allowedBusinessId,now:()=>time});
 const input={businessUid:'owner',product:'lead_generation_research',reason:'Founder-approved exact Business dogfood',expiresAt:time+6*86400000,requestId:'grant-one',enableScheduledResearch:true};
 const actor={uid:'admin',isAdmin:true,emailVerified:true,role:'admin'},serviceGrant=make('owner');
 await assert.rejects(make(undefined).grant(input,actor),/configured/);
 await assert.rejects(serviceGrant.grant({...input,businessUid:'other'},actor),/configured/);
 await assert.rejects(serviceGrant.grant({...input,product:'business_assistant'},actor),/configured/);
 await assert.rejects(serviceGrant.grant(input,{uid:'owner'}),/admin/);
 const results=await Promise.all([serviceGrant.grant(input,actor),serviceGrant.grant(input,actor)]);
 assert.equal(results.filter(r=>r.idempotentReplay).length,1);assert.equal((await db.collection('entitlementAuditEvents').get()).size,1);
 await assert.rejects(serviceGrant.grant({...input,reason:'Changed'},actor),/different/);
 assert.deepEqual((await db.doc('businessSubscriptions/owner').get()).data(),base);
 assert.deepEqual((await db.doc('wallets/owner').get()).data(),{balance:777});
 const record=(await db.doc('customerGrowthProductGrants/owner').get()).data();
 assert.equal(grants.active(record,'owner','owner',base,time),true);
 assert.equal(grants.active(record,'other','owner',base,time),false);
 assert.equal(grants.active(record,'owner','owner',base,time+8*86400000),false);
 assert.equal(require('./subscription_entitlements').hasActiveProductEntitlement(base,'lead_generation_research'),false);
 service=customer.createService({db,auth,FieldValue,Timestamp,project:'scaled-circle',dogfoodBusinessUid:'owner',now:()=>time,readSource:async source=>{reads++;return source.signals.join(' ');}});
 await call('initialize');assert.equal((await call()).leadAccess.source,'internal_dogfood');await call('research');assert.ok(reads>0);
 const before=reads;await serviceGrant.revoke({businessUid:'owner',product:input.product,reason:'Dogfood complete'},actor);
 await assert.rejects(call('research'),/Lead Generation/);assert.equal(reads,before);
 assert.equal((await service.runScheduledResearch()).results[0].status,'held');assert.equal(reads,before);
 assert.deepEqual((await db.doc('businessSubscriptions/owner').get()).data(),base);
});

test('opt-in recurring customer research runs multiple server cycles with lease dedupe and truthful zero-new results',async()=>{
 let clock=Date.now();await db.doc('businessSubscriptions/owner').update({expiresAt:Timestamp.fromMillis(clock+10*86400000)});
 service=customer.createService({db,auth,FieldValue,Timestamp,project:'scaled-circle',now:()=>clock,readSource:async source=>{reads++;return source.signals.join(' ');}});
 await call('initialize');assert.equal((await service.runScheduledResearch()).examined,0);
 await call('researchSchedule','owner','owner',{enabled:true});
 const concurrent=await Promise.all([service.runScheduledResearch(),service.runScheduledResearch()]);
 assert.equal(concurrent.flatMap(r=>r.results).length,1);assert.equal(reads,3);
 let view=await call();assert.equal(view.researchSchedule.lastStatus,'completed');assert.equal(view.researchSchedule.lastCompletedCycle.newProspectCount,3);
 const firstId=view.researchSchedule.lastCompletedCycle.runId;
 assert.equal((await call('research')).reused,true);assert.equal(reads,3);
 clock+=86400001;assert.equal((await service.runScheduledResearch()).results[0].status,'completed');
 view=await call();assert.notEqual(view.researchSchedule.lastCompletedCycle.runId,firstId);
 assert.equal(view.researchSchedule.lastCompletedCycle.newProspectCount,0);assert.equal(view.researchSchedule.lastCompletedCycle.duplicatesExcludedCount,3);
 assert.equal(reads,3);assert.ok(view.researchSchedule.nextRunAt>clock);
 await call('researchSchedule','owner','owner',{enabled:false});clock+=86400001;
 assert.equal((await service.runScheduledResearch()).examined,0);
 assert.equal((await db.collection('outboundEmailJobs').get()).size,0);
});
test('scheduled source failures remain real failures and owner stop wins an in-flight cycle',async()=>{
 let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const scheduler=require('../functions-agentic-growth/customer_research_schedule').createService({db,FieldValue,run:async()=>{entered();await gate;return {runId:'saved-run',reused:false};}});
 await scheduler.configure('owner','owner',true);const running=scheduler.runDue();await waiting;
 await scheduler.configure('owner','owner',false);release();await running;
 assert.equal((await db.doc('customerResearchSchedules/owner').get()).data().enabled,false);
 service=customer.createService({db,auth,FieldValue,Timestamp,project:'scaled-circle',readSource:async()=>{reads++;throw Error('Public source unavailable');}});
 await call('initialize');await call('researchSchedule','owner','owner',{enabled:true});await service.runScheduledResearch();
 const view=await call();assert.equal(view.researchSchedule.lastCompletedCycle.failedSourceCount,3);
 assert.equal(view.researchSchedule.lastCompletedCycle.newProspectCount,0);assert.equal(view.researchSchedule.lastCompletedCycle.sourceChecks,0);
 assert.equal((await db.collection('outboundEmailJobs').get()).size,0);
});
test('production grant callable derives the exact verified admin actor and rejects forged callers',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../functions-agentic-growth/index.js'),'utf8');
 const actorSource=source.slice(source.indexOf('async function growthActor('),source.indexOf('const growthEndpoint='));
 const grantSource=source.slice(source.indexOf('exports.grantCustomerGrowthDogfoodLeadV1='),source.indexOf('exports.runScheduledCustomerGrowthResearchV1='));
 const handlers={};class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 vm.runInNewContext(actorSource+'\n'+grantSource,{exports:handlers,onCall:(_,fn)=>fn,HttpsError,db,getAuth:()=>auth,FieldValue,
   process:{env:{GCLOUD_PROJECT:'scaled-circle',GROWTH_PRODUCTION_ADMIN_UID:'admin',CUSTOMER_GROWTH_DOGFOOD_BUSINESS_UID:'owner'}},
   internalBridge:require('../functions-agentic-growth/internal_growth_bridge'),require:name=>name==='firebase-admin/firestore'?{Timestamp}:require(path.join(__dirname,'../functions-agentic-growth',name))});
 await db.doc('users/admin').set({role:'admin',active:false});
 await db.doc('businessSubscriptions/owner').update({source:'internal_qa',comped:true,billingStatus:'comped'});
 const data={businessUid:'owner',product:'lead_generation_research',reason:'Exact configured Founder dogfood',expiresAt:Date.now()+3600000,requestId:'callable-grant',enableScheduledResearch:true};
 const grant=handlers.grantCustomerGrowthDogfoodLeadV1;
 await assert.rejects(grant({data}),/Sign in/);
 await assert.rejects(grant({auth:{uid:'owner',token:{email_verified:true}},data}),/not available/);
 await assert.rejects(grant({auth:{uid:'admin',token:{email_verified:false}},data}),/not available/);
 await assert.rejects(grant({auth:{uid:'admin',token:{email_verified:true}},data:{...data,grantedBy:'fake'}}),/Unsupported/);
 assert.equal((await grant({auth:{uid:'admin',token:{email_verified:true}},data})).granted,true);
 const record=(await db.doc('customerGrowthProductGrants/owner').get()).data();assert.equal(record.grantedBy,'admin');assert.equal(record.source,'internal_dogfood');
});
test('normal paid Lead purchasers enroll without invitation; Managed Growth alone cannot research',async()=>{
 const ref=db.doc('businessSubscriptions/owner');
 for(const planId of ['starter','growth','scale']){
  await ref.update({planId});
  assert.equal((await call('initialize')).initialized,true);
  assert.equal((await call()).workspaceKind,'customer');
 }
 await call('research');assert.ok(reads>0);
 await ref.update({planId:'managed_growth',addons:[],productEntitlements:[]});
 assert.equal((await call()).workspaceKind,'customer');
 const previousReads=reads;
 await assert.rejects(call('research'),/Lead Generation subscription/);
 await assert.rejects(call('review'),/Lead Generation subscription/);
 assert.equal(reads,previousReads);
 for(const invalid of [
  {planId:'starter',addons:[],productEntitlements:[]},
  {planId:'starter',addons:['lead_generation_research'],productEntitlements:[],source:'stripe'},
  {planId:'starter',addons:['lead_generation_research'],productEntitlements:['lead_generation_research'],source:'manual'},
  {source:'stripe',status:'canceled'},
  {status:'active',expiresAt:Timestamp.fromMillis(Date.now()-1)},
 ]){await ref.update(invalid);await assert.rejects(call(),/subscription|Reactivate membership/);}
});

test('Growth uses exact Social plan approval version and preserves all source records',async()=>{
 await call('initialize');
 const ref=db.doc('socialContentPlans/approved-social');
 const plan={businessUid:'owner',status:'approved',planVersion:1,approvedVersion:1,items:Array.from({length:8},()=>({variants:[{status:'ready_for_review'},{status:'ready_for_review'}]}))};
 await ref.set(plan);
 const result=await call();
 const social=result.agents.find(a=>a.type==='marketing_manager');
 assert.equal(social.status,'Plan approved · 8 ideas / 16 draft platform versions');
 assert.equal(social.lastAction,'30-Day strategy approved');
 assert.equal(social.destination,'/business/social-operations?review=posts');
 assert.equal(result.social.review.draftPosts,16);
 assert.deepEqual((await ref.get()).data(),plan);
 await ref.update({planVersion:2,status:'ready_for_review'});
 assert.equal((await call()).social.review.title,'New Plan Version Needs Review');
 await ref.delete();
});
test('normal owner customer authority, legal consent, plan and isolated data are required',async()=>{
 await assert.rejects(call('load',null),/Sign in/);await assert.rejects(call('load','other'),/access/);
 await assert.rejects(call('load','owner','other'),/unavailable|access/);
 await assert.rejects(call('load','disabled'),/verified/);await assert.rejects(call('load','unverified'),/verified/);
 await db.doc('legalConsents/owner_privacy_'+legal.AGREEMENTS.privacy).delete();await assert.rejects(call(),/consent/);
 assert.equal((await db.collection('agentProfiles').get()).size,0);
});
test('six normal agents and one real-source cycle are idempotent, no internal bridge or financial effects',async()=>{
 await db.doc('wallets/protected').set({amount:777});await db.doc('agentHealth/internal').set({secret:'preserve'});
 assert.equal((await call('initialize')).reused,false);assert.equal((await call('initialize')).reused,true);
 assert.equal((await db.collection('agentProfiles').get()).size,6);
 const run=await call('research');assert.equal(run.reused,false);assert.equal((await call('research')).reused,true);assert.equal(reads,3);
 const data=await call();assert.equal(data.summary.businessesFound,1);assert.equal(data.summary.partnersFound,2);assert.equal(data.summary.individualScalersFound,0);
 assert.equal(data.summary.contacted,0);assert.equal(data.measurement.attributedRevenue,null);assert.equal(data.social.planCount,0);
 assert.ok(data.prospects.every(p=>p.businessUid==='owner'&&p.externalMessageSent===false&&p.outreachAuthorized===false&&!p.draft.includes('ScaledCircle is preparing')));
 assert.equal((await db.doc('agentHealth/internal').get()).data().secret,'preserve');assert.equal((await db.doc('wallets/protected').get()).data().amount,777);
 assert.equal((await db.collection('internalGrowthWorkspaces').get()).size,0);
 for(const c of ['campaignPayments','socialGrowthJobs','socialPublishJobs','financialOperations'])assert.equal((await db.collection(c).get()).size,0);
 const p=data.prospects[0];await assert.rejects(call('review','owner','owner',{prospectId:p.id,decision:'send'}));
 await db.doc('agentProspects/'+p.id).update({businessUid:'other'});await assert.rejects(call('review','owner','owner',{prospectId:p.id,decision:'ready_for_founder_send'}));
});
test('team intelligence permission and active seat required; owner alone initializes and controls report email',async()=>{
 const ref=db.doc('businessWorkspaces/owner/members/member');await ref.set({businessId:'owner',uid:'member',status:'active',seatIndex:1,permissions:['analytics']});
 await assert.rejects(call('load','member'),/responsibility/);await ref.update({permissions:['intelligence']});
 await assert.rejects(call('initialize','member'),/owner/);await call('initialize');assert.equal((await call('load','member')).workspaceKind,'customer');
 await assert.rejects(call('preferences','member','owner',{mode:'daily'}),/owner/);
 await ref.update({status:'removed'});await assert.rejects(call('load','member'),/access/);
});
test('Supervisor pause and tenant geography limit source reads; no custom URL or scope accepted',async()=>{
 await call('initialize');await db.doc('agentHealth/owner').update({researchPaused:true});await assert.rejects(call('research'),/paused/);assert.equal(reads,0);
 await db.doc('agentHealth/owner').update({researchPaused:false});await assert.rejects(call('research','owner','owner',{url:'https://example.com'}),/saved Business/);
 await db.doc('discoveryPreferences/owner').update({userUid:'other'});await call('research');assert.equal(reads,0);assert.equal((await db.collection('agentProspects').get()).size,0);
});

test('expanded customer cycle preserves prior prospects and drafts while adding current bid evidence exactly once',async()=>{
 await db.doc('businessSubscriptions/owner').update({expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)});
 await call('initialize');await call('preferences','owner','owner',{opportunities:{government:true}});await call('research');
 const original=(await db.collection('agentProspects').get()).docs.map(d=>({id:d.id,data:d.data()}));
 const actions=(await db.collection('agentActions').get()).docs.map(d=>({id:d.id,data:d.data()}));
 // Existing day/version is reused. Simulate a new UTC research day for a legitimate next cycle.
 await db.doc('discoveryPreferences/owner').update({areas:[{id:'city',type:'place',geographyType:'city',city:'Baltimore',state:'Maryland',enabled:true,displayName:'Baltimore City'}]});
 const next=customer.createService({db,auth,FieldValue,Timestamp,project:'scaled-circle',allowedBusinesses:'owner',now:()=>Date.now()+86400000,
  readSource:async source=>source.key==='baltimore_city_bids'?'<div class="fw-bold text-body d-none d-lg-block">Office Renovation</div><span class="status-open-pill">Open</span><strong>RFQ Number:</strong> RFQ-EXAMPLE<strong>Deadline:</strong> 09/20/2099':source.signals.join(' ')});
 const request={auth:{uid:'owner'},data:{operation:'research'}};
 const r=await next.execute(request);assert.equal(r.reused,false);assert.equal((await next.execute(request)).reused,true);
 for(const p of original)assert.deepEqual((await db.doc('agentProspects/'+p.id).get()).data(),p.data);
 for(const p of actions)assert.deepEqual((await db.doc('agentActions/'+p.id).get()).data(),p.data);
 const result=await next.execute({auth:{uid:'owner'},data:{operation:'load'}});
 assert.equal(result.summary.opportunityGroups.find(g=>g.label==='Direct opportunities').count,1);
 assert.equal(result.summary.opportunityGroups.find(g=>g.label==='Workforce candidates').count,0);
 const bid=result.prospects.find(p=>p.sourceRecordId==='RFQ-EXAMPLE');assert.equal(bid.outreachAuthorized,false);assert.equal(bid.externalMessageSent,false);assert.match(bid.draft,/not a bid or commitment/);
 assert.equal((await db.collection('socialPublishingJobs').get()).size,0);
});

test('customer report email is owner-bound, preference-controlled and deduplicated through delivery',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../functions-agentic-growth/index.js'),'utf8');
 const start=source.indexOf('exports.queueCustomerGrowthReportEmailV1 =');
 const end=source.indexOf('\nfunction growthService()',start);
 assert.ok(start>=0&&end>start);const handlers={};
 vm.runInNewContext(source.slice(start,end),{exports:handlers,onDocumentCreated:(_,fn)=>fn,
  getAuth:()=>auth,db:new Proxy(db,{get:(t,k)=>k==='runTransaction'?fn=>t.runTransaction(tx=>Promise.resolve(fn(tx))):typeof t[k]==='function'?t[k].bind(t):t[k]}),FieldValue,process:{env:{GROWTH_CUSTOMER_BETA_UIDS:'owner',CUSTOMER_GROWTH_DOGFOOD_BUSINESS_UID:'owner'}},
  require:name=>require(require('node:path').join(__dirname,'../functions-agentic-growth',name)),growth:require('../functions-agentic-growth/growth_operations')});
 await call('initialize');await call('research');
 const report=(await db.collection('agentReports').where('kind','==','daily').get()).docs[0];
 const event={data:{data:()=>report.data()},params:{reportId:report.id}};
 const queue=handlers.queueCustomerGrowthReportEmailV1;
 await Promise.all([queue(event),queue(event)]);
 const jobs=await db.collection('outboundEmailJobs').get();assert.equal(jobs.size,1);
 const job=jobs.docs[0];assert.equal(job.data().to,'owner@example.test');
 assert.equal(job.data().preferenceKind,'important');assert.match(job.data().text,/Nothing in this report approves outreach/);
 assert.match(job.data().text,/https:\/\/scaledcircle.com\/#\/business\/growth-agents/);
 let sends=0;const deliver=()=>require('./transactional_email').processDeliveryJob({db,reference:job.ref,
  jobId:job.id,FieldValue,createTransport:()=>({sendMail:async()=>{sends++;return {messageId:'test-only',accepted:['owner@example.test']};}})});
 await deliver();await deliver();assert.equal(sends,1);assert.equal((await job.ref.get()).data().status,'sent');
 await queue({data:{data:()=>({...report.data(),businessUid:'other'})},params:{reportId:'cross'}});
 await call('preferences','owner','owner',{mode:'off'});
 await queue({...event,params:{reportId:'disabled'}});assert.equal((await db.collection('outboundEmailJobs').get()).size,1);
 await db.doc('businessSubscriptions/owner').update({addons:[],productEntitlements:[]});
 await db.doc('agentCommunicationPreferences/owner').set({daily:true,important:true});
 await queue({...event,params:{reportId:'entitlement_removed'}});
  assert.equal((await db.collection('outboundEmailJobs').get()).size,1);
 await db.doc('businessSubscriptions/owner').update({source:'internal_qa',comped:true,billingStatus:'comped'});
 await db.doc('users/admin').set({role:'admin'});
 await require('../functions-agentic-growth/customer_growth_grants').createService({db,auth,FieldValue,Timestamp,allowedBusinessId:'owner'}).grant({
   businessUid:'owner',product:'lead_generation_research',reason:'Exact dogfood report test',expiresAt:Date.now()+3600000,requestId:'report-grant',enableScheduledResearch:false},
   {uid:'admin',role:'admin',isAdmin:true,emailVerified:true});
 await queue({...event,params:{reportId:'dogfood_report'}});
 assert.equal((await db.collection('outboundEmailJobs').get()).size,2);
});

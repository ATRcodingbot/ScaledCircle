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
 for(const c of ['users','businessWorkspaces','businessSubscriptions','legalConsents','discoveryPreferences','businessGrowthProfiles','agentProfiles','agentHealth','agentApprovals','agentProspects','agentCrmProspects','agentActions','agentRuns','agentReports','agentObservations','agentCommunicationPreferences','notifications','wallets','outboundEmailJobs'])await db.recursiveDelete(db.collection(c));
 await db.doc('users/owner').set({role:'business',active:true,name:'Example Builder'});
 await db.doc('businessSubscriptions/owner').set({planId:'managed_growth',status:'active',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
 await db.doc('businessGrowthProfiles/owner').set({businessUid:'owner',businessName:'Example Builder',servicesOffered:['decks','fences'],plannedAdBudget:'$0'});
 await db.doc('discoveryPreferences/owner').set({schemaVersion:'ServiceAreaPreferencesV1',userUid:'owner',role:'business',preferenceVersion:1,areas:[{id:'aa',type:'place',geographyType:'county',county:'Anne Arundel County',state:'Maryland',displayName:'Anne Arundel County',enabled:true}]});
 for(const uid of ['owner','member'])for(const type of ['terms','privacy'])await db.doc(`legalConsents/${uid}_${type}_${legal.AGREEMENTS[type]}`).set({uid,agreementType:type,agreementVersion:legal.AGREEMENTS[type]});
 reads=0;service=customer.createService({db,auth,FieldValue,Timestamp,project:'scaled-circle',allowedBusinesses:'owner',readSource:async source=>{reads++;return source.signals.join(' ')+' '+(source.email||'');}});
});
after(()=>app.delete());
test('normal owner customer authority, legal consent, plan and isolated data are required',async()=>{
 await assert.rejects(call('load',null),/Sign in/);await assert.rejects(call('load','other'),/access/);
 await assert.rejects(call('load','owner','other'),/invitation/);
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

test('customer report email is owner-bound, preference-controlled and deduplicated through delivery',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../functions-agentic-growth/index.js'),'utf8');
 const start=source.indexOf('exports.queueCustomerGrowthReportEmailV1 =');
 const end=source.indexOf('\nfunction growthService()',start);
 assert.ok(start>=0&&end>start);const handlers={};
 vm.runInNewContext(source.slice(start,end),{exports:handlers,onDocumentCreated:(_,fn)=>fn,
  getAuth:()=>auth,db:new Proxy(db,{get:(t,k)=>k==='runTransaction'?fn=>t.runTransaction(tx=>Promise.resolve(fn(tx))):typeof t[k]==='function'?t[k].bind(t):t[k]}),FieldValue,process:{env:{GROWTH_CUSTOMER_BETA_UIDS:'owner'}},
  growth:require('../functions-agentic-growth/growth_operations')});
 await call('initialize');await call('research');
 const report=(await db.collection('agentReports').where('kind','==','daily').get()).docs[0];
 const event={data:{data:()=>report.data()},params:{reportId:report.id}};
 const queue=handlers.queueCustomerGrowthReportEmailV1;
 await Promise.all([queue(event),queue(event)]);
 const jobs=await db.collection('outboundEmailJobs').get();assert.equal(jobs.size,1);
 const job=jobs.docs[0];assert.equal(job.data().to,'owner@example.test');
 assert.equal(job.data().preferenceKind,'important');assert.match(job.data().text,/Draft — NOT SENT/);
 assert.match(job.data().text,/https:\/\/scaledcircle.com\/#\/business\/growth-agents/);
 let sends=0;const deliver=()=>require('./transactional_email').processDeliveryJob({db,reference:job.ref,
  jobId:job.id,FieldValue,createTransport:()=>({sendMail:async()=>{sends++;return {messageId:'test-only',accepted:['owner@example.test']};}})});
 await deliver();await deliver();assert.equal(sends,1);assert.equal((await job.ref.get()).data().status,'sent');
 await queue({data:{data:()=>({...report.data(),businessUid:'other'})},params:{reportId:'cross'}});
 await call('preferences','owner','owner',{mode:'off'});
 await queue({...event,params:{reportId:'disabled'}});assert.equal((await db.collection('outboundEmailJobs').get()).size,1);
});

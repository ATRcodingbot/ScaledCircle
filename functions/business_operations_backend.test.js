'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {createAuthority}=require('../functions-business-operations/authority'),{createService}=require('../functions-business-operations/service');
const {createWorkspaceService,PRESETS}=require('./business_workspace');
const model=require('../functions-business-operations/model');
let app,db,auth,service,workspace,sequence=0;const project='demo-business-operations',start=Date.UTC(2026,8,14,14);
before(()=>{assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);app=initializeApp({projectId:project},'operations');db=getFirestore(app);auth=getAuth(app);workspace=createWorkspaceService({db,auth,FieldValue,Timestamp});service=createService({db,FieldValue,authority:createAuthority({db,auth,FieldValue,Timestamp,project})});});
after(async()=>{await db.terminate();await deleteApp(app);});
async function user(){const uid='ops'+(++sequence);await auth.createUser({uid,email:uid+'@example.test',emailVerified:true});await db.doc('users/'+uid).set({role:'business',active:true,name:uid,email:uid+'@example.test'});for(const [type,version]of [['terms','terms-2026-08-v1'],['privacy','privacy-2026-08-v1']])await db.doc(`legalConsents/${uid}_${type}_${version}`).set({uid,agreementType:type,agreementVersion:version,acceptedAt:Timestamp.now()});return uid;}
async function owner(plan='growth'){const uid=await user();await db.doc('businessSubscriptions/'+uid).set({plan,status:'active',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});return uid;}
async function member(b,permissions){const uid=await user();const invite=await workspace.invite({uid:b,businessId:b,data:{name:uid,email:uid+'@example.test',permissions,preset:'custom'}});const email=(await db.doc('outboundEmailJobs/'+invite.emailJobId).get()).data();const token=email.text.match(/[?&]token=([\w-]+)/)[1];await workspace.accept({uid,businessId:b,invitationId:invite.invitationId,token});return uid;}
const call=(b,operation,input={},uid=b,requestId=crypto.randomUUID())=>service.execute({auth:uid?{uid}:null,data:{businessId:b,operation,input,requestId}});
const load=(b,uid=b)=>call(b,'load',{fromMs:start-86400000,toMs:start+7*86400000},uid);
const customer=(b,extra={},uid=b)=>call(b,'saveCustomer',{customer:{name:'Controlled customer',email:'client'+b+'@example.test',...extra},expectedVersion:0},uid);
const item=(b,extra={},uid=b,id)=>call(b,'saveItem',{item:{title:'Controlled estimate',type:'estimate',startMs:start,durationMinutes:60,timeZone:'America/New_York',assignedPeople:['user:'+b],...extra},expectedVersion:0},uid,id);
test('all four paid plans have core access and unchanged total seats',async()=>{for(const [p,cap]of [['starter',1],['growth',3],['scale',5],['managed_growth',10]]){const b=await owner(p);await customer(b);const v=await load(b);assert.equal(v.activePaid,true);assert.equal(v.seatLimit,cap);assert.equal(v.customers.length,1);assert.equal(v.people.length,1);}});

test('new work defaults to its authenticated creator for every type, not the workspace owner',async()=>{
 const b=await owner(),u=await member(b,[...PRESETS.sales,'jobsEdit','jobsView']);
 for(const [i,type] of model.TYPES.entries()){
  const saved=await call(b,'saveItem',{expectedVersion:0,item:{title:'Creator default',type,startMs:start+i*7200000,durationMinutes:60,timeZone:'America/New_York'}},u);
  const stored=(await db.doc(`businessOperations/${b}/items/${saved.itemId}`).get()).data();
  assert.deepEqual(stored.assignedPeople,['user:'+u]);assert.equal(stored.updatedBy,u);
 }
 await assert.rejects(item(b,{assignedPeople:['user:'+b]},u),{code:'permission-denied'});
});

test('explicit Unassigned remains conflict-free and existing Unassigned edits are preserved',async()=>{
 const b=await owner();const first=await item(b,{assignedPeople:[]});await item(b,{assignedPeople:[],startMs:start+5*60000});
 assert.equal((await load(b)).counts.unassignedWork,2);
 const before=(await db.doc(`businessOperations/${b}/items/${first.itemId}`).get()).data();
 const {assignedPeople,...edit}=Object.fromEntries(Object.entries(before).filter(([k])=>['title','type','customerId','startMs','durationMinutes','timeZone','assignedPeople','notes','status','linkedItemId','location'].includes(k)));
 await call(b,'saveItem',{itemId:first.itemId,expectedVersion:1,item:{...edit,title:'Still intentionally unassigned'}});
 assert.deepEqual((await db.doc(`businessOperations/${b}/items/${first.itemId}`).get()).data().assignedPeople,[]);
});

test('4:15 and 4:20 assignments conflict for the same user or crew; override remains owner-only',async()=>{
 const b=await owner(),u=await member(b,PRESETS.officeManager),at=Date.UTC(2026,8,12,20,15);
 await item(b,{startMs:at,assignedPeople:['user:'+u]});
 await assert.rejects(item(b,{startMs:at+5*60000,assignedPeople:['user:'+u]}),e=>e.code==='failed-precondition'&&e.details.conflicts[0].startMs===at&&e.details.conflicts[0].endMs===at+3600000);
 const crew=await call(b,'saveResource',{name:'Controlled crew',expectedVersion:0});await item(b,{startMs:at,assignedPeople:['crew:'+crew.resourceId]});
 await assert.rejects(item(b,{startMs:at+5*60000,assignedPeople:['crew:'+crew.resourceId]}),{code:'failed-precondition'});
 const input={expectedVersion:0,item:{title:'Reviewed overlap',type:'estimate',startMs:at+5*60000,durationMinutes:60,timeZone:'America/New_York',assignedPeople:['user:'+u]},overrideConflict:true,overrideReason:'Controlled overlapping review'};
 await assert.rejects(call(b,'saveItem',input,u),{code:'permission-denied'});assert.equal((await call(b,'saveItem',input)).conflictOverride,true);
});
test('no auth, unrelated member, disabled actor, missing consent and unpaid edits fail closed',async()=>{const b=await owner(),other=await owner();await assert.rejects(load(b,null),{code:'unauthenticated'});await assert.rejects(load(b,other),{code:'permission-denied'});await auth.updateUser(b,{disabled:true});await assert.rejects(load(b),{code:'permission-denied'});await auth.updateUser(b,{disabled:false});await db.doc(`legalConsents/${b}_privacy_privacy-2026-08-v1`).delete();await assert.rejects(customer(b),/legal_consent_required/);const expired=await owner();await customer(expired);await db.doc('businessSubscriptions/'+expired).update({status:'canceled'});assert.equal((await load(expired)).customers.length,1);await assert.rejects(customer(expired,{name:'New'}),{code:'failed-precondition'});});
test('concurrent duplicate contacts cannot create two CRM identities',async()=>{const b=await owner();const results=await Promise.allSettled([customer(b),customer(b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await load(b)).customers.length,1);});
test('scheduling creates/reuses customer, updates stage and preserves a real timeline',async()=>{const b=await owner();const a=await call(b,'saveItem',{item:{title:'Estimate',type:'estimate',startMs:start,durationMinutes:60,timeZone:'UTC-04:00',assignedPeople:[]},newCustomer:{name:'John controlled',email:'one@example.test'},expectedVersion:0});const c=(await load(b)).customers[0];assert.equal(c.stage,'estimate_scheduled');const second=await call(b,'saveItem',{item:{title:'Meeting',type:'meeting',startMs:start+86400000,durationMinutes:60,timeZone:'America/New_York',assignedPeople:[]},newCustomer:{name:'John controlled',email:'ONE@example.test'},expectedVersion:0});assert.equal(a.customerId,second.customerId);assert.equal((await load(b)).customers.length,1);assert.ok((await call(b,'timeline',{customerId:a.customerId})).events.some(e=>e.kind==='schedule_created'));});
test('concurrent overlapping schedule writes serialize; touching intervals remain legal',async()=>{const b=await owner();const result=await Promise.allSettled([item(b),item(b)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'failed-precondition');await item(b,{title:'Next',startMs:start+3600000});assert.equal((await load(b)).items.length,2);});
test('conflict override is owner-only and audited',async()=>{const b=await owner(),manager=await member(b,PRESETS.projectManager);await item(b);const input={item:{title:'Override',type:'job',startMs:start,durationMinutes:60,timeZone:'America/New_York',assignedPeople:['user:'+b]},expectedVersion:0,overrideConflict:true,overrideReason:'Owner confirmed shared attendance'};await assert.rejects(call(b,'saveItem',input,manager),{code:'permission-denied'});const result=await call(b,'saveItem',input);assert.equal(result.conflictOverride,true);assert.equal((await db.collection(`businessOperations/${b}/timeline`).where('kind','==','conflict_overridden').get()).size,1);});
test('Field User sees only assigned jobs and minimum customer context',async()=>{const b=await owner(),field=await member(b,PRESETS.fieldUser),c=await customer(b,{notes:'Private note',phone:'4105550123',location:'Private customer address'});const j=await item(b,{type:'job',customerId:c.customerId,assignedPeople:['user:'+field],notes:'Office-only discussion'});await item(b,{type:'estimate',startMs:start+3600000,assignedPeople:['user:'+field]});await item(b,{type:'job',startMs:start+7200000});const v=await load(b,field);assert.equal(v.items.length,1);assert.equal(v.items[0].id,j.itemId);assert.deepEqual(v.customers,[]);assert.equal(v.items[0].notes,undefined);assert.equal(v.items[0].customer.email,undefined);await assert.rejects(call(b,'timeline',{customerId:c.customerId},field),{code:'permission-denied'});await assert.rejects(customer(b,{name:'Attempt'},field),{code:'permission-denied'});await call(b,'setItemStatus',{itemId:j.itemId,expectedVersion:1,status:'in_progress'},field);});
test('removed members lose read and write access immediately without deleting attribution',async()=>{const b=await owner(),u=await member(b,PRESETS.officeManager);const c=await customer(b,{},u);await workspace.changeMember({uid:b,businessId:b,data:{action:'remove',memberId:u}});await assert.rejects(load(b,u),{code:'permission-denied'});await assert.rejects(customer(b,{name:'New'},u),{code:'permission-denied'});assert.ok((await call(b,'timeline',{customerId:c.customerId})).events.some(e=>e.actorUid===u));});
test('crew resources have no login or seat; linking preserves IDs and catches user/crew conflicts',async()=>{const b=await owner(),u=await member(b,PRESETS.fieldUser);const crew=await call(b,'saveResource',{name:'Controlled crew',expectedVersion:0});assert.equal(crew.seatConsumed,false);assert.equal(crew.loginCreated,false);const j=await item(b,{type:'job',assignedPeople:['crew:'+crew.resourceId]});await call(b,'linkResource',{resourceId:crew.resourceId,memberUid:u,expectedVersion:1});assert.equal((await load(b,u)).items[0].id,j.itemId);await assert.rejects(item(b,{assignedPeople:['user:'+u]}),{code:'failed-precondition'});assert.deepEqual((await db.doc(`businessOperations/${b}/items/${j.itemId}`).get()).data().assignedPeople,['crew:'+crew.resourceId]);assert.equal((await workspace.list({uid:b,businessId:b})).seatsUsed,2);});
test('request replay and optimistic versions cannot duplicate work or overwrite new edits',async()=>{const b=await owner(),id=crypto.randomUUID();const first=await item(b,{},b,id),second=await item(b,{},b,id);assert.equal(first.itemId,second.itemId);assert.equal(second.duplicate,true);await assert.rejects(item(b,{title:'Changed payload'},b,id),{code:'already-exists'});await call(b,'setItemStatus',{itemId:first.itemId,expectedVersion:1,status:'completed'});await assert.rejects(call(b,'setItemStatus',{itemId:first.itemId,expectedVersion:1,status:'scheduled'}),{code:'aborted'});});
test('quote/won/completed are owner records, never revenue or marketplace money effects',async()=>{const b=await owner(),c=await customer(b),e=await item(b,{customerId:c.customerId});await call(b,'recordEstimate',{itemId:e.itemId,expectedVersion:1,quotedAmountCents:12500,outcome:'won',note:'Customer accepted quote'});let v=await load(b);assert.equal(v.customers[0].stage,'won');assert.equal(v.items[0].estimate.collectedRevenueCents,null);const job=await item(b,{type:'job',customerId:c.customerId,linkedItemId:e.itemId,startMs:start+86400000});await call(b,'setItemStatus',{itemId:job.itemId,expectedVersion:1,status:'completed'});v=await load(b);assert.equal(v.customers[0].stage,'completed');for(const collection of ['campaigns','campaignZones','trackingSessions','earnings','walletLedger','campaignPayments'])assert.equal((await db.collection(collection).get()).size,0);assert.equal((await call(b,'timeline',{customerId:c.customerId})).revenue,'Not verified');});

test('rescheduling preserves recorded estimate outcome and cannot transfer it to another customer',async()=>{
 const b=await owner(),c=await customer(b),e=await item(b,{customerId:c.customerId});
 await call(b,'recordEstimate',{itemId:e.itemId,expectedVersion:1,quotedAmountCents:12500,outcome:'won',note:'Recorded outcome'});
 const saved=(await load(b)).items[0],input={itemId:e.itemId,expectedVersion:2,item:{title:saved.title,type:saved.type,customerId:saved.customerId,startMs:start+3600000,durationMinutes:60,timeZone:saved.timeZone,assignedPeople:saved.assignedPeople}};
 await call(b,'saveItem',input);const after=(await load(b)).items[0];assert.deepEqual(after.estimate,saved.estimate);assert.equal((await load(b)).customers[0].stage,'won');
 await assert.rejects(call(b,'saveItem',{...input,expectedVersion:3,item:{...input.item,type:'job'}}),{code:'failed-precondition'});
});

test('archived crew labels and linked-user overlap identity remain in historical work',async()=>{
 const b=await owner(),u=await member(b,PRESETS.fieldUser),crew=await call(b,'saveResource',{name:'Historical crew',expectedVersion:0});
 await item(b,{type:'job',assignedPeople:['crew:'+crew.resourceId]});await call(b,'linkResource',{resourceId:crew.resourceId,expectedVersion:1,memberUid:u});
 await call(b,'saveResource',{resourceId:crew.resourceId,expectedVersion:2,name:'Historical crew',status:'inactive'});
 assert.deepEqual((await load(b)).items[0].assignedLabels,['Historical crew']);
 await assert.rejects(item(b,{assignedPeople:['user:'+u]}),{code:'failed-precondition'});
 await assert.rejects(item(b,{startMs:start+3600000,assignedPeople:['crew:'+crew.resourceId]}),{code:'failed-precondition'});
});

test('reopening completed work cannot bypass assignment conflicts',async()=>{
 const b=await owner(),first=await item(b);await call(b,'setItemStatus',{itemId:first.itemId,expectedVersion:1,status:'completed'});await item(b,{title:'Later accepted assignment'});
 await assert.rejects(call(b,'setItemStatus',{itemId:first.itemId,expectedVersion:2,status:'in_progress'}),{code:'failed-precondition'});
 assert.equal((await db.doc(`businessOperations/${b}/items/${first.itemId}`).get()).data().status,'completed');
});

test('linking crew to an account cannot silently merge overlapping assignments',async()=>{
 const b=await owner(),u=await member(b,PRESETS.fieldUser),crew=await call(b,'saveResource',{name:'Separate crew identity',expectedVersion:0});
 await item(b,{assignedPeople:['crew:'+crew.resourceId]});await item(b,{assignedPeople:['user:'+u]});
 await assert.rejects(call(b,'linkResource',{resourceId:crew.resourceId,expectedVersion:1,memberUid:u}),{code:'failed-precondition'});
 assert.equal((await db.doc(`businessOperations/${b}/resources/${crew.resourceId}`).get()).data().linkedUid,undefined);
});
test('landing inquiry is tenant-bound and imported only once even when reusing a customer',async()=>{const b=await owner(),c=await customer(b);await db.doc('salesLeads/lead_'+b).set({ownerUid:b,leadType:'landing_page_inquiry',createdBy:'public_landing_page',contactName:'Controlled customer',contactEmail:'client'+b+'@example.test',message:'Exact inquiry'});assert.equal((await load(b)).inbound.length,1);for(let i=0;i<2;i++)assert.equal((await call(b,'importLead',{leadId:'lead_'+b})).customerId,c.customerId);assert.equal((await load(b)).inbound.length,0);assert.equal((await db.collection(`businessOperations/${b}/timeline`).where('kind','==','landing_lead_linked').get()).size,1);const other=await owner();await assert.rejects(call(other,'importLead',{leadId:'lead_'+b}),{code:'permission-denied'});});
test('notifications remain preferences, never action permissions or customer email',async()=>{const b=await owner(),u=await member(b,PRESETS.fieldUser);await call(b,'savePreferences',{choices:{scheduleChanges:false}},u);await item(b,{type:'job',assignedPeople:['user:'+u]});assert.equal((await db.collection('notifications').where('userId','==',u).get()).size,0);await assert.rejects(item(b,{type:'job',assignedPeople:[]},u),{code:'permission-denied'});});
test('basic parsing rejects unknown fields, invalid dates and fake resource identity',()=>{assert.throws(()=>model.customer({name:'x',balance:10}),{code:'invalid-argument'});assert.throws(()=>model.item({title:'x',type:'job',startMs:start,durationMinutes:0,timeZone:'Bad'}),{code:'invalid-argument'});assert.throws(()=>model.people(['user:../../other']),{code:'invalid-argument'});assert.deepEqual(model.conflicts({id:'a',status:'scheduled',assignedPeople:['user:a'],startMs:10,endMs:20},[{id:'b',status:'scheduled',assignedPeople:['user:a'],startMs:20,endMs:30}]),[]);});
test('estimate reminders are exactly once, in-app only and respect permission/revocation',async()=>{
 const b=await owner(),u=await member(b,PRESETS.officeManager);await item(b,{assignedPeople:['user:'+u]});
 const {createReminders}=require('../functions-business-operations/reminders');const run=createReminders({db,FieldValue,authority:createAuthority({db,auth,FieldValue,Timestamp,project}),now:()=>start-20*60000});
 await run();await run();assert.equal((await db.collection('notifications').where('userId','==',u).where('type','==','business_estimate_reminder').get()).size,1);
 await call(b,'savePreferences',{choices:{estimateReminders:false}},u);await item(b,{startMs:start+3600000,assignedPeople:['user:'+u]});const later=createReminders({db,FieldValue,authority:createAuthority({db,auth,FieldValue,Timestamp,project}),now:()=>start+40*60000});await later();assert.equal((await db.collection('notifications').where('userId','==',u).where('type','==','business_estimate_reminder').get()).size,1);
});
test('agent command prepares exact bounded intent only and denies unentitled users',async()=>{
 const parse=require('../functions-business-operations/proposal').parse;
 assert.equal(parse('Maybe an estimate with John Sunday?',-240).needsDetails,true);
 assert.equal(parse('Schedule estimate with John on 2026-02-31 at 10:00',-240).needsDetails,true);
 const value=parse('Schedule estimate with John in Linthicum on 2026-09-14 at 10:00',-240);assert.equal(value.item.startMs,start);assert.equal(value.executed,false);assert.equal(value.requiresApproval,true);
 const b=await owner('starter');await assert.rejects(call(b,'propose',{prompt:'Schedule estimate with John on 2026-09-14 at 10:00',utcOffsetMinutes:-240}),{code:'permission-denied'});
 assert.equal((await load(b)).items.length,0);
});
test('email thread links require exact Business and customer; recorded estimates feed local outcomes only',async()=>{
 const b=await owner(),c=await customer(b),recipient='client'+b+'@example.test';await db.doc('businessMailboxes/'+b).set({businessId:b,status:'connected',permissions:{read:true,send:false}});
 await db.doc(`businessMailboxes/${b}/operations/thread`).set({businessId:b,state:'sent',recipient,subject:'Controlled inquiry',providerAcceptedAt:start,prospectId:'p',certification:false});
 await assert.rejects(call(b,'linkEmailThread',{customerId:c.customerId,expectedVersion:1,operationId:'missing'}),{code:'permission-denied'});
 await call(b,'linkEmailThread',{customerId:c.customerId,expectedVersion:1,operationId:'thread'});const e=await item(b,{customerId:c.customerId});await call(b,'recordEstimate',{itemId:e.itemId,expectedVersion:1,quotedAmountCents:15000,outcome:'won',note:'Owner recorded'});
 const events=(await db.collection(`businessMailboxes/${b}/outcomes`).get()).docs.map(d=>d.data());assert.equal(events.length,2);assert.ok(events.every(e=>e.businessId===b&&e.revenueVerified===false));
 const timeline=await call(b,'timeline',{customerId:c.customerId});assert.ok(timeline.events.some(e=>e.kind==='email_sent'));assert.equal(timeline.revenue,'Not verified');
});

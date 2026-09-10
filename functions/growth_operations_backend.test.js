'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),fs=require('node:fs');
const app=admin.initializeApp({projectId:'demo-growth-agents'},'growth-tests'),db=app.firestore(),FieldValue=admin.firestore.FieldValue;
const growth=require('../functions-agentic-growth/growth_operations');
const rules=require('@firebase/rules-unit-testing');
let service,clock,checks;
beforeEach(async()=>{
  for(const c of ['internalGrowthWorkspaces','internalGrowthWorkspaceAudits','discoveryPreferences','agentProspects','agentCrmProspects','agentActions','agentApprovals','agentRuns','agentReports','agentObservations','agentHealth','agentCommunicationPreferences','notifications'])for(const d of await db.collection(c).listDocuments())await db.recursiveDelete(d);
  clock=Date.parse('2026-09-10T14:00:00Z');checks=0;
  await db.doc('agentHealth/owner').set({businessUid:'owner',killSwitchActive:true,externalActionsEnabled:false});
  await db.doc('discoveryPreferences/owner').set({schemaVersion:'ServiceAreaPreferencesV1',userUid:'owner',role:'business',preferenceVersion:1,areas:['Anne Arundel County','Baltimore County'].map((county,i)=>({id:'area'+i,type:'place',geographyType:'county',county,state:'Maryland',displayName:county+', Maryland',enabled:true}))});
  service=growth.createService({db,FieldValue,sourceCatalog:require('../functions-agentic-growth/growth_sources').slice(0,6),project:'demo-growth-agents',target:'owner',now:()=>clock,readSource:async s=>{checks++;return s.signals.join(' ')+' '+(s.email||'')+' '+(s.phone||'');}});
});
after(async()=>{await db.terminate();await app.delete();});
test('real persistence dedupes research/CRM/approvals/reports without financial writes',async()=>{
  await db.doc('wallets/protected').set({balance:123});
  await service.run();await service.run();
  assert.equal(checks,6);
  for(const c of ['agentProspects','agentCrmProspects','agentActions','agentObservations'])assert.equal((await db.collection(c).get()).size,6);
  assert.equal((await db.collection('agentReports').get()).size,2);assert.equal((await db.collection('notifications').get()).size,8);
  const data=await service.load();assert.equal(data.summary.businessesFound,3);assert.equal(data.summary.partnersFound,3);assert.equal(data.summary.individualScalersFound,0);
  assert.equal((await db.doc('wallets/protected').get()).data().balance,123);
  assert.equal((await db.doc('agentHealth/owner').get()).data().killSwitchActive,true);
  assert.equal((await db.collection('financialOperations').get()).size,0);
});
test('concurrent run does not duplicate source research or effects; next day preserves drafts',async()=>{
  const result=await Promise.allSettled([service.run(),service.run()]);assert.ok(result.some(x=>x.status==='fulfilled'));assert.equal(checks,6);
  const p=(await db.collection('agentProspects').get()).docs[0];
  await service.review({prospectId:p.id,decision:'do_not_contact'});
  clock+=86400000;await service.run();assert.equal(checks,12);assert.equal((await db.collection('agentProspects').get()).size,6);
  assert.equal((await p.ref.get()).data().doNotContact,true);assert.equal((await db.collection('agentActions').get()).size,6);
});
test('Supervisor pause blocks run; cross-tenant review and external-send decisions are denied',async()=>{
  await service.run();const p=(await db.collection('agentProspects').get()).docs[0];
  await assert.rejects(service.review({prospectId:p.id,decision:'send'}));
  await p.ref.update({businessUid:'other'});await assert.rejects(service.review({prospectId:p.id,decision:'ready_for_founder_send'}));
  await db.doc('agentHealth/owner').update({researchPaused:true});await assert.rejects(service.run(),/paused/);
});
test('source failures stay unknown and create no fabricated prospect',async()=>{
  const s=growth.createService({db,FieldValue,sourceCatalog:require('../functions-agentic-growth/growth_sources').slice(0,6),project:'demo-growth-agents',target:'owner',readSource:async()=>{throw Error('offline');}});
  await s.run();assert.equal((await db.collection('agentProspects').get()).size,0);assert.equal((await s.load()).summary.qualified,0);
});
test('missing or changed tenant scope preserves old records and provenance without broadening discovery',async()=>{
  await service.run();const before=(await db.collection('agentProspects').get()).docs.map(d=>({id:d.id,...d.data()}));
  await db.doc('discoveryPreferences/owner').delete();clock+=86400000;await service.run();
  const after=(await db.collection('agentProspects').get()).docs.map(d=>({id:d.id,...d.data()}));
  assert.equal(after.length,before.length);
  for(const old of before){const current=after.find(p=>p.id===old.id);for(const key of ['sourceHash','discoveredAt','sourceEvidenceIds','draft','approvalState','qualified'])assert.deepEqual(current[key],old[key]);}
  const loaded=await service.load();assert.equal(loaded.summary.serviceAreaStatus,'MISSING_MAINTAINED_GEOGRAPHY');assert.equal(loaded.summary.discoveryByServiceArea.length,2);
});
test('new collections and private-beta grants deny client reads/writes, including unrelated tenants',async()=>{
  const env=await rules.initializeTestEnvironment({projectId:'demo-growth-rules',firestore:{rules:fs.readFileSync(require('node:path').join(__dirname,'..','firestore.rules'),'utf8')}});
  try{for(const context of [env.unauthenticatedContext(),env.authenticatedContext('owner',{role:'business'}),env.authenticatedContext('other',{role:'admin'})])for(const c of ['agentProspects','agentCrmProspects','agentReports','agentCommunicationPreferences','privateProductAccess','internalGrowthWorkspaces','internalGrowthWorkspaceAudits']){
    await rules.assertFails(context.firestore().doc(c+'/owner').get());await rules.assertFails(context.firestore().doc(c+'/owner').set({businessUid:'owner'}));
  }}finally{await env.cleanup();}
});

test('email dispatch rechecks preference and does not send after opt-out',async()=>{
 const ref=db.doc('outboundEmailJobs/pref_guard');await ref.set({status:'queued',template:'growth_agent_report_v1',businessUid:'owner',preferenceKind:'daily',to:'support@scaledcircle.com',fromAddress:'support@scaledcircle.com',text:'Actual report'});
 await service.savePreferences({mode:'off'});let sends=0;
 const result=await require('./transactional_email').processDeliveryJob({db,reference:ref,jobId:'pref_guard',FieldValue,createTransport:()=>({sendMail:async()=>{sends++;}})});
 assert.equal(result.reason,'communication_preference');assert.equal(sends,0);
});
test('new internal territory revision permits one bounded cycle, preserving old drafts and IDs',async()=>{
 await service.run();const before=(await db.collection('agentProspects').get()).docs.map(d=>({id:d.id,...d.data()}));
 await db.doc('internalGrowthWorkspaces/owner').set({schemaVersion:'InternalGrowthWorkspaceV1',namespace:'owner',ownerUid:'owner',kind:'internal_admin_dogfood',revision:1,areas:[{selectionId:'city',displayLabel:'Baltimore City, Maryland',geographyType:'city',city:'Baltimore',state:'Maryland'},{selectionId:'aa',displayLabel:'Anne Arundel County, Maryland',geographyType:'county',county:'Anne Arundel County',state:'Maryland'}]});
 const order=[];const current=growth.createService({db,FieldValue,project:'demo-growth-agents',target:'owner',now:()=>clock,readSource:async s=>{order.push(s.key);return s.signals.join(' ');}});
 const first=await current.run(),second=await current.run();assert.equal(first.reused,false);assert.equal(second.reused,true);
 assert.deepEqual(order.slice(0,2),['baltimore_city_career','lehnhoffs']);
 for(const old of before){const saved=(await db.doc('agentProspects/'+old.id).get()).data();for(const key of ['sourceHash','discoveredAt','draft','approvalState','sourceEvidenceIds'])assert.deepEqual(saved[key],old[key]);}
 assert.equal((await db.collection('agentProspects').get()).size,8);
 const data=await current.load();assert.deepEqual(data.summary.serviceAreaPriority,['Baltimore City, Maryland','Anne Arundel County, Maryland']);
});
test('internal notification view excludes unrelated tenants and non-growth account alerts',async()=>{
 await service.run();await db.doc('notifications/unrelated').set({userId:'other',type:'agent_daily_brief',title:'private'});await db.doc('notifications/billing').set({userId:'owner',type:'invoice_paid',title:'private billing'});
 const view=await service.load();assert.equal(view.notifications.length,8);assert.ok(view.notifications.every(n=>!n.title.includes('private')));assert.ok(view.notifications.every(n=>n.userId===undefined));
});

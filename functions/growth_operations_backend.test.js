'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),fs=require('node:fs');
const app=admin.initializeApp({projectId:'demo-growth-agents'},'growth-tests'),db=app.firestore(),FieldValue=admin.firestore.FieldValue;
const growth=require('../functions-agentic-growth/growth_operations');
const rules=require('@firebase/rules-unit-testing');
let service,clock,checks;
beforeEach(async()=>{
  for(const c of ['businessMailboxes','internalGrowthWorkspaces','internalGrowthWorkspaceAudits','discoveryPreferences','agentProspects','agentCrmProspects','agentActions','agentApprovals','agentRuns','agentReports','agentObservations','agentHealth','publicResearchDiscoveryState','agentCommunicationPreferences','notifications'])for(const d of await db.collection(c).listDocuments())await db.recursiveDelete(d);
  clock=Date.parse('2026-09-10T14:00:00Z');checks=0;
  await db.doc('agentHealth/owner').set({businessUid:'owner',killSwitchActive:true,externalActionsEnabled:false});
  await db.doc('discoveryPreferences/owner').set({schemaVersion:'ServiceAreaPreferencesV1',userUid:'owner',role:'business',preferenceVersion:1,areas:['Anne Arundel County','Baltimore County'].map((county,i)=>({id:'area'+i,type:'place',geographyType:'county',county,state:'Maryland',displayName:county+', Maryland',enabled:true}))});
  service=growth.createService({db,FieldValue,sourceCatalog:require('../functions-agentic-growth/growth_sources').slice(0,6),project:'demo-growth-agents',target:'owner',now:()=>clock,readSource:async s=>{checks++;return s.signals.join(' ')+' '+(s.email||'')+' '+(s.phone||'');}});
});
after(async()=>{await db.terminate();await app.delete();});

test('future briefs use confirmed local correspondence while prior reports stay immutable',async()=>{
 const priorId=await service.makeReport('daily'),prior=(await db.doc('agentReports/'+priorId).get()).data();
 await db.doc('businessMailboxes/owner/operations/real_send').set({businessId:'owner',state:'sent',requestedAt:clock,replyCount:1});
 await db.doc('businessMailboxes/owner/operations/certification').set({businessId:'owner',state:'sent',requestedAt:clock,replyCount:1,certification:true});
 await db.doc('businessMailboxes/owner/outcomes/appointment').set({businessId:'owner',operationId:'real_send',outcome:'appointment',recordedAt:clock,evidenceType:'owner_reported'});
 const view=await service.load();assert.equal(view.summary.contacted,1);assert.equal(view.summary.replied,1);assert.equal(view.outreach.outcomeCounts.appointment,1);
 await service.makeReport('daily');assert.deepEqual((await db.doc('agentReports/'+priorId).get()).data(),prior);
 clock+=86400000;const nextId=await service.makeReport('daily'),next=(await db.doc('agentReports/'+nextId).get()).data();
 assert.equal(next.summary.contacted,1);assert.equal(next.summary.outreach.outcomeCounts.appointment,1);assert.equal(next.summary.outreach.attributedRevenue,null);
 assert.equal(next.summary.paid,null);assert.match(next.scope,/owner-recorded/);
});
test('preference changes preserve historical RFQs and block new drafts and review',async()=>{
 const source={key:'public_bid_test',name:'RFQ-000859',kind:'business',opportunityType:'public_bid',region:'Anne Arundel County',serviceArea:{type:'county',locality:'Anne Arundel County',state:'Maryland'},industry:'procurement',url:'https://example.test/bid',signals:['qualified'],reason:'Public solicitation',useCase:'Read requirements'};
 const research=growth.createService({db,FieldValue,project:'demo-growth-agents',target:'owner',now:()=>clock,sourceCatalog:[source],readSource:async()=>{checks++;return 'qualified';}});
 await research.run();assert.equal(checks,0);assert.equal((await db.collection('agentProspects').get()).size,0);
 await research.savePreferences({opportunities:{government:true}});clock+=86400000;await research.run();
 const record=(await db.collection('agentProspects').get()).docs[0],before=record.data();
 assert.equal(before.displayName,'RFQ-000859');
 await research.savePreferences({opportunities:{government:false}});
 await research.savePreferences({mode:'weekly'});
 const view=await research.load();assert.equal(view.preferences.opportunities.government,false);
 assert.equal(view.prospects.length,0);assert.equal(view.summary.awaitingApproval,0);assert.equal(view.excludedProspects.length,1);
 assert.deepEqual((await record.ref.get()).data(),before);
 await assert.rejects(research.review({prospectId:record.id,decision:'ready_for_founder_send'}),/excluded/);
 clock+=86400000;await research.run();assert.equal(checks,1);assert.deepEqual((await record.ref.get()).data(),before);
});
test('queued report is suppressed if opportunity preferences changed before delivery',async()=>{
 await service.savePreferences({mode:'daily',opportunities:{government:true}});
 const old=(await db.doc('agentCommunicationPreferences/owner').get()).data();
 const ref=db.doc('outboundEmailJobs/old_focus');await ref.set({status:'queued',template:'growth_agent_report_v1',businessUid:'owner',preferenceKind:'daily',growthPreferenceRevision:old.updatedAt.toMillis(),to:'support@scaledcircle.com',fromAddress:'support@scaledcircle.com',text:'Historical RFQ report'});
 await service.savePreferences({opportunities:{government:false}});let sends=0;
 const result=await require('./transactional_email').processDeliveryJob({db,reference:ref,jobId:'old_focus',FieldValue,createTransport:()=>({sendMail:async()=>{sends++;}})});
 assert.equal(result.reason,'growth_preferences_changed');assert.equal(sends,0);
});
test('real persistence dedupes research/CRM/approvals/reports without financial writes',async()=>{
  await db.doc('wallets/protected').set({balance:123});
  await service.run();await service.run();
  assert.equal(checks,6);
  for(const c of ['agentProspects','agentCrmProspects','agentActions','agentObservations'])assert.equal((await db.collection(c).get()).size,6);
  assert.equal((await db.collection('agentReports').get()).size,2);assert.equal((await db.collection('notifications').get()).size,2);
  const data=await service.load();assert.equal(data.summary.businessesFound,3);assert.equal(data.summary.partnersFound,3);assert.equal(data.summary.individualScalersFound,0);
  assert.equal((await db.doc('wallets/protected').get()).data().balance,123);
  assert.equal((await db.doc('agentHealth/owner').get()).data().killSwitchActive,true);
  assert.equal((await db.collection('financialOperations').get()).size,0);
});
test('concurrent run does not duplicate source research or effects; next day preserves drafts',async()=>{
  const result=await Promise.allSettled([service.run(),service.run()]);assert.ok(result.some(x=>x.status==='fulfilled'));assert.equal(checks,6);
  const p=(await db.collection('agentProspects').get()).docs[0];
  await service.review({prospectId:p.id,decision:'do_not_contact'});
  clock+=86400000;await service.run();assert.equal(checks,11,'recipient-wide Do Not Contact skips that source on the next cycle');assert.equal((await db.collection('agentProspects').get()).size,6);
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
 const view=await service.load();assert.equal(view.notifications.length,2);assert.ok(view.notifications.every(n=>!n.title.includes('private')));assert.ok(view.notifications.every(n=>n.userId===undefined));
});
test('daily internal rechecks record zero new prospects and real deduplicated observations',async()=>{
 const first=await service.run();const original=(await db.doc('agentRuns/'+first.runId).get()).data();
 assert.equal(original.newProspectCount,6);assert.equal(original.duplicatesExcludedCount,0);
 clock+=86400000;const second=await service.run();const next=(await db.doc('agentRuns/'+second.runId).get()).data();
 assert.equal(next.newProspectCount,0);assert.equal(next.duplicatesExcludedCount,6);assert.equal(next.sourceChecks,6);
 assert.equal(next.leaseUntil,0);assert.equal(next.externalMutationEnabled,false);
 assert.deepEqual((await db.doc('agentRuns/'+first.runId).get()).data(),original);
 assert.equal((await db.collection('agentProspects').get()).size,6);
});

test('central response through evidence, qualification and CRM keeps processing failure distinct and restart duplicate-safe',async()=>{
 const preferences=(await db.doc('discoveryPreferences/owner').get()).data();
 await db.doc('discoveryPreferences/owner').update({areas:preferences.areas.slice(0,1)});
 let calls=0,mode='invalid';
 const item={name:'Example Deck Vendor',url:'https://example.com/vendors',quote:'Decks are part of our vendor program.',serviceEvidence:'Decks are part of our vendor program.',areaEvidence:'Serving Anne Arundel County in Maryland.'};
 const payload=()=>({id:'resp_fixture',status:mode==='incomplete'?'incomplete':'completed',usage:{input_tokens:1000,output_tokens:100},output_text:mode==='invalid'?'PRIVATE MALFORMED OUTPUT':JSON.stringify({candidates:mode==='empty'?[]:[item]}),output:[{type:'web_search_call',action:{sources:[{url:item.url}]}}]});
 const research=growth.createService({db,FieldValue,project:'demo-growth-agents',target:'owner',now:()=>clock,sourceCatalog:[],readSource:async()=>{throw Error('must use verified evidence');},publicResearch:{publicProfile:{servicesOffered:['Decks']},executeRequest:async()=>{calls++;return {response:payload()};},readPublicSource:async()=>{if(mode==='unavailable')throw Error('unavailable');return item.quote+' '+item.areaEvidence;}}});
 for(const status of ['research_response_invalid','research_response_incomplete']){
  const run=await research.run(),saved=(await db.doc('agentRuns/'+run.runId).get()).data();assert(saved.discoveryChecks.every(c=>c.status===status&&c.stage==='response_parsing'));assert.equal(saved.newProspectCount,0);assert.equal((await db.collection('agentCrmProspects').get()).size,0);const view=await research.load();assert.equal(view.summary.discovery.state,'failed');assert.equal(view.summary.discovery.lastSuccessfulProcessingAt,null);assert.match(view.summary.next,/response_parsing/);assert(view.notifications.some(n=>n.title==='Daily research summary — needs attention'));
  const before=calls;assert.equal((await research.run()).reused,true);assert.equal(calls,before);assert(!JSON.stringify(saved).includes('PRIVATE MALFORMED OUTPUT'));clock+=86400000;mode='incomplete';
 }
 mode='valid';const result=await research.run(),run=(await db.doc('agentRuns/'+result.runId).get()).data();assert.equal(run.newProspectCount,1);assert.equal((await db.collection('agentCrmProspects').get()).size,1);
 const prospect=(await db.collection('agentProspects').get()).docs[0].data();assert.equal(prospect.explicitNeed,false);assert.equal(prospect.externalMessageSent,false);assert.equal(prospect.publicDiscovery.observedAt,clock);
 const before=calls;await research.run();assert.equal(calls,before);assert.equal((await db.collection('agentCrmProspects').get()).size,1);
 clock+=86400000;const repeat=await research.run(),later=(await db.doc('agentRuns/'+repeat.runId).get()).data();assert.equal(later.newProspectCount,0);assert.equal(later.duplicatesExcludedCount,0);assert.equal(later.discoveryChecks.filter(c=>c.attemptId).reduce((n,c)=>n+c.duplicates,0),2);assert.equal((await db.collection('agentCrmProspects').get()).size,1);
 const view=await research.load();assert.equal(view.summary.discovery.newQualified,0);assert.equal(view.summary.discovery.lastNewProspectAt,prospect.discoveredAt);assert.equal(view.summary.discovery.state,'processed');
 for(const m of ['empty','unavailable']){clock+=86400000;mode=m;if(m==='unavailable')item.url='https://unavailable-example.com/vendors';const r=await research.run();const v=await research.load();assert.equal(v.summary.discovery.state,'processed');assert.equal(v.summary.discovery.newQualified,0);assert.equal(v.summary.discovery.candidatesParsed,m==='empty'?0:2);if(m==='unavailable')assert.equal(v.summary.discovery.sourceFailures,1);const prior=calls;await research.run();assert.equal(calls,prior);assert.equal((await db.collection('agentCrmProspects').get()).size,1);}

});

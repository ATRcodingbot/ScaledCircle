'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin');const app=admin.initializeApp({projectId:'demo-growth-internal'},'internal-tests'),db=app.firestore(),FieldValue=admin.firestore.FieldValue;
const internal=require('../functions-agentic-growth/internal_growth_workspace');
const canonicalPlace=require('./business_geography').canonicalPlace;
const actor={uid:'owner',role:'admin',active:true,verified:true};let service;
const result=(name,type,id)=>({id,fullAddress:name+', Maryland, United States',latitude:39,longitude:-76,state:'Maryland',city:type==='city'?name:'',county:type==='county'?name:'',geographyType:type,resolutionSource:'openstreetmap_nominatim',geometry:[{latitude:39,longitude:-76},{latitude:40,longitude:-76},{latitude:39,longitude:-77}]});
beforeEach(async()=>{for(const c of ['users','agentHealth','agentProspects','internalGrowthWorkspaces','internalGrowthWorkspaceAudits'])for(const r of await db.collection(c).listDocuments())await db.recursiveDelete(r);
 await db.doc('users/owner').set({role:'admin',active:true});await db.doc('agentHealth/owner').set({businessUid:'owner',externalActionsEnabled:false,killSwitchActive:true});
 service=internal.createService({db,FieldValue,target:'owner',project:'demo-growth-internal',canonicalPlace,resolvePlace:async()=>({results:[result('Baltimore','city','city'),result('Baltimore County','county','county'),result('Anne Arundel County','county','aa')]})});});
after(async()=>{await db.terminate();await app.delete();});
test('register is idempotent and preserves Admin role, prospects and Supervisor',async()=>{
 await db.doc('agentProspects/old').set({businessUid:'owner',sourceHash:'proof',draft:'original'});
 await Promise.all([service.register(actor),service.register(actor)]);
 assert.equal((await db.collection('internalGrowthWorkspaceAudits').get()).size,1);
 assert.equal((await db.doc('users/owner').get()).data().role,'admin');assert.equal((await db.doc('agentProspects/old').get()).data().draft,'original');
 assert.equal((await db.doc('agentHealth/owner').get()).data().killSwitchActive,true);
});
test('canonical City and County stay distinct; priority persists without another tenant geography',async()=>{
 await service.register(actor);const {results}=await service.search(actor,{query:'Maryland'});
 assert.equal(results[0].label,'Baltimore City, Maryland');assert.match(results[1].label,/Baltimore County/);
 await service.save(actor,{selectionIds:results.map(r=>r.selectionId),expectedRevision:0});
 const scope=internal.scope((await db.doc('internalGrowthWorkspaces/owner').get()).data(),'owner');
 assert.deepEqual(scope.areas.map(a=>a.type),['city','county','county']);assert.equal(scope.preferenceVersion,1);
 assert.equal((await db.collection('discoveryPreferences').get()).size,0);
});
test('wrong actor, role, production environment, unknown selection and duplicates fail closed',async()=>{
 for(const bad of [{...actor,uid:'other'},{...actor,role:'business'},{...actor,active:false},{...actor,verified:false}])await assert.rejects(service.register(bad));
 const prod=internal.createService({db,FieldValue,target:'owner',project:'scaled-circle'});await assert.rejects(prod.register(actor));
 await service.register(actor);await assert.rejects(service.save(actor,{selectionIds:['a'.repeat(64)],expectedRevision:0}));
 const {results}=await service.search(actor,{query:'Maryland'});await assert.rejects(service.save(actor,{selectionIds:[results[0].selectionId,results[0].selectionId],expectedRevision:0}));
});
test('concurrent territory edits cannot overwrite each other and audit once',async()=>{
 await service.register(actor);const {results}=await service.search(actor,{query:'Maryland'});
 const edits=await Promise.allSettled([service.save(actor,{selectionIds:[results[0].selectionId],expectedRevision:0}),service.save(actor,{selectionIds:[results[1].selectionId],expectedRevision:0})]);
 assert.equal(edits.filter(e=>e.status==='fulfilled').length,1);assert.equal((await db.collection('internalGrowthWorkspaceAudits').get()).size,2);
});

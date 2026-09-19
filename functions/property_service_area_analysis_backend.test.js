'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createService}=require('./property_service_area_analysis');
const app=initializeApp({projectId:'demo-property-service-analysis'},'property-analysis'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
const rect=(x,y,w=.04)=>[{longitude:x,latitude:y},{longitude:x+w,latitude:y},{longitude:x+w,latitude:y+w},{longitude:x,latitude:y+w}];
const facts={propertyCount:100,residentialStructureCount:80,percent20PlusYearsOld:75,percent40PlusYearsOld:35,confidence:'HIGH',limitations:[]};
let seq=0;
async function fixture(extra={}){const b='property_test_'+(++seq),prefs={schemaVersion:'ServiceAreaPreferencesV1',role:'business',userUid:b,preferenceVersion:1,areas:[{id:'west',name:'West',geometry:rect(-77,39)},{id:'east',name:'East',geometry:rect(-76.9,39)}],priorityServices:['Roofing'],excludedServices:[]};
 await db.doc('discoveryPreferences/'+b).set(prefs);await db.doc('businessGrowthProfiles/'+b).set({schemaVersion:'BusinessGrowthProfileV1',profileVersion:1,businessUid:b,businessName:'Test Business',servicesOffered:['Roofing','Remodeling'],...extra});return {b,prefs};}
test('real transaction lease prevents concurrent providers, replays exact report, rejects request reuse, and preserves sources',async()=>{
 const {b,prefs}=await fixture();let clock=Date.now(),calls=0,active=0,maxActive=0,release;const gate=new Promise(resolve=>release=resolve);
 const service=createService({db,FieldValue,now:()=>clock,analyze:async()=>{calls++;active++;maxActive=Math.max(maxActive,active);await gate;active--;return facts;}});
 const input={businessId:b,actorUid:b,requestId:'first',objective:'Roofing'},pending=service.run(input);
 while(!calls)await new Promise(resolve=>setTimeout(resolve,10));
 await assert.rejects(service.run({...input,requestId:'parallel'}),e=>e.code==='aborted');release();const report=await pending;
 assert.equal(calls,12);assert.equal(maxActive,3);assert.equal(report.recommendations.length,12);
 assert.deepEqual(await service.run(input),report);assert.equal(calls,12);
 await assert.rejects(service.run({...input,objective:'Remodeling'}),e=>e.code==='already-exists');
 assert.deepEqual((await db.doc('discoveryPreferences/'+b).get()).data(),prefs);
 const territory=db.doc('propertyRecommendationWorkspaces/'+b+'/territories/'+report.recommendations[0].id),proof=(await territory.get()).data().proof;
 await service.save({businessId:b,actorUid:b,recommendationId:report.recommendations[0].id});assert.deepEqual((await territory.get()).data().proof,proof);
 assert.equal((await territory.get()).data().status,'saved');
 assert.equal((await db.collection('propertyRecommendationWorkspaces/'+b+'/territories').get()).size,12);
 clock+=61000;const next=await service.run({...input,requestId:'next'});assert.equal(next.overlapsExcludedCount,12);assert.ok(next.recommendations.every(r=>!report.recommendations.some(old=>old.id===r.id)));
 assert.equal((await service.history({businessId:b})).length,24);
 for(const collection of ['campaigns','campaignZones'])assert.equal((await db.collection(collection).where('businessId','==',b).get()).size,0);
});
test('same-Business campaigns exclude real overlap, competitor records do not; failed and insufficient sections are remembered',async()=>{
 const {b,prefs}=await fixture();let clock=Date.now(),calls=0;
 await db.doc('campaigns/'+b+'_own').set({businessId:b,status:'active',serviceArea:prefs.areas[0].geometry});
 await db.doc('campaigns/'+b+'_other').set({businessId:'another_business',status:'active',serviceArea:prefs.areas[1].geometry});
 const service=createService({db,FieldValue,now:()=>clock,analyze:async()=>{calls++;if(calls===1)throw Error('provider_down');return {...facts,confidence:'INSUFFICIENT'};}});
 const report=await service.run({businessId:b,actorUid:b,requestId:'first',objective:'Roofing'});
 assert.equal(report.recommendations.length,0);assert.equal(report.failedSectionCount,1);assert.ok(report.overlapsExcludedCount>0);assert.ok(report.examinedCount>0);
 const history=await service.history({businessId:b});assert.ok(history.every(r=>r.fit===null));assert.ok(history.every(r=>r.name==='East'));
 clock+=61000;const next=await service.run({businessId:b,actorUid:b,requestId:'next',objective:'Roofing'});assert.ok(next.overlapsExcludedCount>report.overlapsExcludedCount);
});
test('cross-owner sources, forged history and source changes fail closed without saving recommendations',async()=>{
 const {b}=await fixture({businessUid:'foreign'});let calls=0;
 const service=createService({db,FieldValue,analyze:async()=>{calls++;return facts;}});
 await assert.rejects(service.run({businessId:b,actorUid:b,requestId:'foreign',objective:'Roofing'}),e=>e.code==='failed-precondition');assert.equal(calls,0);
 const next=await fixture();const changed=createService({db,FieldValue,analyze:async()=>{await db.doc('businessGrowthProfiles/'+next.b).update({profileVersion:2});return facts;}});
 await assert.rejects(changed.run({businessId:next.b,actorUid:next.b,requestId:'changed',objective:'Roofing'}),e=>e.code==='aborted');
 assert.equal((await db.collection('propertyRecommendationWorkspaces/'+next.b+'/territories').get()).size,0);
 await assert.rejects(service.save({businessId:b,actorUid:b,recommendationId:'foreign'}),e=>e.code==='not-found');
});
test('save rechecks current area containment and preserves original proof on rejection',async()=>{
 const {b,prefs}=await fixture(),service=createService({db,FieldValue,analyze:async()=>facts});
 const report=await service.run({businessId:b,actorUid:b,requestId:'first',objective:'Roofing'}),rec=report.recommendations[0];
 await service.reject({businessId:b,actorUid:b,recommendationId:rec.id});
 assert.equal((await db.doc('propertyRecommendationWorkspaces/'+b+'/territories/'+rec.id).get()).data().status,'rejected');
 await db.doc('discoveryPreferences/'+b).update({areas:[{id:'elsewhere',name:'Elsewhere',geometry:rect(-78,39)}],preferenceVersion:2});
 await assert.rejects(service.save({businessId:b,actorUid:b,recommendationId:rec.id}),e=>e.code==='failed-precondition');
});
test('bounded history refuses truncation before provider work',async()=>{
 const {b}=await fixture();const batch=db.batch();for(let i=0;i<500;i++)batch.set(db.doc('campaigns/'+b+'_'+i),{businessId:b,status:'completed'});await batch.commit();await db.doc('campaigns/'+b+'_500').set({businessId:b,status:'completed'});
 let calls=0;const service=createService({db,FieldValue,analyze:async()=>{calls++;return facts;}});
 await assert.rejects(service.run({businessId:b,actorUid:b,requestId:'bounded',objective:'Roofing'}),e=>e.code==='resource-exhausted');assert.equal(calls,0);
});
test('failed request retries after cooldown with one lease, then completed replay makes no provider calls',async()=>{
 const {b}=await fixture();let clock=Date.now(),calls=0,change=true;
 const service=createService({db,FieldValue,now:()=>clock,analyze:async()=>{calls++;if(change){change=false;await db.doc('businessGrowthProfiles/'+b).update({profileVersion:2});}return facts;}});
 const input={businessId:b,actorUid:b,requestId:'retry',objective:'Roofing'};
 await assert.rejects(service.run(input),e=>e.code==='aborted');const firstCalls=calls;
 await assert.rejects(service.run(input),e=>e.code==='resource-exhausted');assert.equal(calls,firstCalls);
 clock+=61000;const report=await service.run(input);assert.equal(report.recommendations.length,12);assert.equal(calls,firstCalls+12);
 assert.equal((await db.doc('propertyRecommendationWorkspaces/'+b+'/runs/retry').get()).data().attemptCount,2);
 assert.equal((await db.collection('propertyRecommendationWorkspaces/'+b+'/territories').get()).size,12);
 assert.deepEqual(await service.run(input),report);assert.equal(calls,firstCalls+12);
});

test('nearby comparison discovers six distinct contained alternatives without a second drawing',async()=>{
 const {b,prefs}=await fixture();const service=createService({db,FieldValue,analyze:async()=>facts});
 const anchor=rect(-76.99,39.01,.01),report=await service.run({businessId:b,actorUid:b,requestId:'nearby',objective:'Roofing',comparisonGeometry:anchor});
 const geometry=require('./property_service_area_geometry'),union=geometry.normalizeAreas(prefs).union;
 assert.equal(report.examinedCount,6);assert.equal(report.recommendations.length,6);
 assert.ok(report.recommendations.every(r=>geometry.isContained(r.geometry,union)&&!geometry.overlapsGeometry(r.geometry,anchor)));
 assert.ok(report.recommendations.every(r=>r.geometry.every(p=>p.longitude<-76.94)),'nearest west alternatives precede distant east area');
 await assert.rejects(service.run({businessId:b,actorUid:b,requestId:'nearby',objective:'Roofing',comparisonGeometry:rect(-76.98,39.01,.01)}),e=>e.code==='already-exists');
 const other=await fixture();await assert.rejects(service.run({businessId:other.b,actorUid:other.b,requestId:'outside',comparisonGeometry:rect(-79,39)}),e=>e.code==='failed-precondition');
});

test('90-day recommendation cooldown allows reconsideration and preserves every historical observation',async()=>{
 const {b}=await fixture();let clock=Date.now();const service=createService({db,FieldValue,now:()=>clock,analyze:async()=>facts});
 const input={businessId:b,actorUid:b,requestId:'original',objective:'Roofing'},first=await service.run(input);
 clock+=91*86400000;const second=await service.run({...input,requestId:'revisit'});
 assert.deepEqual(second.recommendations.map(r=>r.id),first.recommendations.map(r=>r.id));
 const observations=await db.collection('propertyRecommendationWorkspaces/'+b+'/territories/'+first.recommendations[0].id+'/observations').get();
 assert.equal(observations.size,2);assert.deepEqual((await db.doc('propertyRecommendationWorkspaces/'+b+'/runs/original').get()).data().report,first);
});

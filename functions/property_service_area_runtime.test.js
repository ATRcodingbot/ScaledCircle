'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const property=require('./property_intelligence');
const {publicAnalysis,createAnalyzer}=require('./property_service_area_runtime');
const geometry=[{latitude:39,longitude:-77},{latitude:39.01,longitude:-77},{latitude:39.01,longitude:-76.99},{latitude:39,longitude:-76.99}];
test('shared cache contains neutral evidence and strips technical failures',async t=>{
  const stores=new Map();let providers=0;
  const db={collection:name=>{assert.equal(name,'propertyIntelligenceCache');return {doc:id=>({get:async()=>({data:()=>stores.get(id)}),set:async value=>stores.set(id,value)})};}};
  t.mock.method(property,'analyzeWithFallback',async()=>{providers++;return {source:'maryland',confidence:'HIGH',propertyCount:70,providerFailures:['HTTP 400 https://private.invalid'],limitations:['HTTP 400 https://private.invalid','Public records can be incomplete.']};});
  const now=Date.now(),analyze=createAnalyzer({db,FieldValue:{serverTimestamp:()=>new Date(now).toISOString()},now:()=>now});
  const first=await analyze(geometry),second=await analyze(geometry);
  assert.deepEqual(first,second);assert.equal(providers,1);assert.equal(stores.size,1);
  assert.deepEqual(first.limitations,['Public records can be incomplete.']);
  assert.equal(first.physicalLogisticsVersion,'PropertyPhysicalLogisticsV1');
  assert.deepEqual(first.physicalChannelSuitability,require('./managed_growth').evaluatePhysicalChannelSuitability(first.physicalLogistics));
  assert.doesNotMatch(JSON.stringify([...stores.values()]),/HTTP|private.invalid|providerFailures|businessId|goal|workspace/);
});
test('provider outage is truthful and not persisted as reusable evidence',async t=>{
  let writes=0;
  const db={collection:()=>({doc:()=>({get:async()=>({data:()=>null}),set:async()=>writes++})})};
  t.mock.method(property,'analyzeWithFallback',async()=>({source:'none',confidence:'INSUFFICIENT',limitations:['HTTP 403'],providerFailures:['HTTP 403']}));
  const result=await createAnalyzer({db,FieldValue:{}})(geometry);
  assert.equal(writes,0);assert.equal(result.confidence,'INSUFFICIENT');assert.doesNotMatch(JSON.stringify(result),/403/);
  assert.match(publicAnalysis({source:'none'}).limitations[0],/No service demand/);
});

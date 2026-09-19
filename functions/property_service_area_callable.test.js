'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const parser=require('@babel/parser'),generate=require('@babel/generator').default;
const source=fs.readFileSync(require.resolve('./index'),'utf8');
const node=parser.parse(source).program.body.find(s=>s.expression?.left?.object?.name==='exports'&&s.expression.left.property?.name==='analyzePropertyIntelligence');
function fixture(entitled=true){
 const calls=[],exports={};class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const service={run:async input=>{calls.push(input);return {recommendations:[{id:'bounded'}]};},history:async input=>{calls.push(input);return [];},save:async input=>{calls.push(input);return {id:input.recommendationId,status:'saved'};}};
 const context={exports,onCall:(options,fn)=>fn,businessOperation:(_,fn)=>fn,HttpsError,
  authenticatedUserContext:async request=>{if(!request.auth)throw new HttpsError('unauthenticated','Sign in');return {uid:request.auth.uid,actorUid:request.auth.uid,role:request.auth.role};},
  db:{collection:name=>({doc:uid=>({get:async()=>{assert.equal(name,'businessSubscriptions');return {data:()=>({entitled,uid})};}})})},
  subscriptionEntitlements:{hasActiveScaleEntitlement:value=>value.entitled},
  propertyIntelligence:require('./property_intelligence'),propertyServiceAreaAnalysis:{createService:()=>service},
  propertyServiceAreaRuntime:{createAnalyzer:()=>async()=>{}},FieldValue:{},CENSUS_API_KEY:{value:()=>''},readText:value=>value||''};
 vm.runInNewContext(generate(node).code,context);
 return {call:exports.analyzePropertyIntelligence,calls};
}
test('production callable accepts saved source without geometry and forwards goal, never caller ownership',async()=>{
 const {call,calls}=fixture(),auth={uid:'owner',role:'business'};
 const result=await call({auth,data:{scope:'saved_service_areas',objective:'Get more build deck jobs',requestId:'saved_request'}});
 assert.equal(result.analysisScope,'saved_service_areas');assert.equal(calls[0].businessId,'owner');assert.equal(calls[0].objective,'Get more build deck jobs');assert.equal(calls[0].savedAreaId,undefined);
 await assert.rejects(call({auth,data:{scope:'saved_service_areas',geometry:[],requestId:'spoof'}}),e=>e.code==='invalid-argument');assert.equal(calls.length,1);
 await call({auth,data:{scope:'saved_service_areas',action:'history'}});assert.equal(calls[1].businessId,'owner');
 await call({auth,data:{scope:'saved_service_areas',action:'save_territory',recommendationId:'bounded'}});assert.equal(calls[2].recommendationId,'bounded');
});
test('authentication, role and authoritative entitlement precede saved-area analysis',async()=>{
 for(const auth of [undefined,{uid:'scaler',role:'scaler'}]){const f=fixture();await assert.rejects(f.call({auth,data:{scope:'saved_service_areas'}}));assert.equal(f.calls.length,0);}
 const f=fixture(false);await assert.rejects(f.call({auth:{uid:'owner',role:'business'},data:{scope:'saved_service_areas',entitled:true}}),e=>e.code==='permission-denied');assert.equal(f.calls.length,0);
});
test('custom geometry keeps its separate bounded validation instead of entering saved-area service',async()=>{
 const f=fixture();await assert.rejects(f.call({auth:{uid:'owner',role:'business'},data:{geometry:[{latitude:39,longitude:-77},{latitude:40,longitude:-77},{latitude:40,longitude:-76},{latitude:39,longitude:-76}]}}),e=>e.code==='invalid-argument'&&/My Service Areas/.test(e.message));assert.equal(f.calls.length,0);
});
test('nearby comparison forwards the anchor under authenticated workspace authority',async()=>{
 const f=fixture(),auth={uid:'owner',role:'business'};
 const comparisonGeometry=[{latitude:39,longitude:-76},{latitude:39.005,longitude:-76},{latitude:39.005,longitude:-75.995}];
 await f.call({auth,data:{scope:'saved_service_areas',action:'compare_nearby',comparisonGeometry,requestId:'nearby'}});
 assert.equal(f.calls[0].businessId,'owner');assert.deepEqual(f.calls[0].comparisonGeometry,comparisonGeometry);
 await assert.rejects(f.call({auth,data:{scope:'saved_service_areas',action:'compare_nearby',requestId:'missing'}}),e=>e.code==='invalid-argument');
 assert.equal(f.calls.length,1);
});

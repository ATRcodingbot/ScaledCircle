'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function nodes(source){const map=new Map();for(const n of parser.parse(source).program.body){let name=n.type==='FunctionDeclaration'?n.id.name:null;
 if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.object?.name==='exports')name='exports.'+n.expression.left.property.name;
 if(name)map.set(name,source.slice(n.start,n.end));}return map;}
const main=read('functions/index.js'),discovery=read('functions-discovery/index.js');
test('deployment endpoint/projection AST parity and PI/crypto/cache bindings are retained',()=>{
 const a=nodes(main),b=nodes(discovery),p=nodes(read('functions-business-profile/index.js'));
 for(const name of ['smartZoneRecommendationContext','smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan','exports.getSmartZonePlan','exports.applySmartZonePlan'])assert.equal(b.get(name),a.get(name),name);
 assert.equal(p.get('exports.getBusinessWorkspaceContext'),a.get('exports.getBusinessWorkspaceContext'));
 let checked=0;traverse(parser.parse(discovery),{ReferencedIdentifier(p){if(['propertyIntelligence','PROPERTY_INTELLIGENCE_CACHE_COLLECTION','crypto'].includes(p.node.name)){
   assert.ok(p.scope.getBinding(p.node.name),p.node.name);checked++;}}});assert.ok(checked>=5);
});
test('discovery transitive PI runtime resolves with exact maintained modules and pinned dependency graph',()=>{
 const seen=new Set();function visit(name){if(seen.has(name))return;seen.add(name);
  const source=read('functions/'+name),copy=read('functions-discovery/'+name);assert.equal(copy.replace(/\r\n/g,'\n'),source.replace(/\r\n/g,'\n'),name);
  for(const match of source.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g))visit(path.posix.join(path.posix.dirname(name),match[1])+(/\.js$/.test(match[1])?'':'.js'));
 }
 for(const name of ['smart_zone_intelligence.js','smart_zone_intelligence_runtime.js'])visit(name);
 const pkg=JSON.parse(read('functions-discovery/package.json')),lock=JSON.parse(read('functions-discovery/package-lock.json')),root=JSON.parse(read('functions/package-lock.json'));
 assert.equal(pkg.dependencies['polygon-clipping'],'0.15.7');assert.equal(lock.packages[''].dependencies['polygon-clipping'],'0.15.7');
 for(const key of ['node_modules/polygon-clipping','node_modules/robust-predicates','node_modules/splaytree'])assert.deepEqual(lock.packages[key],root.packages[key]);
 assert.equal(typeof require('../functions-discovery/smart_zone_intelligence').search,'function');
 assert.equal(typeof require('../functions-discovery/property_intelligence').cacheIsReusable,'function');
});
test('actual discovery runtime replays retained public evidence without provider or production access',async()=>{
 const engine=require('../functions-discovery/smart_zone_intelligence'),geo=require('../functions-discovery/smart_zone_geography'),areas=require('../functions-discovery/property_service_area_geometry');
 const fixture=require('./fixtures/21061-corkran-osm-public.json'),runtime=require('../functions-discovery/smart_zone_intelligence_runtime');
 const input={anchor:fixture.anchor,selectedBoundary:fixture.selectedBoundary,eligibleGeography:areas.normalizeAreas({areas:[{geometry:fixture.selectedBoundary}]}).union,
  desiredHours:5,workType:'flyer_distribution',sourceAreaDigest:'fixture',contextVersion:'fixture',label:'Retained Corkran fixture',
  intelligenceContext:{goal:'Deck prospects',services:['Deck construction'],priorityServices:[],excludedServices:[],campaignType:'flyer_distribution'}};
 const evidence=await engine.search(input,{fetchSnapshot:async({selectedBoundary})=>geo.snapshotFromElements(selectedBoundary,fixture.elements,{dataTimestamp:fixture.dataTimestamp,fetchedAt:fixture.retrievedAt})});
 runtime.assertFirestoreValue(evidence);const plan=engine.generate(input,evidence);assert.equal(plan.totalEstimatedProperties,19);assert.equal(plan.totalEstimatedMinutes,44);
});
test('maintained generator retains intelligence bindings, modules and exact clipping dependency without running generation',()=>{
 const vm=require('node:vm'),code=read('functions/scripts/generate_functions_codebases.js'),writes={};
 const prefix=code.slice(0,code.indexOf('for (const [mode, destination] of ['));assert.ok(prefix.length>1000);
 const fakeFs={...fs,writeFileSync:(file,value)=>{writes[path.basename(file)]=value;}};
 const generatorRequire=require('node:module').createRequire(path.join(__dirname,'scripts/generate_functions_codebases.js'));
 const api=vm.runInNewContext(prefix+'\n;({transformIndex,writePackageManifest});',{require:name=>['fs','node:fs'].includes(name)?fakeFs:generatorRequire(name),
  __dirname:path.join(__dirname,'scripts'),console});
 const generated=api.transformIndex('discovery');assert.match(generated,/const propertyIntelligence = require\("\.\/property_intelligence"\)/);
 assert.match(generated,/smart_zone_intelligence_runtime/);assert.match(generated,/requireCached: true/);
 api.writePackageManifest('discovery','virtual');const pkg=JSON.parse(writes['package.json']);assert.equal(pkg.dependencies['polygon-clipping'],'0.15.7');
});

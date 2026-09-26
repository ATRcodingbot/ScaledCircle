'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {rankAnalysis,selectSpread}=require('./property_service_area_analysis');
const context={services:['Roofing','Remodeling','Landscaping'],priorityServices:[],goal:'Roofing'};
const facts={propertyCount:100,residentialStructureCount:80,percent20PlusYearsOld:90,percent40PlusYearsOld:20,confidence:'HIGH',propertyTypeDistribution:{R:100}};
test('service-specific planning proxy changes with the selected offered service',()=>{
 assert.equal(rankAnalysis(facts,context).fit,85);
 assert.equal(rankAnalysis(facts,{...context,goal:'Remodeling'}).fit,50);
 const landscape=rankAnalysis(facts,{...context,goal:'Landscaping'});assert.equal(landscape.fit,80);
 assert.match(landscape.limitations.join(' '),/do not establish single-family/);
});
test('missing, null, string metrics and insufficient evidence never become zero fit',()=>{
 for(const patch of [{propertyCount:null},{propertyCount:'100'},{residentialStructureCount:null},{percent20PlusYearsOld:null},{confidence:'INSUFFICIENT'}])assert.equal(rankAnalysis({...facts,...patch},context).fit,null);
 assert.equal(rankAnalysis({...facts,percent20PlusYearsOld:0},context).fit,40);
});
test('deck goal inflection selects decks independently of remodeling and respects exclusions',()=>{
 const business={services:['Build decks','Remodeling'],priorityServices:['Remodeling'],goal:'Get more build deck jobs',excludedServices:[]};
 const deck=rankAnalysis(facts,business),remodel=rankAnalysis(facts,{...business,goal:'Get more remodeling jobs'});
 assert.equal(deck.fit,80);assert.equal(remodel.fit,50);
 assert.match(deck.reasons.join(' '),/residential share only/);assert.doesNotMatch(deck.reasons.join(' '),/40\+/);
 assert.match(deck.limitations.join(' '),/presence or condition of decks/);
 assert.equal(rankAnalysis(facts,{...business,excludedServices:['Decks']}).fit,null);
});
test('selection spreads across independent saved areas and is repeatable without first-corner bias',()=>{
 const candidates=Array.from({length:30},(_,i)=>({id:'section_'+i,areaIds:[i<15?'west':'east']}));
 const a=selectSpread(candidates,['west','east'],'stable',12),b=selectSpread(candidates,['west','east'],'stable',12);
 assert.deepEqual(a,b);assert.equal(a.filter(c=>c.areaIds[0]==='east').length,6);assert.equal(new Set(a.map(c=>c.id)).size,12);
 assert.notDeepEqual(a.map(c=>c.id),candidates.slice(0,12).map(c=>c.id));
});

test('shared PI section entry preserves maintained score and requires matching geometry',()=>{
 const pi=require('./property_intelligence'),{rankPropertySection}=require('./property_service_area_analysis');
 const geometry=[{latitude:39,longitude:-77},{latitude:39.01,longitude:-77},{latitude:39.01,longitude:-76.99},{latitude:39,longitude:-76.99}];
 const analysis={...facts,source:'synthetic-property-fixture',geometryDigest:pi.geometryDigest(geometry)};
 const result=rankPropertySection({analysis,context,geometry});assert.equal(result.fit,rankAnalysis(facts,context).fit);
 assert.equal(result.evidence.source,'synthetic-property-fixture');assert.equal(result.history.status,'unknown');
 assert.equal(rankPropertySection({analysis:{...analysis,geometryDigest:'foreign'},context,geometry}).fit,null);
});

test('ACS housing-only universe remains context, not 100-percent section residential fit',()=>{
 const aggregate={...facts,propertyCount:100,residentialStructureCount:100,inputGranularity:'aggregate_census'};
 for(const goal of ['Roofing','Remodeling','Landscaping'])assert.equal(rankAnalysis(aggregate,{...context,goal}).fit,null);
 assert.match(rankAnalysis(aggregate,context).limitations.join(' '),/whole intersecting block groups/);
});

test('services without distinguishing evidence honestly tie instead of inventing personalization',()=>{
 const services=['Decks','Fences','Landscaping'];const fits=services.map(goal=>rankAnalysis(facts,{services,goal,priorityServices:[]}).fit);
 assert.deepEqual(fits,[80,80,80]);
});

test('the maintained age formula changes the winning section for roofing versus remodeling',()=>{
 const offered={services:['Roofing','Remodeling'],priorityServices:[]};
 const sections=[{id:'older-mix',...facts,residentialStructureCount:100,percent20PlusYearsOld:40,percent40PlusYearsOld:80},
  {id:'replacement-mix',...facts,residentialStructureCount:80,percent20PlusYearsOld:90,percent40PlusYearsOld:20}];
 const winner=goal=>sections.map(a=>({id:a.id,fit:rankAnalysis(a,{...offered,goal}).fit})).sort((a,b)=>b.fit-a.fit)[0].id;
 assert.equal(winner('Roofing'),'replacement-mix');assert.equal(winner('Remodeling'),'older-mix');
});

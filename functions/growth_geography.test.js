'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {serviceAreaScope,matchArea,prioritizeSources,groupedDiscovery}=require('../functions-agentic-growth/growth_geography');
const area=(id,type,locality)=>({id,type:'place',geographyType:type,city:type==='city'?locality:'',county:type==='county'?locality:'',state:'Maryland',displayName:locality+', Maryland',enabled:true});
const prefs={schemaVersion:'ServiceAreaPreferencesV1',userUid:'business-a',role:'business',preferenceVersion:3,areas:[area('aa','county','Anne Arundel County'),area('city','city','Baltimore'),area('county','county','Baltimore County')]};
const source=(url,type,locality)=>({url,serviceArea:{type,locality,state:'Maryland'}});
test('only the exact Business geography supplies enabled scope; no global Baltimore priority',()=>{
 assert.equal(serviceAreaScope(prefs,'other').status,'MISSING_MAINTAINED_GEOGRAPHY');
 assert.equal(serviceAreaScope(null,'business-a').areas.length,0);
 assert.deepEqual(serviceAreaScope(prefs,'business-a').areas.map(x=>x.id),['aa','city','county']);
 const ordered=serviceAreaScope(prefs,'business-a',['city','county','aa','invented']);
 assert.deepEqual(ordered.areas.map(x=>x.id),['city','county','aa']);
 assert.equal(ordered.preferenceVersion,3);
 const disabled=structuredClone(prefs);disabled.areas[1].enabled=false;
 assert.deepEqual(serviceAreaScope(disabled,'business-a',['city','county','aa']).areas.map(x=>x.id),['county','aa']);
});
test('City and County cannot collide; prefer scoped sources and retain historical rechecks',()=>{
 const scope=serviceAreaScope(prefs,'business-a',['city','county','aa']);
 const catalog=[source('aa','county','Anne Arundel County'),source('county','county','Baltimore County'),source('city','city','Baltimore'),source('historic','county','Howard County'),source('unscoped','county','Howard County')];
 assert.equal(matchArea(catalog[1],scope).id,'county');assert.equal(matchArea(catalog[2],scope).id,'city');
 assert.deepEqual(prioritizeSources(catalog,scope,['historic']).map(x=>x.url),['city','county','aa','historic']);
 assert.deepEqual(prioritizeSources(catalog,serviceAreaScope(null,'business-a'),['aa']).map(x=>x.url),['aa']);
});
test('area summary includes genuine zero results without inventing workers; immutable input',()=>{
 const rows=[{...source('aa','county','Anne Arundel County'),kind:'business',geography:'Anne Arundel County, Maryland',sourceHash:'original'}];
 const before=structuredClone(rows),groups=groupedDiscovery(rows,serviceAreaScope(prefs,'business-a',['city','county','aa']));
 assert.deepEqual(groups.map(g=>g.total),[0,0,1]);assert.equal(groups[2].individualScalers,0);assert.deepEqual(rows,before);
});

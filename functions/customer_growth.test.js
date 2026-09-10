'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const catalog=require('../functions-agentic-growth/customer_growth_sources'),geo=require('../functions-agentic-growth/growth_geography');
const planner=require('../functions-social-operations/social_customer_plan');
test('customer research uses saved service type and exact enabled tenant geography',()=>{
 assert.equal(catalog.select({servicesOffered:['dentistry']}).length,0);
 const sources=catalog.select({servicesOffered:['build decks','fences']});assert.equal(sources.length,6);
 const scope=geo.serviceAreaScope({schemaVersion:'ServiceAreaPreferencesV1',userUid:'owner',role:'business',areas:[{id:'city',type:'place',geographyType:'city',city:'Baltimore',state:'Maryland',displayName:'Baltimore City',enabled:true}]},'owner');
 assert.equal(geo.prioritizeSources(sources,scope).length,2);
 assert.equal(geo.prioritizeSources(sources,geo.serviceAreaScope({userUid:'other'},'owner')).length,0);
});
test('new source packages retain byte-identical maintained authority modules',()=>{
 for(const file of ['business_workspace.js','legal_consent.js','subscription_entitlements.js'])assert.equal(fs.readFileSync(path.join(__dirname,file),'utf8'),fs.readFileSync(path.join(__dirname,'../functions-agentic-growth/shared',file),'utf8'));
 assert.equal(fs.readFileSync(path.join(__dirname,'../functions-agentic-growth/growth_geography.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../functions-social-operations/growth_geography.js'),'utf8'));
});
const input={uid:'owner',planId:'managed_growth',now:Date.parse('2026-09-10T16:00:00Z'),profile:{businessUid:'owner',businessName:'Example Builder',servicesOffered:['decks'],website:'example.com'},scope:{status:'AVAILABLE',areas:[{label:'Example County'}]},connections:[{provider:'facebook',status:'connected_read_only',capabilities:{profile:true}}]};
test('customer plan is deterministic, tenant-bound, connected channels only and review-only',()=>{
 const a=planner.prepare(input),b=planner.prepare(input);assert.equal(a.id,b.id);assert.equal(a.record.items.length,8);
 assert.equal(a.record.status,'ready_for_review');assert.equal(a.record.approvedVersion,null);assert.equal(a.record.automationMode,'manual');
 assert.equal(a.record.strategy.approvalMode,'approval_required');
 for(const item of a.record.items){assert.equal(item.variants.length,1);assert.equal(item.variants[0].provider,'facebook');assert.ok(item.variants[0].mediaRequirement);assert.ok(item.variants[0].responseAssetRequirement);assert.ok(item.variants[0].copy.includes('Example Builder'));}
 assert.throws(()=>planner.prepare({...input,profile:{...input.profile,businessUid:'other'}}));
 assert.throws(()=>planner.prepare({...input,connections:[]}));assert.throws(()=>planner.prepare({...input,scope:{status:'UNAVAILABLE'}}));
 assert.ok(a.record.items.every(i=>i.variants.every(v=>!v.copy.includes('licensed'))));
});

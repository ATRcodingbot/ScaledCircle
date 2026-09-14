'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../functions-social-operations/index.js'),'utf8');
const start=source.indexOf('exports.runCustomerMetaPublisherV1='),end=source.indexOf('\nexports.runMetaGrowthMeasurementsV1=',start);
async function run(mode){
 const events=[],exports={};
 const db={doc:path=>({get:async()=>{events.push('cursor-read');return {data:()=>({cursor:'previous'})};},set:async value=>events.push(['cursor',value.cursor])})};
 vm.runInNewContext(source.slice(start,end),{exports,onSchedule:(_,fn)=>fn,socialOAuthEncryptionKey:{},db,
  FieldValue:{serverTimestamp:()=>1},loadMetaPublisherCredential:()=>{},process:{env:{GCLOUD_PROJECT:'scaled-circle',SOCIAL_CUSTOMER_SCHEDULING_UIDS:'existing',...(mode?{SOCIAL_CUSTOMER_ENROLLMENT_MODE:mode}:{})}},
  require:name=>{
   if(name==='./social_customer_enrollment')return {inventory:async()=>{events.push('inventory');return {uids:['paid_one','paid_two'],jobIdsByBusiness:{paid_one:['one'],paid_two:['two']}};}};
   if(name==='./social_meta_runtime')return {createPublisher:options=>{events.push(['publisher',...options.customerUids]);return {};}};
   if(name==='./social_meta_scheduler')return {run:async options=>{assert.equal(options.customerOnly,true);events.push(['run',options.businessUid]);if(options.businessUid==='paid_one')throw Error('held');return {results:[]};}};
   if(name==='./social_attention_notifications')return {record:async()=>{}};
   if(name==='firebase-functions/logger')return {warn:()=>{},info:()=>{}};
   throw Error(name);
  }});
 await exports.runCustomerMetaPublisherV1();return events;
}
test('unset or unknown enrollment mode retains the exact existing scheduler cohort without new state',async()=>{
 for(const mode of [undefined,'invalid'])assert.deepEqual(await run(mode),[['publisher','existing'],['run','existing']]);
});
test('explicit enrollment mode processes due paid inventory despite a held workspace without cursor state',async()=>{
 assert.deepEqual(await run('plan_entitled'),['inventory',['publisher','paid_one','paid_two'],['run','paid_one'],['run','paid_two']]);
});
test('selected due jobs use exact document reads and remain inspection-only without new publication',async()=>{
 const job={id:'due',businessUid:'paid',provider:'facebook',customerApproval:true,status:'approved',scheduledFor:new Date(Date.now()-1000).toISOString()};
 let inspected=0;
 const db={doc:path=>({get:async()=>({id:path.split('/').pop(),data:()=>job})}),collection:()=>{throw Error('history_scan_forbidden');}};
 const result=await require('../functions-social-operations/social_meta_scheduler').run({db,businessUid:'paid',customerOnly:true,jobIds:['due'],inspectOnly:true,
  publisher:{inspect:async()=>{inspected++;return {deploymentAllowsCreates:true,allowanceEnabled:true};},execute:async()=>{throw Error('must_not_publish');}}});
 assert.equal(inspected,1);assert.equal(result.results[0].status,'awaiting_scheduler');
});

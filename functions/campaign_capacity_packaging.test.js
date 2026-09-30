"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),parser=require('@babel/parser');
function declarations(file){const s=fs.readFileSync(file,'utf8'),map=new Map();for(const n of parser.parse(s).program.body){
 const name=n.type==='FunctionDeclaration'?n.id.name:n.expression?.left?.object?.name==='exports'?'exports.'+n.expression.left.property.name:null;
 if(name)map.set(name,s.slice(n.start,n.end).replace(/\r\n/g,'\n'));}return map;}
test('only reviewed recommendation declarations match maintained discovery source',()=>{
 const a=declarations(require.resolve('./index')),b=declarations(require.resolve('../functions-discovery/index'));
 for(const name of ['smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan','exports.getSmartZonePlan','exports.applySmartZonePlan'])assert.equal(a.get(name),b.get(name));
});
test('team authority is copied exactly; unchanged locks retain existing polygon dependency',()=>{
 for(const file of ['own_team_capacity.js','campaign_workload_authority.js']) {
  const a=fs.readFileSync(require.resolve('./'+file),'utf8');
  assert.equal(a,fs.readFileSync(require.resolve('../functions-discovery/'+file),'utf8'));
  assert.equal(a,fs.readFileSync(require.resolve('../functions-business-operations/shared/'+file),'utf8'));
 }
 const lock=require('../functions-business-operations/package-lock.json');assert.ok(lock.packages['node_modules/polygon-clipping']);
});

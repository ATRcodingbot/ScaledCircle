'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {bind,WORKSPACES,PRINCIPALS}=require('../functions-creative-media/research_pilot_authority');
test('dedicated staging identity replaces shared caller and cannot substitute identity or grant',()=>{
 const email='research-pilot-runtime@scaledcircle-staging.iam.gserviceaccount.com';
 assert.equal(bind(email,{workspace:WORKSPACES[1],operation:'metadata'}),WORKSPACES[1]);
 assert.throws(()=>bind('998249478055-compute@developer.gserviceaccount.com',{workspace:WORKSPACES[1],operation:'metadata'}),/denied/);
 for(const extra of [{grantId:'other'},{identity:email},{email}])assert.throws(()=>bind(email,{workspace:WORKSPACES[1],operation:'metadata',...extra}),/denied/);
 assert.equal(bind('1010956217112-compute@developer.gserviceaccount.com',{workspace:WORKSPACES[0],operation:'metadata'}),WORKSPACES[0]);
});
test('runtime identity fixes exact workspace; no tenant substitution or arbitrary ledger operation',()=>{for(const [email,workspace]of Object.entries(PRINCIPALS)){assert.equal(bind(email,{workspace,operation:'metadata'}),workspace);assert.throws(()=>bind(email,{workspace:WORKSPACES.find(w=>w!==workspace),operation:'metadata'}),/denied/);assert.throws(()=>bind(email,{workspace,operation:'settle',cost:0}),/denied/);}assert.throws(()=>bind('attacker@example.com',{workspace:WORKSPACES[0],operation:'metadata'}),/denied/);});
test('central endpoint exposes only fixed bounded search inputs',()=>{const email=Object.keys(PRINCIPALS)[0],workspace=WORKSPACES[0];assert.equal(bind(email,{workspace,operation:'search',attemptId:'a'.repeat(64),query:'decks Baltimore Maryland public vendor programs'}),workspace);for(const extras of [{model:'expensive'},{max_tool_calls:9},{privateCrm:'private'}])assert.throws(()=>bind(email,{workspace,operation:'search',attemptId:'a'.repeat(64),query:'decks',...extras}),/denied/);});

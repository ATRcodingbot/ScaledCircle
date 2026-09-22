'use strict';
// Reproducible isolated deployment dependencies; never deploy the shared index.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'functions');
for(const codebase of ['functions-business-operations','functions-business-email','functions-agentic-growth']) {
const target=path.join(root,codebase,'shared');
fs.mkdirSync(target,{recursive:true});const seen=new Set();
function copy(name){if(seen.has(name))return;seen.add(name);const bytes=fs.readFileSync(path.join(source,name+'.js'));fs.writeFileSync(path.join(target,name+'.js'),bytes);
 for(const [,dep] of bytes.toString().matchAll(/require\(['"]\.\/([a-z0-9_]+)['"]\)/g))copy(dep);}
if(codebase!=='functions-agentic-growth')copy('email_conversation_context');
copy('business_workspace');copy('legal_consent');copy('subscription_entitlements');
if(codebase==='functions-business-email'){copy('generation_budget');copy('lead_reply_alert');}
if(codebase!=='functions-agentic-growth')fs.copyFileSync(path.join(root,'functions-agentic-growth/internal_growth_bridge.js'),path.join(target,'internal_growth_bridge.js'));
console.log(JSON.stringify({codebase,modules:[...seen].sort()}));
}

// Package the canonical Schedule engine for the existing Email worker; do not
// maintain a second appointment writer or add service-to-service permissions.
const scheduleTarget=path.join(root,'functions-business-email','schedule_runtime');
fs.mkdirSync(scheduleTarget,{recursive:true});
for(const name of ['model','service','email_scheduling','appointment_options','proposal','authority']){
 let bytes=fs.readFileSync(path.join(root,'functions-business-operations',name+'.js'),'utf8');
 if(['authority','email_scheduling','service'].includes(name))bytes=bytes.replaceAll("require('./shared/","require('../shared/");
 fs.writeFileSync(path.join(scheduleTarget,name+'.js'),bytes);
}

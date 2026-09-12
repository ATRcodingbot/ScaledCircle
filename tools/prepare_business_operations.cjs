'use strict';
// Reproducible isolated deployment dependencies; never deploy the shared index.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'functions');
for(const codebase of ['functions-business-operations','functions-business-email','functions-agentic-growth']) {
const target=path.join(root,codebase,'shared');
fs.mkdirSync(target,{recursive:true});const seen=new Set();
function copy(name){if(seen.has(name))return;seen.add(name);const bytes=fs.readFileSync(path.join(source,name+'.js'));fs.writeFileSync(path.join(target,name+'.js'),bytes);
 for(const [,dep] of bytes.toString().matchAll(/require\(['"]\.\/([a-z0-9_]+)['"]\)/g))copy(dep);}
copy('business_workspace');copy('legal_consent');copy('subscription_entitlements');
console.log(JSON.stringify({codebase,modules:[...seen].sort()}));
}

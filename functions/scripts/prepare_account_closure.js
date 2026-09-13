'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),dest=path.join(root,'functions-account-closure');
fs.mkdirSync(dest,{recursive:true});
for(const [from,to] of [['account_closure.js','account_closure.js'],['account_closure_entry.js','index.js']])fs.copyFileSync(path.join(root,'functions',from),path.join(dest,to));
const pkg={name:'scaledcircle-account-closure',private:true,main:'index.js',engines:{node:'24'},dependencies:{'firebase-admin':'13.7.0','firebase-functions':'7.2.1'}};
fs.writeFileSync(path.join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n');
console.log('Prepared dedicated closure package; no payment exports or secrets.');

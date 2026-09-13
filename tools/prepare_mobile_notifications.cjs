'use strict';
// Copy the maintained team/seat authority; never maintain a looser push-only fork.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'functions'),target=path.join(root,'functions-mobile-notifications/shared');
fs.mkdirSync(target,{recursive:true});const seen=new Set();
function copy(name){if(seen.has(name))return;seen.add(name);if(!/^[a-z_]+\.js$/.test(name))throw Error('Unexpected authority dependency');const bytes=fs.readFileSync(path.join(source,name));fs.writeFileSync(path.join(target,name),bytes);for(const m of bytes.toString().matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g))copy(m[1].endsWith('.js')?m[1]:m[1]+'.js');}
copy('business_workspace.js');console.log('Prepared canonical notification authority dependencies: '+seen.size);

'use strict';
// Validate every static local require, including dependencies inside function bodies.
const fs=require('fs'),path=require('path');
function verify(entry){const seen=new Set();function walk(file){file=path.resolve(file);if(seen.has(file))return;seen.add(file);const source=fs.readFileSync(file,'utf8');for(const m of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){let p=path.resolve(path.dirname(file),m[1]);if(!path.extname(p))p+='.js';if(!fs.existsSync(p))throw Error('Missing packaged dependency: '+path.relative(path.dirname(entry),p));if(p.endsWith('.js'))walk(p);}}walk(entry);return seen.size;}
if(require.main===module)console.log('Verified local modules: '+verify(process.argv[2]));module.exports={verify};

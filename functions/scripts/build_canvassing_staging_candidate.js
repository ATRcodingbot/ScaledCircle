"use strict";
// Reproducible, export-limited staging package. Does not deploy or read credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const parser=require('@babel/parser'),generate=require('@babel/generator').default,traverse=require('@babel/traverse').default;
const {selectedProgram}=require('./select_function_program');
const root=path.resolve(__dirname,'../..'),sourceRoot=path.join(root,'functions');
const outRoot=path.join(root,'.firebase','canvassing-policy-candidate');
const groups={'default':['getTrackingSessionState'],'job-room-core':['getJobRoom'],'completion-authority-core':['submitZoneCompletion','finalizeZoneReview']};
const source=fs.readFileSync(path.join(sourceRoot,'index.js'),'utf8'),manifest={schemaVersion:1,environment:'scaledcircle-staging',functions:groups,files:{}};
for(const [group,names]of Object.entries(groups)){
 const destination=path.join(outRoot,group);fs.mkdirSync(destination,{recursive:true});
 const ast=parser.parse(source,{sourceType:'script',plugins:['optionalChaining']});selectedProgram(ast,new Set(names));
 const code=generate(ast,{comments:true},source).code+'\n';
 if(/defineSecret\(/.test(code))throw Error('Unexpected secret dependency in '+group);
 const files=new Map([['index.js',code]]),queue=[code];
 while(queue.length){const text=queue.shift();const tree=parser.parse(text,{sourceType:'script'});
  traverse(tree,{CallExpression(p){if(p.node.callee.type!=='Identifier'||p.node.callee.name!=='require')return;
   const arg=p.node.arguments[0];if(arg?.type!=='StringLiteral'||!arg.value.startsWith('./'))return;
   let name=arg.value.slice(2);if(!path.extname(name))name+='.js';
   if(!/^[a-zA-Z0-9_.-]+\.js$/.test(name))throw Error('Unexpected local module path');
   if(!files.has(name)){const content=fs.readFileSync(path.join(sourceRoot,name),'utf8');files.set(name,content);queue.push(content);}
  }});
 }
 const packageRoot=path.join(root,'functions-completion');
 for(const name of ['package.json','package-lock.json'])files.set(name,fs.readFileSync(path.join(packageRoot,name),'utf8'));
 // Remove stale generated files only within the verified workspace output, preserving local dependency cache.
 for(const name of fs.readdirSync(destination)){if(name==='node_modules')continue;const target=path.join(destination,name);if(fs.statSync(target).isFile()&&!files.has(name))fs.unlinkSync(target);}
 for(const [name,content]of files){fs.writeFileSync(path.join(destination,name),content);manifest.files[group+'/'+name]=crypto.createHash('sha256').update(content).digest('hex');}
}
manifest.sourceFiles={};for(const name of ['index.js','canvassing_completion.js','route_progress.js'])manifest.sourceFiles[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,name))).digest('hex');
fs.writeFileSync(path.join(outRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Built deterministic staging candidate:',Object.values(groups).flat().join(', '));

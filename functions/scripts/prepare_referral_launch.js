'use strict';
// Dedicated launch entry: never package the shared export inventory for deploy.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),dest=path.join(root,'functions-referral-launch');
fs.mkdirSync(dest,{recursive:true});
const seen=new Set();
function copy(file){
 if(seen.has(file))return;seen.add(file);
 const source=path.join(root,'functions',file),text=fs.readFileSync(source,'utf8');
 const target=path.join(dest,file==='referral_launch_entry.js'?'index.js':file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
 for(const match of text.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g)){
  const dep=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));
  copy(path.extname(dep)?dep:dep+'.js');
 }
}
copy('referral_launch_entry.js');
for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,'functions',name),path.join(dest,name));
console.log('Prepared isolated referral launch entry and '+seen.size+' maintained modules.');

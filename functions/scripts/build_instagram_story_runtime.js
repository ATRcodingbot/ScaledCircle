"use strict";
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.firebase/instagram-story-runtime');
fs.mkdirSync(path.join(out,'functions'),{recursive:true});fs.mkdirSync(path.join(out,'functions-social-operations'),{recursive:true});
for(const name of ['social_story_model','social_instagram_story_review','social_instagram_story_runtime','social_instagram_story_publisher','social_instagram_story_transport','social_instagram_story_execution_runtime'])fs.copyFileSync(path.join(root,'functions',name+'.js'),path.join(out,'functions',name+'.js'));
const seen=new Set();function copy(name){if(seen.has(name))return;seen.add(name);const bytes=fs.readFileSync(path.join(root,'functions-social-operations',name+'.js'));fs.writeFileSync(path.join(out,'functions-social-operations',name+'.js'),bytes);for(const m of bytes.toString().matchAll(/require\(["']\.\/([a-z0-9_]+)["']\)/g))copy(m[1]);}
copy('social_meta_page_credential');copy('social_oauth');
for(const n of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,'functions-social-operations',n),path.join(out,n));
fs.writeFileSync(path.join(out,'index.js'),'module.exports={...require("./functions/social_instagram_story_runtime"),...require("./functions/social_instagram_story_execution_runtime")};\n');
console.log('Built isolated Story review and execution runtime');

'use strict';
const https=require('node:https'),dns=require('node:dns').promises;
const {publicUrl}=require('./public_web_discovery');
function allowed(address){const n=address.split('.').map(Number);return n.length===4&&n.every(x=>Number.isInteger(x)&&x>=0&&x<=255)&&![0,10,127].includes(n[0])&&n[0]<224&&!(n[0]===169&&n[1]===254)&&!(n[0]===172&&n[1]>=16&&n[1]<=31)&&!(n[0]===192&&(n[1]===168||n[1]===0))&&!(n[0]===100&&n[1]>=64&&n[1]<=127)&&!(n[0]===198&&(n[1]===18||n[1]===19));}
async function read({url},resolve=dns.resolve4){
 const canonical=publicUrl(url);if(!canonical)throw Error('public_source_invalid');
 const host=new URL(canonical).hostname,addresses=await resolve(host);
 if(!addresses.length||addresses.some(a=>!allowed(a)))throw Error('public_source_private');
 // Pin the vetted DNS answer, retain TLS hostname validation, forbid redirects.
 return new Promise((done,reject)=>{const req=https.get(canonical,{lookup:(_h,_o,cb)=>cb(null,addresses[0],4),headers:{'User-Agent':'ScaledCircleResearch/1.0 (+https://scaledcircle.com/#/support)'}},res=>{
  if(res.statusCode!==200||!String(res.headers['content-type']).includes('text/html')){res.resume();reject(Error('public_source_restricted'));return;}
  const chunks=[];let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>2_000_000)req.destroy(Error('public_source_too_large'));else chunks.push(chunk);});res.on('end',()=>done(Buffer.concat(chunks).toString('utf8')));res.on('error',reject);
 });req.setTimeout(15000,()=>req.destroy(Error('public_source_timeout')));req.on('error',reject);});
}
module.exports={allowed,read};

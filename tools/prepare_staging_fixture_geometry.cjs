"use strict";
// Read an existing Google access token from stdin, never from command arguments.
// Provision only the immutable private geometry input; no campaign or financial writes.
const fs=require('node:fs');
const c=require('../functions-staging-admin/fixture_creator');
async function main(){
 const packet=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const data={projectId:c.PROJECT,version:c.GEOMETRY_VERSION,geometryHash:c.GEOMETRY_HASH,
  immutable:true,geometry:packet.geometry};
 c.validateGeometry(data);
 const token=fs.readFileSync(0,'utf8').trim();
 if(!token)throw Error('Authentication required');
 const encode=v=>typeof v==='string'?{stringValue:v}:typeof v==='number'?{doubleValue:v}:
  typeof v==='boolean'?{booleanValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:
  {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 const decode=v=>'stringValue'in v?v.stringValue:'doubleValue'in v?v.doubleValue:'integerValue'in v?Number(v.integerValue):
  'booleanValue'in v?v.booleanValue:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):
  Object.fromEntries(Object.entries(v.mapValue.fields).map(([k,x])=>[k,decode(x)]));
 const url=`https://firestore.googleapis.com/v1/projects/${c.PROJECT}/databases/(default)/documents/internalCertificationGeometry`;
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const old=await fetch(`${url}/${c.GEOMETRY_VERSION}`,{headers});
 if(old.ok){const existing=decode({mapValue:{fields:(await old.json()).fields}});c.validateGeometry(existing);
  console.log(JSON.stringify({created:false,verified:true,geometryHash:c.GEOMETRY_HASH}));return;}
 if(old.status!==404)throw Error(`Metadata read failed: ${old.status}`);
 const result=await fetch(`${url}?documentId=${c.GEOMETRY_VERSION}`,{method:'POST',headers,body:JSON.stringify(encode(data).mapValue)});
 if(!result.ok)throw Error(`Create-only metadata outcome requires inspection: ${result.status}`);
 console.log(JSON.stringify({created:true,geometryHash:c.GEOMETRY_HASH,project:c.PROJECT}));
}
main().catch(()=>{console.error('Private geometry preparation failed; inspect before retry.');process.exitCode=1;});

'use strict';
// Offline review overlays only. No build, upload, deployment or cloud call.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {nodes,normalizeAst,inventory}=require('./prepare_scale_area_promotion.cjs');
const root=path.resolve(__dirname,'..'),baseSha='f027b75',modules=new Set(['own_team_capacity.js','own_team_time_comparison.js','property_intelligence.js',
 'property_service_area_analysis.js','property_service_area_runtime.js','property_source_http.js','smart_zone_entry_contract.js',
 'smart_zone_intelligence.js','smart_zone_intelligence_runtime.js','zone_intelligence.js','zone_intelligence_runtime.js',
 'property_map_binding.js','smart_zone_connected_territory.js']);
const targets=['getSmartZonePlan','applySmartZonePlan','getCampaignZoneIntelligence','confirmCampaignZoneIntelligence','analyzePropertyIntelligence'];
function prepare(target,baseline,output){
 if(!targets.includes(target)||fs.existsSync(output))throw Error('Unexpected target or existing review output');
 const before=inventory(baseline),source=fs.readFileSync(path.join(baseline,'index.js'),'utf8'),wanted=fs.readFileSync(path.join(root,'functions/index.js'),'utf8');
 const old=cp.execFileSync('git',['show',baseSha+':functions/index.js'],{cwd:root}).toString(),a=nodes(source),b=nodes(wanted),prior=nodes(old);
 const names=target.includes('SmartZone')?['smartZoneSelectedArea','smartZoneCampaign','exports.'+target]:['exports.'+target];
 const edits=names.map(name=>{const x=a.get(name),y=b.get(name),z=prior.get(name);
  if(!x||!y||!z||normalizeAst(source.slice(x.start,x.end))!==normalizeAst(old.slice(z.start,z.end)))throw Error('Baseline declaration drift '+name);
  return {...x,text:wanted.slice(y.start,y.end)};}).sort((a,b)=>b.start-a.start);
 let result=source;for(const e of edits)result=result.slice(0,e.start)+e.text+result.slice(e.end);
 const afterNodes=nodes(result);for(const [name,n] of a)if(!names.includes(name)){
  const other=afterNodes.get(name);if(!other||result.slice(other.start,other.end)!==source.slice(n.start,n.end))throw Error('Unrelated declaration changed '+name);}
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.cpSync(baseline,output,{recursive:true,errorOnExist:true,force:false});
 fs.writeFileSync(path.join(output,'index.js'),result);const allowed=new Set(['index.js']),seen=new Set();
 function visit(name){if(seen.has(name))return;seen.add(name);const repo=path.join(root,'functions',name),live=path.join(baseline,name);
  if(!fs.existsSync(repo))throw Error('Unknown local module '+name);
  const copy=modules.has(name)||!fs.existsSync(live),bytes=fs.readFileSync(copy?repo:live);
  if(copy){fs.mkdirSync(path.dirname(path.join(output,name)),{recursive:true});fs.writeFileSync(path.join(output,name),bytes);allowed.add(name);}
  for(const m of bytes.toString().matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g))visit(path.posix.join(path.posix.dirname(name),m[1])+(/\.js$/.test(m[1])?'':'.js'));
 }
 for(const name of target==='analyzePropertyIntelligence'?['property_intelligence.js','property_service_area_analysis.js','property_service_area_runtime.js']:
  target.includes('SmartZone')?['smart_zone_intelligence.js','smart_zone_intelligence_runtime.js','smart_zone_entry_contract.js','own_team_capacity.js']:
  ['zone_intelligence_runtime.js'])visit(name);
 const after=inventory(output),changedFiles=Object.keys(after).filter(n=>after[n]!==before[n]);
 if(Object.keys(before).some(n=>!after[n])||changedFiles.some(n=>!allowed.has(n)))throw Error('Unreviewed source/configuration change');
 for(const n of ['package.json','package-lock.json','.env.scaled-circle'])if(before[n]!==after[n])throw Error('Configuration/dependency change '+n);
 for(const n of changedFiles.filter(n=>n.endsWith('.js')))cp.execFileSync(process.execPath,['--check',path.join(output,n)]);
 return {target,baseSha,changedFiles,unrelatedDeclarationsPreserved:true,configurationAndLockBytesUnchanged:true,syntaxPassed:true};
}
if(require.main===module)console.log(JSON.stringify(prepare(...process.argv.slice(2))));
module.exports={prepare,targets};

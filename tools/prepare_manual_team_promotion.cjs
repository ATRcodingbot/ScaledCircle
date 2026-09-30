'use strict';
// Narrow offline overlays onto current, generation-pinned production archives.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {nodes,normalizeAst,applyEdits,inventory}=(()=>{const m=require('./prepare_scale_area_promotion.cjs');return {...m,applyEdits:(s,edits)=>{
 let out=s,last=s.length;for(const e of edits.sort((a,b)=>b.start-a.start)){if(e.end>last)throw Error('overlap');last=e.start;out=out.slice(0,e.start)+e.text+out.slice(e.end);}return out;}};})();
const candidate='7c32bdad879ba379e19d6ea16cb9ff36076e3d20',base='fe383adef3124584b3cf8a60faf79d9862c54a7d';
const targets=['businessOperationsV1','getSmartZonePlan','applySmartZonePlan','getCampaignZoneIntelligence','confirmCampaignZoneIntelligence'];
const reviewed=file=>cp.execFileSync('git',['show',candidate+':'+file],{cwd:root,maxBuffer:20*1024*1024});
const old=file=>cp.execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:20*1024*1024});
const normalized=b=>b.toString().replace(/\r\n/g,'\n');
function prepare(target,baseline,output){
 if(!targets.includes(target)||fs.existsSync(output))throw Error('Unexpected target or existing output');
 const before=inventory(baseline);fs.cpSync(baseline,output,{recursive:true,errorOnExist:true,force:false});
 const changes=[],allowed=new Set();
 if(target==='businessOperationsV1'){
  for(const name of ['campaign_planning.js','shared/campaign_workload_authority.js','shared/own_team_capacity.js']){
   const file=path.join(baseline,name),repo='functions-business-operations/'+name;
   if(fs.existsSync(file)&&normalized(fs.readFileSync(file))!==normalized(old(repo)))throw Error('Live planner module differs from reviewed prechange '+name);
   fs.mkdirSync(path.dirname(path.join(output,name)),{recursive:true});fs.writeFileSync(path.join(output,name),reviewed(repo));allowed.add(name);
  }
 }else{
  const s=fs.readFileSync(path.join(baseline,'index.js'),'utf8'),desired=reviewed('functions/index.js').toString(),prior=old('functions/index.js').toString();
  const liveNodes=nodes(s),want=nodes(desired),expected=nodes(prior);
  const names=target.includes('SmartZone')?['smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan','exports.'+target]:['exports.'+target];
  const edits=names.map(name=>{
   const a=liveNodes.get(name),b=want.get(name),c=expected.get(name);if(!a||!b||!c)throw Error('Missing declaration '+name);
   if(normalizeAst(s.slice(a.start,a.end))!==normalizeAst(prior.slice(c.start,c.end)))throw Error('Live declaration differs from reviewed prechange '+name);
   return {start:a.start,end:a.end,text:desired.slice(b.start,b.end)};});
  const result=applyEdits(s,edits),after=nodes(result);
  for(const [name,n] of liveNodes)if(!names.includes(name)){
   const a=after.get(name);if(!a||s.slice(n.start,n.end)!==result.slice(a.start,a.end))throw Error('Unrelated declaration changed '+name);
  }
  fs.writeFileSync(path.join(output,'index.js'),result);allowed.add('index.js');changes.push(...names);
  const changedModules=new Set(['campaign_workload_authority.js','own_team_capacity.js','smart_zone_geography.js','smart_zone_intelligence.js',
   'smart_zone_intelligence_runtime.js','smart_zone_public_cache.js','smart_zone_public_cache_runtime.js','smart_zone_serviceability.js','zone_intelligence.js','zone_intelligence_runtime.js']);
  const seen=new Set();
  function visit(name){if(seen.has(name))return;seen.add(name);const repo='functions/'+name,wanted=reviewed(repo),file=path.join(baseline,name);
   if(changedModules.has(name)||!fs.existsSync(file)){
    if(fs.existsSync(file)){
     let expectedBytes;try{expectedBytes=old(repo);}catch(_){expectedBytes=null;}
     // The preview-only package predates the separately deployed confirm helper.
     const legacyRuntime=name==='zone_intelligence_runtime.js'&&normalized(fs.readFileSync(file))===normalized(expectedBytes).split('async function confirm(options)')[0]+'module.exports={preview};\n';
     if(!legacyRuntime&&(!expectedBytes||normalized(fs.readFileSync(file))!==normalized(expectedBytes)))throw Error('Live changed module differs from reviewed prechange '+name);
    }
    fs.writeFileSync(path.join(output,name),wanted);allowed.add(name);
   }else if(normalized(fs.readFileSync(file))!==normalized(wanted)){
    const preservedBrandOnly=name==='smart_zone_planning.js'&&normalized(fs.readFileSync(file)).replace('Below ScaledCircle recommended compensation','Below Scaled Circle recommended compensation')===normalized(wanted);
    const preservedLegacyEntry=name==='smart_zone_entry_contract.js'&&normalized(fs.readFileSync(file)).replace("  const hours = Number(value);\n  if (!Number.isFinite(hours) || hours < 0.5 || hours > 192) throw Error('campaign_workload_invalid');\n  return hours;","  return require('./campaign_workload_authority').hours(value);")===normalized(wanted);
    if(!preservedBrandOnly&&!preservedLegacyEntry)throw Error('Required unchanged dependency differs '+name);
   }
   for(const m of wanted.toString().matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g))visit(path.posix.join(path.posix.dirname(name),m[1])+(/\.js$/.test(m[1])?'':'.js'));
  }
  for(const name of target.includes('SmartZone')?['smart_zone_intelligence.js','smart_zone_intelligence_runtime.js','smart_zone_geography.js','smart_zone_public_cache_runtime.js','campaign_workload_authority.js','own_team_capacity.js','campaign_execution_authority.js']:['zone_intelligence_runtime.js','smart_zone_geography.js','smart_zone_public_cache_runtime.js'])visit(name);
 }
 const files=inventory(output),changedFiles=Object.keys(files).filter(name=>files[name]!==before[name]);
 if(Object.keys(before).some(name=>!files[name])||changedFiles.some(name=>!allowed.has(name)))throw Error('Unexpected file change');
 for(const preserved of ['package.json','package-lock.json','.env.scaled-circle'])if(files[preserved]!==before[preserved])throw Error('Configuration or dependency lock changed');
 return {target,candidate,files,changedFiles,declarations:changes,configurationAndLockUnchanged:true};
}
if(require.main===module){console.log(JSON.stringify(prepare(...process.argv.slice(2))));}
module.exports={prepare,targets,candidate};

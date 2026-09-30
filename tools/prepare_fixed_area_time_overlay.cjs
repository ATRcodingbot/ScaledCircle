'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {inventory}=require('./prepare_scale_area_promotion.cjs');
const root=path.resolve(__dirname,'..');
const allowed=new Set(['own_team_time_comparison.js','own_team_street_sections.js']);
const targets=['getSmartZonePlan','applySmartZonePlan','getCampaignZoneIntelligence','confirmCampaignZoneIntelligence'];
function prepare(target,baseline,output){
 if(!targets.includes(target)||fs.existsSync(output))throw Error('Unexpected target or existing output');
 const before=inventory(baseline),visited=new Set();
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.cpSync(baseline,output,{recursive:true,errorOnExist:true,force:false});
 function visit(name){if(visited.has(name))return;visited.add(name);
  const local=path.join(root,'functions',name),live=path.join(baseline,name),replace=allowed.has(name);
  if(!fs.existsSync(live)&&!replace)throw Error('Missing maintained dependency '+name);
  if(replace&&fs.existsSync(live)){
   const prior=cp.execFileSync('git',['show','3a6e9d6103e91bb2c23c69678745dd2ebf695dca:'+ 'functions/'+name],{cwd:root}).toString().replace(/\r\n/g,'\n');
   if(fs.readFileSync(live,'utf8').replace(/\r\n/g,'\n')!==prior)throw Error('Live module drift '+name);
  }
  const bytes=fs.readFileSync(replace?local:live);
  if(replace)fs.writeFileSync(path.join(output,name),bytes);
  for(const m of bytes.toString().matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g))visit(path.posix.join(path.posix.dirname(name),m[1])+(/\.js$/.test(m[1])?'':'.js'));
 }
 visit(target.includes('SmartZone')?'smart_zone_intelligence.js':'zone_intelligence_runtime.js');
 const after=inventory(output),changedFiles=Object.keys(after).filter(n=>after[n]!==before[n]);
 if(Object.keys(before).some(n=>!after[n])||changedFiles.some(n=>!allowed.has(n)))throw Error('Unexpected scope');
 for(const name of ['index.js','package.json','package-lock.json','.env.scaled-circle'])if(before[name]!==after[name])throw Error('Entry point/config changed '+name);
 for(const name of changedFiles)cp.execFileSync(process.execPath,['--check',path.join(output,name)]);
 return {target,changedFiles,unrelatedDeclarationsPreserved:true,configurationAndLockBytesUnchanged:true,syntaxPassed:true,closureChecked:[...visited]};
}
if(require.main===module)console.log(JSON.stringify(prepare(...process.argv.slice(2))));
module.exports={prepare,targets};

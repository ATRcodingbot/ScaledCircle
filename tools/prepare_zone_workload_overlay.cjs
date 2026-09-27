'use strict';
// Offline review packages only. Preserve each retained production handler and
// environment; overlay the planning guard and add only missing local helpers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const names=['quoteCampaignFunding','createCampaignFundingCheckoutSession','publishFundedCampaign','getCampaignFundingState','fundCampaign'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function prepare(){
 const retained=JSON.parse(fs.readFileSync(path.join(root,'.firebase/campaign-authority/promotion-manifest.private.json'),'utf8'));
 const output=path.join(root,'.firebase/zone-workload-review/funding');fs.mkdirSync(output,{recursive:true});
 const entries=[];
 for(const name of names){
  const baseline=retained.entries.find(e=>e.name===name);
  if(!baseline||!baseline.files)throw Error('Missing retained production package: '+name);
  const src=path.resolve(baseline.output),dest=path.join(output,name);
  for(const [file,hash]of Object.entries(baseline.files)){
   const data=fs.readFileSync(path.join(src,file));if(sha(data)!==hash)throw Error('Retained package drift: '+name+'/'+file);
   const target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
  }
  const changed={},seen=new Set();
  function copy(module,replace=false){
   if(seen.has(module))return;seen.add(module);
   const file=path.join(dest,module),exists=fs.existsSync(file);
   if(replace||!exists){const data=fs.readFileSync(path.join(root,'functions',module));
    changed[module]={before:exists?sha(fs.readFileSync(file)):null,after:sha(data)};fs.writeFileSync(file,data);}
   const text=fs.readFileSync(file,'utf8');
   for(const m of text.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g))copy(path.posix.join(path.posix.dirname(module),m[1])+(/\.js$/.test(m[1])?'':'.js'));
  }
  copy('campaign_execution_authority.js',true);copy('campaign_workload_authority.js',true);
  const authority=require(path.join(dest,'campaign_workload_authority.js'));
  const geometry=[{latitude:39,longitude:-76},{latitude:39.001,longitude:-76},{latitude:39.001,longitude:-75.999}];
  const digest=require(path.join(root,'functions/operational_layer')).zoneGeometryDigest(geometry);
  const zone={id:'fixture',businessId:'fixture',campaignId:'fixture',serviceArea:geometry,
   zoneIntelligence:{version:'ZoneIntelligenceV1',geometryDigest:digest,status:'available',workload:{minutes:30,oneScaler:true}}};
  const campaign={id:'fixture',businessId:'fixture',status:'draft',campaignWorkload:authority.requirement(5)};
  if(!authority.summary(campaign,[zone]).ready)throw Error('Retained geometry helper incompatibility: '+name);
  if(authority.summary({...campaign,campaignWorkload:authority.requirement(8)},[zone]).ready)throw Error('Missing Zone accepted');
  for(const file of ['index.js','package.json','package-lock.json','.env.scaled-circle']){
   if(baseline.files[file]&&sha(fs.readFileSync(path.join(dest,file)))!==baseline.files[file])throw Error('Protected handler/config changed');
  }
  entries.push({name,baselineArchiveSha256:baseline.archiveSha256,output:dest,changedFiles:changed,
    handlerAndConfigPreserved:true,localGuardChecks:'passed',deployed:false});
 }
 fs.writeFileSync(path.join(output,'review-manifest.private.json'),JSON.stringify({deployed:false,entries},null,2));
 return {packages:entries.length,handlersChanged:0,configurationChanged:0,localGuardChecks:'passed',deployed:false};
}
if(require.main===module)console.log(JSON.stringify(prepare()));
module.exports={prepare};

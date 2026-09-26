'use strict';
// Exact reviewed overlays onto generation-pinned live source; no cloud calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),parser=require(path.join(root,'functions/node_modules/@babel/parser'));
const APPROVED='609055095a104b602323f12a6b3353172ad297b9';
const TARGETS=['getSmartZonePlan','applySmartZonePlan','getBusinessWorkspaceContext'];
const MODULES=['smart_zone_intelligence.js','smart_zone_intelligence_runtime.js','smart_zone_geography.js',
  'smart_zone_serviceability.js','property_service_area_analysis.js','property_service_area_geometry.js',
  'property_intelligence.js','property_source_http.js'];
const PRESERVED=['business_workspace.js','workspace_access.js','subscription_entitlements.js','operational_layer.js',
  'smart_zone_planning.js','smart_zone_entry_contract.js','service_area_resolution.js'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const reviewed=file=>cp.execFileSync('git',['show',APPROVED+':'+file],{cwd:root,maxBuffer:10*1024*1024});
function nodes(source){const map=new Map();for(const node of parser.parse(source).program.body){
 let name=node.type==='FunctionDeclaration'?node.id.name:null;
 if(node.type==='VariableDeclaration'&&node.declarations.length===1&&node.declarations[0].id.type==='Identifier')name=node.declarations[0].id.name;
 if(node.type==='ExpressionStatement'&&node.expression.type==='AssignmentExpression'&&node.expression.left.object?.name==='exports')name='exports.'+node.expression.left.property.name;
 if(name){if(map.has(name)&&(['smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan','smartZoneRecommendationContext','crypto','propertyIntelligence','PROPERTY_INTELLIGENCE_CACHE_COLLECTION',...TARGETS.map(n=>'exports.'+n)].includes(name)))throw Error('Duplicate declaration '+name);map.set(name,node);}}
 return map;}
const get=(map,name)=>{if(!map.has(name))throw Error('Missing declaration '+name);return map.get(name);};
function applyEdits(source,edits){let result=source,last=source.length;for(const e of [...edits].sort((a,b)=>b.start-a.start||b.end-a.end)){
 if(e.end>last||e.end<e.start)throw Error('Overlapping overlay edits');last=e.start;result=result.slice(0,e.start)+e.text+result.slice(e.end);}
 parser.parse(result);return result;}
function patchIndex(source,maintained,target){
 if(!TARGETS.includes(target))throw Error('Unexpected target');
 const before=nodes(source),after=nodes(maintained),edits=[],changed=[];
 const replace=name=>{const a=get(before,name),b=get(after,name);edits.push({start:a.start,end:a.end,text:maintained.slice(b.start,b.end)});changed.push(name);};
 if(target==='getBusinessWorkspaceContext'){
  const old=get(before,'exports.'+target),current=get(after,'exports.'+target);
  const reviewedNode=JSON.parse(normalizeAst(maintained.slice(current.start,current.end)));
  const result=reviewedNode.program.body[0].expression.right.arguments[0].body.body.find(n=>n.type==='ReturnStatement').argument;
  const capabilities=result.properties.filter(p=>p.key?.name==='capabilities');
  if(capabilities.length!==1)throw Error('Expected one reviewed capabilities projection');
  result.properties=result.properties.filter(p=>p.key?.name!=='capabilities');
  if(JSON.stringify(reviewedNode)!==normalizeAst(source.slice(old.start,old.end)))throw Error('Live workspace projection differs beyond capabilities');
  replace('exports.'+target);
 }
 else{
  for(const name of ['smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan','exports.'+target])replace(name);
  const beforeCampaign=get(before,'smartZoneCampaign'),context=get(after,'smartZoneRecommendationContext');
  if(before.has('smartZoneRecommendationContext'))throw Error('Unexpected existing intelligence context');
  edits.push({start:beforeCampaign.start,end:beforeCampaign.start,text:maintained.slice(context.start,context.end)+'\n\n'});
  changed.push('smartZoneRecommendationContext');
  const newBindings=[];
  for(const name of ['crypto','propertyIntelligence','PROPERTY_INTELLIGENCE_CACHE_COLLECTION']){
   const desired=get(after,name),text=maintained.slice(desired.start,desired.end);
   if(before.has(name)){const old=before.get(name);if(normalizeAst(source.slice(old.start,old.end))!==normalizeAst(text))throw Error('Conflicting existing binding '+name);}
   else {newBindings.push(text);changed.push(name);}
  }
  edits.push({start:0,end:0,text:newBindings.join('\n')+'\n'});
 }
 const result=applyEdits(source,edits),resultNodes=nodes(result);
 let untouched='',cursor=0;for(const edit of [...edits].sort((a,b)=>a.start-b.start||a.end-b.end)){untouched+=source.slice(cursor,edit.start);cursor=Math.max(cursor,edit.end);}untouched+=source.slice(cursor);
 // Every unrelated existing declaration/export remains byte-identical.
 for(const [name,n] of before)if(!changed.includes(name)){
  const p=get(resultNodes,name);if(source.slice(n.start,n.end)!==result.slice(p.start,p.end))throw Error('Unrelated declaration changed '+name);}
 return {source:result,audit:{declarations:changed,unchangedDeclarations:[...before.keys()].filter(n=>!changed.includes(n)),
  untouchedSourceSha256:hash(untouched)}};
}
function normalizeAst(source){return JSON.stringify(parser.parse(source),function(key,value){return ['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key)?undefined:value;});}
function patchDependencies(manifest,lock,approvedManifest,approvedLock){
 const before=structuredClone(lock),result=structuredClone(manifest),out=structuredClone(lock),name='polygon-clipping';
 if(approvedManifest.dependencies[name]!=='0.15.7')throw Error('Approved clipping version changed');
 if(result.dependencies?.[name]&&result.dependencies[name]!==approvedManifest.dependencies[name])throw Error('Conflicting live clipping dependency');
 result.dependencies[name]=approvedManifest.dependencies[name];out.packages[''].dependencies[name]=approvedManifest.dependencies[name];
 const additions=[];
 for(const key of ['node_modules/polygon-clipping','node_modules/robust-predicates','node_modules/splaytree']){
  const wanted=approvedLock.packages[key];if(!wanted)throw Error('Reviewed lock entry missing');
  if(out.packages[key]&&JSON.stringify(out.packages[key])!==JSON.stringify(wanted))throw Error('Conflicting live dependency '+key);
  if(!out.packages[key]){out.packages[key]=wanted;additions.push(key);}
 }
 for(const [key,value] of Object.entries(before.packages))if(key&&JSON.stringify(out.packages[key])!==JSON.stringify(value))throw Error('Live dependency changed '+key);
 return {manifest:result,lock:out,audit:{addedDependency:name,version:'0.15.7',addedLockEntries:additions,
  preservedNonRootLockEntries:Object.keys(before.packages).length-1}};
}
function inventory(directory){const result={};function visit(dir,prefix=''){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 if(item.isSymbolicLink())throw Error('Source symlink is not accepted');const rel=prefix+item.name,full=path.join(dir,item.name);
 if(item.isDirectory())visit(full,rel+'/');else result[rel]=hash(fs.readFileSync(full));}}
 visit(directory);return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));}
function prepare(target,baseline,output){
 if(!TARGETS.includes(target)||fs.existsSync(output))throw Error('Choose one exact target and a new output');
 const before=inventory(baseline),maintained=reviewed('functions/index.js').toString();
 const projection=target==='getBusinessWorkspaceContext',indexFile=projection?'workspace-exports.js':'index.js';
 if(projection&&!fs.readFileSync(path.join(baseline,'index.js'),'utf8').includes("exports.getBusinessWorkspaceContext = require('./workspace-exports').getBusinessWorkspaceContext"))throw Error('Live projection entrypoint differs');
 const patched=patchIndex(fs.readFileSync(path.join(baseline,indexFile),'utf8'),maintained,target);
 fs.cpSync(baseline,output,{recursive:true,errorOnExist:true,force:false});fs.writeFileSync(path.join(output,indexFile),patched.source);
 let dependencyAudit=null;
 if(!projection){
  for(const name of PRESERVED){const old=fs.readFileSync(path.join(baseline,name),'utf8').replace(/\r\n/g,'\n'),wanted=reviewed('functions/'+name).toString().replace(/\r\n/g,'\n');
   if(old!==wanted)throw Error('Live authority/shared dependency needs review: '+name);}
  for(const name of MODULES)fs.writeFileSync(path.join(output,name),reviewed('functions/'+name));
  const dependencies=patchDependencies(JSON.parse(fs.readFileSync(path.join(baseline,'package.json'))),JSON.parse(fs.readFileSync(path.join(baseline,'package-lock.json'))),
   JSON.parse(reviewed('functions/package.json')),JSON.parse(reviewed('functions/package-lock.json')));
  fs.writeFileSync(path.join(output,'package.json'),JSON.stringify(dependencies.manifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'package-lock.json'),JSON.stringify(dependencies.lock,null,2)+'\n');dependencyAudit=dependencies.audit;
 }
 const files=inventory(output),changedFiles=Object.keys(files).filter(name=>files[name]!==before[name]).sort();
 const allowed=new Set(projection?[indexFile]:['index.js','package.json','package-lock.json',...MODULES]);
 if(Object.keys(before).some(name=>!files[name])||changedFiles.some(name=>!allowed.has(name)))throw Error('Unexpected source inventory change');
 return {files,changedFiles,audit:{...patched.audit,dependencyAudit,approvedCandidate:APPROVED,archiveEnvironmentBytesPreserved:files['.env.scaled-circle']===before['.env.scaled-circle']}};
}
if(require.main===module){const [target,baseline,output]=process.argv.slice(2);if(!baseline||!output)throw Error('Target, exact live baseline and new output required');console.log(JSON.stringify(prepare(target,baseline,output)));}
module.exports={patchIndex,patchDependencies,inventory,prepare,nodes,normalizeAst,MODULES,PRESERVED,TARGETS,APPROVED};

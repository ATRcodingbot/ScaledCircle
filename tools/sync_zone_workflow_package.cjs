// Synchronize only the reviewed Zone workflow authority and its local dependency closure.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const parser=require(path.join(root,'functions/node_modules/@babel/parser'));
const canonical=fs.readFileSync(path.join(root,'functions/index.js'),'utf8');
const names=new Set(['smartZoneCampaign','smartZonePlanArguments','exports.applySmartZonePlan','exports.confirmCampaignZoneIntelligence']);
function name(n){return n.type==='FunctionDeclaration'?n.id.name:n.type==='ExpressionStatement'&&n.expression?.left?.object?.name==='exports'?'exports.'+n.expression.left.property.name:null;}
const selected=new Map(parser.parse(canonical).program.body.filter(n=>names.has(name(n))).map(n=>[name(n),canonical.slice(n.start,n.end)]));
if(selected.size!==names.size)throw Error('Missing reviewed declaration');
const target=path.join(root,'functions-discovery/index.js');let source=fs.readFileSync(target,'utf8');
const edits=parser.parse(source).program.body.filter(n=>selected.has(name(n))).map(n=>({start:n.start,end:n.end,text:selected.get(name(n)),name:name(n)}));
for(const e of edits.sort((a,b)=>b.start-a.start)){source=source.slice(0,e.start)+e.text+source.slice(e.end);selected.delete(e.name);}
for(const text of selected.values())source+='\n'+text+'\n';
fs.writeFileSync(target,source);
function sync(destination,roots){const seen=new Set();function copy(name){if(seen.has(name))return;seen.add(name);
const text=fs.readFileSync(path.join(root,'functions',name));const file=path.join(root,destination,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);
for(const m of text.toString().matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g)){const dep=path.posix.join(path.posix.dirname(name),m[1])+(/\.js$/.test(m[1])?'':'.js');copy(dep);}}
roots.forEach(copy);process.stdout.write(destination+': '+seen.size+' reviewed dependency files synchronized\n');}
sync('functions-discovery',['smart_zone_intelligence.js','smart_zone_entry_contract.js','zone_intelligence_runtime.js']);
sync('functions-business-operations/shared',['campaign_execution_authority.js']);
sync('functions-campaign-funding',['campaign_execution_authority.js']);

// Preserve this package's established entitlement policy; only register the new factual confirmation action.
const accessFile=path.join(root,'functions-discovery/workspace_access.js');
let access=fs.readFileSync(accessFile,'utf8');
if(!access.includes("confirmCampaignZoneIntelligence:'campaigns'")) {access=access.replace(" getCampaignZoneIntelligence:'campaigns',"," confirmCampaignZoneIntelligence:'campaigns',getCampaignZoneIntelligence:'campaigns',");fs.writeFileSync(accessFile,access);}

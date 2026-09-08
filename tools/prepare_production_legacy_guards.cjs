'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {once,section}=require('./production_policy_patches.cjs');
const root=path.resolve(__dirname,'..');
const parser=require(path.join(root,'functions/node_modules/@babel/parser'));
const generate=require(path.join(root,'functions/node_modules/@babel/generator')).default;
const {selectedProgram}=require('../functions/scripts/select_function_program');
function emit(name,sha,output,guard=false) {
 const archive=path.join(root,'.firebase/nonphysical-promotion',name+'.zip');
 if(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==sha)throw Error('Deployed legacy archive changed');
 const files=JSON.parse(execFileSync('python',['-c',
  'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode() for n in z.namelist() if n.endswith(".js") and "node_modules/" not in n}))',archive],{maxBuffer:40*1024*1024}).toString());
 let source=files['index.js'].replaceAll('\r','');
 if(guard&&name==='approveZonePayout')source=section(source,name,s=>once(s,'        const campaign = campaignSnapshot.data() || {};',
   `        const campaign = campaignSnapshot.data() || {};
        if(campaign.completionPolicyVersion)throw new HttpsError('failed-precondition','Use the current Job Room evidence review for versioned compensation.');`));
 if(guard&&name==='configureZoneGroupAssignment')source=section(source,name,s=>once(s,
  '      const campaign = campaignSnapshot.data() || {};const zone = zoneSnapshot.data() || {};',
  `      const campaign = campaignSnapshot.data() || {};const zone = zoneSnapshot.data() || {};
      if(campaign.completionPolicyVersion)throw new HttpsError('failed-precondition','Assign one Scaler to each versioned canvassing zone through the accepted application.');`));
 const selected=selectedProgram(parser.parse(source),new Set([name]));
 // Nested adapters inherit the same maxInstances/region from their parent.
 // Do not alter Functions global options when a request first loads an adapter.
 if(name!=='approveZonePayout')selected.program.body=selected.program.body.filter(n=>
   !(n.type==='ExpressionStatement'&&n.expression?.callee?.name==='setGlobalOptions'));
 source=generate(selected).code;
 source=require('./production_workspace_adapter.cjs').adapt(source,name,{wrap:name!=='finalizeZoneReview',contextPath:name==='finalizeZoneReview'?'../workspace_access':'./workspace_access'});
 source=source.replace('initializeApp();',"if(!require('firebase-admin/app').getApps().length)initializeApp();");
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'index.js'),source);
 const copied=new Set();
 function deps(text) {for(const m of text.matchAll(/require\(['"]\.\/([\w./-]+)['"]\)/g)) {
   const n=m[1].replace(/\.js$/,'')+'.js';if(copied.has(n))continue;copied.add(n);
   const shared=['workspace_access.js','business_workspace.js','subscription_entitlements.js','legal_consent.js'];
   const content=shared.includes(n)?fs.readFileSync(path.join(root,'functions',n),'utf8'):files[n];
   if(!content)throw Error('Missing reviewed dependency '+n);
   fs.mkdirSync(path.dirname(path.join(output,n)),{recursive:true});fs.writeFileSync(path.join(output,n),content);deps(content);
 }}
 deps(source);
 fs.writeFileSync(path.join(output,'legacy-base-manifest.json'),JSON.stringify({name,archiveSha256:sha,
   adapters:guard?['deny_versioned_compensation','shared_admin_initialization']:['shared_admin_initialization'],files:[...copied]},null,2));
 return {name,output};
}
function prepare(){return [
 emit('finalizeZoneReview','a73d4cfeeba2f51971fe37b998984d29f52e4a1523ec6246fa6ae4aa9ab3e144',path.join(root,'.firebase/production-engineering/tracking/legacy-review')),
 emit('approveZonePayout','cb5c9d9e93649a73b2f940418368db654b5f5d4537ff9df61dfaf48010f97db9',path.join(root,'.firebase/production-engineering/tracking/legacy-payout'),true),
 emit('configureZoneGroupAssignment','455a3e463445d960124dc6d811545370b256f0783aa3c39c86b66bc11683f596',path.join(root,'.firebase/production-engineering/tracking/legacy-group'),true)
];}
if(require.main===module)console.log(JSON.stringify(prepare()));
module.exports={prepare};

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const parser=require('../functions/node_modules/@babel/parser'),traverse=require('../functions/node_modules/@babel/traverse').default;
const {nodes,normalizeAst,inventory}=require('./prepare_scale_area_promotion.cjs');
const state=path.resolve(__dirname,'../.firebase/manual-team-promotion');
const specifications=[['businessOperationsV1','packages','businessOperationsV1-package.json'],['getSmartZonePlan','packages-v2','getSmartZonePlan-package-v2.json'],['applySmartZonePlan','packages-v2','applySmartZonePlan-package-v2.json'],['getCampaignZoneIntelligence','packages-v3','getCampaignZoneIntelligence-package-v3.json'],['confirmCampaignZoneIntelligence','packages-v2','confirmCampaignZoneIntelligence-package-v2.json']];
for(const [name,folder,manifest]of specifications)test('actual '+name+' overlay preserves unrelated declarations, environment and lock and resolves all local imports',()=>{
 const base=path.join(state,'baselines',name,'base'),out=path.join(state,folder,name),proof=JSON.parse(fs.readFileSync(path.join(state,manifest)));
 assert.deepEqual(inventory(out),proof.files);
 const old=fs.readFileSync(path.join(base,'index.js'),'utf8'),s=fs.readFileSync(path.join(out,'index.js'),'utf8'),a=nodes(old),b=nodes(s);
 for(const [id,n]of a)if(!proof.declarations.includes(id)){const m=b.get(id);assert.ok(m,id);assert.equal(s.slice(m.start,m.end),old.slice(n.start,n.end),id);}
 for(const key of ['package.json','package-lock.json','.env.scaled-circle'])assert.deepEqual(fs.readFileSync(path.join(base,key)),fs.readFileSync(path.join(out,key)));
 for(const file of Object.keys(proof.files).filter(f=>f.endsWith('.js'))){const source=fs.readFileSync(path.join(out,file),'utf8');parser.parse(source);
  for(const m of source.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g)){const full=path.resolve(out,path.dirname(file),m[1]);assert.ok(fs.existsSync(full)||fs.existsSync(full+'.js'),'missing '+m[1]);}}
 if(name!=='businessOperationsV1')traverse(parser.parse(s),{ReferencedIdentifier(p){if(['getStorage','logger','crypto','smartZoneGeography','FieldValue','CENSUS_API_KEY'].includes(p.node.name))assert.ok(p.scope.getBinding(p.node.name),p.node.name);}});
});
test('profile failure is outside deployment, while live workspace projection retains authoritative profile completion',()=>{
 const live=fs.readFileSync(path.join(state,'baselines/getBusinessWorkspaceContext/base/workspace-exports.js'),'utf8'),root=fs.readFileSync(path.resolve(__dirname,'../functions/index.js'),'utf8');
 const a=nodes(live).get('exports.getBusinessWorkspaceContext'),b=nodes(root).get('exports.getBusinessWorkspaceContext');
 assert.equal(normalizeAst(live.slice(a.start,a.end)),normalizeAst(root.slice(b.start,b.end)));
 assert.match(live.slice(a.start,a.end),/profileCompletion:await service.profileCompletion/);
 assert.ok(!specifications.some(s=>s[0]==='getBusinessWorkspaceContext'));
 for(const [name,folder]of specifications)for(const file of Object.keys(inventory(path.join(state,folder,name))))assert.ok(!file.includes('functions-business-profile'));
});
test('both old and new readers decode the full replacement inventory without schema or per-blob size changes',()=>{
 const current=require('../functions/smart_zone_public_cache'),legacy=require(path.join(state,'baselines/getSmartZonePlan/base/smart_zone_public_cache.js'));
 const dir=path.resolve(__dirname,'../.firebase/manual-analysis/cache-all-buildings'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'smart-zone-public/v1/maryland/current.json')));
 assert.equal(legacy.safeMetadata(manifest),true);assert.equal(current.safeMetadata(manifest),true);
 let generic=0,roads=0,relations=0;for(const [key,ref]of Object.entries(manifest.tiles)){const bytes=fs.readFileSync(path.join(dir,current.blobPath(ref.hash)));
  const a=current.decode(bytes,ref.hash),b=legacy.decode(bytes,ref.hash);assert.deepEqual(a,b);assert.equal(a.key,key);
  for(const e of a.elements){if(e.tags?.building==='yes')generic++;if(e.tags?.highway)roads++;if(e.type==='relation'){relations++;assert.ok((e.members||[]).filter(m=>m.type==='way').every(m=>m.geometry?.length));}}
 }assert.ok(generic>1000&&roads>1000&&relations>0);
});

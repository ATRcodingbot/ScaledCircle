'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {patchIndex,patchDependencies,nodes,normalizeAst,APPROVED}=require('./prepare_scale_area_promotion.cjs');
const root=path.resolve(__dirname,'..'),maintained=cp.execFileSync('git',['show',APPROVED+':functions/index.js'],{cwd:root,encoding:'utf8'});
const live=name=>fs.readFileSync(path.join(root,'.firebase/scale-area-promotion/baselines',name,'base',name==='getBusinessWorkspaceContext'?'workspace-exports.js':'index.js'),'utf8');
function statement(source,name){const n=nodes(source).get(name);assert.ok(n,name);return source.slice(n.start,n.end);}
test('Get and Apply overlay only selected exports and helpers; live auth and other exports remain exact',()=>{
 for(const target of ['getSmartZonePlan','applySmartZonePlan']){
  const before=live(target),result=patchIndex(before,maintained,target).source;
  for(const name of ['smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan','smartZoneRecommendationContext','exports.'+target])assert.equal(statement(result,name),statement(maintained,name));
  for(const name of ['businessOperation','businessWorkspaceService','authenticatedUserContext','smartZoneSelectedArea','smartZoneAnchor',
    'exports.'+(target==='getSmartZonePlan'?'applySmartZonePlan':'getSmartZonePlan')])assert.equal(statement(result,name),statement(before,name));
  for(const name of ['crypto','propertyIntelligence','PROPERTY_INTELLIGENCE_CACHE_COLLECTION'])assert.equal(normalizeAst(statement(result,name)),normalizeAst(statement(maintained,name)));
 }
});
test('projection changes only the workspace context export, retaining sibling exports and wrapper byte-for-byte',()=>{
 const source=live('getBusinessWorkspaceContext'),result=patchIndex(source,maintained,'getBusinessWorkspaceContext').source;
 const before=nodes(source),after=nodes(result);
 for(const [name,n]of before){const m=after.get(name);if(name!=='exports.getBusinessWorkspaceContext')assert.equal(source.slice(n.start,n.end),result.slice(m.start,m.end));}
 assert.equal(statement(result,'exports.getBusinessWorkspaceContext'),statement(maintained,'exports.getBusinessWorkspaceContext'));
});
test('missing helper, duplicate identity and conflicting PI binding stop overlay preparation',()=>{
 const source=live('getSmartZonePlan');
 for(const changed of [source.replace('async function smartZoneCampaign(','async function missing('),source+'\nfunction smartZoneCampaign(){}',
  'const propertyIntelligence = require("./wrong");\n'+source])assert.throws(()=>patchIndex(changed,maintained,'getSmartZonePlan'));
 assert.throws(()=>patchIndex(source,maintained,'fundCampaign'));
});
test('dependency patch preserves every existing live record and copies only reviewed pinned additions',()=>{
 const base=path.join(root,'.firebase/scale-area-promotion/baselines/getSmartZonePlan/base');
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'package.json'))),lock=JSON.parse(fs.readFileSync(path.join(base,'package-lock.json')));
 const approvedManifest=JSON.parse(cp.execFileSync('git',['show',APPROVED+':functions/package.json'],{cwd:root})),approvedLock=JSON.parse(cp.execFileSync('git',['show',APPROVED+':functions/package-lock.json'],{cwd:root}));
 const result=patchDependencies(manifest,lock,approvedManifest,approvedLock);
 for(const [name,value]of Object.entries(lock.packages))if(name)assert.deepEqual(result.lock.packages[name],value);
 assert.deepEqual({...result.manifest,dependencies:manifest.dependencies},manifest);
 for(const key of result.audit.addedLockEntries)assert.deepEqual(result.lock.packages[key],approvedLock.packages[key]);
 assert.equal(result.manifest.dependencies['polygon-clipping'],'0.15.7');
 const bad=structuredClone(lock);bad.packages['node_modules/splaytree']={version:'invalid'};
 assert.throws(()=>patchDependencies(manifest,bad,approvedManifest,approvedLock),/Conflicting live dependency/);
});
test('overlaid real Get and Apply deny Starter/Growth/expired identities before resolver or provider',async()=>{
 const functionsRequire=require('node:module').createRequire(path.join(root,'functions/index.js'));
 const apiNames=['smartZoneAnchor','smartZoneSelectedArea','smartZoneRecommendationContext','smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan'];
 for(const target of ['getSmartZonePlan','applySmartZonePlan'])for(const planId of ['starter','growth','scale']){
  const patched=patchIndex(live(target),maintained,target).source,map=nodes(patched),code=[...apiNames,'exports.'+target].map(n=>statement(patched,n)).join('\n');
  let providers=0,resolvers=0;
  const env={exports:{},require:functionsRequire,onCall:(_o,fn)=>fn,businessOperation:(_n,fn)=>fn,stagingPhysicalQa:{reserved:()=>false},
   authenticatedUserContext:async()=>({uid:'owner',actorUid:'owner',role:'business',permissions:['campaigns','intelligence']}),
   db:{collection:name=>({doc:()=>({get:async()=>({exists:true,data:()=>name==='campaigns'?{businessId:'owner',status:'draft',executionMode:'own_team'}:
    {planId,status:'active',expiresAt:new Date(planId==='scale'?0:Date.now()+10000)}})})})},
   subscriptionEntitlements:functionsRequire('./subscription_entitlements'),HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},
   readText:v=>String(v||''),serviceAreaResolution:{resolvePlace:()=>{resolvers++;}},smartZoneGeography:{fetchSnapshot:()=>{providers++;}}};
  const api=new Function(...Object.keys(env),code+';return exports;')(...Object.values(env));
  await assert.rejects(api[target]({data:{campaignId:'campaign',desiredHours:5,areaSelection:{query:'21061',resultId:'zip'}}}),{code:'permission-denied'});
  assert.equal(providers,0);assert.equal(resolvers,0);
 }
});

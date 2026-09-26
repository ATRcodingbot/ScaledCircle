'use strict';
// Local acceptance against retained authoritative Business context + public
// responses. Never contacts a provider or writes a production record.
const fs=require('node:fs'),path=require('node:path');
const engine=require('../smart_zone_intelligence'),cache=require('../smart_zone_public_cache');
const pi=require('../property_intelligence'),service=require('../smart_zone_serviceability'),planning=require('../smart_zone_planning');
async function replay({evidenceDirectory,bundleDirectory}){
 const read=name=>JSON.parse(fs.readFileSync(path.join(evidenceDirectory,name),'utf8'));
 const {args,windows}=read('search-context.private.json'),md=read('maryland-proof.public.json'),acs=read('property-proof.public.json');
 const byDigest=new Map(windows.map(w=>{const m=md.windows.find(x=>x.windowId===w.id)?.analysis,c=acs.windows.find(x=>x.windowId===w.id)?.analysis;return [pi.geometryDigest(w.geometry),m?.source?m:c];}));
 const manifest=JSON.parse(fs.readFileSync(path.join(bundleDirectory,cache.PREFIX,'maryland/current.json'),'utf8'));
 let blobReads=0,liveCalls=0;const snapshots=[];
 const store={readManifest:async()=>manifest,readBlob:async(name,max)=>{blobReads++;const b=fs.readFileSync(path.join(bundleDirectory,name));if(b.length>max)throw Error('cache_size_limit');return b;},
   readWindow:async()=>null,reserveRefresh:async()=>{throw Error('offline_proof_must_not_refresh');}};
 const acquire=cache.createAcquirer({store,liveFetch:async()=>{liveCalls++;throw Error('live_disabled');}});
 const evidence=await engine.search(args,{loadPropertyAnalysis:async g=>byDigest.get(pi.geometryDigest(g)),fetchSnapshot:async options=>{
   const s=await acquire(options);if(s)snapshots.push(s);return s;}});
 const plans=[];for(let i=0;i<engine.MAX_ALTERNATIVES;i++){const p=engine.generate({...args,alternativeIndex:i},evidence);if(!p.zones.length)break;plans.push(p);}
 const allCandidates=evidence.candidates;
 const corkran=require('../fixtures/21061-corkran-osm-public.json'),geo=require('../smart_zone_geography');
 const corkranIds=new Set(geo.snapshotFromElements(corkran.selectedBoundary,corkran.elements).landFeatures.filter(f=>f.kind==='school').map(f=>f.id));
 const foundCorkran=new Set(snapshots.flatMap(s=>s.landFeatures).filter(f=>f.kind==='school'&&corkranIds.has(f.id)).map(f=>f.id));
 const summary={proof:'Local maintained cache replay; not live production acceptance',createdAt:new Date().toISOString(),
   snapshotAt:manifest.snapshotAt,retrievedAt:manifest.retrievedAt,importedAt:manifest.importedAt,sourceHash:manifest.sourceHash,
   sourceProvider:manifest.provider,cacheVersion:manifest.version,parserVersion:manifest.parserVersion,
   regionAreaKm2:planning.polygonAreaSquareMeters(args.selectedBoundary)/1e6,selectedWindows:evidence.selectedWindowCount,
   propertyRankedSections:evidence.propertyCandidates.map(p=>({id:p.id,fit:p.ranking.fit,source:p.ranking.evidence.source,
     confidence:p.ranking.evidence.confidence,mapValidation:p.mapValidation,mappedCandidates:p.mappedCandidateCount,supportedMinutes:p.supportedMinutes})),
   cacheReadWindows:evidence.successfulWindowCount,blobReads,liveCalls,modelCalls:0,productionWrites:0,
   mapValidatedSections:evidence.propertyCandidates.filter(p=>p.mappedCandidateCount>0).length,
   totalUsableAreas:allCandidates.length,totalMappedTargets:allCandidates.reduce((s,c)=>s+c.features.length,0),
   totalAdvisoryMinutes:allCandidates.reduce((s,c)=>s+c.workload.estimatedMinutes,0),
   totalSupportingStreetMeters:allCandidates.reduce((s,c)=>s+c.mappedRouteMeters,0),
   totalStreetSegments:allCandidates.reduce((s,c)=>s+c.networkSegments.length,0),
   corkranSchoolFootprintsFound:foundCorkran.size,schoolOverlap:allCandidates.some(c=>snapshots.some(s=>s.landFeatures.filter(f=>f.kind==='school').some(f=>service.polygonsOverlap(c.geometry,f.polygon,planning)))),
   requestedMinutes:args.desiredHours*60,plans:plans.map(p=>({primary:p.recommendationContext.propertyRecommendation.sectionId,
     zones:p.zones.length,targets:p.totalEstimatedProperties,minutes:p.totalEstimatedMinutes,
     hasAlternative:p.recommendationContext.hasAlternative,sourceSnapshots:p.targetEvidence.sourceSnapshots,
     limitations:p.recommendationContext.limitations})),diagnostics:evidence.diagnostics};
 return summary;
}
if(require.main===module){const [evidenceDirectory,bundleDirectory,output]=process.argv.slice(2);
 if(!evidenceDirectory||!bundleDirectory||!output)throw Error('Usage: node replay_smart_zone_public_cache.js EVIDENCE_DIRECTORY LOCAL_CACHE_BUNDLE OUTPUT_JSON');
 replay({evidenceDirectory,bundleDirectory}).then(summary=>{fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({mapValidatedSections:summary.mapValidatedSections,totalUsableAreas:summary.totalUsableAreas,
  targets:summary.totalMappedTargets,minutes:summary.totalAdvisoryMinutes,roadMeters:summary.totalSupportingStreetMeters,
  streetSegments:summary.totalStreetSegments,schoolOverlap:summary.schoolOverlap,cacheReadWindows:summary.cacheReadWindows,
  blobReads:summary.blobReads,liveCalls:summary.liveCalls},null,2));}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={replay};

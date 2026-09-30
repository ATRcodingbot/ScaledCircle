'use strict';
// Offline retained/public evidence comparison. No cloud reads, saves or calls.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),load=n=>require(path.join(root,'functions',n));
const pi=load('property_intelligence'),fit=load('property_service_area_analysis'),search=load('smart_zone_intelligence'),geo=load('smart_zone_geography'),areas=load('property_service_area_geometry');
const osm=load('fixtures/21061-corkran-osm-public.json'),source=load('fixtures/21061-corkran-property-points-public-20260930.json');
const records=source.records.map(r=>({...r,yearBuilt:/^\d{4}$/.test(String(r.yearBuilt))?Number(r.yearBuilt):null,
 yearBuiltBucket:pi.yearBucket(Number(r.yearBuilt)),residential:/residential/i.test(r.landUse||'')&&!/commercial|exempt/i.test(r.landUse||''),
 commercial:/commercial|office|retail|industrial/i.test(r.landUse||'')&&!/exempt|public/i.test(r.landUse||'')}));
function facts(geometry){return {...pi.analyzeParcelObservations(records,{geometry,partialCoverage:!source.complete}),
 geometryDigest:pi.geometryDigest(geometry),source:source.source,sourceVersion:'MD_ParcelPointsV1',
 sourceDates:Object.values(source.sourceMonths),dataUpdatedAt:source.sourceMonths.assessmentLinkage,retrievedAt:source.retrievedAt};}
async function run(output){
 const boundary=osm.selectedBoundary,region=areas.normalizeAreas({areas:[{geometry:boundary}]}).union,comparisons=[];
 const goals=['residential roofing','deck repair','new deck construction','concrete work','deck repairs or builds, roofing leads, cement work'];
 for(const goal of goals){
  const context={goal,services:['build decks','fences','contracting MHIC work'],excludedServices:[],priorityServices:['build decks','fences','contracting MHIC work'],campaignType:'flyer_distribution',targetIntent:'residential'};
  const input={anchor:osm.anchor,selectedBoundary:boundary,eligibleGeography:region,desiredHours:4,
   sourceAreaDigest:pi.geometryDigest(boundary),contextVersion:'offline-retained-public-review',label:'Retained Corkran public fixture',workType:'flyer_distribution',
   executionMode:'own_team',teamCapacity:{sessionHours:4,marketerCount:2,coveragePattern:'stay_together'},intelligenceContext:context};
  const evidence=await search.search(input,{loadPropertyAnalysis:async g=>facts(g),fetchSnapshot:async({selectedBoundary})=>geo.snapshotFromElements(selectedBoundary,osm.elements,{dataTimestamp:osm.dataTimestamp,fetchedAt:osm.retrievedAt})});
  const plan=search.generate(input,evidence);
  comparisons.push({goal,normalized:fit.serviceIntents(context),wholeFixtureRanking:fit.rankAnalysis(facts(boundary),context),
   sourceAreaDigest:input.sourceAreaDigest,windowCount:evidence.selectedWindowCount,
   candidates:evidence.candidates.map(c=>({id:c.id,geometry:c.geometry,features:c.features.map(f=>({latitude:f.latitude,longitude:f.longitude})),networkSegments:c.networkSegments,
    targets:c.features.length,streetMeters:c.mappedRouteMeters,knownSubsetMinutes:c.workload.estimatedMinutes,ranking:c.ranking})),
   selectedCandidateIds:plan.selectionIds,
   selectedZoneCount:plan.zones.length,mappedTargets:plan.totalEstimatedProperties,knownSubsetMinutes:plan.totalEstimatedMinutes,
   team:plan.teamCapacityAnalysis||plan.teamCapacity,propertyMatching:evidence.diagnostics.map(d=>d.propertyMatching),
   incomplete:evidence.candidates.some(c=>c.incompleteTargetInventory),planStatus:plan.recommendationStatus});
 }
 const result={scope:'Offline retained Corkran public comparison — NOT exact Ferndale boundary or production acceptance',
  source:{property:source.source,propertyRetrievedAt:source.retrievedAt,propertyMonths:source.sourceMonths,
   osmSnapshot:osm.dataTimestamp,osmRetrievedAt:osm.retrievedAt},coverage:facts(boundary).recordCoverage,comparisons};
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'service-comparison.json'),JSON.stringify(result,null,2));
 const c=comparisons.at(-1),pts=boundary,west=Math.min(...pts.map(p=>p.longitude)),east=Math.max(...pts.map(p=>p.longitude)),south=Math.min(...pts.map(p=>p.latitude)),north=Math.max(...pts.map(p=>p.latitude));
 const cosine=Math.cos((north+south)/2*Math.PI/180),scale=Math.min(760/((east-west)*cosine),480/(north-south));
 const xy=p=>`${(450+(p.longitude-(east+west)/2)*cosine*scale).toFixed(1)},${(120+(north-p.latitude)*scale).toFixed(1)}`;
 const polys=c.candidates.map((a,i)=>`<polygon points="${a.geometry.map(xy).join(' ')}" fill="${i?'#a7c4eb':'#44c7a1'}" fill-opacity=".45" stroke="#165a58" stroke-width="2"/><text x="${xy(a.geometry[0]).split(',')[0]}" y="${xy(a.geometry[0]).split(',')[1]}" fill="#103c48">Candidate ${i+1}: ${a.targets} mapped targets</text>`).join('');
 const lines=c.candidates.flatMap(a=>a.networkSegments.map(e=>`<polyline points="${xy(e.from)} ${xy(e.to)}" fill="none" stroke="#1d5469" stroke-width="2"/>`)).join('');
 const school=geo.elementFootprints(osm.elements.find(e=>String(e.id)===String(osm.schoolFeature.id))).footprints.map(f=>`<polygon points="${f.polygon.map(xy).join(' ')}" fill="#eaa7a7" stroke="#8d3535"/><text x="${xy(f.polygon[0]).split(',')[0]}" y="${xy(f.polygon[0]).split(',')[1]}">School exclusion</text>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700"><rect width="900" height="700" fill="#f6f9fc"/><g font-family="Arial" font-size="15"><text x="35" y="35" font-size="22">Retained Corkran evidence — connected-plan review</text><text x="35" y="62">Not the physical Ferndale boundary; no production acceptance claimed</text><text x="35" y="86">Two marketers × four hours, Stay together; no basemap or execution route</text><polygon points="${boundary.map(xy).join(' ')}" fill="#eaf0f5" stroke="#42576c" stroke-dasharray="7 5"/>${school}${polys}${lines}<text x="35" y="636">${c.mappedTargets??0} mapped targets; ${c.knownSubsetMinutes??0} min known subset; full workload incomplete</text><text x="35" y="665">Public OSM snapshot ${osm.dataTimestamp}; Maryland source months Feb/May 2026</text></g></svg>`;
 fs.writeFileSync(path.join(output,'retained-connected-plan.svg'),svg);
 console.log(JSON.stringify({coverage:result.coverage,goals:comparisons.map(c=>({goal:c.goal,normalized:c.normalized.requested,fit:c.wholeFixtureRanking.fit,candidates:c.candidates.map(a=>({id:a.id,fit:a.ranking.fit,targets:a.targets,propertyRecords:a.ranking.propertyRecordCoverage?.insideRecords})),selected:c.selectedCandidateIds,targets:c.mappedTargets,minutes:c.knownSubsetMinutes,incomplete:c.incomplete}))},null,2));
 return result;
}
if(require.main===module)run(path.resolve(process.argv[2]||path.join(root,'docs/review-connected-property-20260930'))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run};

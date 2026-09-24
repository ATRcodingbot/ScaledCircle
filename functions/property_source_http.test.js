'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fetchJson}=require('./property_source_http');const property=require('./property_intelligence');
const geometry=[{latitude:38.7,longitude:-76.8},{latitude:38.7,longitude:-76.79},{latitude:38.71,longitude:-76.79},{latitude:38.71,longitude:-76.8}];
const header=['NAME',...property.ACS_FIELDS,'state','county','tract','block group'];
const row=(id='1',n='10')=>['fixture',n,n,...Array(9).fill('0'),'24','033','800800',id];
const geo=id=>({properties:{GEOID:'24033800800'+id,BLKGRP:id}});
test('key stays only on Census data request; pinned geometry, dedupe, partial and true zero are distinct',async()=>{
 const urls=[];const p=new property.CensusPropertyProvider({apiKey:'fixture-key',fetchJson:async url=>{urls.push(new URL(url));return url.includes('tigerweb')?{features:[geo('1'),geo('1'),geo('2')]}:[header,row('1','0')];}});
 const out=await p.analyze({geometry});assert.equal(out.residentialStructureCount,0);assert.equal(out.partialCoverage,true);assert.equal(out.providerPagination.selectedGeographies,2);assert.equal(out.providerPagination.returnedGeographies,1);
 assert.equal(urls.length,2);assert.equal(urls[0].searchParams.has('key'),false);assert.equal(urls[1].searchParams.get('key'),'fixture-key');assert.match(urls[0].pathname,/tigerWMS_ACS2024\/MapServer\/10\/query/);
 assert.deepEqual(out.censusGeographiesUsed,['240338008001']);
});
test('missing key fails without any unauthenticated query; missing schema does not become zero',async()=>{
 let calls=0;await assert.rejects(new property.CensusPropertyProvider({fetchJson:async()=>calls++}).analyze({geometry}),/census_api_key_not_bound/);assert.equal(calls,0);
 assert.throws(()=>property.parseCensusB25034([['NAME'],['x']]),/census_schema_missing_fields/);
 assert.throws(()=>property.parseCensusB25034([header,row('1','-666666666')]),/census_count_unavailable/);
 assert.throws(()=>property.parseTigerwebBlockGroups({error:{code:400}}),/response_invalid/);
 assert.throws(()=>property.parseTigerwebBlockGroups({features:[],exceededTransferLimit:true}),/truncated/);
 assert.deepEqual(property.parseTigerwebBlockGroups({features:[]}),[]);
});
test('redirects and reflected credentials never reach diagnostics, retries or another host',async()=>{
 const events=[];let calls=0;const key='fixture-secret';
 await assert.rejects(fetchJson('https://api.census.gov/data/2024/acs/acs5?key='+key,{fetchImpl:async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('key='+key,{status:302,headers:{location:'https://api.census.gov/data/invalid_key.html?attempt='+key}});},onDiagnostic:e=>events.push(e)}),/redirect_rejected/);
 assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(events),/fixture-secret|attempt=/);assert.equal(events[0].redirectDestination,'https://api.census.gov/data/invalid_key.html');
 await assert.rejects(fetchJson('https://evil.test/?key='+key),/endpoint_not_allowed/);
});
test('HTTP challenges, HTML, malformed JSON, transport failure and oversized bodies are safe distinct failures',async()=>{
 const cases=[['access_challenge',()=>new Response('private error page',{status:403,headers:{'cf-mitigated':'challenge','content-type':'text/html'}})],['non_json',()=>new Response('<html>key=private</html>',{headers:{'content-type':'text/html'}})],['invalid_json',()=>new Response('broken key=private',{headers:{'content-type':'application/json'}})],['response_limit',()=>new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}})],['transport_failed',()=>{throw Error('url?key=private');}]];
 for(const [code,response] of cases){const events=[];await assert.rejects(fetchJson('https://api.census.gov/data/2024/acs/acs5?key=private',{fetchImpl:async()=>response(),onDiagnostic:e=>events.push(e)}),new RegExp(code));assert.doesNotMatch(JSON.stringify(events),/private/);}
 assert.deepEqual(await fetchJson('https://api.census.gov/data/2024/acs/acs5?key=fixture',{fetchImpl:async()=>new Response('[]',{headers:{'content-type':'application/json'}})}),[]);
});
test('Census geography bound prevents unlimited tract requests and preserves actual query geometry',async()=>{
 let calls=0;const p=new property.CensusPropertyProvider({apiKey:'fixture',fetchJson:async url=>{calls++;const u=new URL(url);const supplied=JSON.parse(u.searchParams.get('geometry'));assert.deepEqual(supplied,property.arcGisPolygon(geometry));return {features:Array.from({length:101},(_,i)=>({properties:{GEOID:'24'+'033'+String(i).padStart(6,'0')+'1',BLKGRP:'1'}}))};}});
 await assert.rejects(p.analyze({geometry}),/too many Census/);assert.equal(calls,1);
 assert.throws(()=>property.validateGeometry([{latitude:38,longitude:-77},{latitude:38,longitude:-75},{latitude:40,longitude:-75}]),/too large/);
});
test('campaign analysis declares the existing secret binding',()=>{
 const fs=require('fs');const source=fs.readFileSync(require.resolve('./index'),'utf8');const start=source.indexOf('exports.analyzeCampaignZone = onCall(');assert.match(source.slice(start,start+230),/secrets: \[CENSUS_API_KEY\]/);
});

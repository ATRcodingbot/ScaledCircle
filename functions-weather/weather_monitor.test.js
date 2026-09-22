'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createService}=require('./weather_monitor');
const at=Date.parse('2026-09-22T14:00:00Z');
const polygon={type:'Polygon',coordinates:[[[-77,39],[-76,39],[-76,40],[-77,40],[-77,39]]]};
function fixture(){
 let clock=at,unavailable=false;const records=new Map();let lock=Promise.resolve();
 const snap=path=>({exists:records.has(path),data:()=>structuredClone(records.get(path)),id:path.split('/').pop(),ref:ref(path)});
 function ref(path){return {path,get:async()=>snap(path),set:async(v,{merge}={})=>records.set(path,merge?{...records.get(path),...v}:v)};}
 const db={doc:ref,collection:path=>{let filters=[];const q={where:(key,op,value)=>{filters.push([key,value]);return q;},limit:()=>q,get:async()=>({docs:[...records.keys()].filter(k=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,v])=>records.get(k)?.[key]===v)).map(snap)})};return q;},runTransaction:fn=>{const work=lock.then(async()=>{const writes=[];const result=await fn({get:async r=>snap(r.path),create:(r,v)=>writes.push(['create',r.path,v]),set:(r,v)=>writes.push(['merge',r.path,v]),update:(r,v)=>writes.push(['merge',r.path,v])});for(const [kind,p,v]of writes){if(kind==='create')assert(!records.has(p));records.set(p,kind==='merge'?{...records.get(p),...v}:v);}return result;});lock=work.catch(()=>{});return work;}};
 records.set('users/owner',{role:'admin',weatherMonitoring:{version:1,emailEnabled:true,emailEnabledAt:at-1000,extraCountyIds:[],quietHours:{enabled:false},urgentOutsideQuietHours:false}});
 records.set('businessOperations/owner/settings/scheduling',{settings:{timeZone:'America/New_York'}});
 records.set('discoveryPreferences/owner',{role:'business',notifications:{weatherInMyAreas:true},areas:[{id:'a',name:'First area',geometry:polygon},{id:'b',name:'Overlap',geometry:polygon}]});
 const feature=(time=clock,kind='Alert')=>({id:'https://api.weather.gov/alerts/urn:oid:test',geometry:polygon,properties:{status:'Actual',event:'Severe Thunderstorm Warning',severity:'Severe',sent:new Date(time).toISOString(),effective:new Date(time).toISOString(),expires:new Date(time+3600000).toISOString(),messageType:kind,description:'Official fixture only',instruction:'Follow official instructions'}});
 let current=feature();
 const svc=createService({db,now:()=>clock,getOwner:async uid=>({uid,email:uid+'@example.test',emailVerified:true}),fetchImpl:async()=>{if(unavailable)throw Error('offline');return {ok:true,json:async()=>current};}});
 return {svc,records,feature,advance:()=>clock+=1000,setFeature:f=>current=f,offline:()=>unavailable=true};
}
test('baseline sends nothing; overlapping areas queue once; repeated concurrent visits remain idempotent',async()=>{
 const f=fixture();await f.svc.monitorUser('owner',[f.feature()]);assert.equal([...f.records.keys()].filter(k=>k.startsWith('outboundEmailJobs/')).length,0);
 f.advance();const next=f.feature();f.setFeature(next);await Promise.all([f.svc.monitorUser('owner',[next]),f.svc.monitorUser('owner',[next])]);
 const jobs=[...f.records].filter(([k])=>k.startsWith('outboundEmailJobs/'));assert.equal(jobs.length,1);assert.match(jobs[0][1].text,/First area/);assert.match(jobs[0][1].text,/Overlap/);
 assert.equal((await f.svc.dispatch(jobs[0][1])).state,'eligible');
 f.records.get('users/owner').weatherMonitoring.emailEnabled=false;assert.equal((await f.svc.dispatch(jobs[0][1])).reason,'weather_email_disabled');
 f.records.get('users/owner').weatherMonitoring.emailEnabled=true;f.records.get('discoveryPreferences/owner').areas=[];assert.equal((await f.svc.dispatch(jobs[0][1])).reason,'weather_area_no_longer_matches');
});
test('updates retain history; cancelled/expired status is truthful and exact alert read is tenant-bound',async()=>{
 const f=fixture();await f.svc.monitorUser('owner',[f.feature()]);f.advance();const update=f.feature(undefined,'Update');f.setFeature(update);await f.svc.monitorUser('owner',[update]);
 const job=[...f.records.values()].find(x=>x.template==='weather_alert_v2');assert(job);f.advance();const cancel=f.feature(undefined,'Cancel');f.setFeature(cancel);await f.svc.monitorUser('owner',[cancel]);assert.equal((await f.svc.dispatch(job)).reason,'weather_event_superseded');
 const rows=[...f.records].filter(([k])=>k.startsWith('weatherAlertDeliveries/'));assert.equal(rows.length,3);assert.equal(rows.at(-1)[1].event.status,'cancelled');
 await assert.rejects(f.svc.readAlert('owner','another_event'),/forbidden/);
});
test('provider outage cannot become no alerts and opt-out settings remain writable during outage',async()=>{
 const f=fixture();await f.svc.monitorUser('owner',[f.feature()]);f.offline();assert.equal((await f.svc.monitor()).status,'provider_unavailable');assert.equal(f.records.get('weatherMonitoringState/owner').status,'provider_unavailable');
 await f.svc.settings('owner',{expectedVersion:1,emailEnabled:false,extraCountyIds:['anne_arundel'],quietHours:{enabled:false},urgentOutsideQuietHours:false});assert.equal(f.records.get('users/owner').weatherMonitoring.emailEnabled,false);
 assert.equal(f.records.get('discoveryPreferences/owner').areas.length,2);
});
test('real transactional path defers quiet email, resumes once, and does not send to another tenant',async()=>{
 const f=fixture();await f.svc.monitorUser('owner',[f.feature()]);f.advance();const event=f.feature();await f.svc.monitorUser('owner',[event]);
 const [path,job]=[...f.records].find(([k])=>k.startsWith('outboundEmailJobs/'));
 // Use the same fixtures through the maintained sender, not a fabricated delivery record.
 const db={doc:p=>({path:p,get:async()=>({data:()=>f.records.get(p)}),set:async v=>f.records.set(p,{...f.records.get(p),...v})}),runTransaction:async fn=>fn({get:async r=>({data:()=>f.records.get(r.path)}),update:(r,v)=>f.records.set(r.path,{...f.records.get(r.path),...v})})};
 const email=require('../functions/transactional_email');let sent=0;
 const args={db,reference:db.doc(path),jobId:path.split('/')[1],FieldValue:{increment:n=>n,serverTimestamp:()=>at},now:()=>at+1000,getOwner:async uid=>({uid,email:uid+'@example.test',emailVerified:true}),weatherFetch:async()=>({ok:true,json:async()=>event}),smtpPassword:'fixture-only',createTransport:()=>({sendMail:async value=>{sent++;assert.match(value.text,/National Weather Service/);assert.doesNotMatch(value.text,/lead lift|potential lead/);return {messageId:'fixture-provider'};}})};
 f.records.get('users/owner').weatherMonitoring.quietHours={enabled:true,startMinute:0,endMinute:1439};
 assert.equal((await email.processDeliveryJob(args)).reason,'weather_quiet_hours');assert.equal(sent,0);assert.equal(f.records.get(path).attempts,0);
 f.records.get('users/owner').weatherMonitoring.quietHours={enabled:false};f.records.get(path).status='retry_requested';
 assert.equal((await email.processDeliveryJob(args)).status,'sent');assert.equal(sent,1);
 await email.processDeliveryJob(args);assert.equal(sent,1);
 f.records.set(path,{...job,status:'queued',to:'another@example.test'});assert.equal((await email.processDeliveryJob(args)).reason,'weather_recipient_changed');assert.equal(sent,1);
});

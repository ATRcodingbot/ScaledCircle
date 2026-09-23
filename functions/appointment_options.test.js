'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const p=require('../functions-business-operations/appointment_options');
const availability={version:2,settings:{timeZone:'America/New_York',days:[1,2,3,4,5,6,7],opensMinute:0,closesMinute:1439,durationMinutes:30,bufferMinutes:0,assignedPeople:[],locationRequired:false}};
const make=(date,items=[])=>p.options({availability,selectedDate:date,items,roster:[],assignedPeople:[],now:Date.parse('2026-01-01T00:00Z')});
test('spring gap absent and autumn ambiguous times labelled with distinct offsets',()=>{
 const spring=make('2026-03-08');assert.equal(spring.slots.some(x=>/^2:\d+ AM/.test(x.label)),false);
 const fall=make('2026-11-01');const repeated=fall.slots.filter(x=>/^1:30 AM/.test(x.label));assert.equal(repeated.length,2);assert.notEqual(repeated[0].startMs,repeated[1].startMs);assert.match(repeated[0].label,/GMT-4/);assert.match(repeated[1].label,/GMT-5/);
});
test('Business timezone determines day independently of device/UTC date',()=>{assert.equal(p.dateKey(Date.parse('2026-09-22T02:00Z'),'America/New_York'),'2026-09-21');});
test('confirmed, tentative, expired and canceled; buffers and unassigned Business capacity',()=>{
 const t=Date.parse('2026-09-22T15:00Z');const base={id:'a',title:'Busy',startMs:t,endMs:t+1800000,assignedPeople:[],status:'tentative',emailLink:{bufferMinutes:15}};
 const now=t-86400000;
 const candidate={startMs:t-600000,endMs:t,assignedPeople:['user:one']};assert.equal(p.conflicts(candidate,[base],x=>x,now).length,1);
 assert.equal(p.conflicts(candidate,[{...base,status:'canceled'}],x=>x,now).length,0);
 assert.equal(p.conflicts(candidate,[{...base,emailLink:{expiresAtMs:1}}],x=>x,now).length,0);
 const view=make('2026-09-22',[base,{...base,id:'b',startMs:t+7200000,endMs:t+9000000,status:'scheduled'},{...base,id:'c',status:'canceled'}]);
 assert.equal(view.agenda.length,2);assert.match(view.agenda[0].status,/Tentative/);assert.match(view.agenda[1].status,/Confirmed/);assert.ok(view.datesWithAppointments.includes('2026-09-22'));assert.ok(!view.slots.some(x=>x.startMs===t));
});
test('different staff can run concurrently but unassigned candidates cannot assume infinite capacity',()=>{
 const item={id:'a',startMs:100,endMs:200,assignedPeople:['user:one'],status:'scheduled'};
 assert.equal(p.conflicts({startMs:110,endMs:130,assignedPeople:['user:two']},[item]).length,0);
 assert.equal(p.conflicts({startMs:110,endMs:130,assignedPeople:[]},[item]).length,1);
});
test('editing excludes only same record, not another commitment; past slots absent',()=>{
 const start=Date.parse('2026-09-22T15:00Z'),item={id:'same',title:'Offer',startMs:start,endMs:start+1800000,assignedPeople:[],status:'tentative'};
 const result=p.options({availability,selectedDate:'2026-09-22',items:[item],roster:[],assignedPeople:[],itemId:'same',now:start-60000});assert.ok(result.slots.some(x=>x.startMs===start));assert.ok(result.slots.every(x=>x.startMs>start-60000));assert.equal(result.agenda[0].editing,true);
});

test('a preceding-day buffer blocks overlap; an elapsed tentative offer is no longer active',()=>{
 const start=Date.parse('2026-09-23T04:05Z'),prior={id:'previous',title:'Late visit',startMs:start-1800000,endMs:start-300000,assignedPeople:[],status:'scheduled',emailLink:{bufferMinutes:15}};
 assert.equal(p.conflicts({startMs:start,endMs:start+900000,assignedPeople:['user:owner']},[prior],x=>x,start-86400000).length,1);
 assert.equal(p.active({...prior,status:'tentative'},start),false);
 assert.throws(()=>p.date('2026-02-31'),/valid calendar date/);
});

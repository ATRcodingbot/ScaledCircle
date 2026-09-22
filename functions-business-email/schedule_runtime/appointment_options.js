'use strict';
const m=require('./model');
const scheduling=require('./email_scheduling');
const dayMs=86400000;
function dateKey(t,zone){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(t);}
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)m.fail('invalid-argument','Choose a valid calendar date.');return Date.parse(value+'T00:00:00Z');}
function active(x,now){return x.removedAtMs==null&&!['canceled','completed','done','expired'].includes(x.status)&&!(x.status==='tentative'&&x.endMs<=now)&&!(x.status==='tentative'&&Number.isFinite(x.emailLink?.expiresAtMs)&&x.emailLink.expiresAtMs<=now);}
// Unassigned appointments reserve Business capacity; assignment does not bypass
// an existing unassigned commitment. No new event or hold store is introduced.
function conflicts(candidate,items,resolve=x=>x,now=Date.now()){
 const selected=new Set(candidate.assignedPeople.map(resolve));
 return items.filter(x=>active(x,now)&&x.id!==candidate.id&&x.startMs-(x.emailLink?.bufferMinutes||0)*60000<candidate.endMs&&x.endMs+(x.emailLink?.bufferMinutes||0)*60000>candidate.startMs&&(!selected.size||!x.assignedPeople.length||x.assignedPeople.some(p=>selected.has(resolve(p)))))
 .map(x=>({itemId:x.id,startMs:x.startMs,endMs:x.endMs,person:x.assignedPeople.find(p=>selected.has(resolve(p)))||null}));
}
function options({availability,items,roster,selectedDate,assignedPeople,itemId,now,resolve=x=>x}){
 const s=scheduling.settings(availability.settings),today=dateKey(now,s.timeZone),day=selectedDate||today,anchor=date(day);
 const time=new Intl.DateTimeFormat('en-US',{timeZone:s.timeZone,hour:'numeric',minute:'2-digit',timeZoneName:'shortOffset'});
 const full=new Intl.DateTimeFormat('en-US',{timeZone:s.timeZone,dateStyle:'full'});
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:s.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const relevant=items.filter(x=>active(x,now)&&(!assignedPeople.length||!x.assignedPeople.length||x.assignedPeople.some(p=>assignedPeople.map(resolve).includes(resolve(p)))));
 const dates={};for(const x of relevant){for(let t=x.startMs;t<=x.endMs;t+=3600000){const k=dateKey(t,s.timeZone);dates[k]=true;}dates[dateKey(x.endMs-1,s.timeZone)]=true;}
 const slots=[];let from=null,to=null;
 // Enumerate actual instants, not guessed UTC offsets. Spring gaps never exist;
 // fall repeats are separate choices explicitly labelled with their offsets.
 for(let t=anchor-15*3600000;t<anchor+39*3600000;t+=60000){
  const p=Object.fromEntries(parts.formatToParts(t).map(x=>[x.type,x.value]));if(`${p.year}-${p.month}-${p.day}`!==day)continue;
  from??=t;to=t+60000;
  if(Number(p.minute)%5||t<=now)continue;
  const candidate={id:itemId,startMs:t,endMs:t+s.durationMinutes*60000,durationMinutes:s.durationMinutes,timeZone:s.timeZone,assignedPeople,status:'tentative',location:'availability-preview'};
  let expanded;try{expanded=scheduling.checkSlot(candidate,availability,now);}catch(_){continue;}
  if(conflicts(expanded,relevant,resolve,now).length)continue;
  slots.push({startMs:t,endMs:candidate.endMs,label:`${time.format(t)} – ${time.format(candidate.endMs)}`,summary:`${full.format(t)}, ${time.format(t)} – ${time.format(candidate.endMs)} (${s.timeZone})`});
 }
 const agenda=relevant.filter(x=>x.startMs-(x.emailLink?.bufferMinutes||0)*60000<(to||anchor)&&x.endMs+(x.emailLink?.bufferMinutes||0)*60000>(from||anchor)).map(x=>({id:x.id,title:x.title,startMs:x.startMs,endMs:x.endMs,label:`${time.format(x.startMs)} – ${time.format(x.endMs)}`,status:x.status==='tentative'?'Tentative / Awaiting customer confirmation':'Confirmed / Booked',assignedLabels:x.assignedPeople.map(p=>roster.find(r=>r.id===p)?.name||'Former team member'),bufferMinutes:x.emailLink?.bufferMinutes||0,editing:x.id===itemId})).sort((a,b)=>a.startMs-b.startMs);
 return {availability,today,selectedDate:day,datesWithAppointments:Object.keys(dates),slots,agenda,people:roster.filter(p=>p.status!=='inactive'&&(!s.assignedPeople.length||s.assignedPeople.includes(p.id)))};
}
module.exports={dateKey,date,active,conflicts,options};

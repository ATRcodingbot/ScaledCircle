'use strict';
const crypto=require('node:crypto');
const VERSION='BusinessOperationsV1';
const STAGES=Object.freeze(['new_lead','contacted','estimate_scheduled','estimate_given','won','lost','job_scheduled','in_progress','completed','follow_up']);
const TYPES=Object.freeze(['estimate','job','follow_up','meeting','task']);
const NOTIFICATIONS=Object.freeze(['assignedJobs','scheduleChanges','leadUpdates','customerReplies','estimateReminders','paymentBilling','growthApprovals','socialApprovals']);
function fail(code,message,details){const e=Error(message);e.code=code;e.details=details;throw e;}
function text(v,max=180,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail('invalid-argument','Check the required fields and text length.');return v.trim();}
function id(v){const x=text(v,128,true);if(!/^[a-zA-Z0-9_-]+$/.test(x))fail('invalid-argument','Choose a valid record.');return x;}
function strict(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('invalid-argument','This change includes unsupported fields.');}
function choice(v,values){if(!values.includes(v))fail('invalid-argument','Choose a listed status or work type.');return v;}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function normalize(v){return String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');}
function contactKeys(c){return [...new Set([c.email?`email:${normalize(c.email)}`:null,c.phone?`phone:${c.phone.replace(/\D/g,'')}`:null,`name:${normalize(c.name)}:${normalize(c.location)}`].filter(Boolean))];}
function customer(input){
 strict(input,['name','company','phone','email','location','source','stage','notes','assignedPeople']);
 const result={name:text(input.name,160,true),company:text(input.company||'',160),phone:text(input.phone||'',40),email:text(input.email||'',254).toLowerCase(),location:text(input.location||'',400),source:text(input.source||'Owner recorded',180),stage:choice(input.stage||'new_lead',STAGES),notes:text(input.notes||'',4000),assignedPeople:people(input.assignedPeople||[])};
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))fail('invalid-argument','Enter a valid email address.');
 if(result.phone&&result.phone.replace(/\D/g,'').length<7)fail('invalid-argument','Enter a complete phone number.');
 return result;
}
function people(v){if(!Array.isArray(v)||v.length>25||v.some(x=>typeof x!=='string'||!/^(user|crew):[a-zA-Z0-9_-]{1,128}$/.test(x)))fail('invalid-argument','Choose people from this workspace.');return [...new Set(v)];}
function item(input){
 strict(input,['title','type','customerId','startMs','durationMinutes','timeZone','location','assignedPeople','notes','status','linkedItemId']);
 const type=choice(input.type,TYPES),duration=input.durationMinutes;
 if(!Number.isSafeInteger(input.startMs)||input.startMs<Date.UTC(2000,0,1)||input.startMs>Date.UTC(2100,0,1)||!Number.isInteger(duration)||duration<5||duration>1440)fail('invalid-argument','Choose a valid date and a duration from 5 minutes to 24 hours.');
 const timeZone=text(input.timeZone,100,true);if(!/^UTC[+-](0\d|1[0-4]):[0-5]\d$/.test(timeZone))try{new Intl.DateTimeFormat('en-US',{timeZone}).format(new Date(input.startMs));}catch(_){fail('invalid-argument','Choose a valid time zone.');}
 return {title:text(input.title,180,true),type,customerId:input.customerId?id(input.customerId):null,startMs:input.startMs,durationMinutes:duration,endMs:input.startMs+duration*60000,timeZone,
  location:text(input.location||'',400),assignedPeople:people(input.assignedPeople||[]),notes:text(input.notes||'',4000),status:choice(input.status||(type==='task'?'open':'scheduled'),type==='task'?['open','done','canceled']:['scheduled','in_progress','completed','canceled']),linkedItemId:input.linkedItemId?id(input.linkedItemId):null};
}
function conflicts(candidate,items,resolve=x=>x){
 const assigned=new Set(candidate.assignedPeople.map(resolve));
 if(['canceled','completed','done'].includes(candidate.status)||!assigned.size)return [];
 return items.filter(x=>x.id!==candidate.id&&!['canceled','completed','done'].includes(x.status)&&x.startMs<candidate.endMs&&x.endMs>candidate.startMs)
  .flatMap(x=>x.assignedPeople.filter(p=>assigned.has(resolve(p))).map(person=>({itemId:x.id,title:x.title,person,startMs:x.startMs,endMs:x.endMs})));
}
function fieldItem(row,customer,peopleLabels){return {id:row.id,title:row.title,type:row.type,status:row.status,startMs:row.startMs,endMs:row.endMs,durationMinutes:row.durationMinutes,timeZone:row.timeZone,location:row.location,
 assignedPeople:row.assignedPeople,assignedLabels:row.assignedPeople.map(p=>peopleLabels[p]||'Team member'),customer:customer?{name:customer.name,company:customer.company||''}:null,version:row.version};}
module.exports={VERSION,STAGES,TYPES,NOTIFICATIONS,fail,text,id,strict,choice,hash,normalize,contactKeys,customer,item,people,conflicts,fieldItem};

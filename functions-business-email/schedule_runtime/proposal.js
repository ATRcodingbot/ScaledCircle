'use strict';
const m=require('./model');
// Bounded V1 command parser. Ambiguous dates/names are never guessed or executed.
function parse(prompt,offsetMinutes){
 const text=m.text(prompt,1000,true);
 if(!Number.isInteger(offsetMinutes)||Math.abs(offsetMinutes)>840)m.fail('invalid-argument','Confirm the time zone.');
 const match=text.match(/^schedule\s+(?:an?\s+)?(estimate|job|meeting|follow-up|task)\s+(?:with|for)\s+(.+?)(?:\s+in\s+(.+?))?\s+on\s+(\d{4}-\d{2}-\d{2})\s+at\s+(\d{2}:\d{2})\s*$/i);
 if(!match)return {needsDetails:true,message:'Choose the exact date, time and customer in Schedule. Nothing has been added.'};
 const instant=Date.parse(match[4]+'T'+match[5]+':00Z');
 if(!Number.isFinite(instant)||new Date(instant).toISOString().slice(0,16)!==match[4]+'T'+match[5])return {needsDetails:true,message:'Confirm a valid date and time. Nothing has been added.'};
 const type=match[1].toLowerCase().replace('-','_'),name=match[2].trim(),location=match[3]?.trim()||'';
 return {needsDetails:false,name,item:{title:m.text((type==='follow_up'?'Follow-up':type[0].toUpperCase()+type.slice(1))+' with '+name,180,true),type,location,startMs:instant-offsetMinutes*60000,durationMinutes:60,assignedPeople:[],notes:'',status:type==='task'?'open':'scheduled'},assumptions:['Duration proposed: 60 minutes. Choose the assigned people and confirm all details before saving.'],requiresApproval:true,executed:false};
}
module.exports={parse};

'use strict';
const {digest}=require('./lead_assistance_policy');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const same=(a,b)=>JSON.stringify(stable(a??null))===JSON.stringify(stable(b??null));
function review(old,next){
 const prior=old.policy,expanded=[];
 const changes=Object.keys(next).filter(k=>k!=='expiresAt'&&!same(prior[k],next[k]));
 const on=(k,label)=>{if(next[k]&&!prior[k])expanded.push(label);};
 on('newInquiriesEnabled',`Begin monitoring future ${next.mailboxMode==='inbox'?'Inbox':'selected-scope'} inquiries.`);
 if(next.newInquiriesEnabled&&prior.newInquiriesEnabled&&next.mailboxMode!=='conversations'&&!(prior.mailboxMode==='inbox'&&next.mailboxMode==='labels')&&['mailboxMode','inquiryLabel','inquiryFilterDescription'].some(k=>!same(prior[k],next[k])))expanded.push(`Change future inquiry coverage to ${next.mailboxMode==='inbox'?'Inbox':next.mailboxMode==='labels'?'label '+next.inquiryLabel:'linked conversations'}.`);
 on('introductionsEnabled',`Enable eligible introductions, up to ${next.limits.initialPerDay} per day.`);
 on('followupsEnabled',`Enable eligible follow-ups, up to ${next.limits.followupsPerContact} per contact.`);
 if(next.limits.initialPerDay>prior.limits.initialPerDay)expanded.push(`Increase the introduction cap from ${prior.limits.initialPerDay} to ${next.limits.initialPerDay} per day.`);
 if(next.limits.followupsPerContact>prior.limits.followupsPerContact||next.limits.followupIntervalHours<prior.limits.followupIntervalHours)expanded.push(`Change follow-up limits to ${next.limits.followupsPerContact} per contact, at least ${next.limits.followupIntervalHours} hours apart.`);
 if(next.sendingDays.some(d=>!prior.sendingDays.includes(d))||next.opensMinute<prior.opensMinute||next.closesMinute>prior.closesMinute||next.timeZone!==prior.timeZone)expanded.push(`Change permitted sending times: days ${next.sendingDays.join(', ')}, ${clock(next.opensMinute)}–${clock(next.closesMinute)}, ${next.timeZone}.`);
 for(const k of ['services','claims','destinations','audiences']){const added=next[k].filter(v=>!prior[k]?.includes(v));if(added.length)expanded.push(`Add ${k}: ${added.join('; ')}.`);}
 if(next.adaptiveOutreach?.enabled&&!prior.adaptiveOutreach?.enabled)expanded.push(`Enable adaptive selection of the reviewed alternatives for ${next.adaptiveOutreach.objective}.`);
 if(next.adaptiveOutreach?.enabled&&next.adaptiveOutreach.explorationEnabled&&!prior.adaptiveOutreach?.explorationEnabled)expanded.push('Permit the reviewed small comparison without extra recipients or messages.');
 if(next.bookingEnabled&&(!prior.bookingEnabled||!same(next.schedulingRules,prior.schedulingRules)))expanded.push(`Use Schedule assistance with availability version ${next.availabilityRevision}; acceptance and conflict checks remain required.`);
 if(next.modelAssistance&&!prior.modelAssistance)expanded.push('Request AI suggestions; processing remains pending separate readiness and explicit AI authorization.');
 return {changedFields:changes,expansions:expanded,changeDigest:digest(stable({baseVersion:old.version,policy:next})),existingExpiry:prior.expiresAt};
}
module.exports={review,same};

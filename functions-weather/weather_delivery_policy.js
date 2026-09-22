'use strict';
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function event(feature,now=Date.now()){
 const p=feature?.properties||{};
 if(p.status!=='Actual'||!feature.id||!p.event||['Test','Exercise'].includes(p.messageType))return null;
 const expiresAt=Date.parse(p.ends||p.expires),issuedAt=Date.parse(p.sent),effectiveAt=Date.parse(p.effective||p.sent);
 if(!Number.isFinite(expiresAt)||!Number.isFinite(issuedAt)||!Number.isFinite(effectiveAt))throw Error('weather_event_times_unavailable');
 const status=p.messageType==='Cancel'?'cancelled':expiresAt<=now?'expired':effectiveAt>now?'upcoming':'active';
 const references=(p.references||[]).map(r=>r.identifier).filter(Boolean);
 const eventId=hash(references[0]||feature.id);
 return {eventId,revision:hash([feature.id,p.sent,p.messageType,p.severity,p.areaDesc,feature.geometry,p.geocode,p.description,p.instruction]),
   providerId:feature.id,source:'National Weather Service',event:p.event,severity:p.severity||'Unknown',
   status,issuedAt,effectiveAt,expiresAt,description:String(p.description||'').slice(0,2400),
   instructions:String(p.instruction||'').slice(0,1600),officialUrl:feature.id};
}
function quietUntil(settings,timeZone,at){
 if(settings?.enabled!==true)return at;
 const {startMinute:start,endMinute:end}=settings;
 if(![start,end].every(n=>Number.isInteger(n)&&n>=0&&n<1440)||start===end)throw Error('weather_quiet_hours_invalid');
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const quiet=t=>{const parts=Object.fromEntries(fmt.formatToParts(t).map(p=>[p.type,p.value])),m=Number(parts.hour)*60+Number(parts.minute);return start<end?m>=start&&m<end:m>=start||m<end;};
 let due=at;for(let i=0;i<1560&&quiet(due);i++)due+=60000;
 if(quiet(due))throw Error('weather_quiet_hours_unresolved');return due;
}
function decision({userId,job,preferences,entitled,owner,event:current,matches,now=Date.now()}){
 if(job.businessUid!==userId||owner?.uid!==userId||owner.disabled||owner.emailVerified!==true||owner.email?.toLowerCase()!==job.to)
   return {state:'suppressed',reason:'weather_recipient_changed'};
 if(!entitled||preferences?.emailEnabled!==true)return {state:'suppressed',reason:'weather_email_disabled'};
 if(!matches?.length)return {state:'suppressed',reason:'weather_area_no_longer_matches'};
 if(!current||current.eventId!==job.eventId||current.revision!==job.eventRevision)return {state:'suppressed',reason:'weather_event_superseded'};
 if(current.status==='expired'||current.expiresAt<=now)return {state:'suppressed',reason:'weather_event_expired'};
 if(current.issuedAt<preferences.emailEnabledAt)return {state:'suppressed',reason:'weather_before_email_opt_in'};
 const urgent=preferences.urgentOutsideQuietHours===true&&['Extreme','Severe'].includes(current.severity)&&/Warning$/.test(current.event)&&current.status==='active';
 const due=urgent?now:quietUntil(preferences.quietHours,preferences.timeZone,now);
 if(due>now)return {state:'held_quiet',reason:'weather_quiet_hours',notBefore:due};
 return {state:'eligible',matches};
}
function content({event:e,matches,timeZone,url,preferencesUrl}){
 const fmt=t=>new Intl.DateTimeFormat('en-US',{timeZone,dateStyle:'medium',timeStyle:'long'}).format(t);
 return {subject:`[ScaledCircle Weather] ${e.event} — ${e.status}`,
   text:[`${e.event} — ${e.status}`,`Source: ${e.source}`,
     ...matches.map(m=>`${m.name}: ${m.reason}${m.partial?' Only part of this saved area intersects the official coverage.':''}`),
     `Issued: ${fmt(e.issuedAt)}`,`Effective: ${fmt(e.effectiveAt)}`,`Expires: ${fmt(e.expiresAt)}`,
     '',e.description,e.instructions,'',`Official alert: ${e.officialUrl}`,`Review alert: ${url}`,
     `Weather email preferences: ${preferencesUrl}`,'ScaledCircle is not your sole source of emergency warnings. Follow official instructions.'].join('\n')};
}
module.exports={event,quietUntil,decision,content,hash};

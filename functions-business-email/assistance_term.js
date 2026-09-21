'use strict';
const {TERM}=require('./inference_budget');
// Local wall time conversion rejects nonexistent/ambiguous DST times, never
// guesses an offset or uses the server/device timezone.
function localStop(value,zone){
 if(value==null||value==='')return null;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Choose a valid local stop date and time.');
 const target=value.replace('T',' '),base=Date.parse(value+'Z'),matches=[];
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(let offset=-14*60;offset<=14*60;offset+=15){const t=base+offset*60000;if(fmt.format(t)===target)matches.push(t);}
 if(matches.length!==1)throw Error('This local time is ambiguous or unavailable due to daylight saving. Choose another time.');
 return matches[0];
}
function resolveTerm(policy,shared,now){
 if(!policy||policy.termMode!=='shared_pilot')return policy;
 if(!shared||!['prepared','active'].includes(shared.status)||shared.termMs!==TERM||shared.revokedAt)return {...policy,expiresAt:null};
 const end=shared.expiresAt??(shared.status==='prepared'&&!shared.startsAt?now+TERM:null);
 const stop=localStop(policy.ownerStopLocal,policy.timeZone);
 return {...policy,expiresAt:end==null?null:Math.min(end,stop??end)};
}
module.exports={localStop,resolveTerm};

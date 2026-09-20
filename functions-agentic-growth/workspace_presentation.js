'use strict';
function zone(profile={},workspace={},operations={}){
 for(const value of [operations.timeZone,workspace.timeZone,profile.timeZone,profile.timezone,profile.businessHours?.timeZone]){
  try{if(typeof value==='string'&&new Intl.DateTimeFormat('en-US',{timeZone:value}).format(0))return value;}catch(_){}
 }
 return null;
}
function present(data,{profile={},workspace={},operations={}}={}){
 const timeZone=zone(profile,workspace,operations),labels={};
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:timeZone||'UTC',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 function visit(value,key,depth=0){
  if(depth>8||value==null)return;
  if(/(?:At|After|Until)$/.test(key)){
   const raw=typeof value==='number'?value:typeof value==='string'?Date.parse(value):value?.toMillis?.()??(Number.isFinite(value?._seconds)?value._seconds*1000:NaN);
   if(Number.isFinite(raw)){const d=new Date(raw);labels[d.toISOString()]=fmt.format(d)+(timeZone?'':' · UTC fallback — set your workspace timezone');return;}
  }
  if(Array.isArray(value))for(const v of value)visit(v,'',depth+1);
  else if(typeof value==='object')for(const [k,v] of Object.entries(value))visit(v,k,depth+1);
 }
 visit(data,'');
 return {...data,workspaceTimeZone:timeZone,timeLabels:labels,workspaceTimeZoneSource:timeZone?'maintained_workspace_settings':'not_set'};
}
module.exports={zone,present};

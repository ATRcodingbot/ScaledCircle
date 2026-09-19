'use strict';
// Read-only presentation. Publication authority and immutable job bindings remain unchanged.
const iso=v=>{const d=v?.toDate?v.toDate():new Date(v);return v!=null&&Number.isFinite(d.getTime())?d.toISOString():null;};
function state(job){
 if(job.providerPostId||job.providerMediaId)return 'published';
 if(job.status==='canceled')return 'canceled';
 if(['publishing','executing','running'].includes(job.status))return 'publishing';
 if(['failed','unknown_outcome','hold','reconciliation_required','blocked'].includes(job.status))return 'needs_attention';
 if(['approved','scheduled','queued'].includes(job.status)&&iso(job.scheduledFor))return 'scheduled';
 return job.status||'draft';
}
function text(raw,fallback='Social strategy'){
 const value=String(raw||'').trim();
 return /INITIAL_EXPERIMENT|confidence score|generation provenance|automated workflow/i.test(value)?fallback:value||fallback;
}
function zone(context={}){
 const candidate=context.timeZone;
 try {if(candidate){new Intl.DateTimeFormat('en',{timeZone:candidate}).format();return candidate;}}catch{}
 return 'UTC'; // Explicit fallback; never infer geography or use the device zone.
}
function timeLabel(value,timeZone){const date=iso(value);return date?new Intl.DateTimeFormat('en-US',{timeZone:zone({timeZone}),month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(date))+' · '+zone({timeZone}):null;}
function creativeLabel({origin,format,mediaRequirement,newCreative=false}){
 if(mediaRequirement==='none')return 'Text-only recommendation';
 if(newCreative)return 'New creative';
 if(origin==='generated_service_concept')return 'Generated graphic';
 if(['business_photo','real_business_photo'].includes(format))return 'Real business photo';
 if(['branded_graphic','graphic'].includes(format))return 'Branded graphic';
 return 'Business asset'; // Ownership alone is not photographic provenance.
}
function project({uid,jobs=[],plans=[],timeZone='UTC',channels=['facebook','instagram']}={}){
 const rows=[],seen=new Set(),published=new Set();
 for(const job of jobs){
  if(uid&&(job.businessUid||job.owner)!==uid)continue;
  if(!channels.includes(job.provider))continue;
  const publicationId=job.providerPostId||job.providerMediaId;
  if(publicationId){const pk=job.provider+':'+publicationId;if(published.has(pk))continue;published.add(pk);}
  const key=job.canonicalKey||job.id;if(!key||seen.has(key))continue;seen.add(key);
  const itemId=job.versionId?.replace(/_v\d+$/,'');
  const p=plans.find(p=>(p.items||[]).some(i=>p.id+'_'+i.itemKey===itemId));
  const item=p?.items.find(i=>p.id+'_'+i.itemKey===itemId);
  const v=item?.variants?.find(v=>v.provider===job.provider);
  const binding=job.binding?.variants?.find(v=>v.provider===job.provider)||{};
  const lifecycle=state(job),postZone=job.timeZone||timeZone;
  if(!['scheduled','publishing','published','needs_attention','canceled','paused'].includes(lifecycle))continue;
  rows.push({...v?.scheduling,itemId:itemId||key,provider:job.provider,jobId:job.id,canonicalKey:key,
   title:text(item?.pillar,'Social post'),strategyTitle:text(p?.goal),publicationStatus:lifecycle,
   scheduledFor:iso(job.scheduledFor),scheduledForLabel:timeLabel(job.scheduledFor,postZone),timeZone:postZone,
   reviewedPost:{...v?.scheduling?.reviewedPost,variant:{...binding},scheduledFor:iso(job.scheduledFor)},
   // Historical immutable jobs must not be rebound to the latest editable revision.
   historyOnly:!v||v.scheduling?.jobId!==job.id});
 }
 for(const p of plans)for(const i of p.items||[])for(const v of i.variants||[]){
  if(uid&&p.businessUid!==uid)continue;
  if(!channels.includes(v.provider))continue;
  const itemId=p.id+'_'+i.itemKey;
  if(rows.some(r=>r.itemId===itemId&&r.provider===v.provider&&r.publicationStatus!=='canceled'))continue;
  const s=v.scheduling||{};
  rows.push({...s,itemId,provider:v.provider,title:text(i.pillar,'Social post'),strategyTitle:text(p.goal),
   publicationStatus:s.publicationStatus||null,scheduledFor:s.scheduledFor||v.scheduledFor||i.scheduledFor,
   scheduledForLabel:timeLabel(s.scheduledFor||v.scheduledFor||i.scheduledFor,timeZone),timeZone});
 }
 const counters={scheduled:0,publishing:0,published:0,needsAttention:0};
 for(const row of rows){
  if(row.publicationStatus){
   if(['scheduled','publishing','published'].includes(row.publicationStatus))counters[row.publicationStatus]++;
   else if(row.publicationStatus==='needs_attention')counters.needsAttention++;
  }else if(row.automaticMode){
   if(row.automaticState==='needs_attention')counters.needsAttention++;
  }else if(row.preparationError||(row.reviewState==='needs_attention'||row.ready===false)&&!row.preparing&&row.reviewState!=='preparing_creative')counters.needsAttention++;
 }

 return {posts:rows,counters,timeZone:zone({timeZone})};
}
module.exports={state,text,zone,timeLabel,creativeLabel,project};

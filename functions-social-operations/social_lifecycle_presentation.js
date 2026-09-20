'use strict';
// Read-only presentation. Publication authority and immutable job bindings remain unchanged.
const iso=v=>{const d=v?.toDate?v.toDate():new Date(v);return v!=null&&Number.isFinite(d.getTime())?d.toISOString():null;};
function state(job,now=Date.now()){
 if(job.providerPostId||job.providerMediaId)return 'published';
 if(job.status==='canceled')return 'canceled';
 if(job.status==='published')return 'needs_attention'; // Confirmation ID/receipt must back publication history.
 if(['publishing','executing','running'].includes(job.status))return 'publishing';
 if(['failed','unknown_outcome','hold','reconciliation_required','blocked','authority_review_required','needs_attention'].includes(job.status))return 'needs_attention';
 if(['approved','scheduled','queued'].includes(job.status)&&iso(job.scheduledFor)) {
  const due=Date.parse(iso(job.scheduledFor));
  if(due>now)return 'scheduled';
  return now-due<=15*60000?'publishing':'needs_attention';
 }
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
function project({uid,jobs=[],plans=[],timeZone='UTC',channels=['facebook','instagram'],now=Date.now(),automaticPublishing=null}={}){
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
  const lifecycle=state(job,now),postZone=job.timeZone||timeZone;
  const overdue=iso(job.scheduledFor)&&Date.parse(iso(job.scheduledFor))<now-15*60000;
  const uncertain=job.sendStarted===true||['unknown_outcome','reconciliation_required','publishing','executing','running'].includes(job.executionStatus||job.status);
  const explanation=lifecycle==='needs_attention'?(uncertain?'Awaiting publication confirmation. Resolve the existing attempt before retrying.':overdue?'Missed scheduled time. No confirmed publication is recorded; review the saved execution before rescheduling.':'This publication needs review of its saved execution.'):lifecycle==='publishing'?(uncertain?'Awaiting publication confirmation.':'Scheduled time reached; awaiting processing within the normal grace period.'):null;
  if(!['scheduled','publishing','published','needs_attention','canceled','paused'].includes(lifecycle))continue;
  rows.push({...v?.scheduling,itemId:itemId||key,provider:job.provider,jobId:job.id,canonicalKey:key,
   title:text(job.binding?.pillar||item?.pillar,'Social post'),strategyTitle:text(p?.goal),publicationStatus:lifecycle,
   lifecycleMessage:explanation,automaticReasons:explanation?[{code:'execution_state',message:explanation}]:[],
   authorizationScope:job.managedPolicyId&&job.managedPolicyId===automaticPublishing?.id?'Current automatic strategy':'Historical / individually authorized',
   publishedAt:lifecycle==='published'?iso(job.publishedAt||job.completedAt):null,
   publishedAtLabel:lifecycle==='published'?timeLabel(job.publishedAt||job.completedAt,postZone):null,
   providerPermalink:typeof job.providerPermalink==='string'&&/^https:\/\//.test(job.providerPermalink)?job.providerPermalink:null,
   scheduledFor:iso(job.scheduledFor),scheduledForLabel:timeLabel(job.scheduledFor,postZone),timeZone:postZone,
   historyMediaUrl:job.historyMediaUrl||null,
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

 rows.sort((a,b)=>a.publicationStatus==='published'&&b.publicationStatus==='published'?(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0):(Date.parse(a.scheduledFor)||Infinity)-(Date.parse(b.scheduledFor)||Infinity));
 return {posts:rows,counters,timeZone:zone({timeZone}),countScope:'All saved execution history for the displayed channels; current strategy is identified separately.'};
}
module.exports={state,text,zone,timeLabel,creativeLabel,project};

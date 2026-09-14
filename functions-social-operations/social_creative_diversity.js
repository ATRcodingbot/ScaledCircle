'use strict';
// Recommendations only. Publication and asset approval retain their own authority.
const crypto=require('node:crypto');
const POLICY='SocialCreativeDiversityV1';
const key=r=>`${r.itemId}:${r.provider}`;
const millis=v=>v?.toMillis?v.toMillis():typeof v==='number'?v:Date.parse(v);
const words=v=>new Set(String(v||'').toLowerCase().replace(/service concept image[^\n]*/g,'').match(/[a-z]{4,}/g)||[]);
function similarity(a,b){const x=words(a),y=words(b);return [...x].filter(w=>y.has(w)).length/Math.max(1,new Set([...x,...y]).size);}
function topicMatch(text,service){return [...words(service)].filter(w=>!['build','install','service','services'].includes(w)).some(w=>String(text).toLowerCase().includes(w.replace(/s$/,'')));}
function intentionalText(row){
 const objective=`${row.goal} ${row.pillar}`.toLowerCase();
 return row.provider==='facebook'&&(row.mediaRequirement==='none'||row.copy.length<1100&&
  /conversation|question|expectation|reminder|tip|service area/.test(objective));
}
function mediaHistory(rows){
 const unique=new Map();
 for(const r of rows){if(!r.media?.sourceSha256&&!r.media?.assetId)continue;
  const id=key(r);if(!unique.has(id)||r.version>unique.get(id).version)unique.set(id,r);
 }
 return [...unique.values()];
}
function assetHistory(asset,rows){
 const uses=mediaHistory(rows).filter(r=>r.media?.assetId===asset.id||r.media?.sourceSha256===asset.revision?.contentHash);
 const published=uses.filter(r=>r.status==='published'),scheduled=uses.filter(r=>r.status&&r.status!=='published');
 const last=published.map(r=>millis(r.scheduledFor)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
 return {timesUsed:published.length,scheduledUses:scheduled.length,plannedUses:uses.filter(r=>!r.status).length,
  lastUsed:last?new Date(last).toISOString():null,platforms:[...new Set(uses.map(r=>r.provider))],
  overused:uses.length>2,service:asset.revision?.serviceLabel||null,
  origin:asset.revision?.origin==='generated_service_concept'?'Service concept image':'Real Business photo'};
}
function planCreativeMix({uid,rows,assets,services=[]}){
 const {assertSource}=require('./social_customer_media');
 const usable=assets.filter(a=>{try{assertSource({uid,asset:a,revision:a.revision,assetId:a.id,revisionId:a.approvedRevisionId});
  return !/\b(logo|icon|internal qa|test image)\b/i.test(`${a.title} ${a.revision.altText}`)&&a.purpose!=='logo';}catch{return false;}});
 const frozen=mediaHistory(rows.filter(r=>r.status)),decisions={},selected=[];
 const sorted=[...rows].sort((a,b)=>(millis(a.scheduledFor)-millis(b.scheduledFor))||a.itemId.localeCompare(b.itemId)||a.provider.localeCompare(b.provider));
 const ideas=[...new Set(sorted.map(r=>r.itemId))];
 const reservedGenerationIds=new Set(ideas.map(id=>{const request='social_mix_'+crypto.createHash('sha256').update(uid+':'+id+':'+POLICY).digest('hex');
   return 'visual_job_'+crypto.createHash('sha256').update(uid+'\n'+request).digest('hex').slice(0,40);}));
 for(const row of sorted){
  if(row.status)continue;
  const ordinal=ideas.indexOf(row.itemId),relevant=services.filter(s=>topicMatch(row.copy+' '+row.goal,s));
  const service=(relevant.length===1?relevant[0]:services[ordinal%Math.max(1,services.length)])||null;
  const base={policy:POLICY,service,objective:row.goal||row.pillar,topic:row.pillar,initialCandidateLimit:1,
   evidence:'Initial creative mix; performance has not established a preferred format.'};
  const requestId='social_mix_'+crypto.createHash('sha256').update(uid+':'+row.itemId+':'+POLICY).digest('hex');
  const jobId='visual_job_'+crypto.createHash('sha256').update(uid+'\n'+requestId).digest('hex').slice(0,40);
  if(intentionalText(row)){decisions[key(row)]={...base,format:'text',label:'Text-only Facebook post',
   reason:'This short question or expectation-setting post invites a clear conversation without a decorative image.'};continue;}
  const pair=selected.find(r=>r.itemId===row.itemId&&r.provider!==row.provider&&similarity(r.copy,row.copy)>=.65);
  if(pair){decisions[key(row)]={...pair.decision,reason:'The same idea uses one source concept with a separate composition for this platform.'};
   selected.push({...row,decision:decisions[key(row)]});continue;}
  const ownCandidate=usable.find(a=>a.revision.generationJobId===jobId);
  if(ownCandidate){decisions[key(row)]={...base,format:'generated',label:'New service concept',
    reason:'This new concept was prepared for this idea and approved as a Business asset. The post still needs your exact approval.',
    requestId,assetId:ownCandidate.id,revisionId:ownCandidate.approvedRevisionId,sourceHash:ownCandidate.revision.contentHash};
    selected.push({...row,decision:decisions[key(row)]});continue;}
  const candidates=usable.map(a=>{
   // A concept commissioned for another idea is not a generic spare asset.
   if(reservedGenerationIds.has(a.revision.generationJobId))return null;
   const description=`${a.title} ${a.revision.altText} ${a.revision.serviceLabel}`;
   if(service&&!topicMatch(description,service))return null;
   const prior=[...frozen,...selected.filter(r=>r.decision.assetId).map(r=>({...r,media:{assetId:r.decision.assetId,sourceSha256:r.decision.sourceHash}}))];
   const used=prior.filter(r=>(r.media?.assetId===a.id||r.media?.sourceSha256===a.revision.contentHash)&&r.itemId!==row.itemId&&
     Math.abs(millis(row.scheduledFor)-millis(r.scheduledFor))<=30*86400000);
   if(used.length)return null;
   return {a,real:a.revision.origin!=='generated_service_concept',score:similarity(description,row.copy+' '+row.goal)};
  }).filter(Boolean).sort((a,b)=>Number(b.real)-Number(a.real)||b.score-a.score||a.a.id.localeCompare(b.a.id));
  const asset=candidates[0]?.a;
  const decision=asset?{...base,format:asset.revision.origin==='generated_service_concept'?'approved_asset':'business_photo',
   label:asset.revision.origin==='generated_service_concept'?'Reusable approved service concept':'Real Business photo',
   reason:asset.revision.origin==='generated_service_concept'?'This approved concept fits the topic and has no competing use in this 30-day window.':'This approved Business photo fits the topic and gives the post authentic project context.',
   assetId:asset.id,revisionId:asset.approvedRevisionId,sourceHash:asset.revision.contentHash}:
   {...base,format:'generated',label:'New service concept',reason:service?
    `A fresh ${service} concept keeps this idea distinct from recently used creative.`:'Choose an approved service before preparing a new concept.',
    requestId,
    visualDirection:['clean','practical','modern','friendly','premium'][ordinal%5]};
  decisions[key(row)]=decision;selected.push({...row,decision});
 }
 return {policy:POLICY,decisions,assets:assets.map(a=>({assetId:a.id,...assetHistory(a,rows)})),
  learning:{recommendation:'hold',reason:'Compare format results only after compatible, attributed publication measurements exist.'}};
}
async function readCreativeContext(db,uid){
 const [items,jobs,library,brand]=await Promise.all([
  db.collection('socialContentItems').where('businessUid','==',uid).limit(101).get(),
  db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101).get(),
  db.collection(`businessMediaLibraries/${uid}/mediaAssets`).limit(51).get(),db.doc('businessBrandProfiles/'+uid).get()]);
 if(items.size>100||jobs.size>100||library.size>50)throw Error('Creative history needs review before automatic preparation.');
 const jobRows=jobs.docs.map(d=>d.data()).filter(j=>j.status!=='canceled'),rows=[];
 for(const item of items.docs)for(const provider of ['facebook','instagram']){
  const version=item.data().platformVersions?.[provider]??item.data().currentVersion;
  const record=(await db.doc(`socialContentVersions/${item.id}_v${version}`).get()).data();
  if(record?.businessUid!==uid)continue;const variant=record.variants?.find(v=>v.provider===provider);if(!variant)continue;
  const media=variant.mediaRevisionId?(await db.doc(`socialMediaLibraries/${uid}/items/${variant.mediaRevisionId}`).get()).data():null;
  const job=jobRows.find(j=>j.provider===provider&&j.versionId?.startsWith(item.id+'_v'));
  rows.push({itemId:item.id,provider,version,copy:variant.copy,mediaRequirement:variant.mediaRequirement,goal:record.goal,pillar:record.pillar,scheduledFor:record.scheduledFor,media,status:job?.status||null});
 }
 const assets=await Promise.all(library.docs.map(async d=>{const a=d.data();return {id:d.id,...a,revision:a.approvedRevisionId?(await d.ref.collection('revisions').doc(a.approvedRevisionId).get()).data():null};}));
 return {uid,rows,assets,services:brand.data()?.approvedServiceCategories||[]};
}
const leaseId=(uid,input)=>crypto.createHash('sha256').update(uid+':'+input.itemId+':'+input.provider).digest('hex');
function presentation(record){const r=record?.recommendation;if(r?.policy!==POLICY)return null;
 return {policy:POLICY,label:r.label,format:r.format,reason:r.reason,service:r.service,evidence:r.evidence,
  state:record.state,generationStatus:record.generationStatus||null};}
module.exports={POLICY,key,similarity,intentionalText,planCreativeMix,readCreativeContext,leaseId,presentation,assetHistory};

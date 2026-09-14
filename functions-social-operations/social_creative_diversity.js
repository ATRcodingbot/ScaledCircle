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
  const id=r.historyJobId||key(r);if(!unique.has(id)||r.version>unique.get(id).version)unique.set(id,r);
 }
 return [...unique.values()];
}
function assetHistory(asset,rows){
 const uses=mediaHistory(rows).filter(r=>r.media?.assetId===asset.id||r.media?.sourceSha256===asset.revision?.contentHash);
 const published=uses.filter(r=>r.status==='published'),scheduled=uses.filter(r=>r.status&&r.status!=='published');
 const last=uses.filter(r=>r.status).map(r=>millis(r.publishedAt||r.scheduledFor)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
 return {timesUsed:published.length,scheduledUses:scheduled.length,plannedUses:uses.filter(r=>!r.status).length,
  lastUsed:last?new Date(last).toISOString():null,platforms:[...new Set(uses.map(r=>r.provider))],
  recentUses:uses.filter(r=>r.status).length, recentIdeas:[...new Set(uses.map(r=>r.itemId))], lastPlatform:uses.filter(r=>r.status).sort((a,b)=>millis(b.publishedAt||b.scheduledFor)-millis(a.publishedAt||a.scheduledFor))[0]?.provider||null, conceptLabel:asset.revision?.conceptLabel||(/generated concept/i.test(asset.title||'')?`${asset.revision?.serviceLabel||'Service'} — ${uses[0]?.pillar||'Unused concept'}`:asset.title), sourceSha256:asset.revision?.contentHash||null, overused:uses.length>2,service:asset.revision?.serviceLabel||null,
  origin:asset.revision?.origin==='generated_service_concept'?'Service concept image':'Real Business photo'};
}
function recentUse(asset,row,rows){
 const uses=mediaHistory(rows).filter(r=>r.itemId!==row.itemId&&(r.media?.assetId===asset.id||r.media?.sourceSha256===asset.revision?.contentHash)&&
   Math.abs(millis(row.scheduledFor)-millis(r.publishedAt||r.scheduledFor))<=30*86400000);
 return {classification:uses.length?'blocked_from_automatic_reuse':'fresh',uses:uses.length,
   samePlatform:uses.some(r=>r.provider===row.provider),reason:uses.length?'This source is already used for another idea in the 30-day strategy window.':'Fresh source for this idea.'};
}
function supply(decisions,rows,assets){
 const ds=Object.values(decisions),images=ds.filter(d=>d.format!=='text');
 const required=[...new Set(images.filter(d=>d.format==='generated'&&!d.assetId&&!d.candidateAvailable).map(d=>d.requestId).filter(Boolean))];
 return {policy:'SocialCreativeSupplyV1',remainingPosts:ds.length,imagePosts:images.length,textPosts:ds.length-images.length,
  approvedAssets:assets.filter(a=>a.approvedRevisionId&&!a.removed).length,
  recentlyUsedAssets:assets.filter(a=>rows.some(r=>r.status&&(r.media?.assetId===a.id||r.media?.sourceSha256===a.revision?.contentHash))).length,
  freshSelectedAssets:new Set(images.filter(d=>d.assetId).map(d=>d.sourceHash)).size,
  pendingConcepts:new Set(images.filter(d=>d.candidateAvailable).map(d=>d.requestId)).size,
  conceptsNeeded:required.length,requests:required,targetFreshnessRatio:1,
  policyDescription:'One fresh source per unrelated image idea; paired Facebook and Instagram versions may share a source. Manual reuse remains available.'};
}
function planCreativeMix({uid,rows,assets,services=[],preparations=[]}){
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
  const base={policy:POLICY,historyPolicy:'SocialCreativeHistoryV2',service,objective:row.goal||row.pillar,topic:row.pillar,initialCandidateLimit:1,
   evidence:'Initial creative mix; performance has not established a preferred format.'};
  const requestId='social_mix_'+crypto.createHash('sha256').update(uid+':'+row.itemId+':'+POLICY).digest('hex');
  const jobId='visual_job_'+crypto.createHash('sha256').update(uid+'\n'+requestId).digest('hex').slice(0,40);
  if(intentionalText(row)){decisions[key(row)]={...base,format:'text',label:'Text-only Facebook post',
   reason:'This short question or expectation-setting post invites a clear conversation without a decorative image.'};continue;}
  const pair=selected.find(r=>r.itemId===row.itemId&&r.provider!==row.provider&&similarity(r.copy,row.copy)>=.65);
  if(pair){decisions[key(row)]={...pair.decision,reason:'The same idea uses one source concept with a separate composition for this platform.'};
   selected.push({...row,decision:decisions[key(row)]});continue;}
  const existing=preparations.find(p=>p.itemId===row.itemId&&p.provider===row.provider&&p.version===row.version);
  if(existing?.recommendation?.format==='owner_selected'){
   decisions[key(row)]={...existing.recommendation,historyPolicy:'SocialCreativeHistoryV2'};selected.push({...row,decision:decisions[key(row)]});continue;
  }
  if(existing?.reviewCandidate&&existing.recommendation?.format==='generated'){
   const candidate=assets.find(a=>a.id===existing.reviewCandidate.assetId);
   if(candidate&&!recentUse(candidate,row,frozen).uses){decisions[key(row)]={...existing.recommendation,historyPolicy:'SocialCreativeHistoryV2',candidateAvailable:true};selected.push({...row,decision:decisions[key(row)]});continue;}
  }
  const ownCandidate=usable.find(a=>a.revision.generationJobId===jobId&&!recentUse(a,row,frozen).uses);
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
   const topicUses=frozen.filter(r=>topicMatch(r.copy,a.revision.serviceLabel)).length;
   return {a,real:a.revision.origin!=='generated_service_concept',score:similarity(description,row.copy+' '+row.goal)-topicUses*.05};
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
 return {policy:POLICY,supply:supply(decisions,rows,assets),decisions,assets:assets.map(a=>({assetId:a.id,...assetHistory(a,rows)})),
  learning:{recommendation:'hold',reason:'Compare format results only after compatible, attributed publication measurements exist.'}};
}
async function readCreativeContext(db,uid){
 const [items,jobs,library,brand]=await Promise.all([
  db.collection('socialContentItems').where('businessUid','==',uid).limit(101).get(),
  db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101).get(),
  db.collection(`businessMediaLibraries/${uid}/mediaAssets`).limit(51).get(),db.doc('businessBrandProfiles/'+uid).get()]);
 if(items.size>100||jobs.size>100||library.size>50)throw Error('Creative history needs review before automatic preparation.');
 const jobRows=jobs.docs.map(d=>({historyJobId:d.id,...d.data()})).filter(j=>j.status!=='canceled'),rows=[];
 const preparations=(await db.collection('socialCreativePreparation').where('businessUid','==',uid).limit(201).get()).docs.map(d=>d.data());
 for(const item of items.docs)for(const provider of ['facebook','instagram']){
  const version=item.data().platformVersions?.[provider]??item.data().currentVersion;
  const record=(await db.doc(`socialContentVersions/${item.id}_v${version}`).get()).data();
  if(record?.businessUid!==uid)continue;const variant=record.variants?.find(v=>v.provider===provider);if(!variant)continue;
  let media=variant.mediaRevisionId?(await db.doc(`socialMediaLibraries/${uid}/items/${variant.mediaRevisionId}`).get()).data():null;
  const job=jobRows.find(j=>j.provider===provider&&j.versionId?.startsWith(item.id+'_v'));
  const pending=preparations.find(p=>p.itemId===item.id&&p.provider===provider&&p.version===version);
  if(!job&&pending?.reviewCandidate)media={...pending.reviewCandidate,sourceSha256:pending.reviewCandidate.sourceSha256};
  rows.push({itemId:item.id,provider,version,copy:variant.copy,mediaRequirement:variant.mediaRequirement,goal:record.goal,pillar:record.pillar,scheduledFor:record.scheduledFor,media,status:job?.status||null});
 }
 for(const job of jobRows){
  const v=(await db.doc('socialContentVersions/'+job.versionId).get()).data();if(v?.businessUid!==uid)throw Error('Creative history binding mismatch.');
  const variant=v.variants?.find(r=>r.provider===job.provider);if(!variant)continue;
  const media=variant.mediaRevisionId?(await db.doc(`socialMediaLibraries/${uid}/items/${variant.mediaRevisionId}`).get()).data():null;
  const itemId=job.versionId.replace(/_v\d+$/,'');
  const index=rows.findIndex(r=>r.itemId===itemId&&r.provider===job.provider&&r.version===v.version);
  const history={itemId,provider:job.provider,version:v.version,copy:variant.copy,goal:v.goal,pillar:v.pillar,mediaRequirement:variant.mediaRequirement,
    media,status:job.status,scheduledFor:job.scheduledFor,publishedAt:job.publishedAt||null,historyJobId:job.historyJobId};
  if(index>=0)rows[index]=history;else rows.push(history);
 }
 const assets=await Promise.all(library.docs.map(async d=>{const a=d.data();return {id:d.id,...a,revision:(a.currentRevisionId||a.approvedRevisionId)?(await d.ref.collection('revisions').doc(a.currentRevisionId||a.approvedRevisionId).get()).data():null};}));
 return {uid,rows,assets,preparations,services:brand.data()?.approvedServiceCategories||[]};
}
const leaseId=(uid,input)=>crypto.createHash('sha256').update(uid+':'+input.itemId+':'+input.provider).digest('hex');
function presentation(record){const r=record?.recommendation;if(r?.policy!==POLICY)return null;
 return {policy:POLICY,label:r.label,format:r.format,reason:r.reason,service:r.service,evidence:r.evidence,
  state:record.state,generationStatus:record.generationStatus||null};}
module.exports={POLICY,key,similarity,intentionalText,planCreativeMix,readCreativeContext,leaseId,presentation,assetHistory,recentUse,supply};

'use strict';
// Advisory comparison only. No approval, budget or publication authority.
const labels={text:'Text-only Facebook',business_photo:'Real Business photos',generated:'Service concepts'};
function recommend({uid,observations=[],now=Date.now()}) {
 const unique=new Map();
 for(const r of observations){
  const at=Date.parse(r.observedAt);
  if(r.businessUid!==uid||r.source!=='meta_graph_read_only'||r.scope!=='post'||r.hoursAfterPublication!==168||
   !r.publicationJobId||!r.formatVerified||!labels[r.creativeFormat]||!r.objective||
   !['facebook','instagram'].includes(r.provider)||!Number.isFinite(at)||at>now||at<now-56*86400000)continue;
  const metrics=Object.fromEntries((r.metrics||[]).filter(m=>m.status==='OBSERVED'&&m.period==='lifetime'&&Number.isFinite(m.value)&&m.value>=0).map(m=>[m.name,m.value]));
  if(!(metrics.reach>0)||!Number.isFinite(metrics.total_interactions)||!Number.isFinite(metrics.link_clicks))continue;
  if(!unique.has(r.publicationJobId)||Date.parse(unique.get(r.publicationJobId).observedAt)<at)unique.set(r.publicationJobId,{...r,metrics});
 }
 const rows=[...unique.values()],groups=new Map();
 for(const r of rows){const k=JSON.stringify([r.provider,r.objective]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 const comparisons=[];
 for(const sample of groups.values())for(const format of Object.keys(labels)){
  const own=sample.filter(r=>r.creativeFormat===format),other=sample.filter(r=>r.creativeFormat!==format);
  if(own.length<8||other.length<8)continue;
  const rate=(rs,m)=>rs.reduce((s,r)=>s+r.metrics[m],0)/rs.reduce((s,r)=>s+r.metrics.reach,0);
  const baseline=rate(other,'total_interactions');let decision='hold';
  if(baseline>0&&rate(own,'total_interactions')>=baseline*1.2&&rate(own,'link_clicks')>=rate(other,'link_clicks')&&own.every(r=>r.qualityReady===true))decision='more';
  else if(baseline>0&&rate(own,'total_interactions')<=baseline*.8&&rate(own,'link_clicks')<rate(other,'link_clicks'))decision='less';
  comparisons.push({provider:sample[0].provider,objective:sample[0].objective,format,label:labels[format],decision,
   sample:own.length,comparisonSample:other.length,reason:decision==='hold'?'Keep the current mix while collecting comparable results.':
    `Consider ${decision} of this format in a reviewed experiment. Comparable response differs; this does not prove the creative caused the result.`});
 }
 return {decision:'hold',reason:comparisons.length?'Review these provisional format comparisons; no automatic frequency changes.':'Keep the initial creative mix. More comparable published-post evidence is needed.',
  comparisons,automaticAdjustmentEnabled:false,method:'Same platform and objective; 7-day post measurements within 56 days; at least 8 distinct posts in each comparison; observed reach, interactions and link clicks.'};
}
async function enrich(db,uid,observations){
 const cache=new Map();return Promise.all(observations.map(async r=>{
  if(r.businessUid!==uid||typeof r.contentVersionId!=='string'||!/^[A-Za-z0-9_-]+$/.test(r.contentVersionId))return r;
  if(!cache.has(r.contentVersionId))cache.set(r.contentVersionId,db.doc('socialContentVersions/'+r.contentVersionId).get());
  const v=(await cache.get(r.contentVersionId)).data(),variant=v?.variants?.find(x=>x.provider===r.provider);
  if(v?.businessUid!==uid||v.contentHash!==r.contentHash||!variant)return r;
  const media=variant.mediaRevisionId?(await db.doc(`socialMediaLibraries/${uid}/items/${variant.mediaRevisionId}`).get()).data():null;
  const format=variant.mediaRequirement==='none'&&r.provider==='facebook'?'text':
   media?.businessUid===uid?(media.sourceOrigin==='generated_service_concept'?'generated':media.sourceOrigin==='business_owned'?'business_photo':null):null;
  return {...r,creativeFormat:format,formatVerified:!!format,objective:v.goal||v.pillar};
 }));
}
module.exports={recommend,enrich};

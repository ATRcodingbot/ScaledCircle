'use strict';
const {assertSource}=require('./social_customer_media');
const toMillis=value=>value?.toMillis?value.toMillis():typeof value==='number'?value:Date.parse(value);
function futureSlot(value,now=Date.now()) {
 const current=toMillis(value);
 // UTC slot calculation is timezone/DST independent; the client displays local time.
 return new Date(Number.isFinite(current)&&current>=now+15*60000?current:Math.ceil((now+60*60000)/1800000)*1800000).toISOString();
}
function selectAsset({uid,assets,variant,goal}) {
 const words=new Set((variant.copy+' '+goal).toLowerCase().match(/[a-z]{4,}/g)||[]);
 return assets.map(asset=>{
   const revision=asset.revisions?.find(r=>r.id===asset.approvedRevisionId);
   try{assertSource({uid,asset,revision,assetId:asset.id,revisionId:revision?.id});}catch{return null;}
   const description=[asset.title,revision.altText,revision.serviceLabel].filter(Boolean).join(' ').toLowerCase();
   if(/\b(logo|icon|internal qa|test image)\b/.test(description)||asset.purpose==='logo')return null;
   const score=[...words].filter(w=>description.includes(w)).length;
   if(!score)return null;
   return {asset,revision,score,generated:revision.origin==='generated_service_concept'};
 }).filter(Boolean).sort((a,b)=>Number(a.generated)-Number(b.generated)||b.score-a.score||a.asset.id.localeCompare(b.asset.id))[0]||null;
}
function createPreparation({db,editor,media,now=Date.now}) {
 const current=async(uid,input)=>{
   const item=(await db.doc('socialContentItems/'+input.itemId).get()).data();
   if(item?.businessUid!==uid)throw Error('This post is not available.');
   const version=item.platformVersions?.[input.provider]??item.currentVersion;
   const data=(await db.doc('socialContentVersions/'+input.itemId+'_v'+version).get()).data();
   if(data?.businessUid!==uid)throw Error('This post is not available.');
   return {...data,version};
 };
 return {async prepare(uid,input){
   require('./social_customer_editor').validate(input);
   let version=await current(uid,input);
   if(version.version!==input.version)throw Error('The post changed. Reopen the current preview.');
   let variant=version.variants.find(v=>v.provider===input.provider);
   const nextTime=futureSlot(version.scheduledFor,now());
   const oldTime=toMillis(version.scheduledFor);
   if(!Number.isFinite(oldTime)||nextTime!==new Date(oldTime).toISOString()) {
     await editor.save(uid,{...input,copy:variant.copy,callToAction:variant.callToAction,destinationUrl:variant.destinationUrl,
       scheduledFor:nextTime,textOnly:variant.mediaRequirement==='none'});
     version=await current(uid,input);variant=version.variants.find(v=>v.provider===input.provider);
   }
   let creativeStatus=variant.mediaRevisionId?'prepared':variant.mediaRequirement==='none'?'text_only':'needs_creative';
   if(!variant.mediaRevisionId&&variant.mediaRequirement!=='none') {
     const inventory=await db.doc('businessMediaLibraries/'+uid).collection('mediaAssets').limit(51).get();
     if(inventory.size>50)throw Error('Choose a suitable approved image from Brand Assets.');
     const assets=await Promise.all(inventory.docs.map(async d=>{const a=d.data();return {id:d.id,...a,revisions:a.approvedRevisionId?[{id:a.approvedRevisionId,...(await d.ref.collection('revisions').doc(a.approvedRevisionId).get()).data()}]:[]};}));
     const selected=selectAsset({uid,assets,variant,goal:version.goal||''});
     if(selected){
       await media.attach(uid,{...input,version:version.version,assetId:selected.asset.id,revisionId:selected.revision.id,confirmPublicUse:true});
       version=await current(uid,input);variant=version.variants.find(v=>v.provider===input.provider);
       creativeStatus=selected.generated?'approved_service_concept':'approved_business_image';
     }
   }
   const quality=await editor.assess(uid,{...input,version:version.version});
   return {version:version.version,creativeStatus,quality,approved:false,scheduled:false};
 }};
}
module.exports={futureSlot,selectAsset,createPreparation,toMillis};

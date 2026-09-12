'use strict';
// Owner-driven preparation only. This module cannot approve or publish posts.
const social=require('./social_operations');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,220}$/.test(v);
function validate(input) {
  if(!id(input?.itemId)||!['facebook','instagram'].includes(input.provider)||
      !Number.isSafeInteger(input.version)||input.version<1)throw Error('Review the current post first.');
}
function editVersion({uid,current,input,nextVersionBase=current?.version,now=Date.now()}) {
  validate(input);
  if(current?.businessUid!==uid||current.version!==input.version)throw Error('The post changed. Reload it before saving.');
  const old=current.variants?.find(v=>v.provider===input.provider);
  if(!old)throw Error('Choose a platform on this post.');
  if(typeof input.copy!=='string'||!input.copy.trim()||input.copy.length>(input.provider==='instagram'?2200:5000))throw Error('Review the post text.');
  const time=Date.parse(input.scheduledFor);
  if(!Number.isFinite(time)||time<now+5*60000||time>now+366*86400000)throw Error('Choose a future time at least five minutes from now.');
  for(const key of ['callToAction','destinationUrl'])if(input[key]!=null&&typeof input[key]!=='string')throw Error('Review the destination.');
  const destination=(input.destinationUrl||'').trim();
  if(destination){const u=new URL(destination);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use a secure public destination.');}
  if(input.textOnly===true&&input.provider!=='facebook')throw Error('Instagram needs an image.');
  const variant={...old,copy:input.copy.trim(),callToAction:(input.callToAction||'').trim(),destinationUrl:destination,
    ...(input.textOnly===true?{mediaRequirement:'none',mediaAssetId:null,mediaRevisionId:null,format:'text'}:{})};
  // Every edit creates an immutable version. Other platform jobs retain their
  // original binding and cannot be re-approved as a side effect of this edit.
  return social.contentItemVersion({businessUid:uid,planId:current.planId,previousVersion:nextVersionBase,now,
    item:{...current,scheduledFor:new Date(time).toISOString(),variants:current.variants.map(v=>v.provider===input.provider?variant:v)}});
}
function createEditor({db,now=Date.now,enabledUids=[]}) {
  const enabled=uid=>{if(!enabledUids.includes(uid))throw Error('Social Manager is invite only.');};
  async function read(tx,uid,input){
    validate(input);enabled(uid);
    const ref=db.doc('socialContentItems/'+input.itemId),item=(await tx.get(ref)).data();
    if(item?.businessUid!==uid)throw Error('This post is not available.');
    const activeVersion=item.platformVersions?.[input.provider]??item.currentVersion;
    const current=(await tx.get(db.doc(`socialContentVersions/${input.itemId}_v${activeVersion}`))).data();
    if(current?.businessUid!==uid||current.version!==input.version)throw Error('The post changed. Reload it before saving.');
    const jobs=await tx.get(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
    if(jobs.size>100)throw Error('Publication history needs review.');
    if(jobs.docs.some(d=>{const j=d.data();return j.provider===input.provider&&j.versionId?.startsWith(input.itemId+'_v')&&j.status!=='canceled';}))
      throw Error('This platform post is already approved. Review its schedule before replacing it.');
    return {ref,item,current};
  }
  return {
    async save(uid,input){
      return db.runTransaction(async tx=>{
        const {ref,item,current}=await read(tx,uid,input);
        const next=editVersion({uid,current,input,nextVersionBase:item.currentVersion,now:now()});
        tx.create(db.doc(`${'socialContentVersions'}/${input.itemId}_v${next.version}`),next);
        tx.update(ref,{currentVersion:next.version,platformVersions:platformVersions(item,current,input.provider,next.version),updatedAt:now()});
        return {status:'ready_for_review',version:next.version,contentHash:next.contentHash,approved:false,scheduled:false};
      });
    },
    async assess(uid,input){
      return db.runTransaction(async tx=>{
        const {current}=await read(tx,uid,input);
        const profile=(await tx.get(db.doc('businessGrowthProfiles/'+uid))).data()||{};
        const recent=await tx.get(db.collection('socialContentVersions').where('businessUid','==',uid).limit(100));
        const assessment=social.assessScheduledContent({businessUid:uid,contentItemId:input.itemId,
          versionRecord:{...current,variants:current.variants.filter(v=>v.provider===input.provider)},
          businessContext:{businessName:profile.businessName,services:profile.services||profile.servicesOffered||[],
            geography:[profile.serviceArea,profile.city,profile.county].filter(v=>typeof v==='string')},
          recentVariants:recent.docs.filter(d=>!d.id.startsWith(input.itemId+'_v')).flatMap(d=>d.data().variants||[]),now:now()});
        const result={...assessment,provider:input.provider,versionId:`${input.itemId}_v${current.version}`,providerMutationsEnabled:false};
        tx.set(db.doc(`socialContentQualityAssessments/${input.itemId}_v${current.version}_${input.provider}`),result);
        return result;
      });
    },
  };
}
function platformVersions(item,current,provider,version){return {...Object.fromEntries(current.variants.map(v=>[v.provider,item.platformVersions?.[v.provider]??item.currentVersion])),[provider]:version};}
module.exports={editVersion,createEditor,validate,platformVersions};

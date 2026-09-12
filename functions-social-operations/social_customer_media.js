'use strict';
const crypto=require('node:crypto');
const {validate}=require('./social_customer_editor');
const social=require('./social_operations');
const meta=require('./social_meta_candidate');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function assertSource({uid,asset,revision,assetId,revisionId}) {
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(assetId||'')||!/^[A-Za-z0-9_-]{1,160}$/.test(revisionId||'')||
    asset?.businessUid!==uid||asset.removed===true||asset.approvedRevisionId!==revisionId||
    revision?.businessUid!==uid||revision.status!=='ready'||revision.approvalStatus!=='approved'||revision.rightsAttestation!==true||
    !revision.altText?.trim()||!revision.privateOriginalPath?.startsWith(`business_media_private/${uid}/${assetId}/${revisionId}/`)||
    !/^[a-f0-9]{64}$/.test(revision.contentHash||'')||!revision.storageGeneration)throw Error('Choose a current approved Business image.');
}
async function derivative(bytes,sharp=require('sharp')) {
  // Deterministic format preparation: no image generation or inferred artwork.
  // Contain preserves all of the selected image and strips private EXIF metadata.
  const result=await sharp(bytes,{failOn:'error',limitInputPixels:40000000}).rotate().resize(1080,1080,
    {fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).toColourspace('srgb')
    .jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer({resolveWithObject:true});
  if(result.data.length>8*1024*1024)throw Error('Choose a smaller image.');
  return {bytes:result.data,width:result.info.width,height:result.info.height,sha256:hash(result.data),mime:'image/jpeg'};
}
async function assertDeliveryAuthority({db,read=ref=>ref.get(),uid,revision}) {
  if(!revision?.customerDeliveryId)return;
  const id=revision.customerDeliveryId;
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('Image approval needs review.');
  const record=(await read(db.doc('customerSocialMedia/'+id))).data();
  if(record?.businessUid!==uid||record.status!=='approved_for_social'||record.assetId!==revision.assetId||
    record.path!==`customer_social_delivery/${id}.jpg`||!record.generation||
    record.sha256!==revision.images?.[0]?.sha256||record.bytes!==revision.images?.[0]?.bytes||
    !/^[A-Za-z0-9_-]{1,160}$/.test(record.revisionId||''))throw Error('Image approval needs review.');
  const ar=db.doc(`businessMediaLibraries/${uid}/mediaAssets/${record.assetId}`);
  const [asset,source]=await Promise.all([read(ar),read(ar.collection('revisions').doc(record.revisionId))]);
  if(asset.data()?.businessUid!==uid||asset.data()?.removed===true||asset.data()?.approvedRevisionId!==record.revisionId||
    source.data()?.businessUid!==uid||source.data()?.status!=='ready'||source.data()?.approvalStatus!=='approved'||
    source.data()?.rightsAttestation!==true)throw Error('Image approval needs review.');
}
function createMedia({db,bucket,project,now=Date.now,enabledUids=[],prepareImage=derivative}) {
  if(!['scaled-circle','scaledcircle-staging'].includes(project))throw Error('Media environment unavailable.');
  const origin=`https://us-east1-${project}.cloudfunctions.net`;
  const storage=()=>typeof bucket==='function'?bucket():bucket;
  return {
    async attach(uid,input){
      validate(input);
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(input.assetId||'')||!/^[A-Za-z0-9_-]{1,160}$/.test(input.revisionId||''))throw Error('Choose an approved image.');
      if(!enabledUids.includes(uid)||input.confirmPublicUse!==true)throw Error('Confirm this approved image may be used for public Social content.');
      const assetRef=db.doc(`businessMediaLibraries/${uid}/mediaAssets/${input.assetId}`);
      const revisionRef=assetRef.collection('revisions').doc(input.revisionId);
      const [a,r]=await Promise.all([assetRef.get(),revisionRef.get()]);
      const source={uid,asset:a.data(),revision:r.data(),assetId:input.assetId,revisionId:input.revisionId};
      assertSource(source);
      const [bytes]=await storage().file(source.revision.privateOriginalPath,{generation:source.revision.storageGeneration}).download();
      if(bytes.length>20*1024*1024||hash(bytes)!==source.revision.contentHash)throw Error('The image could not be verified.');
      const image=await prepareImage(bytes);
      const deliveryId=hash(JSON.stringify({uid,assetId:input.assetId,revisionId:input.revisionId,sha256:image.sha256}));
      const path=`customer_social_delivery/${deliveryId}.jpg`;
      await storage().file(path).save(image.bytes,{resumable:false,contentType:'image/jpeg',preconditionOpts:{ifGenerationMatch:0}})
        .catch(e=>{if(e.code!==412)throw e;});
      const [stored]=await storage().file(path).getMetadata();
      const prepared=meta.mediaRevision({businessUid:uid,assetId:input.assetId,provider:input.provider,
        productionOrigin:origin,customerDeliveryId:deliveryId,images:[{sha256:image.sha256,bytes:image.bytes.length,
          width:image.width,height:image.height,mime:image.mime,url:`${origin}/serveCustomerSocialMediaV1/${deliveryId}.jpg`}]});
      return db.runTransaction(async tx=>{
        const itemRef=db.doc('socialContentItems/'+input.itemId);
        const [item,latestAsset,latestRevision,delivery,existingMedia]=await Promise.all([
          tx.get(itemRef),tx.get(assetRef),tx.get(revisionRef),tx.get(db.doc('customerSocialMedia/'+deliveryId)),
          tx.get(db.doc(`socialMediaLibraries/${uid}/items/${prepared.id}`))]);
        assertSource({...source,asset:latestAsset.data(),revision:latestRevision.data()});
        if(latestRevision.data().contentHash!==source.revision.contentHash||latestRevision.data().storageGeneration!==source.revision.storageGeneration)
          throw Error('The image changed. Choose it again.');
        if(item.data()?.businessUid!==uid||(item.data()?.platformVersions?.[input.provider]??item.data()?.currentVersion)!==input.version)throw Error('The post changed. Reload it.');
        const current=(await tx.get(db.doc(`${'socialContentVersions'}/${input.itemId}_v${input.version}`))).data();
        if(current?.businessUid!==uid||!current.variants?.some(v=>v.provider===input.provider))throw Error('Post unavailable.');
        const jobs=await tx.get(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
        if(jobs.size>100||jobs.docs.some(d=>d.data().provider===input.provider&&d.data().versionId?.startsWith(input.itemId+'_v')&&d.data().status!=='canceled'))
          throw Error('Review the existing scheduled post before replacing its image.');
        const next=social.contentItemVersion({businessUid:uid,planId:current.planId,previousVersion:item.data().currentVersion,now:now(),item:{...current,
          variants:current.variants.map(v=>v.provider===input.provider?{...v,mediaAssetId:input.assetId,mediaRevisionId:prepared.id,
            mediaRequirement:'approved_image',format:'feed',altText:source.revision.altText}:v)}});
        if(delivery.exists&&(delivery.data().businessUid!==uid||delivery.data().sha256!==image.sha256))throw Error('Image identity conflict.');
        if(!delivery.exists)tx.create(db.doc('customerSocialMedia/'+deliveryId),{businessUid:uid,status:'approved_for_social',
          path,generation:String(stored.generation),sha256:image.sha256,bytes:image.bytes.length,
          assetId:input.assetId,revisionId:input.revisionId,approvedByUid:uid,approvedAt:now()});
        if(!existingMedia.exists)tx.create(db.doc(`socialMediaLibraries/${uid}/items/${prepared.id}`),prepared);
        tx.create(db.doc(`socialContentVersions/${input.itemId}_v${next.version}`),next);
        tx.update(itemRef,{currentVersion:next.version,platformVersions:require('./social_customer_editor').platformVersions(item.data(),current,input.provider,next.version),updatedAt:now()});
        return {status:'ready_for_review',version:next.version,contentHash:next.contentHash,approved:false,scheduled:false};
      });
    },
    async delivery(id){
      if(!/^[a-f0-9]{64}$/.test(id))return null;
      const record=(await db.doc('customerSocialMedia/'+id).get()).data();
      if(record?.status!=='approved_for_social'||record.path!==`customer_social_delivery/${id}.jpg`||!record.generation)return null;
      if(!enabledUids.includes(record.businessUid))return null;
      const asset=(await db.doc(`businessMediaLibraries/${record.businessUid}/mediaAssets/${record.assetId}`).get()).data();
      const revision=(await db.doc(`businessMediaLibraries/${record.businessUid}/mediaAssets/${record.assetId}/revisions/${record.revisionId}`).get()).data();
      if(asset?.removed===true||asset?.businessUid!==record.businessUid||asset?.approvedRevisionId!==record.revisionId||revision?.businessUid!==record.businessUid||revision?.status!=='ready'||revision?.approvalStatus!=='approved'||revision?.rightsAttestation!==true)return null;
      const [bytes]=await storage().file(record.path,{generation:record.generation}).download();
      if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error('Image integrity failed.');
      return bytes;
    },
  };
}
module.exports={assertSource,derivative,createMedia,assertDeliveryAuthority};

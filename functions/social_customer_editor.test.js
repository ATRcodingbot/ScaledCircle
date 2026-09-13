'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {editVersion,platformVersions}=require('../functions-social-operations/social_customer_editor');
const {assertSource,derivative}=require('../functions-social-operations/social_customer_media');
const {mediaRevision}=require('../functions-social-operations/social_meta_candidate');
const now=1900000000000;
function example(){return {businessUid:'owner',planId:'plan',itemKey:'post',version:1,scheduledFor:new Date(now+600000).toISOString(),
  goal:'Local services',variants:[{provider:'facebook',copy:'Old Facebook',mediaRequirement:'image'},{provider:'instagram',copy:'Old Instagram',mediaRequirement:'image'}]};}
const input={itemId:'post',version:1,provider:'facebook',copy:'New owner-reviewed Facebook draft',scheduledFor:new Date(now+1200000).toISOString(),textOnly:true};
test('Facebook text-only edit preserves Instagram, original version, and has no approval',()=>{
 const current=example(),before=structuredClone(current),next=editVersion({uid:'owner',current,input,now});
 assert.deepEqual(current,before);assert.deepEqual(next.variants[1].copy,current.variants[1].copy);
 assert.equal(next.variants[0].mediaRequirement,'none');assert.equal(next.version,2);assert.equal(next.approvedAt,null);assert.equal(next.status,'ready_for_review');
 assert.deepEqual(platformVersions({currentVersion:1},current,'facebook',2),{facebook:2,instagram:1});
});
test('wrong owner, stale version, insecure URL, past time and text-only Instagram fail closed',()=>{
 for(const change of [{uid:'other'},{input:{...input,version:2}},{input:{...input,destinationUrl:'http://example.com'}},
   {input:{...input,scheduledFor:new Date(now).toISOString()}},{input:{...input,provider:'instagram'}}])
   assert.throws(()=>editVersion({uid:'owner',current:example(),input,now,...change}));
});
test('quality absence is unknown, not a measured zero',()=>{
 const {contentHealthProjection}=require('../functions-social-operations/social_operations');
 const h=contentHealthProjection({});assert.equal(h.assessmentStatus,'not_assessed');assert.equal(h.strongCount,null);assert.equal(h.needsAttentionCount,null);assert.equal(h.historyStatus,'unavailable');
 assert.equal(contentHealthProjection({assessments:[{qualityBand:'strong'}]}).needsAttentionCount,0);
});
test('media requires exact approved owned revision and explicit rights',()=>{
 const good={uid:'owner',assetId:'asset',revisionId:'revision',asset:{businessUid:'owner',approvedRevisionId:'revision'},
  revision:{businessUid:'owner',status:'ready',approvalStatus:'approved',rightsAttestation:true,altText:'Owner image',
    privateOriginalPath:'business_media_private/owner/asset/revision/original.jpg',contentHash:'a'.repeat(64),storageGeneration:'1'}};
 assert.doesNotThrow(()=>assertSource(good));
 for(const patch of [{businessUid:'other'},{rightsAttestation:false},{approvalStatus:'pending'},{privateOriginalPath:'business_media_private/other/asset/revision/original.jpg'}])
   assert.throws(()=>assertSource({...good,revision:{...good.revision,...patch}}));
 assert.throws(()=>assertSource({...good,asset:{...good.asset,removed:true}}));
});
test('Instagram uses a full-resolution square without letterboxing and strips metadata',async()=>{
 const sharp=require('sharp');const original=await sharp({create:{width:1536,height:1024,channels:3,background:'#123456'}})
 .composite([{input:{create:{width:300,height:300,channels:3,background:'#ef3525'}},left:600,top:100}]).withMetadata().png().toBuffer();
 const prepared=await derivative(original,sharp,'instagram'),metadata=await sharp(prepared.bytes).metadata();
 assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,1024);assert.equal(metadata.height,1024);assert.equal(metadata.exif,undefined);
 assert.equal(prepared.preparation.pixelCheck,'passed');assert.equal(prepared.preparation.checkedSha256,prepared.sha256);
 const {data,info}=await sharp(prepared.bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
 assert(!data.some((v,i)=>i%info.channels===0&&v>245&&data[i+1]>245&&data[i+2]>245));
 const deliveryId='b'.repeat(64),origin='https://us-east1-scaled-circle.cloudfunctions.net';
 const revision=mediaRevision({businessUid:'owner',assetId:'asset',provider:'instagram',productionOrigin:origin,customerDeliveryId:deliveryId,
 images:[{...prepared,bytes:prepared.bytes.length,url:origin+'/serveCustomerSocialMediaV1/'+deliveryId+'.jpg'}]});
 assert.equal(revision.customerDeliveryId,deliveryId);
 assert.throws(()=>mediaRevision({...revision,productionOrigin:'https://attacker.example'}));
});
test('low resolution, blank images, baked borders and excessive crop all fail before review',async()=>{
 const sharp=require('sharp');
 for(const [width,height,color] of [[300,200,'#123456'],[1024,1024,'#ffffff'],[640,2000,'#234567']])
   await assert.rejects(derivative(await sharp({create:{width,height,channels:3,background:color}}).png().toBuffer(),sharp,'instagram'));
 const bordered=await sharp({create:{width:1080,height:1080,channels:3,background:'#ffffff'}})
  .composite([{input:{create:{width:1080,height:720,channels:3,background:'#123456'}},left:0,top:180}]).png().toBuffer();
 await assert.rejects(derivative(bordered,sharp,'instagram'),/blank borders/);
});

test('Facebook upload preserves high-resolution landscape and portrait originals without white bands or cropping',async()=>{
 const sharp=require('sharp');
 for(const [width,height,expectedWidth,expectedHeight] of [[1536,1024,1080,720],[800,1000,800,1000]]){
  const original=await sharp({create:{width,height,channels:3,background:'#123456'}})
    .composite([{input:{create:{width:40,height:40,channels:3,background:'#ef3525'}},left:0,top:0},
      {input:{create:{width:40,height:40,channels:3,background:'#25cf35'}},left:width-40,top:height-40}])
    .withMetadata().png().toBuffer();
  const prepared=await derivative(original,sharp,'facebook'),metadata=await sharp(prepared.bytes).metadata();
  assert.equal(metadata.width,expectedWidth);assert.equal(metadata.height,expectedHeight);
  assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);
  const {data,info}=await sharp(prepared.bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let white=0;for(let p=0;p<data.length;p+=info.channels)if(data[p]>245&&data[p+1]>245&&data[p+2]>245)white++;
  assert.equal(white,0,'no added white pixels anywhere in the delivered file');
  assert(data[0]>200&&data[1]<90,'top-left marker retained');
  const last=data.length-info.channels;assert(data[last]<90&&data[last+1]>170,'bottom-right marker retained');
 }
 await assert.rejects(derivative(Buffer.from('invalid'),sharp,'facebook'));
 await assert.rejects(derivative(Buffer.from('invalid'),sharp,'youtube'));
});

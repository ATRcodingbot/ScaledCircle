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
test('prepared derivative strips metadata and preserves portrait image within supported JPEG bounds',async()=>{
 const sharp=require('sharp');const original=await sharp({create:{width:400,height:900,channels:3,background:'#123456'}}).png().toBuffer();
 const prepared=await derivative(original,sharp),metadata=await sharp(prepared.bytes).metadata();
 assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,1080);assert.equal(metadata.height,1080);assert.equal(metadata.exif,undefined);
 const deliveryId='b'.repeat(64),origin='https://us-east1-scaled-circle.cloudfunctions.net';
 const revision=mediaRevision({businessUid:'owner',assetId:'asset',provider:'instagram',productionOrigin:origin,customerDeliveryId:deliveryId,
  images:[{...prepared,bytes:prepared.bytes.length,url:origin+'/serveCustomerSocialMediaV1/'+deliveryId+'.jpg'}]});
 assert.equal(revision.customerDeliveryId,deliveryId);
 assert.throws(()=>mediaRevision({...revision,productionOrigin:'https://attacker.example'}));
});

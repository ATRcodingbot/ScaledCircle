'use strict';
const crypto=require('node:crypto');
const POLICY='SocialCreativeHistoryV2';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const recipes={
 fence:[
  ['Horizontal-board fence and gate','horizontal-board timber privacy fence with a framed pedestrian gate','oblique property-line corner, close enough that fence fills most of frame','charcoal gate hardware, gravel planting border, overcast daylight'],
  ['Fence gate joinery detail','well-built timber fence gate and its joinery','close three-quarter detail of hinges, bracing and latch; no expansive lawn','warm brown timber, brick path, soft morning light'],
  ['Stepped fence on a gentle slope','stepped timber privacy fence following a gentle grade','side-on corner view showing the fence line and realistic post spacing','muted house exterior, stone planting bed, afternoon side light'],
  ['Decorative timber gate entrance','a sturdy decorative wooden garden gate within matching fencing','entry-focused eye-level composition, structure dominates the image','natural timber, restrained planting, paved entry, bright diffused daylight']
 ],
 deck:[
  ['Deck railing and stair detail','a professionally built residential deck with broad stairs and solid railing','close diagonal view across railing and stair junctions','light composite boards, dark balusters, pale blue house siding, soft morning light'],
  ['Low deck beside a brick home','a low residential timber deck with broad perimeter steps','wide corner composition with the deck occupying most of the frame','warm wood, red brick exterior, gravel border, late afternoon light'],
  ['Covered deck gathering space','a practical residential deck beneath an open timber pergola','eye-level view along deck boards toward pergola, no overhead empty sky','natural posts, gray house siding, modest furniture, overcast light'],
  ['Deck construction detail concept','a realistic residential deck board and railing installation detail','close view of straight decking, fastening and sturdy railing connections','warm neutral materials, no people, believable construction, diffuse daylight']
 ]};
function direction(service,requestId,recent=[]){
 if(['product explanation','business value','business and scaler roles'].includes(String(service).toLowerCase())){
  const layouts=['connected steps in a clear visual sequence','paired complementary roles with a shared goal','focused decision point with distinct evidence inputs','organized layers showing planning and observed outcomes'];
  const start=parseInt(hash(requestId).slice(0,8),16)%layouts.length;
  const layout=layouts.slice(start).concat(layouts.slice(0,start)).find(l=>!recent.some(r=>r.composition===l))||layouts[start];
  return {conceptLabel:service+' educational illustration',subject:service,composition:layout,treatment:'polished abstract editorial graphic; no invented UI, result, logo or completed-work scene'};
 }
 const category=/fenc/i.test(service)?'fence':/deck/i.test(service)?'deck':null;
 const options=recipes[category]||[[`${service} detail concept`, `professional ${service}`, 'subject-focused three-quarter detail with minimal empty background','realistic materials and diffuse daylight']];
 const used=new Set(recent.map(r=>r.conceptLabel));
 const start=parseInt(hash(requestId).slice(0,8),16)%options.length;
 const rotated=options.slice(start).concat(options.slice(0,start));
 const chosen=rotated.find(r=>!used.has(r[0]))||rotated[recent.length%rotated.length];
 return {conceptLabel:chosen[0],subject:chosen[1],composition:chosen[2],treatment:chosen[3]};
}
async function readContext(db,actor,request){
 if(!request.socialPost)return null;
 const p=request.socialPost;
 if(!/^[A-Za-z0-9_-]{1,220}$/.test(p.itemId||'')||!['facebook','instagram'].includes(p.provider)||!Number.isSafeInteger(p.version))throw Error('invalid_generation_request');
 const uid=actor.uid,leaseId=hash(uid+':'+p.itemId+':'+p.provider);
 const [i,v,l,j,recent]=await Promise.all([
  db.doc('socialContentItems/'+p.itemId).get(),db.doc(`socialContentVersions/${p.itemId}_v${p.version}`).get(),
  db.doc('socialCreativePreparation/'+leaseId).get(),db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101).get(),
  db.collection('visualGenerationJobs').where('businessUid','==',uid).orderBy('createdAt','desc').limit(30).get()]);
 const item=i.data(),version=v.data(),lease=l.data(),recommendation=lease?.generationOverride||lease?.recommendation;
 if(item?.businessUid!==uid||version?.businessUid!==uid||(item.platformVersions?.[p.provider]??item.currentVersion)!==p.version||
  lease?.businessUid!==uid||lease.version!==p.version||recommendation?.requestId!==request.requestId||recommendation.service!==request.serviceCategory||
  j.size>100||j.docs.some(d=>d.data().provider===p.provider&&d.data().versionId?.startsWith(p.itemId+'_v')&&d.data().status!=='canceled'))throw Error('generation_access_denied');
 const history=recent.docs.map(d=>d.data()).filter(r=>r.candidateAssetId).map(r=>({service:r.serviceCategory,
  conceptLabel:r.safeBrief?.socialCreativeContext?.conceptLabel||`${r.serviceCategory} ${r.visualDirection} concept`,
  composition:r.safeBrief?.socialCreativeContext?.composition||r.safeBrief?.composition||'',
  sourceAssetId:r.candidateAssetId}));
 const variant=version.variants?.find(r=>r.provider===p.provider);if(!variant)throw Error('generation_access_denied');
 const fresh=direction(request.serviceCategory,request.requestId,history);
 return {policy:POLICY,...fresh,post:{itemId:p.itemId,provider:p.provider,version:p.version,contentHash:version.contentHash},
  objective:String(version.goal||'').slice(0,300),topic:String(version.pillar||'').slice(0,200),
  educationalCopy:String(variant.copy||'').slice(0,1600),
  recent:history.slice(0,12).map(r=>({service:r.service,conceptLabel:r.conceptLabel,composition:r.composition})),
  previousSourceSha256:lease.reviewCandidate?.sourceSha256||lease.regenerationPreviousSourceSha256||null,
  reason:'New concept for the same approved service; vary subject treatment and composition from recent creative. No completed-project claim.'};
}
module.exports={POLICY,direction,readContext};

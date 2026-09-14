'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const d=require('../functions-social-operations/social_creative_diversity');
const {direction}=require('./social_generation_context');
const uid='owner';
const asset=n=>({id:'asset'+n,businessUid:uid,title:'Deck view '+n,approvedRevisionId:'r',revision:{businessUid:uid,status:'ready',approvalStatus:'approved',rightsAttestation:true,altText:'decks',serviceLabel:'decks',privateOriginalPath:`business_media_private/${uid}/asset${n}/r/original.jpg`,contentHash:String(n).padStart(64,'0'),storageGeneration:'1',origin:'business_upload'}});
const row=(n,provider='instagram')=>({itemId:'idea'+n,provider,version:1,copy:'Explore a residential deck and its practical materials.',goal:'Explore a service',pillar:'Deck ideas',mediaRequirement:'image',scheduledFor:'2026-10-01T16:00:00Z'});
test('four fresh assets cannot silently fill twenty unrelated image ideas',()=>{
 const result=d.planCreativeMix({uid,services:['decks'],assets:[1,2,3,4].map(asset),rows:Array.from({length:20},(_,i)=>row(i))});
 assert.equal(result.supply.remainingPosts,20);assert.equal(result.supply.freshSelectedAssets,4);assert.equal(result.supply.conceptsNeeded,16);
 assert.equal(result.supply.targetFreshnessRatio,1);assert.equal(result.supply.textPosts,0);
});
test('same idea across platforms needs one source, repeated sources across other ideas are blocked including aliases',()=>{
 const a=asset(1),old={...row('old','facebook'),status:'scheduled',media:{assetId:'alias',sourceSha256:a.revision.contentHash}};
 assert.equal(d.recentUse(a,row('new'),[old]).classification,'blocked_from_automatic_reuse');
 const result=d.planCreativeMix({uid,services:['decks'],assets:[a],rows:[old,row(1,'facebook'),row(1)]});
 assert.equal(result.supply.conceptsNeeded,1);assert.equal(result.supply.imagePosts,2);
 assert.equal(result.decisions['idea1:facebook'].requestId,result.decisions['idea1:instagram'].requestId);
});
test('new briefs choose an unused composition and stay within maintained service',()=>{
 const first=direction('fences','request_one');const next=direction('fences','request_two',[first]);
 assert.notEqual(first.conceptLabel,next.conceptLabel);assert.match(next.subject,/fenc|gate/);
 assert.notEqual(first.composition,next.composition);
});
test('owner-selected reuse is explicit, while text is a strategy choice rather than fallback failure',()=>{
 const r=row('manual'),manual={itemId:r.itemId,provider:r.provider,version:1,recommendation:{policy:d.POLICY,format:'owner_selected',label:'Business-selected creative'}};
 const result=d.planCreativeMix({uid,services:['decks'],assets:[],rows:[r],preparations:[manual]});
 assert.equal(result.decisions['ideamanual:instagram'].format,'owner_selected');
 assert.equal(d.intentionalText({...row(1,'facebook'),goal:'Explore a service'}),false);
});
test('a candidate approved separately becomes usable without losing its exact source identity',()=>{
 const a=asset(1),r=row(1),p={itemId:r.itemId,provider:r.provider,version:1,reviewCandidate:{assetId:a.id},recommendation:{policy:d.POLICY,format:'generated',requestId:'social_original_request',service:'decks'}};
 const result=d.planCreativeMix({uid,services:['decks'],assets:[a],rows:[r],preparations:[p]});
 assert.equal(result.decisions['idea1:instagram'].assetId,a.id);assert.equal(result.decisions['idea1:instagram'].sourceHash,a.revision.contentHash);
 assert.equal(result.decisions['idea1:instagram'].candidateAvailable,false);assert.equal(result.supply.conceptsNeeded,0);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const d=require('../functions-social-operations/social_creative_diversity');
const uid='business';
const asset=(id,service='decks',generated=false,hash=id.repeat(64).slice(0,64))=>({id,title:service+' photo',businessUid:uid,approvedRevisionId:'r',
 revision:{businessUid:uid,status:'ready',approvalStatus:'approved',rightsAttestation:true,altText:service,serviceLabel:service,
 privateOriginalPath:`business_media_private/${uid}/${id}/r/original.jpg`,contentHash:hash,storageGeneration:'1',origin:generated?'generated_service_concept':'business_upload'}});
const row=(id,provider='instagram',extra={})=>({itemId:id,provider,version:1,copy:'Considering decks? Talk about your goals and materials with us.',goal:'Explore a service',pillar:'Deck choices',scheduledFor:'2026-10-01T16:00:00Z',...extra});
test('rotates asset hashes, prioritizes relevant real photos, shares only the same idea across platforms',()=>{
 const a=asset('a'),duplicate=asset('b','decks',false,a.revision.contentHash),concept=asset('c','decks',true);
 const plan=d.planCreativeMix({uid,services:['decks'],assets:[concept,duplicate,a],rows:[row('one','facebook'),row('one'),row('two','instagram',{scheduledFor:'2026-10-02T16:00:00Z'}),row('three','instagram',{scheduledFor:'2026-10-03T16:00:00Z'})]});
 assert.equal(plan.decisions['one:facebook'].format,'business_photo');
 assert.equal(plan.decisions['one:facebook'].assetId,'a');assert.equal(plan.decisions['one:instagram'].assetId,'a');
 assert.equal(plan.decisions['two:instagram'].assetId,'c');assert.equal(plan.decisions['three:instagram'].format,'generated');
});
test('protects scheduled posts and exact-hash history from duplicate aliases and never fabricates services',()=>{
 const a=asset('a'),old=row('old','facebook',{status:'scheduled',media:{assetId:'different',sourceSha256:a.revision.contentHash}});
 const rows=[old,row('new')],before=JSON.stringify(rows);
 const plan=d.planCreativeMix({uid,services:['decks'],assets:[a],rows});
 assert.equal(plan.decisions['old:facebook'],undefined);assert.equal(plan.decisions['new:instagram'].format,'generated');
 assert.equal(plan.decisions['new:instagram'].service,'decks');assert.equal(JSON.stringify(rows),before);
 const empty=d.planCreativeMix({uid,services:[],assets:[],rows:[row('new')]});assert.equal(empty.decisions['new:instagram'].service,null);
});
test('intentional conversation text is Facebook-only and does not use missing media as its reason',()=>{
 const rows=['facebook','instagram'].map(p=>row('q',p,{goal:'Invite a useful conversation',pillar:'Your priorities'}));
 const plan=d.planCreativeMix({uid,services:['decks'],assets:[],rows});
 assert.equal(plan.decisions['q:facebook'].format,'text');assert.equal(plan.decisions['q:instagram'].format,'generated');
 assert.match(plan.decisions['q:facebook'].reason,/conversation/);assert.doesNotMatch(plan.decisions['q:facebook'].reason,/missing|no.*image/i);
});
test('one stable candidate per idea, no caption-driven generation loop, and unapproved/cross-tenant/logo assets excluded',()=>{
 const good=asset('a'),bad={...good,businessUid:'other'},logo={...asset('b'),title:'Business logo'};
 const input={uid,services:['decks'],assets:[bad,logo],rows:[row('one','facebook'),row('one')]};
 const a=d.planCreativeMix(input),b=d.planCreativeMix({...input,rows:input.rows.map(r=>({...r,version:99}))});
 assert.equal(a.decisions['one:facebook'].format,'generated');
 assert.equal(a.decisions['one:facebook'].requestId,a.decisions['one:instagram'].requestId);
 assert.equal(a.decisions['one:facebook'].requestId,b.decisions['one:facebook'].requestId);
 assert.equal(a.learning.recommendation,'hold');
});
test('asset counts deduplicate revisions and distinguish planned, scheduled and published',()=>{
 const a=asset('a'),rows=[row('one','facebook',{version:1,media:{assetId:'a'}}),row('one','facebook',{version:2,media:{assetId:'a'},status:'published'}),row('two','instagram',{media:{assetId:'a'},status:'scheduled'}),row('three','instagram',{media:{assetId:'a'}})];
 const result=d.assetHistory(a,rows);assert.equal(result.timesUsed,1);assert.equal(result.scheduledUses,1);assert.equal(result.plannedUses,1);assert.equal(result.overused,true);
});
test('generation status distinguishes configuration, quota, capacity, provider failure and available',()=>{
 const {availability}=require('./generation_foundation');const args={capability:'enabled',authorized:true,budgetEnabled:true,usage:{used:0,total:60}};
 assert.equal(availability(args).state,'available');
 assert.equal(availability({...args,capability:'disabled'}).state,'configuration_unavailable');
 assert.equal(availability({...args,usage:{limitReached:true}}).state,'monthly_limit_reached');
 assert.equal(availability({...args,globalLimit:true}).state,'platform_capacity');
 assert.equal(availability({...args,providerUnavailable:true}).state,'provider_temporarily_unavailable');
 assert.equal(availability({...args,authorized:false}).state,'access_unavailable');
});

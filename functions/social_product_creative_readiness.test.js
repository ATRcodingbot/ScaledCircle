'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const categories=require('../functions-social-operations/social_managed_categories');
test('strategy category compatibility preserves canonical labels and never alters logo or existing choices',()=>{
 const args={uid:'owner',policy:{id:'policy',services:['business value'],approvedByUid:'owner',approvedAt:1,strategyDigest:'digest'},profile:{businessUid:'owner',servicesOffered:['Business value']},now:2};
 const patch=categories.patch(args);assert.deepEqual(patch.approvedServiceCategories,['Business value']);assert.equal(patch.approvedLogo,undefined);assert.equal(patch.categoryAuthority.policyId,'policy');
 assert.equal(categories.patch({...args,brand:{businessUid:'owner',approvedServiceCategories:['Other approved topic']}}),null);
 assert.throws(()=>categories.patch({...args,brand:{businessUid:'other'}}));
 assert.throws(()=>categories.patch({...args,policy:{...args.policy,services:['Decks']}}));
});
test('product illustration prompts and subject checks preserve truthfulness without contractor templates or regenerated logos',()=>{
 const foundation=require('../functions-creative-media/generation_foundation'),adapter=require('../functions-creative-media/openai_image_adapter');
 const context=require('../functions-creative-media/social_generation_context'),subject=require('../functions-social-operations/social_creative_subject');
 for(const category of ['Product explanation','Business value','Business and Scaler roles']){
  const brief=foundation.safeBrief({serviceCategory:category,visualDirection:'clean'}, {},null,context.direction(category,'request',[]));
  const prompt=adapter.buildPrompt(brief);assert.match(prompt,/editorial product illustration/);assert.doesNotMatch(prompt,/Create one photorealistic|professionally completed/);
  assert.match(prompt,/canonical Business logo must remain untouched/);assert.match(subject.instructions(category),/abstract editorial/);
 }
 assert.match(adapter.buildPrompt(foundation.safeBrief({serviceCategory:'Decks',visualDirection:'clean'})),/photorealistic/);
 assert.match(subject.instructions('Decks'),/deck, steps/);
 const failed=subject.evaluate({subjectVisible:true,relevantToService:true,backgroundDominant:false,severeCrop:false,blankBands:true,logoOrWatermark:false,subjectFraction:.8,confidence:.9},'sha');
 assert.equal(failed.status,'blocked');
});
test('internal visual worker compatibility requires exact workspace and provider bindings, not an Admin email or role alone',()=>{
 const {internalOwner}=require('../functions-creative-media/social_managed_visual_worker');
 const args={uid:'owner',user:{role:'admin'},profile:{businessUid:'owner',internalSocialContext:{source:'owner_reviewed_meta_strategy'}},config:{provider:'meta',environment:'production',enabled:true,writeScopesEnabled:true,metaDogfood:{businessUid:'owner',pageId:'123',instagramId:'456'}},policy:{providers:['facebook','instagram'],reviewedScope:{providerAccounts:[{provider:'facebook',accountId:'123'},{provider:'instagram',accountId:'456'}]}}};
 assert.equal(internalOwner(args),true);assert.equal(internalOwner({...args,uid:'other'}),false);
 assert.equal(internalOwner({...args,policy:{...args.policy,providers:['x']}}),false);
 assert.equal(internalOwner({...args,profile:{businessUid:'other'}}),false);
});

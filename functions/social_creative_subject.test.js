'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {evaluate}=require('../functions-social-operations/social_creative_subject');
const good={subjectVisible:true,relevantToService:true,backgroundDominant:false,severeCrop:false,blankBands:false,logoOrWatermark:false,subjectFraction:.5,confidence:.9};
test('subject visibility fails closed for background-heavy, unrelated, cropped, uncertain and logo-bearing creatives',()=>{
 assert.equal(evaluate(good,'sha').status,'passed');
 for(const change of [{subjectVisible:false},{relevantToService:false},{backgroundDominant:true},{subjectFraction:.2},{severeCrop:true},{blankBands:true},{logoOrWatermark:true},{confidence:.5}]){
  const result=evaluate({...good,...change},'sha');assert.equal(result.status,'blocked');assert.ok(result.reasons.length);
 }
 for(const value of [null,{}, {...good,subjectFraction:NaN},{...good,subjectVisible:'yes'}])assert.throws(()=>evaluate(value,'sha'));
});
test('Social uses the exact maintained workload identity adapter without alternate credentials',()=>{
 const fs=require('node:fs');assert.deepEqual(fs.readFileSync(require.resolve('./openai_image_adapter')),fs.readFileSync(require.resolve('../functions-social-operations/openai_image_adapter')));
});

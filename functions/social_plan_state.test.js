'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {project}=require('./social_plan_state');
const plan={id:'plan',status:'approved',planVersion:1,approvedVersion:1,items:Array.from({length:8},()=>({variants:[{status:'ready_for_review'},{status:'ready_for_review'}]}))};
test('same immutable plan authority feeds Social and Growth projections',()=>{
 for(const dir of ['functions-agentic-growth','functions-social-operations'])assert.equal(fs.readFileSync(path.join(__dirname,'../',dir,'social_plan_state.js'),'utf8'),fs.readFileSync(path.join(__dirname,'social_plan_state.js'),'utf8'));
 const before=structuredClone(plan),state=project([plan]);
 assert.equal(state.planApprovalState,'approved');assert.equal(state.postReviewState,'drafts_need_review');assert.equal(state.draftPosts,16);
 assert.equal(state.title,'Plan approved · 8 ideas / 16 draft platform versions');assert.equal(state.destination,'/business/social-operations?review=posts');assert.equal(state.publicationAuthorizedByStatus,false);assert.deepEqual(plan,before);
});
test('only exact approved current version is approved; previous approval stays historical',()=>{
 const newer={...plan,planVersion:2,status:'ready_for_review'};
 assert.equal(project([newer]).title,'New Plan Version Needs Review');assert.equal(newer.approvedVersion,1);
 for(const p of [{...plan,approvedVersion:0},{...plan,status:'draft'},{...plan,planVersion:null}])assert.equal(project([p]).planApprovalState,'needs_review');
 assert.equal(project([]).planApprovalState,'not_created');
});
test('post approval, schedule and publication remain distinct from plan approval',()=>{
 for(const state of ['approved','scheduled','published']){
  const result=project([{...plan,items:[{variants:[{status:state}]}]}]);
  assert.equal(result.planApprovalState,'approved');assert.equal(result.postReviewState,state);assert.equal(result.draftPosts,0);
 }
});

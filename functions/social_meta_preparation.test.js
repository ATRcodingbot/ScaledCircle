"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const p=require("../functions-social-operations/social_meta_preparation");
const scopes=require("../functions-social-operations/social_oauth").META_PUBLISH_SCOPES;
function fixture(){return {uid:"meta_preparation_fixture",now:Date.parse("2030-01-01T00:00:00Z"),
 config:{provider:"meta",environment:"production",enabled:true,writeScopesEnabled:true,externalPublishingEnabled:false,
  metaDogfood:{businessUid:"meta_preparation_fixture",pageId:"123",pageName:"Example Company",instagramId:"456",instagramUsername:"example"}},
 connection:{environment:"production",status:"connected_write",tokenHealth:"healthy",providerUserId:"123",linkedPageId:"123",grantedScopes:scopes},
 profile:{businessName:"Example Company"},input:{provider:"facebook",startsOn:"2030-01-02T05:00:00Z",timeZone:"America/New_York",media:[],
  items:["A practical map helps local businesses focus a campaign on streets they can serve.",
   "Response evidence matters when a busy owner needs to understand where interest came from.",
   "Businesses and independent workers need a clear shared workflow for assignments and review."].map((copy,i)=>({
    itemKey:`post${i}`,pillar:`pillar${i}`,scheduledFor:`2030-01-0${3+i}T15:00:00Z`,
    variants:[{provider:"facebook",format:"text",copy:`${copy} Example Company. Learn more at https://example.com/${i}`,
     callToAction:`Explore ${i}`,destinationUrl:`https://example.com/${i}`}]}))}};}
test("three scored drafts bind deterministic IDs without approval or publication",()=>{
 const f=fixture(),d=p.build(f),again=p.build({...f,now:f.now+1});
 assert.deepEqual(d.jobs,again.jobs);assert.equal(d.jobs.length,3);
 for(const [i,j] of d.jobs.entries()){
  assert.equal(j.approvalId,null);assert.equal(j.status,"ready_for_review");assert.equal(j.externalPublishingEnabled,false);
  assert.equal(d.assessments[i].record.readyToPublish,true);
  assert.equal(d.assessments[i].record.variantAssessments[0].timing.confidence,"low");
 }
});
test("drafts reject wrong ownership, scope, schedule, duplicate key and channel",()=>{
 for(const change of [f=>f.uid="other",f=>f.connection.providerUserId="789",f=>f.connection.grantedScopes=[],
  f=>f.input.items[0].scheduledFor="bad",f=>f.input.items[0].scheduledFor="2030-02-01T00:00:00Z",
  f=>f.input.items[0].itemKey=f.input.items[1].itemKey,f=>f.input.items[0].variants[0].provider="instagram",
  f=>f.config.externalPublishingEnabled=true]){const f=fixture();change(f);assert.throws(()=>p.build(f));}
});
test("missing profile uses verified brand only, not invented service or location evidence",()=>{
 const f=fixture();delete f.profile;const d=p.build(f);
 assert.equal(d.assessments[0].record.variantAssessments[0].scores.serviceRelevance,62);
 assert.equal(d.assessments[0].record.variantAssessments[0].scores.localRelevance,65);
});
test("asset verification rejects changed bytes and never sends POST",async()=>{
 const image={url:"https://example.com/image",mime:"image/png",bytes:1,sha256:"a".repeat(64)};
 await assert.rejects(p.verifyMedia([{images:[image]}],async(_url,options)=>{
  assert.equal(options.method,"GET");return {ok:true,headers:new Headers({"content-type":"image/png"}),body:[Buffer.from("x")]};
 }),/media_changed/);
});
module.exports={fixture};

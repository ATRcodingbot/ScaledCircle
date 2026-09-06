"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const growth=require("../functions-social-operations/social_growth_cycle");
const meta=require("../functions-social-operations/social_meta_candidate");
const {createAdapter}=require("../functions-social-operations/social_meta_transport");
const {execute}=require("../functions-social-operations/social_meta_steps");
function fixture(count=1,provider="instagram") {
 const account={businessUid:"fixture",providerUserId:provider==="instagram"?"17841441730285620":"1198660363339503",linkedPageId:"1198660363339503"};
 const files=Array.from({length:count},(_,i)=>Buffer.from(`fixture image ${i}`));
 const revision=meta.mediaRevision({businessUid:account.businessUid,assetId:"asset",provider,productionOrigin:"https://scaledcircle.com",
  images:files.map(bytes=>{const sha256=crypto.createHash("sha256").update(bytes).digest("hex");return {sha256,bytes:bytes.length,width:1080,height:1350,mime:"image/jpeg",url:`https://scaledcircle.com/social/${sha256}.jpg`};})});
 const approval={id:"approval",businessUid:account.businessUid,approvedByUid:account.businessUid,providerAccounts:{[provider]:account},
  items:[{versionId:"v1",bindingHash:"immutable",scheduledFor:"2030-01-01T00:00:00Z",variants:[{provider,copy:"Local stories. Link in bio.",mediaAssetId:"asset",mediaRevisionId:revision.id}]}]};
 const job=growth.jobs(approval)[0],records=new Map(),calls=[],containers=new Map();
 const control={ready:true,paused:false,lostPublish:false,lostChild:false,wrongOwner:false,expired:false,badMedia:false};
 const store={existing:async(_,key)=>records.get(key),begin:async step=>{
  const old=records.get(step.key);if(old?.receipt)return {mode:"received",record:old};
  const next=old||{...step,startedAt:1000};records.set(step.key,next);return {mode:old?"reconcile":"create",record:next};
 },remember:async(step,id)=>{records.get(step.key).observedProviderId=id;},finish:async(step,receipt)=>{records.get(step.key).receipt=receipt;return receipt;}};
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);calls.push({path:u.pathname,method:options.method,body:options.body&&JSON.parse(options.body)});
  if(u.origin==="https://scaledcircle.com") {const i=revision.images.findIndex(v=>v.url===u.href);return {ok:true,headers:new Map([["content-type","image/jpeg"]]),arrayBuffer:async()=>control.badMedia?Buffer.from("wrong"):files[i]};}
  assert.equal(u.origin,"https://graph.facebook.com");assert.equal(options.headers.Authorization,provider==="instagram"?"Bearer page-fixture":"Bearer fixture-only");assert.equal(u.searchParams.has("access_token"),false);
  if(options.method==="POST") {
   const id=String(100+calls.filter(c=>c.method==="POST").length);
   if(u.pathname.endsWith("/media_publish")) {if(control.lostPublish)throw Error("lost");return {ok:true,json:async()=>({id:"999"})};}
   if(u.pathname.endsWith("/photos"))return {ok:true,json:async()=>({id:"777",post_id:`${account.providerUserId}_999`})};
   containers.set(id,"FINISHED");if(control.lostChild)throw Error("lost");return {ok:true,json:async()=>({id})};
  }
  if(u.pathname.endsWith("/media"))return {ok:true,json:async()=>({data:[{id:"999",caption:"Local stories. Link in bio.",timestamp:new Date(1000).toISOString()}]})};
  if(provider==="facebook")return {ok:true,json:async()=>({id:`${account.providerUserId}_999`,from:{id:control.wrongOwner?"1":account.providerUserId},message:"Local stories. Link in bio."})};
  const id=u.pathname.split("/").at(-1);return {ok:true,json:async()=>({id,status_code:control.expired?"EXPIRED":control.ready?"FINISHED":"IN_PROGRESS"})};
 };
 const root=provider==="instagram"?require("./fixtures/meta_page_credential")({businessUid:account.businessUid,pageId:account.linkedPageId,igId:account.providerUserId}):null;
 const adapter=createAdapter({job,account,approval,revision,fetchImpl,now:()=>2000,
  authorizeCreate:async()=>{if(control.paused)throw Error("paused");},credentials:root?root.resolve:async()=>({...account,tokenType:"PAGE",linkedPageId:account.linkedPageId||account.providerUserId,accessToken:"fixture-only"})});
 return {control,calls,records,revision,adapter,run:()=>execute({job,account,approval,revision,store,adapter})};
}
test("Instagram single-image uses exact account, readiness, final publish and reusable receipt",async()=>{
 const f=fixture();await f.adapter.verifyAssets();assert.equal((await f.run()).status,"received");
 f.control.expired=true;assert.equal((await f.run()).status,"received");
 assert.deepEqual(f.calls.filter(c=>c.method==="POST").map(c=>c.path),["/v26.0/17841441730285620/media","/v26.0/17841441730285620/media_publish"]);
 assert.equal(f.records.get("publish").receipt.id,"999");
});
test("Instagram delayed readiness preserves one container and waits before publishing",async()=>{
 const f=fixture();f.control.ready=false;assert.equal((await f.run()).status,"needs_attention");
 assert.equal(f.records.get("image").observedProviderId,"101");
 f.control.ready=true;assert.equal((await f.run()).status,"received");assert.equal(f.calls.filter(c=>c.method==="POST").length,2);
});
test("Instagram carousel preserves all four child URLs and ordered parent IDs",async()=>{
 const f=fixture(4);await f.run();await f.run();const posts=f.calls.filter(c=>c.method==="POST");
 assert.equal(posts.length,6);assert.deepEqual(posts.slice(0,4).map(c=>c.body.image_url),f.revision.images.map(i=>i.url));
 assert.deepEqual(posts[4].body.children,["101","102","103","104"]);assert.equal(posts[5].body.creation_id,"105");
});
test("expired container never causes recreation or final publish",async()=>{
 const f=fixture();f.control.expired=true;await f.run();await f.run();assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
});
test("lost child response stays held even when readiness later succeeds",async()=>{
 const f=fixture();f.control.lostChild=true;await f.run();f.control.lostChild=false;await f.run();assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
 assert.equal(f.records.has("publish"),false);
});
test("lost final publish response cannot infer a receipt from matching caption or repeat publish",async()=>{
 const f=fixture();f.control.lostPublish=true;await f.run();f.control.expired=true;await f.run();
 assert.equal(f.records.get("publish").receipt,undefined);assert.equal(f.calls.filter(c=>c.method==="POST").length,2);
});
test("Supervisor stop after container readiness prevents the final provider effect",async()=>{
 const f=fixture();f.control.ready=false;await f.run();f.control.ready=true;f.control.paused=true;await f.run();
 assert.equal(f.calls.filter(c=>c.method==="POST").length,1);assert.equal(f.records.get("publish").receipt,undefined);
});
test("media hash substitution fails closed",async()=>{
 const f=fixture();f.control.badMedia=true;await assert.rejects(f.adapter.verifyAssets(),/media_changed/);assert.equal(f.calls.filter(c=>c.method==="POST").length,0);
});
test("Facebook photo response persists post_id rather than the photo object ID",async()=>{
 const f=fixture(1,"facebook");const result=await f.run();assert.equal(result.receipt.id,"1198660363339503_999");
 assert.equal(f.calls[0].path,"/v26.0/1198660363339503/photos");assert.equal(f.calls[0].body.url,f.revision.images[0].url);
});
test("Facebook receipt from another Page fails closed",async()=>{
 const f=fixture(1,"facebook");f.control.wrongOwner=true;assert.equal((await f.run()).status,"needs_attention");assert.equal(f.records.get("post").receipt,undefined);
});

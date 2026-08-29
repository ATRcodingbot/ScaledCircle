"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const media=require("./landing_page_media");const lp=require("./landing_page");

function snapshot(data){return{exists:data!=null,data:()=>data};}
function dbFixture({approved=true,removed=false}={}){
  const records=new Map([
    ["businessMediaLibraries/business-a/mediaAssets/asset-a",{businessUid:"business-a",approvedRevisionId:approved?"revision-a":"revision-old",removed}],
    ["businessMediaLibraries/business-a/mediaAssets/asset-a/revisions/revision-a",{businessUid:"business-a",origin:"business_upload",status:"ready",approvalStatus:"approved",rightsAttestation:true,altText:"A truthful service concept",renditions:{hero:{storagePath:"private/hero.webp",width:1600,height:900,mimeType:"image/webp"},card:{storagePath:"private/card.webp",width:900,height:675,mimeType:"image/webp"}}}],
    ["businessBrandProfiles/business-a",{primaryColor:"#123456",secondaryColor:"#654321",stylePreset:"clean"}],
  ]);
  class Ref{constructor(path){this.path=path;this.id=path.split("/").at(-1);}collection(name){return new Col(`${this.path}/${name}`);}async get(){return snapshot(records.get(this.path));}}
  class Col{constructor(path){this.path=path;}doc(id){return new Ref(`${this.path}/${id}`);}}
  return{collection:(name)=>new Col(name)};
}
function bucketFixture(){
  const files=new Map([["private/hero.webp",Buffer.from("hero-bytes")],["private/card.webp",Buffer.from("card-bytes")]]);
  const metadata=new Map();
  return{name:"demo.appspot.com",files,metadata,file(path){return{
    download:async()=>[files.get(path)],
    save:async(bytes,options)=>{if(files.has(path)){const error=new Error("exists");error.code=412;throw error;}files.set(path,Buffer.from(bytes));metadata.set(path,{size:String(bytes.length),contentType:options.contentType,metadata:options.metadata.metadata});},
    getMetadata:async()=>[metadata.get(path)||{size:String(files.get(path)?.length||0),contentType:"image/webp"}],
    exists:async()=>[files.has(path)],
  };}};
}

test("selection is bounded and preserves exact immutable revision identities",()=>{
  const chosen=media.sanitizeMediaSelection({logo:{assetId:"asset-a",revisionId:"revision-a"},visuals:[{assetId:"asset-a",revisionId:"revision-a",role:"hero",slotId:"hero-main"}]});
  assert.equal(chosen.logo.revisionId,"revision-a");assert.equal(chosen.visuals[0].slotId,"hero-main");
  assert.throws(()=>media.sanitizeMediaSelection({visuals:Array.from({length:7},()=>({assetId:"a",revisionId:"r",role:"service"}))}),/limit/);
});

test("publish materializes content-addressed derivatives and is retry-idempotent",async()=>{
  const bucket=bucketFixture();const input={db:dbFixture(),bucket,businessUid:"business-a",pageId:"page-a",versionId:"version-a",selection:{useBrandColors:true,visuals:[{assetId:"asset-a",revisionId:"revision-a",role:"hero",slotId:"hero-main"}]}};
  const first=await media.materializeSelection(input);const second=await media.materializeSelection(input);
  assert.deepEqual(second,first);assert.match(first.visuals[0].publicDerivativePath,/^landing_page_public\/business-a\/page-a\/version-a\/hero-main\/[a-f0-9]{64}\.webp$/);
  assert.equal(first.brand.primaryColor,"#123456");assert.equal(first.visuals[0].derivatives.length,2);assert.equal(bucket.files.size,4);
});

test("unapproved, removed, or wrong revision fails closed before publication",async()=>{
  const selection={visuals:[{assetId:"asset-a",revisionId:"revision-a",role:"hero"}]};
  await assert.rejects(()=>media.materializeSelection({db:dbFixture({approved:false}),bucket:bucketFixture(),businessUid:"business-a",pageId:"p",versionId:"v",selection}),/not_approved/);
  await assert.rejects(()=>media.materializeSelection({db:dbFixture({removed:true}),bucket:bucketFixture(),businessUid:"business-a",pageId:"p",versionId:"v",selection}),/not_approved/);
});

test("SSR uses public immutable media only and preserves deterministic fallback",()=>{
  const content=lp.sanitizeDraft({headline:"Service",supportingText:"A truthful concept.",contactFields:["name","email"]});
  const fallback=lp.renderPage({page:{publicSlug:"slug"},version:{id:"v",content}});
  assert.match(fallback,/hero-panel/);assert.doesNotMatch(fallback,/business_media_private|<script/i);
  const version={id:"v",content,mediaBucket:"demo.appspot.com",mediaSnapshot:{useBrandColors:false,logo:null,visuals:[{role:"hero",altText:"Conceptual service scene",publicDerivativePath:"landing_page_public/u/p/v/hero/hash.webp",width:1600,height:900,derivatives:[{publicDerivativePath:"landing_page_public/u/p/v/hero/small.webp",width:960},{publicDerivativePath:"landing_page_public/u/p/v/hero/hash.webp",width:1600}]}]}};
  const html=lp.renderPage({page:{publicSlug:"slug"},version});
  assert.match(html,/firebasestorage\.googleapis\.com/);assert.match(html,/Conceptual service scene/);assert.match(html,/srcset=/);assert.doesNotMatch(html,/business_media_private|token=|<script/i);
});

test("future generated imagery is explicitly disclosed as conceptual",()=>{
  const content=lp.sanitizeDraft({headline:"Service",supportingText:"A qualified concept.",contactFields:["name","email"]});
  const html=lp.renderPage({page:{publicSlug:"slug"},version:{id:"v",content,mediaBucket:"demo.appspot.com",
    mediaSnapshot:{logo:null,visuals:[{role:"hero",origin:"generated_service_concept",altText:"Conceptual scene",
      publicDerivativePath:"landing_page_public/u/p/v/hero/hash.webp",width:1200,height:800}]}}});
  assert.match(html,/Conceptual service visual/);assert.doesNotMatch(html,/completed work|our customer|our property/i);
});

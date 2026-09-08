'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PDFDocument}=require('pdf-lib');
const sharp=require('sharp');
const jsQR=require('jsqr');
const physical=require('./physical_marketing');
const {routeSelection,quoteMath,createPostcardService}=require('./postcard_fulfillment');
const {ACTIONS}=require('./workspace_access');

test('complete route quantities are bounded and duplicate route credit is rejected',()=>{
  const routes=[{zip:'21061',route:'C001',quantity:200,delivery:'residential'}];
  assert.equal(routeSelection({routes}).quantity,200);
  for(const input of [[],[...routes,...routes],[{...routes[0],quantity:199}],[{...routes[0],quantity:5001}],[{...routes[0],route:'made-up'}],[{...routes[0],quantity:200.5}]]) assert.throws(()=>routeSelection({routes:input}));
});
test('quote preserves USPS pass-through, variable local costs, explicit fee and margin',()=>{
  const q={printingCents:9000,postageCents:5200,taxCents:0,printCostCents:8000,postageCostCents:5200,handlingCostCents:1000,postageRateCents:26};
  const math=quoteMath(q,200);assert.equal(math.customer.totalCents,17040);assert.equal(math.internal.estimatedGrossMarginCents,2840);
  for(const x of [{postageCents:5300},{postageCostCents:5000},{printingCents:0},{taxCents:-1},{postageRateCents:0}])assert.throws(()=>quoteMath({...q,...x},200));
  assert.equal(quoteMath({...q,postageRateCents:27,postageCents:5400,postageCostCents:5400},200).customer.postageCents,5400,'future verified rates do not require source edits');
});
test('production postcards are unavailable before any database or provider use',async()=>{
  let calls=0;const db={collection:()=>({})};
  const service=createPostcardService({db,projectId:'scaled-circle',stripe:()=>{calls++;throw Error('not permitted');}});
  await assert.rejects(service.create({}, {uid:'owner',role:'business'}),/staging Beta/);assert.equal(calls,0);
});
test('postcard permissions separate design approval from payments and retain workspace checks',()=>{
  assert.equal(ACTIONS.createPostcardCampaignV1,'campaigns');assert.equal(ACTIONS.requestPostcardQuoteV1,'authorizeCampaigns');
  for(const a of ['createPostcardCheckoutV1','reconcilePostcardPaymentV1','requestPostcardCancellationV1'])assert.equal(ACTIONS[a],'payments');
  const source=fs.readFileSync(path.join(__dirname,'postcard_fulfillment.js'),'utf8');
  assert.doesNotMatch(source,/collection\(["'](?:wallets|earnings|trackingSessions|zones)["']/);
});
test('EDDM print master is two immutable CMYK pages, USPS-sized, readable, with scannable QR',async()=>{
  const content=physical.normalizeDraft({productSpecId:'postcard_eddm_6x11',sideCount:2,campaignId:'postcard-certification',landingPageId:'page',service:'Build decks',headline:'Make more of your outdoor space',offer:'Explore deck options with Attractive Remodel.',cta:'Scan to plan your next project',primaryColor:'#176FD1',secondaryColor:'#10243E'});
  const version={productSpecId:content.productSpecId,content,brandSnapshot:{businessName:'Attractive Remodel',businessNameSource:'business_growth_profile',services:['Build decks']},responseAssetId:'response-certification',trackedUrl:'https://scaledcircle.test/r?code=POSTCARDPROOF',landingPage:{landingPageId:'page',destination:'https://scaledcircle.test/p/remodel'}};
  const rendered=await physical.renderPrintMaster({version,trackedUrl:version.trackedUrl});
  const hash=physical.digest(rendered.pdf),preflight=physical.preflightReport({version,renderEvidence:rendered.evidence,artifactHash:hash});
  assert.equal(preflight.status,'pass',JSON.stringify(preflight));
  assert.equal(physical.marketingReadinessReport({version,renderEvidence:rendered.evidence}).status,'pass');
  const pdf=await PDFDocument.load(rendered.pdf);assert.equal(pdf.getPageCount(),2);
  for(const page of pdf.getPages()){assert.deepEqual(page.getSize(),{width:810,height:450});assert.deepEqual(page.getTrimBox(),{x:9,y:9,width:792,height:432});}
  assert.match(rendered.pdf.toString('latin1'),/DeviceCMYK/);assert.match(rendered.pdf.toString('latin1'),/FontFile/);
  const {data,info}=await sharp(rendered.proofs[1].webp).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data,version.trackedUrl);
  const replay=await physical.renderPrintMaster({version,trackedUrl:version.trackedUrl});assert.equal(physical.digest(replay.pdf),hash);
  if(process.env.POSTCARD_ARTIFACT_DIR){fs.mkdirSync(process.env.POSTCARD_ARTIFACT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.POSTCARD_ARTIFACT_DIR,'neighborhood-postcard-certification.pdf'),rendered.pdf);for(const p of rendered.proofs)fs.writeFileSync(path.join(process.env.POSTCARD_ARTIFACT_DIR,`proof-${p.side}.webp`),p.webp);}
});

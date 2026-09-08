'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib'),sharp=require('sharp');
const {preflightArtwork}=require('./postcard_artwork');
const {quoteMath}=require('./postcard_fulfillment');
const physical=require('./physical_marketing');
const file=b=>({base64:Buffer.from(b).toString('base64')});
async function pdf(sides=1,width=810,height=450,panelInk=false){const d=await PDFDocument.create(),font=await d.embedFont(StandardFonts.Helvetica);for(let i=0;i<sides;i++){const p=d.addPage([width,height]);p.drawText('Approved Business artwork',{x:30,y:height-50,font,size:20});if(panelInk)p.drawRectangle({x:600,y:100,width:100,height:100,color:rgb(1,0,0)});}return Buffer.from(await d.save());}
test('20 percent is server derived, excludes tax, rounds cents and rejects fee forgery',()=>{
 const q={printingCents:9000,postageCents:5200,postageCostCents:5200,postageRateCents:26,printCostCents:8000,handlingCostCents:0,taxCents:1000};
 assert.equal(quoteMath(q,200).customer.fulfillmentCents,2840);assert.equal(quoteMath(q,200).customer.totalCents,18040);
 assert.equal(quoteMath({...q,printingCents:9003},200).customer.fulfillmentCents,2841);
 assert.equal(quoteMath({...q,printingCents:9002},200).customer.fulfillmentCents,2840);
 assert.throws(()=>quoteMath({...q,fulfillmentCents:1},200),/20%/);
 assert.equal(quoteMath(q,200).customer.postageCents,5200);
});
test('one and two page PDF originals remain separate from rendered artwork; mailing panel is reserved',async()=>{
 const bytes=await pdf(2),r=await preflightArtwork([file(bytes)]);assert.equal(r.pages.length,2);assert.deepEqual(r.originals[0].bytes,bytes);assert.equal(r.report.noStretch,true);assert.equal(r.report.sourceResolution,'pass');assert.equal(r.report.safeArea,'visual_approval_required');
 const one=await preflightArtwork([file(await pdf())]);assert.equal(one.report.mailingPanel,'generated_back');
 await assert.rejects(preflightArtwork([file(await pdf(2,810,450,true))]),/mailing area/);
});
test('upload rejects corrupt, wrong-size/orientation, excess pages and low resolution artwork',async()=>{
 await assert.rejects(preflightArtwork([file(Buffer.from('not a usable image file or PDF document'))]),/readable/);
 await assert.rejects(preflightArtwork([file(await pdf(1,450,810))]),/landscape/);
 await assert.rejects(preflightArtwork([file(await pdf(3))]),/front and optional back/);
 const small=await sharp({create:{width:810,height:450,channels:3,background:'#fff'}}).png().toBuffer();await assert.rejects(preflightArtwork([file(small)]),/too small/);
 const large=await sharp({create:{width:3375,height:1875,channels:3,background:'#fff'}}).png().toBuffer();const good=await preflightArtwork([file(large)]);assert.equal(good.originals[0].contentType,'image/png');
});
test('QR off permits print without Landing Page, preserves exact own phone, and renders both sides',async()=>{
 const content=physical.normalizeDraft({productSpecId:'postcard_eddm_6x11',campaignId:'proof',service:'Build decks',headline:'Plan your next deck',cta:'Call to discuss your project',qrEnabled:false,includeBusinessPhone:true,businessPhone:'(410) 732-6184'});
 const brandSnapshot={businessName:'Craft & Care',businessNameSource:'business_approved_design',services:['Build decks'],phone:'(410) 732-6184',phoneSource:'business_approved_design'};
 physical.validateAuthorizedDraft(content,brandSnapshot);
 const version={productSpecId:content.productSpecId,content,brandSnapshot};const r=await physical.renderPrintMaster({version});
 assert.equal(r.evidence.sideEvidence.length,0);assert.equal(physical.marketingReadinessReport({version,renderEvidence:r.evidence}).status,'pass');
 assert.equal(physical.preflightReport({version,renderEvidence:r.evidence,artifactHash:physical.digest(r.pdf)}).status,'pass');
});
test('uploaded front with generated QR back and generated service imagery remain truthful',async()=>{
 const upload=await preflightArtwork([file(await pdf())]);
 const content=physical.normalizeDraft({productSpecId:'postcard_eddm_6x11',campaignId:'proof',service:'Build decks',headline:'Plan your next deck',cta:'Learn more',qrEnabled:true});
 const version={productSpecId:content.productSpecId,content,brandSnapshot:{businessName:'Craft & Care',businessNameSource:'business_growth_profile',services:['Build decks']},responseAssetId:'qr',trackedUrl:'https://example.com/r/test',landingPage:{destination:'https://example.com'},mediaSnapshot:{assetId:'approved',revisionId:'one',contentHash:'hash',origin:'generated_service_concept'}};
 const r=await physical.renderPrintMaster({version,trackedUrl:version.trackedUrl,artworkPages:upload.pages});
 assert.equal(r.evidence.sideEvidence.length,1);assert.equal(r.evidence.marketingLayout.conceptualDisclosurePresent,true);
});
test('postcard photo fits source aspect at 300 dpi without square crop or enlargement',async()=>{
 const content=physical.normalizeDraft({productSpecId:'postcard_eddm_6x11',campaignId:'proof',service:'Decks',headline:'Explore deck options',cta:'Get in touch',qrEnabled:false});
 const version={productSpecId:content.productSpecId,content,brandSnapshot:{businessName:'Craft & Care'}};
 const mediaBuffer=await sharp({create:{width:1024,height:768,channels:3,background:'#447733'}}).jpeg().toBuffer();
 const r=await physical.renderPrintMaster({version,mediaBuffer});assert.equal(r.evidence.effectiveRasterDpi,300);
 const tiny=await sharp({create:{width:120,height:100,channels:3,background:'#447733'}}).jpeg().toBuffer();
 await assert.rejects(physical.renderPrintMaster({version,mediaBuffer:tiny}),/resolution_low/);
});

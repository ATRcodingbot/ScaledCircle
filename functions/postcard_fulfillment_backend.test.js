'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc}=require('firebase/firestore');
const fs=require('node:fs');
const physical=require('./physical_marketing');
const {createPostcardService,STEPS}=require('./postcard_fulfillment');
let app,db,env,sequence=0;
const projectId='demo-postcard-fulfillment';
const business={uid:'postcard-owner',role:'business'},admin={uid:'postcard-admin',role:'admin',isAdmin:true};
before(async()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required');app=initializeApp({projectId},'postcards');db=getFirestore(app);const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');env=await initializeTestEnvironment({projectId,firestore:{host,port:+port,rules:fs.readFileSync('../firestore.rules','utf8')}});await db.doc('users/postcard-owner').set({role:'business',businessName:'Attractive Remodel'});await db.doc('businessGrowthProfiles/postcard-owner').set({businessName:'Attractive Remodel',servicesOffered:['Build decks']});await db.doc('landingPages/postcard-page').set({businessUid:business.uid,status:'published',publishedVersionId:'page-version',publicSlug:'remodel'});});
after(async()=>{await env?.cleanup();await db?.terminate();if(app)await deleteApp(app);});
async function fixture(simulation=true){
  await db.doc('privateProductAccess/'+business.uid).set({businessId:business.uid,status:'approved',products:['postcards'],expiresAtMillis:Date.now()+86400000});
  const n=++sequence,objects=new Map();let provider,creates=0,refund;
  const bucket=()=>({file:p=>({save:async b=>{objects.set(p,Buffer.from(b));},download:async()=>{if(!objects.has(p))throw Error('not found');return [objects.get(p)];}})});
  const print=physical.createPhysicalMarketingService({db,FieldValue,bucket,publicBaseUrl:'https://scaledcircle.test',createResponseAsset:async(input)=>({responseAssetId:`response-${n}`,trackedUrl:`https://scaledcircle.test/r?code=POSTCARD${n}`})});
  const service=createPostcardService({db,FieldValue,bucket,physicalService:print,projectId,stripe:()=>({checkout:{sessions:{create:async(data,options)=>{creates++;assert.ok(options.idempotencyKey);provider={id:`cs_test_${n}`,url:`https://checkout.stripe.com/c/pay/cs_test_${n}`,livemode:false,status:'open',payment_status:'unpaid',...data,amount_total:data.line_items[0].price_data.unit_amount,currency:'usd',payment_intent:{id:`pi_${n}`,status:'succeeded',livemode:false,amount_received:data.line_items[0].price_data.unit_amount,currency:'usd'}};return provider;},retrieve:async()=>provider}},refunds:{retrieve:async()=>refund}})});
  const order=await service.create({requestId:`cert-${n}`,name:`Postcard proof ${n}`,targetArea:'Certification area',zip:'21061',simulation},business);
  const material=await print.mutate({action:'create',requestId:`design-${n}`,draft:{campaignId:order.campaignId,landingPageId:'postcard-page',productSpecId:'postcard_eddm_6x11',sideCount:2,service:'Build decks',headline:'Make more of your outdoor space',offer:'Explore deck options with Attractive Remodel.',cta:'Scan to learn more'}},business);
  const version=await print.prepare({materialId:material.materialId},business);
  assert.equal(version.preflight.status,'pass');assert.equal(version.marketingReadiness.status,'pass');
  await print.approve({materialId:material.materialId,versionId:version.versionId},business);
  await service.requestQuote({orderId:order.orderId,materialId:material.materialId,versionId:version.versionId},business);
  const q=await service.confirmQuote({orderId:order.orderId,simulationAcknowledged:true,routes:[{zip:'21061',route:'C001',quantity:200,delivery:'residential'}],printingCents:9000,postageCents:5200,postageCostCents:5200,postageRateCents:26,fulfillmentCents:2840,taxCents:0,printCostCents:8000,handlingCostCents:1000,uspsVerified:true,mailpieceVerified:true,costsConfirmed:true,uspsVerifiedOn:new Date().toISOString().slice(0,10),stockThicknessInches:.012,pieceWeightOz:1,stockFlexible:true,vendor:'Emulator-only printer',printSpecification:'6 x 11 CMYK',routeEvidenceReference:'Emulator-only route selection',estimate:'Simulation only'},admin);
  const checkout=()=>service.checkout({orderId:order.orderId,quoteId:q.quote.quoteId,artifactHash:q.quote.artifactHash,acceptTerms:true},business);
  return {service,print,order,q,version,objects,checkout,get creates(){return creates;},get provider(){return provider;},pay:async()=>{await checkout();provider.payment_status='paid';await service.reconcile({orderId:order.orderId},business);},setRefund:r=>{refund=r;}};
}
test('authoritative creative → quote → TEST payment → queue → simulation fulfilled, exactly once',async()=>{
  const f=await fixture();await assert.rejects(f.service.advance({orderId:f.order.orderId,status:'PRINT_READY',simulation:true},admin));
  await Promise.allSettled([f.checkout(),f.checkout()]);assert.equal(f.creates,1);
  f.provider.payment_status='paid';await Promise.all([f.service.reconcile({orderId:f.order.orderId},business),f.service.reconcile({orderId:f.order.orderId},business)]);
  const before=(await db.doc(`campaigns/${f.order.campaignId}`).get()).data();
  for(const status of STEPS.slice(1)){await f.service.advance({orderId:f.order.orderId,status,simulation:true},admin);await f.service.advance({orderId:f.order.orderId,status,simulation:true},admin);}
  const final=(await db.doc(`postcardOrders/${f.order.orderId}`).get()).data();assert.equal(final.status,'COMPLETED');assert.equal(final.mailedQuantity,200);assert.equal(final.artifactHash,f.q.quote.artifactHash);
  assert.equal((await db.collection('postcardPaymentReceipts').where('orderId','==',f.order.orderId).get()).size,1);
  const notices=await db.collection('notifications').where('orderId','==',f.order.orderId).get();assert.equal(notices.size,3);assert.ok(notices.docs.every(d=>d.data().body.includes('No physical mailing is claimed')));
  const customer=(await f.service.workspace({},business)).orders.find(o=>o.orderId===f.order.orderId);assert.equal(customer.operations,undefined);assert.equal(customer.responseAssetId,`response-1`);
  const artifact=await f.service.artifact({orderId:f.order.orderId},business);assert.equal(artifact.bindingHash,final.artifactHash);assert.match(artifact.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual((await db.doc(`campaigns/${f.order.campaignId}`).get()).data(),before);
  for(const c of ['wallets','earnings','trackingSessions','zones'])assert.equal((await db.collection(c).get()).size,0);
});
test('cross-Business, Scaler and non-Admin access denied; forged paid/version/amount held',async()=>{
  const f=await fixture();for(const actor of [{uid:'other',role:'business'},{uid:'scaler',role:'scaler'},{}])await assert.rejects(f.service.artifact({orderId:f.order.orderId},actor),{code:'permission-denied'});
  await assert.rejects(f.service.advance({orderId:f.order.orderId,status:'PRINT_READY',simulation:true},business),{code:'permission-denied'});
  await assert.rejects(f.service.checkout({orderId:f.order.orderId,quoteId:f.q.quote.quoteId,artifactHash:'changed',acceptTerms:true},business));assert.equal(f.creates,0);
  await f.checkout();f.provider.payment_status='paid';f.provider.amount_total++;await assert.rejects(f.service.reconcile({orderId:f.order.orderId},business));assert.equal((await db.doc(`postcardPaymentReceipts/${f.order.orderId}`).get()).exists,false);
});

test('private beta blocks new orders and Checkout without hiding existing order history',async()=>{
  const f=await fixture();await db.doc('privateProductAccess/'+business.uid).delete();
  const view=await f.service.workspace({},business);
  assert.equal(view.creationAvailable,false);assert.ok(view.orders.some(o=>o.orderId===f.order.orderId));
  await assert.rejects(f.service.create({requestId:'uninvited',name:'Held',targetArea:'Area',zip:'21061',simulation:true},business),{code:'failed-precondition'});
  await assert.rejects(f.checkout(),{code:'failed-precondition'});assert.equal(f.creates,0);
});
test('real fulfillment requires matching private receipts; hold resumes without duplicate milestone',async()=>{
  const f=await fixture(false);await f.pay();const orderId=f.order.orderId;
  await f.service.advance({orderId,status:'PRINT_READY',simulation:false},admin);
  await assert.rejects(f.service.advance({orderId,status:'ORDERED_FOR_PRINT',simulation:false},admin),/receipt/);
  const receipt=await f.service.evidence({orderId,kind:'printer_confirmation',base64:Buffer.from('%PDF-1.7\nEmulator receipt only').toString('base64')},admin);
  await f.service.advance({orderId,status:'ORDERED_FOR_PRINT',simulation:false,evidenceId:receipt.evidenceId},admin);
  await f.service.advance({orderId,status:'ON_HOLD',simulation:false,note:'Printer timing review'},admin);
  await assert.rejects(f.service.advance({orderId,status:'READY_FOR_PICKUP',simulation:false},admin));
  await f.service.advance({orderId,status:'ORDERED_FOR_PRINT',simulation:false,resolveHold:true,note:'Confirmed timing',evidenceId:receipt.evidenceId},admin);
  assert.equal((await db.collection('notifications').where('orderId','==',orderId).get()).size,2);
  for(const status of ['READY_FOR_PICKUP','PRINT_RECEIVED','USPS_PREPARATION'])await f.service.advance({orderId,status,simulation:false,evidenceId:receipt.evidenceId},admin);
  await assert.rejects(f.service.advance({orderId,status:'MAILED',simulation:false,evidenceId:receipt.evidenceId},admin),/USPS/);
  const usps=await f.service.evidence({orderId,kind:'usps_receipt',base64:Buffer.from('%PDF-1.7\nEmulator acceptance only').toString('base64')},admin);
  await assert.rejects(f.service.advance({orderId,status:'MAILED',simulation:false,evidenceId:usps.evidenceId},admin),/acceptance date/);
  await assert.rejects(f.service.advance({orderId,status:'MAILED',simulation:false,evidenceId:usps.evidenceId,mailDate:'2099-01-01'},admin),/acceptance date/);
  const mailDate=new Date().toISOString().slice(0,10);
  await f.service.advance({orderId,status:'MAILED',simulation:false,evidenceId:usps.evidenceId,mailDate},admin);
  const workspace=await f.service.workspace({admin:true},admin),row=workspace.orders.find(o=>o.orderId===orderId);
  assert.equal(row.mailDate,mailDate);assert.equal(row.businessName,'Attractive Remodel');
});
test('cancellation stops fulfillment; only confirmed provider refund changes refunded state',async()=>{
  const f=await fixture();await f.pay();const orderId=f.order.orderId;
  await f.service.cancel({orderId},business);await assert.rejects(f.service.advance({orderId,status:'PRINT_READY',simulation:true},admin));
  f.setRefund({id:'re_test',payment_intent:f.provider.payment_intent.id,amount:1,currency:'usd',status:'succeeded'});await assert.rejects(f.service.refund({orderId,refundId:'re_test'},admin),/full refund/);
  f.setRefund({id:'re_test',payment_intent:f.provider.payment_intent.id,amount:f.q.quote.totalCents,currency:'usd',status:'succeeded'});
  await f.service.refund({orderId,refundId:'re_test'},admin);await f.service.refund({orderId,refundId:'re_test'},admin);
  assert.equal((await db.collection('postcardRefundReceipts').where('orderId','==',orderId).get()).size,1);
});
test('Rules deny direct order, payment, private evidence and cost reads/writes, including owner/Admin',async()=>{
  for(const uid of ['postcard-owner','postcard-admin','other']){const client=env.authenticatedContext(uid,{admin:uid==='postcard-admin'}).firestore();for(const collection of ['postcardOrders','postcardFulfillmentPrivate','postcardPaymentReceipts','postcardRefundReceipts','postcardEvidence','postcardCostHistory','postcardAudit','postcardArtworkUploads']){await assertFails(getDoc(doc(client,collection,'probe')));await assertFails(setDoc(doc(client,collection,'probe'),{status:'PAID'}));}}
});

test('all creation modes allow preview before mailing; QR off and own number require no attribution object',async()=>{
 const f=await fixture();
 for(const creationMode of ['template','assisted','upload']){
  const o=await f.service.create({requestId:`flow-${creationMode}`,name:'Creative flow',creationMode,simulation:true},business);assert.equal(o.mailingPending,true);
  let upload=null;
  if(creationMode==='upload'){
   const {PDFDocument,StandardFonts}=require('pdf-lib');const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([810,450]).drawText('Attractive Remodel',{font,x:30,y:400});
   upload=await f.print.mutate({action:'upload_postcard_artwork',campaignId:o.campaignId,files:[{base64:Buffer.from(await pdf.save()).toString('base64')}]},business);
   const original=(await db.doc(`postcardArtworkUploads/${upload.uploadId}`).get()).data();assert.equal(original.immutable,true);assert.notEqual(original.originals[0].storagePath,original.pages[0].storagePath);
   await assert.rejects(f.print.mutate({action:'upload_postcard_artwork',campaignId:o.campaignId,files:[]},{uid:'other',role:'business'}));
  }
  const draft={creationMode,campaignId:o.campaignId,productSpecId:'postcard_eddm_6x11',service:'Build decks',headline:'Plan your next deck',cta:'Call to discuss your project',qrEnabled:false,includeBusinessPhone:true,businessPhone:'(410) 732-6184',artworkUploadId:upload?.uploadId};
  const material=await f.print.mutate({action:'create',requestId:`m-${creationMode}`,draft},business),version=await f.print.prepare({materialId:material.materialId},business);
  assert.equal(version.marketingReadiness.status,'pass');const immutable=(await db.doc(`marketingMaterialVersions/${version.versionId}`).get()).data();assert.equal(immutable.responseAssetId,null);assert.equal(immutable.brandSnapshot.phone,'(410) 732-6184');
  await f.print.approve({materialId:material.materialId,versionId:version.versionId},business);
  const request={orderId:o.orderId,materialId:material.materialId,versionId:version.versionId};await assert.rejects(f.service.requestQuote(request,business),/mailing area/);
  await f.service.mailing({orderId:o.orderId,targetArea:'Illustrative area',zip:'21061',desiredQuantity:200},business);await f.service.requestQuote(request,business);
  if(upload){const original=await f.service.artifact({orderId:o.orderId,admin:true,originalIndex:0},admin);assert.equal(original.contentType,'application/pdf');assert.match(original.sha256,/^[a-f0-9]{64}$/);await assert.rejects(f.service.artifact({orderId:o.orderId,originalIndex:0},business),{code:'permission-denied'});}
  await assert.rejects(f.service.mailing({orderId:o.orderId,targetArea:'Changed',zip:'21061',desiredQuantity:300},business),/locked/);
  assert.deepEqual((await db.doc(`marketingMaterialVersions/${version.versionId}`).get()).data(),immutable);
 }
});

test('QR website binding and campaign-specific tracking phone fail closed across owners/campaigns',async()=>{
 const f=await fixture(),o=await f.service.create({requestId:'contact-binding',name:'Contact binding',creationMode:'template'},business);
 const draft={campaignId:o.campaignId,productSpecId:'postcard_eddm_6x11',service:'Build decks',headline:'Plan your next deck',cta:'Explore our work',qrEnabled:true,destinationUrl:'https://business.example/services'};
 await db.doc('trackingPhoneAssets/postcard-phone').set({businessUid:business.uid,status:'ACTIVE',activeBindingId:'postcard-binding',displayNumber:'(410) 732-6184'});
 await db.doc('trackingPhoneBindings/postcard-binding').set({businessUid:business.uid,trackingPhoneAssetId:'postcard-phone',campaignId:o.campaignId});
 const m=await f.print.mutate({action:'create',requestId:'valid-contact',draft:{...draft,trackingPhoneAssetId:'postcard-phone'}},business),v=await f.print.prepare({materialId:m.materialId},business);
 const saved=(await db.doc(`marketingMaterialVersions/${v.versionId}`).get()).data();assert.equal(saved.landingPage.destination,draft.destinationUrl);assert.equal(saved.trackingPhoneSnapshot.campaignId,o.campaignId);
 await assert.rejects(f.print.mutate({action:'create',requestId:'wrong-contact',draft:{...draft,campaignId:f.order.campaignId,trackingPhoneAssetId:'postcard-phone'}},business),/tracking_phone_forbidden/);
 await assert.rejects(f.print.mutate({action:'create',requestId:'bad-url',draft:{...draft,destinationUrl:'http://insecure.example'}},business),/https/);
});

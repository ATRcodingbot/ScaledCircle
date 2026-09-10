"use strict";

// Neighborhood mail extends the maintained campaign, creative and Stripe
// authorities. No printer/USPS API, production payment or Scaler ledger writes.
const crypto = require("node:crypto");
const physical = require("./physical_marketing");
const POLICY = "NeighborhoodPostcardFulfillmentV1";
const FEE_POLICY = Object.freeze({version:'PostcardFulfillmentCreative20V1',rateBps:2000,basis:['printingCents','postageCents'],rounding:'nearest_cent_half_up',taxExcluded:true});
const USPS_REFERENCE = Object.freeze({
  checkedOn: "2026-09-08", rateEffectiveOn: "2026-07-12", rateCents: 26,
  price: "https://pe.usps.com/text/dmm300/Notice123.htm",
  eligibility: "https://pe.usps.com/text/dmm300/143.htm",
  preparation: "https://pe.usps.com/text/dmm300/145.htm",
  documentation: "https://pe.usps.com/text/dmm300/144.htm",
  operations: "https://www.usps.com/business/every-door-direct-mail.htm",
});
const CUSTOMER_STATUS = Object.freeze({
  DRAFT: "Design your postcard", QUOTE_REQUESTED: "Quote being prepared",
  QUOTED: "Your quote is ready", PAYMENT_PENDING: "Payment processing",
  PAYMENT_HOLD: "Payment needs review", PAID: "Design Approved",
  PAYMENT_EXPIRED: "Payment expired — not charged",
  PRINT_READY: "Design Approved", ORDERED_FOR_PRINT: "Printing",
  READY_FOR_PICKUP: "Printing", PRINT_RECEIVED: "Printing",
  USPS_PREPARATION: "Preparing for Mail", MAILED: "Mailed", COMPLETED: "Complete",
  ON_HOLD: "On hold", NEEDS_BUSINESS_APPROVAL: "Your approval is needed",
  FULFILLMENT_ISSUE: "We are reviewing a fulfillment issue",
  CANCEL_REQUESTED: "Cancellation requested", REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded", CANCELED: "Canceled",
});
const STEPS = ["PAID", "PRINT_READY", "ORDERED_FOR_PRINT", "READY_FOR_PICKUP",
  "PRINT_RECEIVED", "USPS_PREPARATION", "MAILED", "COMPLETED"];
function fail(message, code = "failed-precondition") { const e = new Error(message); e.code = code; throw e; }
function id(value) { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) fail("Choose a valid record.", "invalid-argument"); return value; }
function label(value, max = 200) { const s = String(value || "").trim(); if (!s || s.length > max || /[<>\x00-\x1f]/.test(s)) fail("Complete the requested details.", "invalid-argument"); return s; }
function money(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) fail("Enter a valid amount in cents.", "invalid-argument"); return value; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(physical.stable(value))).digest("hex"); }
function iso(value) { return value?.toDate ? value.toDate().toISOString() : value || null; }
function routeSelection(input) {
  if (!Array.isArray(input.routes) || !input.routes.length || input.routes.length > 20) fail("Verify the selected USPS routes.");
  const routes = input.routes.map(r => ({zip: /^\d{5}$/.test(r.zip) ? r.zip : fail("A five-digit ZIP is required."), route: /^[CRB]\d{3}$/.test(r.route) ? r.route : fail("Use the USPS carrier route code."), quantity: money(r.quantity), delivery: ["residential", "all"].includes(r.delivery) ? r.delivery : fail("Choose residential or all addresses.")}));
  if (new Set(routes.map(r => `${r.zip}-${r.route}`)).size !== routes.length || routes.some(r => r.quantity < 1)) fail("Select each complete USPS route once.");
  const byZip = {};
  for (const r of routes) byZip[r.zip] = (byZip[r.zip] || 0) + r.quantity;
  // Conservative V1: special under-200 ZIP exceptions remain manual/unavailable.
  const quantity = routes.reduce((n, r) => n + r.quantity, 0);
  if (quantity < 200 || Object.values(byZip).some(n => n > 5000)) fail("EDDM Retail V1 supports 200+ pieces, at most 5,000 per ZIP per day.");
  return {routes, quantity, selectionHash: hash(routes), source: "USPS EDDM route selection reviewed by Admin"};
}
function quoteMath(input, quantity) {
  const printingCents = money(input.printingCents), postageCents = money(input.postageCents);
  const feeBaseCents=money(printingCents+postageCents);
  const fulfillmentCents = Math.floor((feeBaseCents*FEE_POLICY.rateBps+5000)/10000), taxCents = money(input.taxCents || 0);
  if(input.fulfillmentCents!=null && input.fulfillmentCents!==fulfillmentCents)fail('The ScaledCircle Fulfillment & Creative fee is calculated as 20% of printing plus postage.');
  const printCostCents = money(input.printCostCents), postageCostCents = money(input.postageCostCents);
  const handlingCostCents = money(input.handlingCostCents || 0);
  const rateCents = money(input.postageRateCents);
  if (!rateCents || postageCents !== rateCents * quantity || postageCostCents !== postageCents) fail("Postage must match the confirmed USPS cost without hidden markup.");
  const totalCents = money(printingCents + postageCents + fulfillmentCents + taxCents);
  if (!totalCents || printingCents + fulfillmentCents < printCostCents + handlingCostCents) fail("The quote does not cover the confirmed fulfillment costs.");
  return {customer: {printingCents, postageCents, feeBaseCents,fulfillmentCents,feePolicy:FEE_POLICY,taxCents, totalCents, currency: "usd"},
    internal: {printCostCents, postageCostCents, handlingCostCents,fulfillmentRevenueCents:fulfillmentCents,estimatedGrossMarginCents: totalCents - taxCents - printCostCents - postageCostCents - handlingCostCents, postageRateCents: rateCents}};
}
function createPostcardService({db, FieldValue, bucket, physicalService, stripe, projectId, now = () => Date.now()}) {
  const orders = db.collection("postcardOrders"), privateOps = db.collection("postcardFulfillmentPrivate");
  function enabled() { if (projectId !== "scaledcircle-staging" && !projectId?.startsWith("demo-postcard")) fail("Postcard Campaigns are in staging Beta. Customer payment is not enabled."); }
  function actorCheck(actor, admin = false) { enabled(); if (!actor?.uid || (admin ? actor.isAdmin !== true : actor.role !== "business")) fail("This action is not available to this account.", "permission-denied"); }
  async function owned(orderId, actor, admin = false) { actorCheck(actor, admin); const ref = orders.doc(id(orderId)), snap = await ref.get(); if (!snap.exists || (!admin && snap.data().businessId !== actor.uid)) fail("This postcard order is not available.", "permission-denied"); return {ref, order: snap.data()}; }
  function publicOrder(order) { const out = {...order, customerStatus: order.status==='REFUNDED' && order.refundCents<order.paidCents ? 'Partially refunded' : CUSTOMER_STATUS[order.status] || "Under review"}; for (const key of ["createdAt", "updatedAt", "paidAt", "mailedAt"]) out[key] = iso(out[key]); return out; }
  function notify(tx, order, kind) {
    const messages = {approved: ["Postcard approved", "Your approved postcard campaign is ready for fulfillment."], printing: ["Printing started", "ScaledCircle is preparing your approved postcard campaign."], mailed: ["Postcard campaign mailed", "Your ScaledCircle postcard campaign has been mailed."]};
    const [title, body] = messages[kind];
    tx.set(db.doc(`notifications/postcard_${order.orderId}_${kind}`), {userId: order.businessId, type: "postcard_fulfillment", title: order.simulation ? `TEST simulation: ${title}` : title, body: order.simulation ? `Software certification only. ${body} No physical mailing is claimed.` : body, read: false, campaignId: order.campaignId, orderId: order.orderId, createdAt: FieldValue.serverTimestamp()});
  }
  function audit(tx, order, actor, action, key) { tx.create(db.doc(`postcardAudit/${order.orderId}_${key}`), {orderId: order.orderId, businessId: order.businessId, actorUid: actor.actorUid || actor.uid, action, environment: "staging", simulation: order.simulation, createdAt: FieldValue.serverTimestamp()}); }
  async function workspace(input, actor) {
    actorCheck(actor, input?.admin === true);
    const admin = input?.admin === true;
    const query = admin ? orders : orders.where("businessId", "==", actor.uid);
    const docs = await query.limit(100).get();
    const items = await Promise.all(docs.docs.map(async d => ({...publicOrder(d.data()), ...(admin ? {operations: (await privateOps.doc(d.id).get()).data() || {}, evidence:(await db.collection('postcardEvidence').where('orderId','==',d.id).get()).docs.map(e=>({evidenceId:e.id,label:e.data().kind.replaceAll('_',' '),sha256:e.data().sha256}))} : {})})));
    if(admin) {
      const names = new Map();
      for(const item of items) {
        if(!names.has(item.businessId)) {
          const [growth,user]=await Promise.all([db.doc(`businessGrowthProfiles/${item.businessId}`).get(),db.doc(`users/${item.businessId}`).get()]);
          const g=growth.data()||{},u=user.data()||{};
          names.set(item.businessId,String(g.businessName||u.businessName||u.companyName||u.displayName||'Business').slice(0,120));
        }
        item.businessName=names.get(item.businessId);
        if(item.versionId){const v=(await db.doc(`marketingMaterialVersions/${item.versionId}`).get()).data();item.uploadReview=v?.artworkSnapshot?.report||null;item.uploadSources=(v?.artworkSnapshot?.originals||[]).map((s,index)=>({index,contentType:s.contentType,sha256:s.sha256}));}
      }
    }
    const grant=(await db.doc('privateProductAccess/'+actor.uid).get()).data();
    const creationAvailable=!admin&&require('./product_availability').allowed({product:'postcards',businessId:actor.uid,grant,now:now()});
    return {policy: POLICY, available: true, creationAvailable, availabilityLabel:'Private Beta', environment: "staging", fulfilledBy: "ScaledCircle", orders: items.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))), usps: admin ? USPS_REFERENCE : null, physical: admin ? null : await physicalService.workspace({}, actor)};
  }
  async function create(input, actor) {
    actorCheck(actor);
    await require('./product_availability').assertPurchase({db,businessId:actor.uid,selection:{items:['postcards']},now:now()});
    const requestId = id(input.requestId), orderId = `postcard_${hash([actor.uid, requestId]).slice(0,40)}`;
    const creationMode=['upload','template','assisted'].includes(input.creationMode)?input.creationMode:null;
    const mailingPending=creationMode!==null && input.targetArea==null;
    const name = label(input.name, 100), targetArea = mailingPending?null:label(input.targetArea), zip = mailingPending?null:String(input.zip || "");
    const desiredQuantity = input.desiredQuantity == null ? 200 : money(input.desiredQuantity);
    if(desiredQuantity<200||desiredQuantity>5000)fail('Choose a preferred quantity between 200 and 5,000.');
    if (!mailingPending && !/^\d{5}$/.test(zip)) fail("Enter the mailing area's ZIP Code.", "invalid-argument");
    let mapping = null;
    if (input.mappingCampaignId) { const c = await db.doc(`campaigns/${id(input.mappingCampaignId)}`).get(); if (!c.exists || c.data().businessId !== actor.uid || c.data().certificationFixture === true) fail("Choose your Business mailing area.", "permission-denied"); mapping = {campaignId: c.id, source: "Business-selected existing campaign area; USPS routes still require verification"}; }
    const draftHash = hash({name,targetArea,zip,mapping,desiredQuantity,creationMode,simulation:input.simulation === true});
    const ref = orders.doc(orderId);
    await db.runTransaction(async tx => {
      const old = await tx.get(ref);
      if (old.exists) { if (old.data().draftHash !== draftHash) fail("This request already has different details."); return; }
      const at = FieldValue.serverTimestamp();
      const order = {policy: POLICY, orderId, campaignId: orderId, businessId: actor.uid, name, targetArea, zip, mapping, desiredQuantity,creationMode,mailingPending,draftHash,status: "DRAFT", mailingMethod: "eddm_retail", simulation: input.simulation === true, testMode: true, createdAt: at, updatedAt: at};
      tx.create(ref, order);
      tx.create(db.doc(`campaigns/${orderId}`), {name, title:name, businessId: actor.uid, campaignType:"neighborhoodPostcards", distributionType:"directMail", status:"draft", postcardOrderId:orderId, targetArea, zip, sourceMapping:mapping, createdAt:at});
      audit(tx, order, actor, "created", "created");
    });
    return publicOrder((await ref.get()).data());
  }
  async function mailing(input,actor){
    const {ref,order}=await owned(input.orderId,actor);
    const targetArea=label(input.targetArea),zip=String(input.zip||''),desiredQuantity=money(input.desiredQuantity);
    if(!/^\d{5}$/.test(zip)||desiredQuantity<200||desiredQuantity>5000)fail('Choose a ZIP Code and preferred quantity from 200 to 5,000.','invalid-argument');
    await db.runTransaction(async tx=>{const current=(await tx.get(ref)).data();if(current.status!=='DRAFT')fail('Mailing details are locked to the requested quote.');tx.update(ref,{targetArea,zip,desiredQuantity,mailingPending:false,updatedAt:FieldValue.serverTimestamp()});tx.update(db.doc(`campaigns/${order.campaignId}`),{targetArea,zip});});
    return {orderId:ref.id,targetArea,zip,desiredQuantity,mailingPending:false};
  }
  async function requestQuote(input, actor) {
    const {ref,order} = await owned(input.orderId, actor);
    if(order.mailingPending||!order.targetArea||!/^\d{5}$/.test(order.zip||''))fail('Choose your mailing area and quantity before requesting a quote.');
    const [material, version, approval] = await Promise.all([db.doc(`marketingMaterials/${id(input.materialId)}`).get(), db.doc(`marketingMaterialVersions/${id(input.versionId)}`).get(), db.doc(`marketingMaterialApprovals/${id(input.versionId)}`).get()]);
    const v = version.data() || {}, m = material.data() || {};
    if (m.businessUid !== actor.uid || v.businessUid!==actor.uid || m.campaignId !== order.campaignId || m.approvedVersionId !== version.id || v.productSpecId !== "postcard_eddm_6x11" || v.materialId !== material.id || !approval.exists || approval.data().artifactId!==v.artifactId || approval.data().decision!=='approved' || !physical.versionOrderReady(v)) fail("Approve the exact EDDM-ready design before requesting a quote.");
    const artifact = (await db.doc(`printReadyArtifacts/${v.artifactId}`).get()).data();
    if (!artifact?.artifactHash || !artifact.storagePath) fail("The approved print file is unavailable.");
    await db.runTransaction(async tx => { const o = (await tx.get(ref)).data(); if (o.status === "QUOTE_REQUESTED" && o.versionId === version.id) return; if (o.status !== "DRAFT") fail("This order is already bound to an approved design."); tx.update(ref, {status:"QUOTE_REQUESTED", materialId:material.id, versionId:version.id, artifactId:v.artifactId, artifactHash:artifact.artifactHash, storagePath:artifact.storagePath, responseAssetId:v.responseAssetId, updatedAt:FieldValue.serverTimestamp()}); audit(tx,order,actor,"quote_requested","quote_requested"); });
    return {orderId:ref.id,status:"QUOTE_REQUESTED"};
  }
  async function confirmQuote(input, actor) {
    const {ref,order} = await owned(input.orderId, actor, true);
    const artifact=(await db.doc(`printReadyArtifacts/${id(order.artifactId)}`).get()).data();
    if(artifact?.uploadPreflight && input.artworkReviewed!==true)fail('Review the uploaded original and final rendition for safe text placement, readable source images and an unobstructed mailing panel before confirming the quote.');
    const selection = routeSelection(input), amounts = quoteMath(input,selection.quantity);
    if (order.simulation ? input.simulationAcknowledged!==true : (input.uspsVerified !== true || input.mailpieceVerified !== true || input.costsConfirmed !== true)) fail("Confirm USPS route counts, physical stock eligibility and local costs, or explicitly acknowledge a software-only simulation.");
    if(order.simulation)selection.source='Software simulation — route counts and local costs are illustrative, not USPS/vendor verification';
    if (selection.routes.some(r=>r.zip!==order.zip)) fail("V1 quotes must match the Business-selected ZIP.");
    const verifiedOn = label(input.uspsVerifiedOn,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedOn) || !Number.isFinite(Date.parse(verifiedOn+'T12:00:00Z')) || Math.abs(now()-Date.parse(verifiedOn+'T12:00:00Z'))>7*86400000) fail("Recheck current USPS requirements and rates before quoting.");
    if (!(input.stockThicknessInches >= .009 && input.stockThicknessInches <= .75 && input.pieceWeightOz > 0 && input.pieceWeightOz <= 3.3) || input.stockFlexible !== true) fail("Confirm flexible, uniformly thick eligible stock and actual piece weight.");
    const quoteId = `quote_${hash({orderId:ref.id,selection,amounts,artifactHash:order.artifactHash}).slice(0,40)}`;
    const quote = {...amounts.customer, quoteId, quantity:selection.quantity, routes:selection.routes, routeHash:selection.selectionHash, artifactHash:order.artifactHash, versionId:order.versionId, expiresAt:new Date(now()+48*3600000).toISOString(), cancellationPolicy:"Cancel before printing is ordered for a full refund. After print commitment, request review of documented unrecoverable costs; no automatic refund promise. Mailing cannot be recalled.", estimate:label(input.estimate,120)};
    await db.runTransaction(async tx=>{const o=(await tx.get(ref)).data();if(o.status==='QUOTED'&&o.quote?.quoteId===quoteId)return;if(o.status!=='QUOTE_REQUESTED')fail("Only a pending quote can be confirmed.");tx.update(ref,{status:'QUOTED',quote,updatedAt:FieldValue.serverTimestamp()});tx.create(privateOps.doc(ref.id),{...amounts.internal,vendor:label(input.vendor,100),printSpecification:label(input.printSpecification),uspsVerifiedOn:verifiedOn,uspsReference:USPS_REFERENCE,routeEvidenceReference:label(input.routeEvidenceReference),stockThicknessInches:input.stockThicknessInches,pieceWeightOz:input.pieceWeightOz,stockFlexible:true,quoteConfirmedBy:actor.uid,createdAt:FieldValue.serverTimestamp()});audit(tx,order,actor,'quote_confirmed','quote_confirmed');});
    return {orderId:ref.id,status:'QUOTED',quote};
  }
  async function checkout(input, actor) {
    actorCheck(actor);
    await require('./product_availability').assertPurchase({db,businessId:actor.uid,selection:{items:['postcards']},now:now()});
    const {ref,order} = await owned(input.orderId,actor);
    if (input.quoteId !== order.quote?.quoteId || input.artifactHash !== order.artifactHash || input.acceptTerms !== true) fail("Review and accept this exact quote and approved design.");
    if (order.checkoutSessionId) return {orderId:ref.id,url:order.checkoutUrl,status:order.status};
    await db.runTransaction(async tx=>{const o=(await tx.get(ref)).data();if(o.status!=='QUOTED'||Date.parse(o.quote.expiresAt)<=now())fail("The quote expired or payment already started. Refresh the order.");tx.update(ref,{status:'PAYMENT_PENDING',checkoutStartedAt:FieldValue.serverTimestamp(),acceptedQuoteId:input.quoteId,acceptedBy:actor.actorUid||actor.uid,updatedAt:FieldValue.serverTimestamp()});});
    try {
      const s = await stripe().checkout.sessions.create({mode:'payment',payment_method_types:['card'],client_reference_id:ref.id,metadata:{purpose:POLICY,orderId:ref.id,businessId:actor.uid,quoteId:order.quote.quoteId,artifactHash:order.artifactHash},payment_intent_data:{metadata:{purpose:POLICY,orderId:ref.id,quoteId:order.quote.quoteId}},line_items:[{price_data:{currency:'usd',unit_amount:order.quote.totalCents,product_data:{name:`${order.simulation?'TEST simulation — ':''}Neighborhood Postcards — ${order.name}`}},quantity:1}],success_url:`https://scaledcircle-staging.web.app/#/business/postcards?order=${ref.id}`,cancel_url:`https://scaledcircle-staging.web.app/#/business/postcards?order=${ref.id}`,expires_at:Math.floor(now()/1000)+1800},{idempotencyKey:`postcard-${ref.id}-${order.quote.quoteId}`});
      if (s.livemode !== false || !/^cs_test_/.test(s.id) || !/^https:\/\/checkout.stripe.com\//.test(s.url)) fail("TEST payment authority could not be confirmed.");
      await ref.update({checkoutSessionId:s.id,checkoutUrl:s.url,updatedAt:FieldValue.serverTimestamp()});
      return {orderId:ref.id,url:s.url,sessionId:s.id,status:'PAYMENT_PENDING',testMode:true};
    } catch (_) { await ref.update({status:'PAYMENT_HOLD',updatedAt:FieldValue.serverTimestamp()});fail("Payment creation needs reconciliation. Do not create a replacement payment."); }
  }
  async function reconcile(input, actor) {
    const {ref,order} = await owned(input.orderId,actor, input.admin === true);
    const sessionId = order.checkoutSessionId || (actor.isAdmin === true ? input.sessionId : null);
    if (!sessionId || !/^cs_test_/.test(sessionId)) fail("An Admin must reconcile the existing TEST payment before retrying.");
    const s = await stripe().checkout.sessions.retrieve(sessionId,{expand:['payment_intent']});
    if (s.livemode !== false || s.client_reference_id!==ref.id || s.metadata?.purpose!==POLICY || s.metadata?.businessId!==order.businessId || s.metadata?.quoteId!==order.quote?.quoteId || s.metadata?.artifactHash!==order.artifactHash || s.amount_total!==order.quote.totalCents || s.currency!=='usd') fail("Provider payment binding differs; fulfillment is on hold.");
    if (s.payment_status!=='paid') {
      if(s.status==='expired')await db.runTransaction(async tx=>{const o=(await tx.get(ref)).data();if(['PAYMENT_PENDING','PAYMENT_HOLD'].includes(o.status))tx.update(ref,{status:'PAYMENT_EXPIRED',updatedAt:FieldValue.serverTimestamp()});});
      return {orderId:ref.id,status:s.status==='expired'?'PAYMENT_EXPIRED':order.status,paymentStatus:s.payment_status};
    }
    const pi = s.payment_intent;
    if (!pi || typeof pi!=='object' || pi.livemode!==false || pi.status!=='succeeded' || pi.amount_received!==order.quote.totalCents || pi.currency!=='usd') fail("Payment settlement is not confirmed.");
    await db.runTransaction(async tx=>{const receipt=db.doc(`postcardPaymentReceipts/${ref.id}`);const [o,r]=await Promise.all([tx.get(ref),tx.get(receipt)]);if(r.exists){if(r.data().paymentIntentId!==pi.id)fail("A different payment is already recorded.");return;}if(!['PAYMENT_PENDING','PAYMENT_HOLD'].includes(o.data().status))fail("This order cannot accept payment reconciliation.");tx.create(receipt,{orderId:ref.id,sessionId:s.id,paymentIntentId:pi.id,amountCents:s.amount_total,currency:'usd',livemode:false,reconciledAt:FieldValue.serverTimestamp()});tx.update(ref,{status:'PAID',paidCents:s.amount_total,paymentIntentId:pi.id,checkoutSessionId:s.id,paidAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});audit(tx,order,actor,'paid','paid');notify(tx,order,'approved');});
    return {orderId:ref.id,status:(await ref.get()).data().status,paidCents:s.amount_total,testMode:true};
  }
  async function evidence(input, actor) {
    const {ref} = await owned(input.orderId,actor,true);
    if (!['printer_confirmation','printer_receipt','usps_receipt','mailing_documents'].includes(input.kind)) fail("Choose the evidence type.");
    const bytes=Buffer.from(input.base64||'','base64');if(bytes.length<8||bytes.length>5*1024*1024||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))fail("Upload a PDF receipt, up to 5 MB.");
    const sha=crypto.createHash('sha256').update(bytes).digest('hex'), storagePath=`postcard_operations_private/${ref.id}/${sha}.pdf`;
    await bucket().file(storagePath).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'application/pdf',cacheControl:'private,no-store'}}).catch(e=>{if(e.code!==412)throw e;});
    const record={kind:input.kind,sha256:sha,storagePath,uploadedBy:actor.uid,createdAt:FieldValue.serverTimestamp()};
    const evidenceId=`${ref.id}_${input.kind}_${sha}`;
    await db.runTransaction(async tx=>{const er=db.doc(`postcardEvidence/${evidenceId}`);if((await tx.get(er)).exists)return;tx.create(er,{orderId:ref.id,...record});});
    return {evidenceId,sha256:sha};
  }
  async function advance(input, actor) {
    const {ref,order} = await owned(input.orderId,actor,true), next=input.status;
    if (!STEPS.includes(next) && !['ON_HOLD','NEEDS_BUSINESS_APPROVAL','FULFILLMENT_ISSUE'].includes(next)) fail("Choose a supported fulfillment step.");
    const evidenceSnap=input.evidenceId?await db.doc(`postcardEvidence/${id(input.evidenceId)}`).get():null;
    if(evidenceSnap && (!evidenceSnap.exists || evidenceSnap.data().orderId!==ref.id))fail('The evidence does not belong to this order.');
    if (input.simulation !== order.simulation) fail("Confirm whether this is a software simulation.");
    if (next==='MAILED'&&!order.simulation && (!evidenceSnap?.exists||evidenceSnap.data().orderId!==ref.id||evidenceSnap.data().kind!=='usps_receipt')) fail("USPS acceptance evidence is required before marking mailed.");
    let mailDate=null;
    if(next==='MAILED') {
      mailDate=input.mailDate|| (order.simulation?new Date(now()).toISOString().slice(0,10):null);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(mailDate||'') || !Number.isFinite(Date.parse(mailDate)) || new Date(mailDate).toISOString().slice(0,10)!==mailDate || mailDate>new Date(now()).toISOString().slice(0,10) || mailDate<String(iso(order.paidAt)||'').slice(0,10)) fail('Enter the actual USPS acceptance date, between payment and today.');
    }
    if (['ORDERED_FOR_PRINT','PRINT_RECEIVED'].includes(next)&&!order.simulation && (!evidenceSnap?.exists||evidenceSnap.data().orderId!==ref.id||!['printer_confirmation','printer_receipt'].includes(evidenceSnap.data().kind))) fail("Record the printer confirmation or receipt first.");
    await db.runTransaction(async tx=>{
      const o=(await tx.get(ref)).data();if(o.status===next)return;
      const holding=['ON_HOLD','NEEDS_BUSINESS_APPROVAL','FULFILLMENT_ISSUE'];
      if(!o.paidCents || (!STEPS.includes(o.status)&&!holding.includes(o.status)))fail("Reconciled payment and an eligible fulfillment state are required.");
      const at=FieldValue.serverTimestamp(), revision=(o.fulfillmentRevision||0)+1;
      if(holding.includes(o.status)){
        if(next!==o.heldFromStatus || input.resolveHold!==true)fail("Resolve the hold and return only to the previous verified step.");
        const resolution=label(input.note,500);
        tx.update(ref,{status:next,heldFromStatus:null,fulfillmentRevision:revision,updatedAt:at});
        tx.create(db.doc(`postcardAudit/${ref.id}_hold_resolved_${revision}`),{orderId:ref.id,businessId:o.businessId,actorUid:actor.uid,action:'hold_resolved',resolution,createdAt:at,environment:'staging'});
        return;
      }
      if(STEPS.includes(next)&&STEPS.indexOf(next)!==STEPS.indexOf(o.status)+1)fail("Complete the preceding fulfillment step first.");
      const isHold=holding.includes(next);if(isHold)label(input.note,500);
      tx.update(ref,{status:next,fulfillmentRevision:revision,updatedAt:at,...(isHold?{heldFromStatus:o.status}:{}),...(next==='MAILED'?{mailedAt:at,mailDate,mailedQuantity:o.quote.quantity}:{}),...(next==='PRINT_RECEIVED'?{printedAt:at}:{} )});
      audit(tx,o,actor,next.toLowerCase(),isHold?`${next.toLowerCase()}_${revision}`:next.toLowerCase());
      if(input.evidenceId||isHold)tx.set(privateOps.doc(ref.id),{[`step${revision}`]:{status:next,evidenceId:input.evidenceId||null,note:input.note?label(input.note,500):null,at}},{merge:true});
      if(next==='ORDERED_FOR_PRINT')notify(tx,o,'printing');if(next==='MAILED')notify(tx,o,'mailed');
    });
    return {orderId:ref.id,status:next,simulation:order.simulation};
  }
  async function costs(input,actor) {
    const {ref,order}=await owned(input.orderId,actor,true);
    if (!order.quote || !order.paidCents) fail("Reconciled payment is required before recording actual fulfillment costs.");
    const actualPrintCents=money(input.actualPrintCents),actualPostageCents=money(input.actualPostageCents),actualHandlingCents=money(input.actualHandlingCents||0),actualFeesCents=money(input.actualFeesCents||0);
    const actualGrossMarginCents=order.paidCents==null?null:order.paidCents-(order.quote.taxCents||0)-actualPrintCents-actualPostageCents-actualHandlingCents-actualFeesCents;
    if (!order.quote || !order.paidCents) fail("Reconciled payment is required before recording actual fulfillment costs.");
    const cost={actualPrintCents,actualPostageCents,actualHandlingCents,actualFeesCents,actualGrossMarginCents};
    await db.runTransaction(async tx=>{const cr=db.doc(`postcardCostHistory/${ref.id}_${hash(cost)}`);if((await tx.get(cr)).exists)return;const record={...cost,costRecordedBy:actor.uid,costRecordedAt:FieldValue.serverTimestamp()};tx.create(cr,{orderId:ref.id,...record});tx.set(privateOps.doc(ref.id),record,{merge:true});});
    return {orderId:ref.id,actualGrossMarginCents};
  }
  async function cancel(input,actor) {
    const {ref,order}=await owned(input.orderId,actor);
    await db.runTransaction(async tx=>{const o=(await tx.get(ref)).data();if(['CANCELED','CANCEL_REQUESTED','REFUND_PENDING','REFUNDED'].includes(o.status))return;if(['MAILED','COMPLETED'].includes(o.heldFromStatus||o.status))fail("Mail already entered cannot be recalled. Contact support for an issue review.");if(['PAYMENT_PENDING','PAYMENT_HOLD'].includes(o.status))fail("Reconcile the existing payment first.");const paid=Boolean(o.paidCents),state=paid?'CANCEL_REQUESTED':'CANCELED';tx.update(ref,{status:state,cancellationRequestedAt:FieldValue.serverTimestamp(),cancellationPreviousStatus:o.status,refundEligibility:!paid?'not_charged':['PAID','PRINT_READY'].includes(o.heldFromStatus||o.status)?'full_refund_before_print':'documented_cost_review',updatedAt:FieldValue.serverTimestamp()});audit(tx,order,actor,'cancellation_requested','cancellation_requested');});return {orderId:ref.id,status:(await ref.get()).data().status};
  }
  async function refund(input,actor) {
    const {ref,order}=await owned(input.orderId,actor,true);
    // Admin records the maintained provider refund; never fabricate or mark
    // refunded from a manual status dropdown. Provider creation stays manual.
    if (!['CANCEL_REQUESTED','REFUND_PENDING','REFUNDED'].includes(order.status)) fail("A cancellation review is required.");
    const r=await stripe().refunds.retrieve(id(input.refundId));
    if(r.payment_intent!==order.paymentIntentId||r.currency!=='usd'||r.status!=='succeeded'||r.amount>order.paidCents||r.amount<1)fail("The provider refund is not confirmed for this order.");
    if(order.refundEligibility==='full_refund_before_print'&&r.amount!==order.paidCents)fail("A full refund is required before print commitment.");
    await db.runTransaction(async tx=>{const receipt=db.doc(`postcardRefundReceipts/${ref.id}`);const [o,old]=await Promise.all([tx.get(ref),tx.get(receipt)]);if(old.exists){if(old.data().refundId!==r.id)fail("A different refund is already recorded.");return;}if(!['CANCEL_REQUESTED','REFUND_PENDING'].includes(o.data().status))fail("Refund state changed.");tx.create(receipt,{orderId:ref.id,refundId:r.id,paymentIntentId:r.payment_intent,amountCents:r.amount,reconciledAt:FieldValue.serverTimestamp()});tx.update(ref,{status:'REFUNDED',refundCents:r.amount,updatedAt:FieldValue.serverTimestamp()});audit(tx,order,actor,'refunded','refunded');});return {orderId:ref.id,status:'REFUNDED',refundCents:r.amount};
  }
  async function artifact(input,actor) {
    const {order}=await owned(input.orderId,actor,input.admin===true);
    if(!order.storagePath)fail('Approve and prepare the print file first.');
    if(input.originalIndex!=null){
      actorCheck(actor,true);const v=(await db.doc(`marketingMaterialVersions/${id(order.versionId)}`).get()).data();
      if(!Number.isInteger(input.originalIndex)||input.originalIndex<0)fail('Choose an original artwork file.');
      const source=v?.artworkSnapshot?.originals?.[input.originalIndex];if(!source)fail('This version has no such original artwork file.');
      const [bytes]=await bucket().file(source.storagePath).download();const sha=crypto.createHash('sha256').update(bytes).digest('hex');if(sha!==source.sha256)fail('Original artwork integrity check failed.');
      return {base64:bytes.toString('base64'),sha256:sha,contentType:source.contentType,filename:`original-artwork-${input.originalIndex+1}.${source.contentType==='application/pdf'?'pdf':source.contentType==='image/png'?'png':'jpg'}`};
    }
    const [bytes]=await bucket().file(order.storagePath).download();if(physical.digest(bytes)!==order.artifactHash)fail('The print file integrity check failed.');return {base64:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bindingHash:order.artifactHash,filename:'scaledcircle-neighborhood-mail.pdf'};
  }
  async function sweep() {
    enabled();
    const pending=await orders.where('status','in',['PAYMENT_PENDING','PAYMENT_HOLD']).limit(25).get();
    const results=[];
    for(const doc of pending.docs){if(!doc.data().checkoutSessionId)continue;try{results.push(await reconcile({orderId:doc.id,admin:true},{uid:'postcard-test-reconciler',isAdmin:true}));}catch(_){results.push({orderId:doc.id,status:'RECONCILIATION_HOLD'});}}
    return results;
  }
  return {workspace,create,mailing,requestQuote,confirmQuote,checkout,reconcile,evidence,advance,costs,cancel,refund,artifact,sweep};
}
module.exports={POLICY,FEE_POLICY,USPS_REFERENCE,CUSTOMER_STATUS,STEPS,routeSelection,quoteMath,createPostcardService};

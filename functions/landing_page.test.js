"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const lp=require("./landing_page");
test("no-asset draft is factual and complete",()=>{const d=lp.defaultDraft({businessName:"Harbor Landscaping",offering:"yard cleanup",serviceArea:"Annapolis"});assert.match(d.headline,/yard cleanup/);assert.equal(d.contactFields.includes("email"),true);assert.doesNotMatch(JSON.stringify(d),/award|review|licensed/i);});
test("sanitization rejects unsupported controls",()=>{assert.throws(()=>lp.sanitizeDraft({headline:"Hi",supportingText:"There",style:"raw_css"}),/invalid_landing_page_style/);});
test("public renderer escapes content and omits Flutter",()=>{const content=lp.sanitizeDraft({headline:"<script>x</script>",supportingText:"Safe",valuePoints:["Good"],contactFields:["name","email"]});const html=lp.renderPage({page:{publicSlug:"opaque"},version:{id:"v1",content}});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/main\.dart\.js|flutter_bootstrap/);assert.match(html,/name="email"/);});
test("form requires identity and contact method",()=>{const version={content:{contactFields:["name","email","phone","message"]}};assert.throws(()=>lp.validateSubmission({name:"A"},version),/contact_required/);assert.equal(lp.validateSubmission({name:"A",email:"a@example.invalid"},version).name,"A");});
test("opaque slugs are non-enumerable and avoid ambiguous print glyphs",()=>{const s=lp.slug(()=>Buffer.alloc(18,7));assert.equal(lp.PUBLIC_SLUG_ALPHABET.length,32);assert.equal(s.length,29);assert.match(s,/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ_]+$/);assert.doesNotMatch(s,/[01OIL]/);});
test("public submission contexts are opaque and reject raw record identities",()=>{const token=lp.opaqueContext(()=>Buffer.alloc(18,9));assert.match(token,/^[A-Za-z0-9_-]{24}$/);assert.equal(lp.validOpaqueContext(token),token);assert.equal(lp.validOpaqueContext("version-a"),"");assert.equal(lp.validOpaqueContext("page-a"),"");});
test("unavailable renderer is branded, safe, and omits Flutter",()=>{const html=lp.renderUnavailablePage();assert.match(html,/ScaledCircle/);assert.match(html,/This page is unavailable/);assert.match(html,/noindex,nofollow/);assert.doesNotMatch(html,/main\.dart\.js|flutter_bootstrap|<script/i);});
test("no-asset renderer is a complete responsive funnel",()=>{const content=lp.sanitizeDraft({headline:"Reliable yard cleanup in Annapolis",supportingText:"Tell us about the outdoor work you need.",valuePoints:["Seasonal cleanup","Property upkeep","A clear service conversation"],contactFields:["name","email","phone","message"]});const html=lp.renderPage({page:{publicSlug:"opaque"},version:{id:"v1",content}});for(const marker of ["hero-grid","value-grid","process-title","faq-title","conversion-grid","form-card","mid-cta"]){assert.match(html,new RegExp(marker));}assert.match(html,/@media\(max-width:820px\)/);assert.match(html,/@media\(max-width:420px\)/);assert.match(html,/aria-labelledby="contact-title"/);assert.match(html,/focus-visible/);assert.doesNotMatch(html,/main\.dart\.js|flutter_bootstrap|<script/i);});
test("all style presets produce distinct deterministic presentation",()=>{const rendered=new Map();for(const style of lp.STYLES){const content=lp.sanitizeDraft({headline:"Local service",supportingText:"Start with a clear request.",valuePoints:["Useful service"],style,contactFields:["name","email"]});const html=lp.renderPage({page:{publicSlug:"opaque"},version:{id:"v1",content}});assert.match(html,new RegExp(`<body class="${style}">`));rendered.set(style,html);}assert.equal(rendered.size,4);assert.notEqual(rendered.get("clean"),rendered.get("bold"));assert.notEqual(rendered.get("friendly"),rendered.get("premium"));});
test("renderer adds no unsupported Business claims",()=>{const content=lp.sanitizeDraft({headline:"Home service",supportingText:"Tell us what you need.",valuePoints:["Repairs"],contactFields:["name","email"]});const html=lp.renderPage({page:{publicSlug:"opaque"},version:{id:"v1",content}});assert.doesNotMatch(html,/award|licensed|guarantee|five.star|customer count|financing|same.day|response time/i);assert.match(html,/Submitting does not create a purchase/);});
test("success renderer is branded, responsive, and does not leak implementation details",()=>{const html=lp.renderSuccessPage({style:"friendly"});assert.match(html,/Your request is in/);assert.match(html,/class="friendly"/);assert.match(html,/Powered by ScaledCircle/);assert.match(html,/noindex,nofollow/);assert.doesNotMatch(html,/leadId|Firebase|Firestore|Function|stack|<script/i);});
test("landing inquiry email jobs use the current shared outbound contract",()=>{const job=lp.outboundEmailJob({to:"  PERSON@Example.Invalid ",subject:"Request received",textBody:"Transactional confirmation",template:"landing_page_customer_confirmation",eventType:"landing_page.inquiry.confirmation",metadata:{landingPageId:"page"}});assert.equal(job.schemaVersion,lp.EMAIL_JOB_SCHEMA_VERSION);assert.equal(job.to,"person@example.invalid");assert.equal(job.status,"queued");assert.equal(job.attempts,0);assert.equal(job.fromAddress,"support@scaledcircle.com");assert.equal(job.replyTo,"support@scaledcircle.com");assert.equal(job.template,"landing_page_customer_confirmation");});

test("Business recipient resolution normalizes safe outcomes without exposing records",async()=>{
  const resolved=await lp.resolveBusinessRecipient("business",async()=>({email:"owner@example.invalid",emailVerified:true}));
  assert.equal(resolved.status,"resolved");assert.equal(resolved.category,"resolved");assert.equal(resolved.email,"owner@example.invalid");
  assert.equal(resolved.uid.formatValid,true);assert.equal(resolved.diagnostic.firebaseCode,null);
  assert.equal((await lp.resolveBusinessRecipient("business",async()=>null)).category,"user_not_found");
  assert.equal((await lp.resolveBusinessRecipient("business",async()=>({email:"",emailVerified:true}))).category,"email_missing");
  assert.equal((await lp.resolveBusinessRecipient("business",async()=>({email:"owner@example.invalid",emailVerified:false}))).category,"email_unverified");
  for(const [code,category] of [["auth/insufficient-permission","auth_permission_denied"],["auth/user-not-found","user_not_found"],
    ["auth/network-request-failed","auth_unavailable"],["auth/unexpected-condition","auth_other_failure"]]){
    const outcome=await lp.resolveBusinessRecipient("business",async()=>{const error=new Error("sensitive details");error.code=code;throw error;});
    assert.equal(outcome.category,category);assert.equal(outcome.firebaseErrorCode,code);assert.equal("message" in outcome,false);
  }
});

test("recipient diagnostics distinguish project, UID, permission, backend, and local SDK failures safely",async()=>{
  let calls=0;
  const mismatch=await lp.resolveBusinessRecipient("business-a",async()=>{calls++;return null;},{projectIdentity:{effectiveProjectId:"wrong-project",match:false}});
  assert.equal(mismatch.category,"project_mismatch");assert.equal(calls,0);
  const invalid=await lp.resolveBusinessRecipient(" business-a ",async()=>{calls++;return null;});
  assert.equal(invalid.category,"invalid_business_uid");assert.equal(calls,0);
  for(const [error,category,backend] of [
    [Object.assign(new Error("permission denied for owner@example.invalid"),{code:"auth/insufficient-permission",errorInfo:{code:"auth/insufficient-permission"},httpStatus:403}),"auth_permission_denied","backend_permission_denied"],
    [Object.assign(new Error("Identity Toolkit API has not been used"),{code:"auth/internal-error",httpStatus:403}),"auth_unavailable","identity_toolkit_disabled"],
    [Object.assign(new Error("request timed out"),{code:"auth/internal-error"}),"auth_unavailable","timeout"],
    [new ReferenceError("admin is not defined"),"auth_other_failure","unknown_backend_failure"],
  ]){
    const outcome=await lp.resolveBusinessRecipient("business-a",async()=>{throw error;});
    assert.equal(outcome.category,category);assert.equal(outcome.diagnostic.backendCategory,backend);
    assert.doesNotMatch(JSON.stringify(outcome),/owner@example\.invalid|eyJ[A-Za-z0-9_-]+\./);
  }
});

function memoryDb(seed={}){const docs=new Map(Object.entries(seed));let nextId=0;class Snap{constructor(ref){this.ref=ref;this.id=ref.id;this.exists=docs.has(ref.path);}data(){return docs.get(this.ref.path);}}class Ref{constructor(path){this.path=path;this.id=path.split("/").at(-1);}collection(name){return new Col(`${this.path}/${name}`);}async get(){return new Snap(this);}}class Query{constructor(path,field,value){this.path=path;this.field=field;this.value=value;this.maximum=Infinity;}limit(n){this.maximum=n;return this;}async get(){const prefix=`${this.path}/`;const found=[];for(const [path,data] of docs){if(path.startsWith(prefix)&&!path.slice(prefix.length).includes("/")&&data?.[this.field]===this.value)found.push(new Snap(new Ref(path)));}return{docs:found.slice(0,this.maximum)};}}class Col{constructor(path){this.path=path;}doc(id){return new Ref(`${this.path}/${id||`auto-${++nextId}`}`);}where(field,_op,value){return new Query(this.path,field,value);}}const db={collection:(name)=>new Col(name),runTransaction:async(fn)=>fn({get:(ref)=>ref.get(),create:(ref,data)=>{if(docs.has(ref.path))throw new Error("already_exists");docs.set(ref.path,data);},set:(ref,data,{merge}={})=>docs.set(ref.path,merge?{...(docs.get(ref.path)||{}),...data}:data),update:(ref,data)=>docs.set(ref.path,{...(docs.get(ref.path)||{}),...data})}),docs};return db;}

function landingSeed({trackingMode="off"}={}){const content=lp.sanitizeDraft({headline:"Published A",supportingText:"Current public copy",contactFields:["name","email","phone","message"]});return{"landingPages/page-a":{businessUid:"business-a",publicSlug:"PUBLIC_A",status:"published",trackingMode,publishedVersionId:"version-a",draftVersionId:"version-b",campaignId:null},"landingPages/page-a/versions/version-a":{content,submissionContext:"version-a",publishedAt:"PUBLISHED",published:true,immutable:true,pageId:"page-a",businessUid:"business-a"},"landingPages/page-a/versions/version-b":{content:{...content,headline:"Unpublished B"},immutable:true,pageId:"page-a",businessUid:"business-a"},"users/business-a":{role:"business",businessName:"Harbor Services"}};}

test("submission transaction is retry-idempotent and tracking-off remains unattributed",async()=>{const db=memoryDb(landingSeed());const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},getAuthUser:async()=>({email:"owner@example.invalid",emailVerified:true})});const input={slug:"PUBLIC_A",version:"version-a",name:"Pat",email:"pat@example.invalid",message:"Estimate please"};const first=await service.submit(input,{ip:"127.0.0.1",requestIdentity:"request-one"});const replay=await service.submit(input,{ip:"127.0.0.1",requestIdentity:"request-two"});assert.equal(first.created,true);assert.equal(replay.created,false);assert.equal(first.leadId,replay.leadId);const paths=[...db.docs.keys()];assert.equal(paths.filter((p)=>p.startsWith("salesLeads/")).length,1);assert.equal(paths.filter((p)=>p.startsWith("salesActivities/")).length,1);assert.equal(paths.filter((p)=>p.startsWith("notifications/")).length,1);assert.equal(paths.filter((p)=>p.startsWith("outboundEmailJobs/")).length,2);assert.equal(paths.filter((p)=>p.startsWith("attributionConversions/")).length,0);const lead=db.docs.get(`salesLeads/${first.leadId}`);assert.equal(lead.attribution.landingPageVersionId,"version-a");assert.equal(lead.attribution.sourceDetail,"PUBLIC_A");});

test("phone-only direct inquiry queues no customer email and fabricates no tracked conversion",async()=>{const db=memoryDb(landingSeed({trackingMode:"first_party"}));const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},getAuthUser:async()=>({email:"owner@example.invalid",emailVerified:true})});await service.submit({slug:"PUBLIC_A",version:"version-a",name:"Phone Customer",phone:"555-0100",idempotencyKey:"phone-only"});const paths=[...db.docs.keys()];assert.equal(paths.filter((p)=>p.startsWith("salesLeads/")).length,1);assert.equal(paths.filter((p)=>p.startsWith("outboundEmailJobs/")).length,1);assert.equal(paths.filter((p)=>p.startsWith("attributionConversions/")).length,0);});

test("public input cannot select lead owner or Business email recipient",async()=>{const db=memoryDb(landingSeed());const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},getAuthUser:async()=>({email:"verified-owner@example.invalid",emailVerified:true})});const result=await service.submit({slug:"PUBLIC_A",version:"version-a",name:"Public",email:"visitor@example.invalid",ownerUid:"attacker",businessUid:"attacker",recipient:"attacker@example.invalid",idempotencyKey:"authority"});assert.equal(db.docs.get(`salesLeads/${result.leadId}`).ownerUid,"business-a");const businessJob=[...db.docs.entries()].find(([path])=>path.startsWith("outboundEmailJobs/landing-business_"))[1];assert.equal(businessJob.to,"verified-owner@example.invalid");});

test("saving a draft keeps the published version live and immutable",async()=>{const db=memoryDb(landingSeed());const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"}});const saved=await service.saveDraft({pageId:"page-a",content:{headline:"Draft B",supportingText:"Tomorrow's public copy",contactFields:["name","email"]}}, {uid:"business-a",role:"business"});const page=db.docs.get("landingPages/page-a");assert.equal(page.status,"published");assert.equal(page.publishedVersionId,"version-a");assert.equal(page.draftVersionId,saved.versionId);assert.notEqual(page.draftVersionId,page.publishedVersionId);assert.equal(db.docs.get("landingPages/page-a/versions/version-a").content.headline,"Published A");const resolved=await service.resolve("PUBLIC_A");assert.equal(resolved.version.id,"version-a");assert.equal(resolved.version.content.headline,"Published A");});

test("republish advances only the published pointer and preserves the stable slug and history",async()=>{const db=memoryDb(landingSeed());const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},publicBaseUrl:"https://scaledcircle-staging.web.app"});const saved=await service.saveDraft({pageId:"page-a",content:{headline:"Published B",supportingText:"New public copy",contactFields:["name","email"]}}, {uid:"business-a",role:"business"});const result=await service.transition({pageId:"page-a",action:"publish"},{uid:"business-a",role:"business"});const page=db.docs.get("landingPages/page-a");assert.equal(result.publicSlug,"PUBLIC_A");assert.equal(page.publicSlug,"PUBLIC_A");assert.equal(page.status,"published");assert.equal(page.publishedVersionId,saved.versionId);assert.equal(db.docs.has("landingPages/page-a/versions/version-a"),true);const resolved=await service.resolve("PUBLIC_A");assert.equal(resolved.version.content.headline,"Published B");});

test("visitor opened on A submits A after republish B and public identity overrides fail closed",async()=>{
  const responseContext="rrrrrrrrrrrrrrrrrrrrrrrr";const db=memoryDb(landingSeed({trackingMode:"first_party"}));
  db.docs.get("landingPages/page-a").responseAssetId="asset-a";
  db.docs.set("responseAssets/asset-a",{businessUid:"business-a",publicCode:"cccccccccccccccccccccccc",
    attribution:{landingPageId:"page-a",landingPageVersionId:"version-a"}});
  db.docs.set("responseInteractions/interaction-a",{businessUid:"business-a",responseAssetId:"asset-a",
    landingPageId:"page-a",landingPageVersionId:"version-a",submissionContext:responseContext,
    attributionComplete:true,analyticsClass:"prelaunch",immutable:true});
  const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},
    getAuthUser:async()=>({email:"owner@example.invalid",emailVerified:true}),
    publicBaseUrl:"https://scaledcircle-staging.web.app"});
  const saved=await service.saveDraft({pageId:"page-a",content:{headline:"Published B",
    supportingText:"New public copy",contactFields:["name","email"]}},
  {uid:"business-a",role:"business"});
  await service.transition({pageId:"page-a",action:"publish"},{uid:"business-a",role:"business"});
  const asset=db.docs.get("responseAssets/asset-a");
  assert.equal(asset.attribution.landingPageVersionId,saved.versionId);
  const result=await service.submit({slug:"PUBLIC_A",version:"version-a",response:responseContext,
    name:"Historic visitor",email:"visitor@example.invalid",landingPageVersionId:saved.versionId,
    responseAssetId:"attacker",interactionId:"attacker",idempotencyKey:"historic-a"});
  const lead=db.docs.get(`salesLeads/${result.leadId}`);
  const conversion=db.docs.get(`attributionConversions/lead_${result.leadId}`);
  assert.equal(lead.attribution.landingPageVersionId,"version-a");
  assert.equal(lead.attribution.responseAssetId,"asset-a");
  assert.equal(lead.attribution.interactionId,"interaction-a");
  assert.equal(conversion.analyticsClass,"prelaunch");
  assert.equal(conversion.attribution.landingPageVersionId,"version-a");
  await assert.rejects(()=>service.submit({slug:"PUBLIC_A",version:"version-a",
    response:"xxxxxxxxxxxxxxxxxxxxxxxx",name:"Mismatch",email:"x@example.invalid"}),
  /landing_page_response_context_invalid/);
});

test("only explicit pause and archive transitions make a published page unavailable",async()=>{for(const action of ["pause","archive"]){const db=memoryDb(landingSeed());const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"}});await service.transition({pageId:"page-a",action},{uid:"business-a",role:"business"});await assert.rejects(()=>service.resolve("PUBLIC_A"),/landing_page_unavailable/);assert.equal(db.docs.get("landingPages/page-a").publishedVersionId,"version-a");}});

test("Admin reconciliation upgrades the exact legacy pre-send failure in place and is replay-idempotent",async()=>{const db=memoryDb(landingSeed());const FieldValue={serverTimestamp:()=>"SERVER_TIME"};const outcomes=[];const service=lp.createLandingPageService({db,FieldValue,getAuthUser:async()=>({email:"owner@example.invalid",emailVerified:true}),reportRecipientResolution:async(o)=>outcomes.push(o),publicBaseUrl:"https://scaledcircle-staging.web.app"});const submitted=await service.submit({slug:"PUBLIC_A",version:"version-a",name:"Pat",email:"pat@example.invalid",message:"Estimate",idempotencyKey:"repair"},{ip:"127.0.0.1"});const businessPath=`outboundEmailJobs/landing-business_${submitted.leadId}`;const customerPath=`outboundEmailJobs/landing-customer_${submitted.leadId}`;const legacy=db.docs.get(customerPath);db.docs.delete(businessPath);db.docs.set(customerPath,{to:legacy.to,fromAddress:legacy.fromAddress,template:legacy.template,eventType:legacy.eventType,metadata:{landingPageId:"page-a"},status:"failed_terminal",attempts:0,errorCode:"invalid_server_email_job",createdAt:"ORIGINAL_TIME"});const beforeCounts={leads:[...db.docs.keys()].filter(p=>p.startsWith("salesLeads/")).length,activities:[...db.docs.keys()].filter(p=>p.startsWith("salesActivities/")).length,notifications:[...db.docs.keys()].filter(p=>p.startsWith("notifications/")).length,receipts:[...db.docs.keys()].filter(p=>p.startsWith("landingPageSubmissionReceipts/")).length};const result=await service.reconcileInquiry({leadId:submitted.leadId},{uid:"admin",role:"admin"});assert.deepEqual(result,{lead:"existing",businessRecipient:"resolved",businessEmailJob:"created",customerEmailJob:"reconciled_retry_requested"});assert.equal(db.docs.get(businessPath).payload.landingPageTitle,"Published A");const repaired=db.docs.get(customerPath);assert.equal(repaired.status,"retry_requested");assert.equal(repaired.schemaVersion,lp.EMAIL_JOB_SCHEMA_VERSION);assert.equal(repaired.createdAt,"ORIGINAL_TIME");assert.equal(repaired.reconciliation.previousErrorCode,"invalid_server_email_job");assert.equal(repaired.payload.customerEmail,"pat@example.invalid");const again=await service.reconcileInquiry({leadId:submitted.leadId},{uid:"admin",role:"admin"});assert.deepEqual(again,{lead:"existing",businessRecipient:"resolved",businessEmailJob:"unchanged",customerEmailJob:"unchanged"});assert.deepEqual(beforeCounts,{leads:[...db.docs.keys()].filter(p=>p.startsWith("salesLeads/")).length,activities:[...db.docs.keys()].filter(p=>p.startsWith("salesActivities/")).length,notifications:[...db.docs.keys()].filter(p=>p.startsWith("notifications/")).length,receipts:[...db.docs.keys()].filter(p=>p.startsWith("landingPageSubmissionReceipts/")).length});assert.equal([...db.docs.keys()].filter(p=>p===businessPath).length,1);assert.equal([...db.docs.keys()].filter(p=>p===customerPath).length,1);assert.equal(outcomes.at(-1).category,"resolved");});

test("historical Auth failure recovers later without duplicating canonical inquiry state",async()=>{const db=memoryDb(landingSeed());let available=false;const reports=[];const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},getAuthUser:async()=>{if(!available){const error=new Error("not logged");error.code="auth/insufficient-permission";throw error;}return{email:"owner@example.invalid",emailVerified:true};},reportRecipientResolution:async(o)=>reports.push(o)});const submitted=await service.submit({slug:"PUBLIC_A",version:"version-a",name:"Pat",email:"pat@example.invalid",idempotencyKey:"auth-recovery"});const businessPath=`outboundEmailJobs/landing-business_${submitted.leadId}`;assert.equal(db.docs.has(businessPath),false);assert.equal(reports.at(-1).category,"auth_permission_denied");available=true;const result=await service.reconcileInquiry({leadId:submitted.leadId},{uid:"admin",role:"admin"});assert.equal(result.businessEmailJob,"created");assert.equal(result.businessRecipient,"resolved");assert.equal(db.docs.has(businessPath),true);assert.equal([...db.docs.keys()].filter(p=>p.startsWith("salesLeads/")).length,1);});

test("reconciliation refuses unsafe legacy and provider-terminal jobs",async()=>{for(const patch of [{template:"unrelated_template"},{status:"sent",sentAt:"TIME"},{attempts:1},{providerResult:"rejected"},{errorCode:"email_delivery_failed"},{schemaVersion:lp.EMAIL_JOB_SCHEMA_VERSION}]){const db=memoryDb(landingSeed());const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},getAuthUser:async()=>({email:"owner@example.invalid",emailVerified:true})});const submitted=await service.submit({slug:"PUBLIC_A",version:"version-a",name:"Pat",email:"pat@example.invalid",idempotencyKey:`unsafe-${JSON.stringify(patch)}`});const path=`outboundEmailJobs/landing-customer_${submitted.leadId}`;const current=db.docs.get(path);db.docs.set(path,{...current,schemaVersion:"legacy",status:"failed_terminal",attempts:0,errorCode:"invalid_server_email_job",payload:undefined,...patch});const result=await service.reconcileInquiry({leadId:submitted.leadId},{uid:"admin",role:"admin"});assert.equal(result.customerEmailJob,"unchanged");assert.notEqual(db.docs.get(path).reconciliation?.kind,"legacy_landing_page_schema_upgrade");}});

test("reconciliation denies non-Admin and arbitrary identities",async()=>{const db=memoryDb(landingSeed());const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"}});await assert.rejects(()=>service.reconcileInquiry({leadId:"landing_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{uid:"business-a",role:"business"}),/admin_required/);await assert.rejects(()=>service.reconcileInquiry({leadId:"arbitrary"},{uid:"admin",role:"admin"}),/inquiry_invalid/);});

test("Admin dry-run diagnoses the canonical inquiry without mutating jobs, health, or sent customer delivery",async()=>{
  for(const [authBehavior,expected] of [
    [async()=>({email:"owner@example.invalid",emailVerified:true}),{recipientResolution:"resolved",backendCategory:null}],
    [async()=>{const e=new Error("forbidden");e.code="auth/insufficient-permission";e.httpStatus=403;throw e;},{recipientResolution:"auth_permission_denied",backendCategory:"backend_permission_denied"}],
    [async()=>{throw new ReferenceError("admin is not defined");},{recipientResolution:"auth_other_failure",backendCategory:"unknown_backend_failure"}],
  ]){
    const db=memoryDb(landingSeed());let healthReports=0;
    const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},getAuthUser:authBehavior,
      runtimeProjectIdentity:()=>({effectiveProjectId:"scaledcircle-staging",match:true,gcloudProject:"scaledcircle-staging",
        googleCloudProject:"scaledcircle-staging",firebaseConfigProject:"scaledcircle-staging",adminAppProject:"scaledcircle-staging",authAppProject:"scaledcircle-staging"}),reportRecipientResolution:async()=>{healthReports++;}});
    const submitted=await service.submit({slug:"PUBLIC_A",version:"version-a",name:"Pat",email:"pat@example.invalid",idempotencyKey:`dry-${expected.recipientResolution}`});
    const customerPath=`outboundEmailJobs/landing-customer_${submitted.leadId}`;
    db.docs.set(customerPath,{...db.docs.get(customerPath),status:"sent",sentAt:"SENT_TIME",providerResult:"accepted"});
    const before=JSON.stringify([...db.docs.entries()].sort(([a],[b])=>a.localeCompare(b)));const reportsBefore=healthReports;
    const result=await service.reconcileInquiry({leadId:submitted.leadId,dryRun:true},{uid:"admin",role:"admin"});
    assert.equal(result.authenticated,true);assert.equal(result.dryRun,true);assert.equal(result.project,"scaledcircle-staging");
    assert.equal(result.projectIdentityMatch,true);assert.equal(result.uid.formatValid,true);
    assert.deepEqual(new Set(Object.values(result.projectSources)),new Set(["scaledcircle-staging"]));
    assert.equal(result.recipientResolution,expected.recipientResolution);assert.equal(result.backendCategory,expected.backendCategory);
    assert.equal(JSON.stringify([...db.docs.entries()].sort(([a],[b])=>a.localeCompare(b))),before);
    assert.equal(healthReports,reportsBefore);assert.equal(db.docs.get(customerPath).status,"sent");
    assert.doesNotMatch(JSON.stringify(result),/owner@example\.invalid|admin is not defined|pat@example\.invalid/);
  }
});

test("dry-run fails closed for signed-out, Business, invalid lead, and project mismatch",async()=>{
  const db=memoryDb(landingSeed());let lookups=0;
  const service=lp.createLandingPageService({db,FieldValue:{serverTimestamp:()=>"SERVER_TIME"},getAuthUser:async()=>{lookups++;return{email:"owner@example.invalid",emailVerified:true};},runtimeProjectIdentity:()=>({effectiveProjectId:"other-project",match:false})});
  const submitted=await service.submit({slug:"PUBLIC_A",version:"version-a",name:"Pat",phone:"555-0100",idempotencyKey:"dry-auth"});
  await assert.rejects(()=>service.reconcileInquiry({leadId:submitted.leadId,dryRun:true},null),/admin_required/);
  await assert.rejects(()=>service.reconcileInquiry({leadId:submitted.leadId,dryRun:true},{uid:"business-a",role:"business"}),/admin_required/);
  await assert.rejects(()=>service.reconcileInquiry({leadId:"landing_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",dryRun:true},{uid:"admin",role:"admin"}),/inquiry_missing/);
  const result=await service.reconcileInquiry({leadId:submitted.leadId,dryRun:true},{uid:"admin",role:"admin"});
  assert.equal(result.recipientResolution,"project_mismatch");assert.equal(result.projectIdentityMatch,false);assert.equal(lookups,0);
});

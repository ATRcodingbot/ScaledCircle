"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "LandingPageV1";
const STATUSES = new Set(["draft", "published", "paused", "archived"]);
const STYLES = new Set(["clean", "bold", "friendly", "premium"]);
const CTA_TYPES = new Set(["request_estimate", "get_quote", "call", "text", "book", "visit_website", "custom"]);
const MAX_POINTS = 6;
const EMAIL_JOB_SCHEMA_VERSION = "LandingPageEmailJobV2";
const PUBLIC_ORIGINS = Object.freeze({"scaled-circle":"https://scaledcircle.com","scaledcircle-staging":"https://scaledcircle-staging.web.app","demo-scaledcircle":"http://127.0.0.1:5000"});

function text(value, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function headerText(value, max = 500) { return text(value, max).replace(/[\r\n]+/g, " "); }
function validEmail(value) { const email=headerText(value,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:""; }
function escapeHtml(value) { return text(value, 5000).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
// 144 bits of entropy encoded with a human-safe alphabet. Ambiguous glyphs
// (0/O and 1/I/L) are intentionally absent because Businesses copy these URLs
// into print and social material.
const PUBLIC_SLUG_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ_";
function slug(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(18); let bits = 0; let value = 0; let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += PUBLIC_SLUG_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) result += PUBLIC_SLUG_ALPHABET[(value << (5 - bits)) & 31];
  return result;
}
function opaqueContext(randomBytes = crypto.randomBytes) { return randomBytes(18).toString("base64url"); }
function validOpaqueContext(value) { const v=text(value,80);return /^[A-Za-z0-9_-]{24}$/.test(v)?v:""; }
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function publicOrigin(projectId) { const value=PUBLIC_ORIGINS[text(projectId,160)];if(!value)throw new Error("landing_page_environment_unknown");return value; }

function normalizedFirebaseErrorCode(error) {
  return text(error?.code || error?.errorInfo?.code || "auth/unknown", 80)
    .toLowerCase().replace(/[^a-z0-9/_-]/g, "_");
}

function safeDiagnosticText(value, max = 240) {
  return headerText(value, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[redacted-token]");
}

function firebaseUidDiagnostics(value) {
  const raw=typeof value==="string"?value:"";const trimmed=raw.trim();
  return {length:raw.length,trimmed:raw===trimmed,
    formatValid:raw.length>0&&raw.length<=128&&raw===trimmed&&/^[A-Za-z0-9:_-]+$/.test(raw),
    fingerprint:digest(raw).slice(0,16)};
}

function safeFirebaseErrorDiagnostics(error) {
  const firebaseCode=normalizedFirebaseErrorCode(error);
  const httpStatus=Number(error?.httpResponse?.status||error?.response?.status||error?.status||0)||null;
  const backendCode=text(error?.httpResponse?.data?.error?.status||error?.response?.data?.error?.status||
    error?.cause?.status||error?.cause?.code,80)||null;
  const safeMessage=safeDiagnosticText(error?.errorInfo?.message||error?.message,240)||null;
  const combined=`${firebaseCode} ${backendCode||""} ${safeMessage||""}`.toLowerCase();
  let backendCategory="unknown_backend_failure";
  if(combined.includes("identity toolkit")&&(combined.includes("disabled")||combined.includes("not enabled")||combined.includes("not been used")))backendCategory="identity_toolkit_disabled";
  else if(httpStatus===403||combined.includes("permission")||combined.includes("forbidden"))backendCategory="backend_permission_denied";
  else if(httpStatus===503||combined.includes("service unavailable")||combined.includes("temporarily unavailable"))backendCategory="service_unavailable";
  else if(httpStatus===408||httpStatus===504||combined.includes("timeout")||combined.includes("timed out"))backendCategory="timeout";
  else if(combined.includes("network")||["econnreset","enotfound","eai_again"].some((code)=>combined.includes(code)))backendCategory="network_failure";
  else if(combined.includes("json")||combined.includes("parse"))backendCategory="response_parse_failure";
  else if(combined.includes("credential")||combined.includes("authentication")||combined.includes("unauthenticated"))backendCategory="credential_failure";
  return {firebaseCode,errorInfoCode:text(error?.errorInfo?.code,80)||null,safeMessage,httpStatus,
    httpStatusText:safeDiagnosticText(error?.httpResponse?.statusText||error?.response?.statusText,80)||null,
    backendCode,backendCategory,causeType:text(error?.cause?.constructor?.name,80)||null,
    causeCode:text(error?.cause?.code,80)||null,errorType:text(error?.constructor?.name,80)||null};
}

function firebaseAuthFailureCategory(error) {
  const diagnostic=safeFirebaseErrorDiagnostics(error);const code=diagnostic.firebaseCode;
  if (code.includes("user-not-found")) return "user_not_found";
  if (diagnostic.backendCategory==="backend_permission_denied") return "auth_permission_denied";
  if (["service_unavailable","timeout","network_failure"].includes(diagnostic.backendCategory)||
      code.includes("unavailable")||code.includes("internal")) return "auth_unavailable";
  return "auth_other_failure";
}

async function resolveBusinessRecipient(businessUid, getAuthUser, {projectIdentity=null}={}) {
  const uid=firebaseUidDiagnostics(businessUid);
  if(!uid.formatValid)return{status:"unresolved",category:"invalid_business_uid",firebaseErrorCode:null,email:null,uid,
    diagnostic:{backendCategory:"invalid_business_uid"}};
  if(projectIdentity?.match===false)return{status:"unresolved",category:"project_mismatch",firebaseErrorCode:null,email:null,uid,
    diagnostic:{backendCategory:"project_mismatch"}};
  try {
    const user = await getAuthUser(businessUid);
    if (!user) return {status:"unresolved",category:"user_not_found",firebaseErrorCode:null,email:null,uid,
      diagnostic:{backendCategory:"user_not_found"}};
    const email = validEmail(user.email);
    if (!email) return {status:"unresolved",category:"email_missing",firebaseErrorCode:null,email:null,uid,
      diagnostic:{backendCategory:"email_missing"}};
    if (user.emailVerified !== true) return {status:"unresolved",category:"email_unverified",firebaseErrorCode:null,email:null,uid,
      diagnostic:{backendCategory:"email_unverified"}};
    return {status:"resolved",category:"resolved",firebaseErrorCode:null,email,uid,
      diagnostic:{firebaseCode:null,httpStatus:null,backendCode:null,backendCategory:null,causeType:null,causeCode:null,errorType:null}};
  } catch (error) {
    const diagnostic=safeFirebaseErrorDiagnostics(error);
    if(diagnostic.safeMessage&&businessUid)diagnostic.safeMessage=diagnostic.safeMessage.split(businessUid).join("[redacted-uid]");
    return {status:"unresolved",category:firebaseAuthFailureCategory(error),
      firebaseErrorCode:diagnostic.firebaseCode,email:null,uid,diagnostic};
  }
}

function sanitizeDraft(input = {}) {
  const ctaType = text(input.ctaType, 40).toLowerCase() || "request_estimate";
  const style = text(input.style, 30).toLowerCase() || "clean";
  if (!CTA_TYPES.has(ctaType)) throw new Error("invalid_landing_page_cta");
  if (!STYLES.has(style)) throw new Error("invalid_landing_page_style");
  const headline = text(input.headline, 100);
  const supportingText = text(input.supportingText, 320);
  if (!headline || !supportingText) throw new Error("landing_page_content_required");
  const points = Array.isArray(input.valuePoints) ? input.valuePoints.map((v) => text(v, 120)).filter(Boolean).slice(0, MAX_POINTS) : [];
  const contactFields = Array.isArray(input.contactFields) ? input.contactFields.filter((v) => ["name","email","phone","message"].includes(v)) : ["name","email","phone","message"];
  if (!contactFields.includes("name") || (!contactFields.includes("email") && !contactFields.includes("phone"))) throw new Error("landing_page_contact_method_required");
  return {headline, supportingText, valuePoints: points, ctaType,
    ctaLabel: text(input.ctaLabel, 60) || "Request an estimate", ctaDestination: text(input.ctaDestination, 500) || null,
    style, showProcess: input.showProcess !== false, showFaq: input.showFaq !== false,
    contactFields: [...new Set(contactFields)], privacyDisclosure: "By submitting, you agree that this Business may contact you about your request."};
}

function defaultDraft({businessName, offering, serviceArea}) {
  const business = text(businessName, 100) || "Your local service team";
  const service = text(offering, 100) || "local service";
  const area = text(serviceArea, 100);
  return sanitizeDraft({headline: `${service} from ${business}`, supportingText: `Tell us what you need${area ? ` in ${area}` : ""}. We’ll follow up with a clear next step.`,
    valuePoints: [`A straightforward conversation about your ${service} needs`, "A clear next step based on your request"],
    ctaType: "request_estimate", ctaLabel: "Request an estimate", style: "clean"});
}

function validateSubmission(input = {}, version) {
  const allowed = new Set(version.content.contactFields || []);
  const result = {};
  for (const field of ["name","email","phone","message"]) if (allowed.has(field)) result[field] = text(input[field], field === "message" ? 1000 : 160);
  if (!result.name || (!result.email && !result.phone)) throw new Error("landing_page_contact_required");
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("landing_page_email_invalid");
  if (text(input.website, 200)) throw new Error("landing_page_submission_rejected"); // honeypot
  return result;
}

function outboundEmailJob({to, subject, textBody, template, eventType, metadata}) {
  return {schemaVersion:EMAIL_JOB_SCHEMA_VERSION,to: validEmail(to), fromAddress:"support@scaledcircle.com",
    fromName:"Scaled Circle Support", replyTo:"support@scaledcircle.com",
    subject:headerText(subject,180), text:String(textBody||"").slice(0,12000),
    template:headerText(template,80), eventType:headerText(eventType,80), metadata,
    idempotencyKey:headerText(metadata?.idempotencyKey,180),
    status:"queued", attempts:0, lastErrorClass:null, providerResult:null};
}

function businessInquiryEmail({businessName,contact,pageName,metadata}) {
  const safeName=headerText(contact.name,160)||"A customer";
  return outboundEmailJob({to:metadata.recipient,subject:`New landing page inquiry from ${safeName}`,
    template:"landing_page_business_inquiry",eventType:"landing_page.inquiry.business",metadata,
    textBody:[`A new inquiry was submitted to ${headerText(businessName,120)||"your Business"}.`,
      `Landing Page: ${headerText(pageName,120)||"Landing Page"}`,`Name: ${text(contact.name,160)||"Not provided"}`,
      `Email: ${validEmail(contact.email)||"Not provided"}`,`Phone: ${text(contact.phone,160)||"Not provided"}`,
      `Request: ${text(contact.message,1000)||"No message provided"}`,"",
      "Open Landing Pages in ScaledCircle to review and follow up:",
      "https://scaledcircle.com/#/business/landing-pages"].join("\n")});
}

function customerConfirmationEmail({businessName,contact,metadata}) {
  return outboundEmailJob({to:contact.email,subject:`We sent your request to ${headerText(businessName,120)||"the Business"}`,
    template:"landing_page_customer_confirmation",eventType:"landing_page.inquiry.confirmation",metadata,
    textBody:[`Hi ${text(contact.name,160)},`,"",`Your request was sent to ${text(businessName,120)||"the Business"}.`,
      text(contact.message,1000)?`Request: ${text(contact.message,1000)}`:"",
      "They can follow up using the contact details you provided.","",
      "This confirmation is about your request and is not a marketing subscription.","","Powered by ScaledCircle"].filter(Boolean).join("\n")});
}

function landingPageEmailPayload({businessName,contact,pageName,inquiryUrl}) {
  return {businessName:headerText(businessName,120),customerName:headerText(contact.name,160),
    customerEmail:validEmail(contact.email)||null,customerPhone:text(contact.phone,80)||null,
    inquirySummary:text(contact.message,1000)||null,landingPageTitle:headerText(pageName,160),
    ...(inquiryUrl?{inquiryUrl}: {})};
}

function renderSuccessPage({style="clean"}={}) {
  const safeStyle=STYLES.has(style)?style:"clean";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Request sent | ScaledCircle</title><style>:root{--ink:#10243e;--muted:#526579;--accent:#176fd1;--soft:#edf5fc}body.bold{--ink:#171923;--muted:#4f5260;--accent:#ea4b23;--soft:#fff0e9}body.friendly{--ink:#173b35;--muted:#53716c;--accent:#087f6c;--soft:#e8f7f1}body.premium{--ink:#211d31;--muted:#665e77;--accent:#7858b5;--soft:#f3eef9}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,var(--soft),#fff 68%);color:var(--ink);font:16px/1.6 system-ui,sans-serif}.card{width:min(680px,100%);padding:clamp(30px,7vw,64px);border:1px solid color-mix(in srgb,var(--accent) 22%,#d7e2ec);border-radius:28px;background:#fff;box-shadow:0 22px 70px rgba(16,36,62,.13)}.check{display:grid;width:58px;height:58px;place-items:center;border-radius:18px;background:var(--accent);color:#fff;font-size:1.7rem;font-weight:900}h1{margin:26px 0 12px;font-size:clamp(2.2rem,7vw,4.2rem);line-height:1;letter-spacing:-.04em}p{margin:0;color:var(--muted);font-size:1.08rem}.next{margin-top:26px;padding:20px;border-radius:18px;background:var(--soft)}.brand{display:flex;justify-content:space-between;gap:18px;margin-top:32px;color:var(--ink);font-size:.86rem;font-weight:800}.brand a{color:var(--accent)}</style></head><body class="${safeStyle}"><main class="card"><div class="check" aria-hidden="true">✓</div><h1>Your request is in.</h1><p>The Business received your inquiry and can follow up using the contact details you provided.</p><div class="next"><strong>What happens next</strong><p>Keep an eye on your email or phone. Sending this request did not create a purchase or obligation.</p></div><div class="brand"><span>Powered by ScaledCircle</span><a href="/privacy">Privacy</a></div></main></body></html>`;
}

function renderPage({page, version, formAction = "/landing-page-submit"}) {
  const c = version.content; const title = escapeHtml(c.headline); const description = escapeHtml(c.supportingText);
  const style = STYLES.has(c.style) ? c.style : "clean";
  const points = c.valuePoints.map((p, index) => `<article class="value-card"><span class="value-icon" aria-hidden="true">${index + 1}</span><h3>${escapeHtml(p)}</h3><p>Tell us what matters most, and we’ll use it to guide the next conversation.</p></article>`).join("");
  const fields = c.contactFields.map((field) => field === "message" ? `<label>How can we help?<textarea name="message" maxlength="1000"></textarea></label>` :
    `<label>${escapeHtml(field[0].toUpperCase() + field.slice(1))}<input name="${field}" type="${field === "email" ? "email" : field === "phone" ? "tel" : "text"}" ${field === "name" ? "required" : ""} maxlength="160"></label>`).join("");
  const process = c.showProcess ? `<section class="section process" aria-labelledby="process-title"><div class="section-heading"><p class="eyebrow">A simple next step</p><h2 id="process-title">From request to a useful conversation</h2><p>No complicated intake process. Share the essentials and the Business can follow up about your request.</p></div><ol class="steps"><li><span>1</span><div><h3>Tell us what you need</h3><p>Send the details that will help start the conversation.</p></div></li><li><span>2</span><div><h3>We review your request</h3><p>The Business receives your inquiry with the page context attached.</p></div></li><li><span>3</span><div><h3>Plan the next step</h3><p>Continue directly with the Business based on your needs.</p></div></li></ol></section>` : "";
  const faq = c.showFaq ? `<section class="section faq" aria-labelledby="faq-title"><div class="section-heading"><p class="eyebrow">Good to know</p><h2 id="faq-title">Before you reach out</h2></div><div class="faq-grid"><article><h3>What happens after I submit?</h3><p>Your request goes directly to this Business so they can review it and contact you.</p></article><article><h3>What should I include?</h3><p>Share the service you need and any details that would make the first conversation more useful.</p></article></div><a class="text-link" href="#contact">Ready to get started? ${escapeHtml(c.ctaLabel)} →</a></section>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="noindex,follow"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><style>
:root{color-scheme:light;--ink:#10243e;--muted:#526579;--accent:#176fd1;--accent-dark:#0d4c99;--soft:#edf5fc;--surface:#fff;--line:#d7e2ec;--hero:#e9f4ff;--radius:22px;--shadow:0 18px 55px rgba(16,36,62,.12);--display:system-ui,sans-serif;--body:system-ui,sans-serif}
body.bold{--ink:#171923;--muted:#4f5260;--accent:#ea4b23;--accent-dark:#b92e12;--soft:#fff0e9;--hero:#fff4df;--radius:10px;--shadow:8px 8px 0 #171923;--display:Impact,"Arial Black",system-ui,sans-serif}
body.friendly{--ink:#173b35;--muted:#53716c;--accent:#087f6c;--accent-dark:#056050;--soft:#e8f7f1;--hero:#fff5df;--radius:30px;--shadow:0 18px 50px rgba(23,59,53,.13);--display:ui-rounded,"Trebuchet MS",system-ui,sans-serif}
body.premium{--ink:#211d31;--muted:#665e77;--accent:#7858b5;--accent-dark:#523984;--soft:#f3eef9;--hero:#f8f4ee;--radius:4px;--shadow:0 20px 60px rgba(33,29,49,.14);--display:Georgia,serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:16px/1.6 var(--body);color:var(--ink);background:var(--surface)}a{color:inherit}.shell{width:min(1180px,calc(100% - 40px));margin:auto}.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,var(--hero),#fff 70%);border-bottom:1px solid var(--line)}.hero:after{content:"";position:absolute;width:520px;height:520px;border:90px solid color-mix(in srgb,var(--accent) 13%,transparent);border-radius:50%;right:-230px;top:-270px}.hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(260px,.55fr);gap:clamp(40px,7vw,100px);align-items:center;min-height:640px;padding:clamp(76px,9vw,128px) 0}.eyebrow{margin:0 0 14px;color:var(--accent-dark);font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.hero h1{max-width:820px;margin:0;font:800 clamp(3rem,6vw,5.8rem)/.98 var(--display);letter-spacing:-.045em}.hero-copy{max-width:650px;margin:24px 0 30px;color:var(--muted);font-size:clamp(1.08rem,1.8vw,1.3rem)}.cta{display:inline-flex;min-height:54px;align-items:center;justify-content:center;border:2px solid transparent;border-radius:calc(var(--radius) * .55);padding:14px 24px;background:var(--accent);color:#fff;font-weight:800;text-decoration:none;box-shadow:0 10px 25px color-mix(in srgb,var(--accent) 24%,transparent);transition:transform .15s,background .15s}.cta:hover{background:var(--accent-dark);transform:translateY(-2px)}.cta:focus-visible,.text-link:focus-visible,input:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 42%,white);outline-offset:3px}.hero-note{margin:16px 0 0;color:var(--muted);font-size:.92rem}.hero-panel{padding:30px;border:1px solid color-mix(in srgb,var(--accent) 25%,var(--line));border-radius:var(--radius);background:color-mix(in srgb,var(--surface) 90%,transparent);box-shadow:var(--shadow);backdrop-filter:blur(10px)}.hero-panel strong{display:block;font:700 1.35rem/1.25 var(--display);margin-bottom:16px}.hero-panel span{display:flex;gap:10px;align-items:flex-start;margin-top:12px;color:var(--muted)}.hero-panel span:before{content:"✓";color:var(--accent);font-weight:900}.section{padding:clamp(72px,9vw,118px) 0}.section-heading{max-width:720px;margin-bottom:42px}.section-heading h2,.conversion-copy h2{margin:0;font:750 clamp(2rem,4vw,3.4rem)/1.06 var(--display);letter-spacing:-.025em}.section-heading>p:last-child,.conversion-copy>p{color:var(--muted);font-size:1.08rem}.value-section{background:var(--surface)}.value-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.value-card{min-height:220px;padding:28px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);box-shadow:0 12px 32px rgba(16,36,62,.07)}.value-icon{display:grid;width:44px;height:44px;place-items:center;margin-bottom:24px;border-radius:14px;background:var(--soft);color:var(--accent-dark);font-weight:900}.value-card h3,.steps h3,.faq h3{margin:0 0 10px;font:700 1.18rem/1.25 var(--display)}.value-card p,.steps p,.faq p{margin:0;color:var(--muted)}.mid-cta{margin-top:34px}.process{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(40px,8vw,110px);align-items:start}.steps{display:grid;gap:14px;margin:0;padding:0;list-style:none}.steps li{display:flex;gap:18px;padding:22px;border-radius:var(--radius);background:var(--soft)}.steps li>span{display:grid;flex:0 0 40px;height:40px;place-items:center;border-radius:50%;background:var(--accent);color:#fff;font-weight:900}.faq{border-top:1px solid var(--line)}.faq-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.faq article{padding:26px;border-left:4px solid var(--accent);background:var(--soft)}.text-link{display:inline-block;margin-top:28px;color:var(--accent-dark);font-weight:800;text-decoration-thickness:2px;text-underline-offset:4px}.conversion{background:var(--ink);color:#fff}.conversion-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(320px,1.2fr);gap:clamp(44px,8vw,110px);align-items:center}.conversion-copy .eyebrow{color:color-mix(in srgb,var(--accent) 55%,white)}.conversion-copy>p{color:#d4dde7}.reassurance{display:grid;gap:12px;margin:28px 0 0;padding:0;list-style:none;color:#e5ebf1}.reassurance li:before{content:"✓";margin-right:10px;color:color-mix(in srgb,var(--accent) 48%,white);font-weight:900}.form-card{padding:clamp(24px,4vw,40px);border-radius:var(--radius);background:#fff;color:var(--ink);box-shadow:var(--shadow)}form{display:grid;grid-template-columns:1fr 1fr;gap:18px}label{display:grid;gap:7px;font-weight:700}label:has(textarea),.fine,form button{grid-column:1/-1}input,textarea{width:100%;min-height:50px;border:1px solid #9cafbf;border-radius:calc(var(--radius) * .4);padding:12px 14px;background:#fff;color:var(--ink);font:inherit}textarea{min-height:120px;resize:vertical}.fine{margin:0;color:var(--muted);font-size:.84rem}.fine a{color:var(--accent-dark)}button{min-height:54px;border:0;border-radius:calc(var(--radius) * .5);background:var(--accent);color:#fff;font:800 1rem var(--body);cursor:pointer}button:hover{background:var(--accent-dark)}footer{padding:28px 20px;background:var(--ink);border-top:1px solid rgba(255,255,255,.15);color:#c7d2de;text-align:center;font-size:.82rem}
@media(max-width:820px){.shell{width:min(100% - 32px,640px)}.hero-grid{display:block;min-height:0;padding:72px 0 56px}.hero h1{font-size:clamp(2.65rem,12vw,4.3rem)}.hero-panel{margin-top:34px;padding:22px}.section{padding:64px 0}.value-grid,.faq-grid,.process,.conversion-grid{grid-template-columns:1fr}.value-card{min-height:0}.process{gap:14px}.conversion-copy{margin-bottom:8px}form{grid-template-columns:1fr}form>*{grid-column:1}.hero:after{width:300px;height:300px;border-width:55px;right:-170px;top:-170px}}
@media(max-width:420px){.shell{width:min(100% - 24px,390px)}.hero-grid{padding:58px 0 44px}.hero h1{font-size:2.6rem}.hero-copy{font-size:1.02rem;margin:18px 0 24px}.cta{width:100%}.section{padding:52px 0}.section-heading{margin-bottom:26px}.section-heading h2,.conversion-copy h2{font-size:2rem}.value-grid{gap:12px}.value-card,.steps li,.faq article{padding:20px}.form-card{padding:20px}.hero-panel{display:none}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.cta{transition:none}}
</style></head><body class="${style}"><header class="hero"><div class="shell hero-grid"><div><p class="eyebrow">Local service, clear next step</p><h1>${title}</h1><p class="hero-copy">${description}</p><a class="cta" href="#contact">${escapeHtml(c.ctaLabel)}</a><p class="hero-note">Share a few details. No obligation is created by sending a request.</p></div><aside class="hero-panel" aria-label="What to expect"><strong>A straightforward way to get started</strong><span>Describe the service you’re looking for</span><span>Choose email or phone for a reply</span><span>Continue directly with the Business</span></aside></div></header><main>${points ? `<section class="section value-section" aria-labelledby="value-title"><div class="shell"><div class="section-heading"><p class="eyebrow">How we can help</p><h2 id="value-title">Start with what matters to your project</h2><p>Every request is different. These are the service priorities this Business is ready to discuss.</p></div><div class="value-grid">${points}</div><a class="cta mid-cta" href="#contact">${escapeHtml(c.ctaLabel)}</a></div></section>` : ""}<div class="shell">${process}${faq}</div><section class="section conversion" id="contact" aria-labelledby="contact-title"><div class="shell conversion-grid"><div class="conversion-copy"><p class="eyebrow">Ready when you are</p><h2 id="contact-title">Let’s talk about your project</h2><p>Tell the Business what you need and how you prefer to be contacted. They’ll receive your request with the page context attached.</p><ul class="reassurance"><li>Your details go to this Business</li><li>Include only what is useful for the first conversation</li><li>Submitting does not create a purchase</li></ul></div><div class="form-card"><form method="post" action="${formAction}"><input type="hidden" name="slug" value="${escapeHtml(page.publicSlug)}"><input type="hidden" name="version" value="${escapeHtml(version.id)}"><input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">${fields}<p class="fine">${escapeHtml(c.privacyDisclosure)} <a href="/privacy">Privacy Policy</a></p><button type="submit">${escapeHtml(c.ctaLabel)}</button></form></div></div></section></main><footer>Powered by ScaledCircle · A direct request to this Business</footer></body></html>`;
}

function renderUnavailablePage() {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Page unavailable | ScaledCircle</title><meta name=\"robots\" content=\"noindex,nofollow\"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#eef6ff;font:16px/1.6 system-ui,sans-serif}.card{width:min(560px,calc(100% - 40px));padding:36px;border:1px solid #24415f;border-radius:22px;background:#0d1c2e}h1{margin:0 0 12px;font-size:clamp(2rem,7vw,3.2rem);line-height:1.05}p{margin:0;color:#b8c9da}a{display:inline-block;margin-top:24px;color:#54e3b1;font-weight:800}</style></head><body><main class=\"card\"><p>ScaledCircle</p><h1>This page is unavailable.</h1><p>The link may be incorrect, or the Business may have paused or archived this page.</p><a href=\"/\">Visit ScaledCircle</a></main></body></html>";
}

function createLandingPageService({db, FieldValue, now = () => Date.now(), randomBytes = crypto.randomBytes,
  publicBaseUrl = "https://scaledcircle.com", getAuthUser = async () => null,
  reportRecipientResolution = async () => {},runtimeProjectIdentity=()=>({effectiveProjectId:null,match:true})}) {
  const pages = db.collection("landingPages");
  async function recipientFor(businessUid, context = {}) {
    const outcome = await resolveBusinessRecipient(businessUid, getAuthUser,{projectIdentity:runtimeProjectIdentity()});
    try { await reportRecipientResolution(outcome, {...context,businessUid}); } catch (_) { /* health reporting must not break inquiry authority */ }
    return outcome;
  }
  async function createDraft(input, actor) {
    if (!actor?.uid || actor.role !== "business") throw new Error("landing_page_business_required");
    const creationRequestId=text(input.creationRequestId,160);
    const ref = creationRequestId ? pages.doc(`page_${digest(`${actor.uid}:${creationRequestId}`).slice(0,40)}`) : pages.doc();
    const publicSlug = slug(randomBytes); const content = input.content ? sanitizeDraft(input.content) : defaultDraft(input);
    const versionRef = ref.collection("versions").doc(); const at = FieldValue.serverTimestamp();
    let result;
    await db.runTransaction(async (tx) => {
      const existing=creationRequestId?await tx.get(ref):null;
      if(existing?.exists){const data=existing.data();if(data.businessUid!==actor.uid||data.creationRequestId!==creationRequestId)throw new Error("landing_page_creation_conflict");result={pageId:ref.id,publicSlug:data.publicSlug,versionId:data.draftVersionId,idempotentReplay:true};return;}
      tx.create(ref, {schemaVersion:SCHEMA_VERSION,businessUid:actor.uid,campaignId:text(input.campaignId,160)||null,publicSlug,status:"draft",trackingMode:input.trackingMode === "first_party" ? "first_party":"off",draftVersionId:versionRef.id,publishedVersionId:null,creationRequestId:creationRequestId||null,createdAt:at,updatedAt:at});
      tx.create(versionRef,{schemaVersion:SCHEMA_VERSION,businessUid:actor.uid,pageId:ref.id,content,contentDigest:digest(content),createdBy:actor.uid,createdAt:at,immutable:true});
      result={pageId:ref.id,publicSlug,versionId:versionRef.id,idempotentReplay:false};
    });
    return result;
  }
  async function saveDraft(input, actor) {
    const pageRef=pages.doc(text(input.pageId,160)); const current=await pageRef.get(); if(!current.exists||current.data().businessUid!==actor?.uid) throw new Error("landing_page_forbidden");
    const content=sanitizeDraft(input.content); const versionRef=pageRef.collection("versions").doc(); const at=FieldValue.serverTimestamp();
    const trackingMode=input.trackingMode==="first_party"?"first_party":input.trackingMode==="off"?"off":current.data().trackingMode;
    await db.runTransaction(async(tx)=>{tx.create(versionRef,{schemaVersion:SCHEMA_VERSION,businessUid:actor.uid,pageId:pageRef.id,content,contentDigest:digest(content),createdBy:actor.uid,createdAt:at,immutable:true});tx.update(pageRef,{draftVersionId:versionRef.id,trackingMode,updatedAt:at});}); return {pageId:pageRef.id,versionId:versionRef.id};
  }
  async function transition(input, actor) {
    const pageRef=pages.doc(text(input.pageId,160)); const action=text(input.action,30); let result;
    await db.runTransaction(async(tx)=>{
      const snap=await tx.get(pageRef);
      if(!snap.exists||snap.data().businessUid!==actor?.uid)throw new Error("landing_page_forbidden");
      const p=snap.data();
      if(action==="publish"){
        const versionRef=pageRef.collection("versions").doc(p.draftVersionId);
        const v=await tx.get(versionRef);
        if(!v.exists)throw new Error("landing_page_version_missing");
        const submissionContext=validOpaqueContext(v.data()?.submissionContext)||opaqueContext(randomBytes);
        const publishedAt=v.data()?.publishedAt||FieldValue.serverTimestamp();
        tx.set(versionRef,{submissionContext,publishedAt,published:true},{merge:true});
        const patch={status:"published",publishedVersionId:p.draftVersionId,
          publishedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
        let responseAssetId=p.responseAssetId||null;let trackedUrl=null;
        const attribution={source:"landing_page",sourceDetail:p.publicSlug,campaignId:p.campaignId||null,
          landingPageId:pageRef.id,landingPageVersionId:p.draftVersionId,responseAssetId};
        if(p.trackingMode==="first_party"&&!responseAssetId){
          const assetRef=db.collection("responseAssets").doc();responseAssetId=assetRef.id;
          attribution.responseAssetId=responseAssetId;const publicCode=opaqueContext(randomBytes);
          tx.create(assetRef,{schemaVersion:"AttributionFoundationV1",businessUid:p.businessUid,
            type:"landing_page",publicCode,status:"active",label:v.data().content.headline,
            destination:`${publicBaseUrl}/p/${p.publicSlug}`,attribution,createdBy:actor.uid,
            createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
          patch.responseAssetId=responseAssetId;trackedUrl=`${publicBaseUrl}/r?code=${publicCode}`;
        }else if(p.trackingMode==="first_party"&&responseAssetId){
          attribution.responseAssetId=responseAssetId;
          tx.update(db.collection("responseAssets").doc(responseAssetId),{attribution,
            label:v.data().content.headline,updatedAt:FieldValue.serverTimestamp()});
        }
        tx.update(pageRef,patch);result={status:"published",publicSlug:p.publicSlug,
          versionId:p.draftVersionId,responseAssetId,trackedUrl};
      }else if(["pause","archive"].includes(action)){
        tx.update(pageRef,{status:action==="pause"?"paused":"archived",
          updatedAt:FieldValue.serverTimestamp()});result={status:action==="pause"?"paused":"archived"};
      }else throw new Error("invalid_landing_page_transition");
    });return result;
  }
  async function resolvePage(publicSlug) {
    const snap=await pages.where("publicSlug","==",text(publicSlug,80)).limit(2).get();
    if(snap.docs.length!==1||snap.docs[0].data().status!=="published")throw new Error("landing_page_unavailable");
    return {ref:snap.docs[0].ref,page:{id:snap.docs[0].id,...snap.docs[0].data()}};
  }
  async function resolve(publicSlug) {
    const {ref,page}=await resolvePage(publicSlug);
    const v=await ref.collection("versions").doc(page.publishedVersionId).get();
    if(!v.exists)throw new Error("landing_page_unavailable");
    return {page,version:{id:v.id,...v.data()}};
  }
  async function resolveSubmissionVersion(page, context) {
    const token=text(context,80);if(!token)throw new Error("landing_page_context_invalid");
    const matches=await pages.doc(page.id).collection("versions")
      .where("submissionContext","==",token).limit(2).get();
    if(matches.docs.length!==1)throw new Error("landing_page_context_invalid");
    const version={id:matches.docs[0].id,...matches.docs[0].data()};
    if(version.pageId!==page.id||version.businessUid!==page.businessUid||version.immutable!==true||
        !version.publishedAt)throw new Error("landing_page_context_invalid");
    return version;
  }
  async function resolveResponseInteraction(page, version, context) {
    if(!text(context,80))return null;
    const token=validOpaqueContext(context);if(!token)throw new Error("landing_page_response_context_invalid");
    const matches=await db.collection("responseInteractions").where("submissionContext","==",token).limit(2).get();
    if(matches.docs.length!==1)throw new Error("landing_page_response_context_invalid");
    const interaction={id:matches.docs[0].id,...matches.docs[0].data()};
    if(interaction.immutable!==true||interaction.businessUid!==page.businessUid||
        interaction.responseAssetId!==page.responseAssetId||interaction.landingPageId!==page.id||
        interaction.landingPageVersionId!==version.id||interaction.attributionComplete!==true)
      throw new Error("landing_page_response_context_invalid");
    return interaction;
  }
  async function submit(input, requestMeta={}) {
    const {page}=await resolvePage(input.slug);
    const version=await resolveSubmissionVersion(page,input.version||input.context);
    const interaction=await resolveResponseInteraction(page,version,input.response);
    const contact=validateSubmission(input,version);
    const recipientOutcome=await recipientFor(page.businessUid,{operation:"submission",landingPageId:page.id});
    const day=Math.floor(now()/86400000);const key=text(input.idempotencyKey,160)||digest({p:page.id,v:version.id,c:contact,day});
    const receiptId=digest(`${page.id}:${key}`);const receiptRef=db.collection("landingPageSubmissionReceipts").doc(receiptId);
    const networkHash=digest(`${page.id}:${day}:${text(requestMeta.ip,120)||"unknown"}`);const rateRef=db.collection("landingPageSubmissionRates").doc(networkHash);
    const leadRef=db.collection("salesLeads").doc(`landing_${receiptId.slice(0,40)}`);const activityRef=db.collection("salesActivities").doc(`landing_created_${receiptId.slice(0,40)}`);
    const conversionRef=db.collection("attributionConversions").doc(`lead_${leadRef.id}`);const notificationRef=db.collection("notifications").doc(`landing-inquiry_${leadRef.id}`);
    const businessEmailRef=db.collection("outboundEmailJobs").doc(`landing-business_${leadRef.id}`);const customerEmailRef=db.collection("outboundEmailJobs").doc(`landing-customer_${leadRef.id}`);
    let created=false;let leadId;
    await db.runTransaction(async(tx)=>{
      const existing=await tx.get(receiptRef);if(existing.exists){leadId=existing.data().leadId;return;}
      const [rate,businessSnap]=await Promise.all([tx.get(rateRef),tx.get(db.collection("users").doc(page.businessUid))]);
      const count=Number(rate.data()?.count||0);if(count>=20)throw new Error("landing_page_rate_limited");
      if(!businessSnap.exists||String(businessSnap.data()?.role||"").toLowerCase()!=="business")throw new Error("landing_page_business_missing");
      const profile=businessSnap.data();const businessEmail=recipientOutcome.email||"";
      const businessName=text(profile.businessName||profile.companyName||profile.displayName,120)||"the Business";
      const pageName=text(version.content?.headline,160)||"Landing Page";const at=FieldValue.serverTimestamp();
      const attribution={source:"landing_page",sourceDetail:page.publicSlug,landingPageId:page.id,
        landingPageVersionId:version.id,campaignId:page.campaignId||null,
        responseAssetId:interaction?.responseAssetId||null,interactionId:interaction?.id||null};
      const metadata={leadId:leadRef.id,landingPageId:page.id,landingPageVersionId:version.id,idempotencyKey:receiptId};
      const payload=landingPageEmailPayload({businessName,contact,pageName,inquiryUrl:`${publicBaseUrl}/#/business/landing-pages?pageId=${encodeURIComponent(page.id)}`});
      tx.set(rateRef,{schemaVersion:SCHEMA_VERSION,pageId:page.id,day,count:count+1,updatedAt:at},{merge:true});
      tx.create(leadRef,{schemaVersion:"SalesFunnelV1",leadType:"landing_page_inquiry",businessName:"Landing page inquiry",contactName:contact.name,contactEmail:contact.email?.toLowerCase()||null,contactPhone:contact.phone||null,requestSummary:contact.message||null,source:"landing_page",sourceDetail:page.publicSlug,attribution,firstAttribution:attribution,lastAttribution:attribution,stage:"prospect",priority:"normal",ownerUid:page.businessUid,suppressionStatus:null,createdBy:"public_landing_page",createdAt:at,updatedAt:at});
      tx.create(activityRef,{schemaVersion:"SalesFunnelV1",leadId:leadRef.id,type:"lead_created",actorUid:"public_landing_page",attribution,occurredAt:at});
      if(interaction)tx.create(conversionRef,{schemaVersion:"AttributionFoundationV1",milestone:"lead",
        businessUid:page.businessUid,leadId:leadRef.id,responseAssetId:interaction.responseAssetId,
        interactionId:interaction.id,attribution,analyticsClass:interaction.analyticsClass,
        occurredAt:at,immutable:true});
      tx.create(notificationRef,{schemaVersion:2,id:notificationRef.id,userId:page.businessUid,type:"landing_page_inquiry",title:"New landing page inquiry",message:`${contact.name} sent a request from your landing page.`,entityId:leadRef.id,deepLink:{destination:"landing_page",pageId:page.id},priority:"high",metadata:{landingPageId:page.id},read:false,channel:"in_app",emailRequested:true,pushRequested:false,createdAt:at,updatedAt:at});
      if(businessEmail){const job=businessInquiryEmail({businessName,contact,pageName,metadata:{...metadata,recipient:businessEmail}});tx.create(businessEmailRef,{...job,payload,createdAt:at,updatedAt:at});}
      if(contact.email){const job=customerConfirmationEmail({businessName,contact,metadata});tx.create(customerEmailRef,{...job,payload,createdAt:at,updatedAt:at});}
      tx.create(receiptRef,{schemaVersion:SCHEMA_VERSION,pageId:page.id,versionId:version.id,leadId:leadRef.id,delivery:{businessNotification:"queued",businessEmail:businessEmail?"queued":"recipient_unavailable",customerEmail:contact.email?"queued":"not_applicable"},createdAt:at,updatedAt:at});
      leadId=leadRef.id;created=true;
    });
    return {leadId,created,slug:page.publicSlug,style:version.content.style};
  }
  async function reconcileInquiry(input, actor) {
    if (!actor?.uid || actor.role !== "admin") throw new Error("landing_page_admin_required");
    const leadId=text(input.leadId,160);
    if (!/^landing_[a-f0-9]{40}$/.test(leadId)) throw new Error("landing_page_inquiry_invalid");
    const leadRef=db.collection("salesLeads").doc(leadId);const leadSnap=await leadRef.get();
    const lead=leadSnap.data()||{};
    if(!leadSnap.exists||lead.leadType!=="landing_page_inquiry"||lead.createdBy!=="public_landing_page")throw new Error("landing_page_inquiry_missing");
    const pageId=text(lead.attribution?.landingPageId,160);const versionId=text(lead.attribution?.landingPageVersionId,160);
    const pageRef=pages.doc(pageId);const [pageSnap,versionSnap]=await Promise.all([pageRef.get(),pageRef.collection("versions").doc(versionId).get()]);
    if(!pageSnap.exists||!versionSnap.exists||pageSnap.data()?.businessUid!==lead.ownerUid)throw new Error("landing_page_inquiry_authority_invalid");
    const dryRun=input.dryRun===true||input.diagnoseRecipient===true;const projectIdentity=runtimeProjectIdentity();
    const recipientOutcome=dryRun?await resolveBusinessRecipient(lead.ownerUid,getAuthUser,{projectIdentity}):
      await recipientFor(lead.ownerUid,{operation:"reconciliation",leadId});
    const recipient=recipientOutcome.email||"";
    const businessProfile=await db.collection("users").doc(lead.ownerUid).get();
    if(!businessProfile.exists||String(businessProfile.data()?.role||"").toLowerCase()!=="business")throw new Error("landing_page_business_missing");
    if(dryRun)return{authenticated:true,dryRun:true,project:projectIdentity.effectiveProjectId||null,
      projectIdentityMatch:projectIdentity.match!==false,projectSources:{gcloudProject:projectIdentity.gcloudProject||null,
        googleCloudProject:projectIdentity.googleCloudProject||null,firebaseConfigProject:projectIdentity.firebaseConfigProject||null,
        adminAppProject:projectIdentity.adminAppProject||null,authAppProject:projectIdentity.authAppProject||null},uid:recipientOutcome.uid,
      recipientResolution:recipientOutcome.category,firebaseCode:recipientOutcome.firebaseErrorCode||null,
      httpStatus:recipientOutcome.diagnostic?.httpStatus||null,backendCode:recipientOutcome.diagnostic?.backendCode||null,
      backendCategory:recipientOutcome.diagnostic?.backendCategory||null,causeType:recipientOutcome.diagnostic?.causeType||null,
      causeCode:recipientOutcome.diagnostic?.causeCode||null,errorType:recipientOutcome.diagnostic?.errorType||null};
    const businessName=text(businessProfile.data()?.businessName||businessProfile.data()?.companyName||businessProfile.data()?.displayName,120)||"the Business";
    const contact={name:text(lead.contactName,160),email:validEmail(lead.contactEmail),phone:text(lead.contactPhone,80),message:text(lead.requestSummary,1000)};
    const pageName=text(versionSnap.data()?.content?.headline,160)||"Landing Page";
    const metadata={leadId,pageId,landingPageVersionId:versionId,idempotencyKey:`reconcile:${leadId}`};
    const payload=landingPageEmailPayload({businessName,contact,pageName,inquiryUrl:`${publicBaseUrl}/#/business/landing-pages`});
    const businessRef=db.collection("outboundEmailJobs").doc(`landing-business_${leadId}`);
    const customerRef=db.collection("outboundEmailJobs").doc(`landing-customer_${leadId}`);
    const result={lead:"existing",businessRecipient:recipientOutcome.category,
      businessEmailJob:recipient?"unchanged":"recipient_unavailable",
      customerEmailJob:contact.email?"unchanged":"not_applicable"};
    await db.runTransaction(async(tx)=>{
      const [businessJob,customerJob]=await Promise.all([tx.get(businessRef),tx.get(customerRef)]);const at=FieldValue.serverTimestamp();
      if(recipient&&!businessJob.exists){const job=businessInquiryEmail({businessName,contact,pageName,metadata:{...metadata,recipient}});tx.create(businessRef,{...job,payload,createdAt:at,updatedAt:at});result.businessEmailJob="created";}
      else if(recipient&&businessJob.exists&&businessJob.data()?.status==="failed_retryable"){
        tx.set(businessRef,{status:"retry_requested",retryRequestedAt:at,updatedAt:at},{merge:true});result.businessEmailJob="retry_requested";
      }
      if(contact.email&&!customerJob.exists){const job=customerConfirmationEmail({businessName,contact,metadata});tx.create(customerRef,{...job,payload,createdAt:at,updatedAt:at});result.customerEmailJob="created";}
      else if(contact.email&&customerJob.exists){
        const existing=customerJob.data()||{};
        const legacyPreSendFailure=existing.template==="landing_page_customer_confirmation"&&
          existing.status==="failed_terminal"&&Number(existing.attempts||0)===0&&
          existing.errorCode==="invalid_server_email_job"&&!existing.sentAt&&!existing.providerResult&&!existing.messageId&&
          existing.schemaVersion!==EMAIL_JOB_SCHEMA_VERSION;
        if(legacyPreSendFailure){
          const job=customerConfirmationEmail({businessName,contact,metadata});
          tx.set(customerRef,{...job,payload,status:"retry_requested",createdAt:existing.createdAt||at,
            reconciledAt:at,retryRequestedAt:at,updatedAt:at,
            reconciliation:{kind:"legacy_landing_page_schema_upgrade",previousErrorCode:existing.errorCode,
              previousSchemaVersion:text(existing.schemaVersion,80)||"legacy_unversioned"}});
          result.customerEmailJob="reconciled_retry_requested";
        } else if(existing.status==="failed_retryable"){
          tx.set(customerRef,{status:"retry_requested",retryRequestedAt:at,updatedAt:at},{merge:true});result.customerEmailJob="retry_requested";
        }
      }
    });
    return result;
  }
  return {createDraft,saveDraft,transition,resolve,submit,reconcileInquiry};
}

module.exports={SCHEMA_VERSION,EMAIL_JOB_SCHEMA_VERSION,STATUSES,STYLES,CTA_TYPES,PUBLIC_ORIGINS,PUBLIC_SLUG_ALPHABET,
  text,headerText,validEmail,escapeHtml,slug,opaqueContext,validOpaqueContext,digest,publicOrigin,
  normalizedFirebaseErrorCode,safeDiagnosticText,
  firebaseUidDiagnostics,safeFirebaseErrorDiagnostics,firebaseAuthFailureCategory,
  resolveBusinessRecipient,sanitizeDraft,defaultDraft,validateSubmission,outboundEmailJob,businessInquiryEmail,
  customerConfirmationEmail,landingPageEmailPayload,renderPage,renderSuccessPage,renderUnavailablePage,createLandingPageService};

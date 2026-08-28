const assert = require("node:assert/strict");
const test = require("node:test");
const email = require("./transactional_email");
const legacy = require("./signup_notifications");

function fakeDatabase() {
  const documents = new Map();
  const reference = (path) => ({path, async get() { return snapshot(path); }, async set(data,{merge}={}) {
    documents.set(path,merge?{...(documents.get(path)||{}),...data}:data);
  }});
  const snapshot = (path) => ({exists: documents.has(path), data: () => documents.get(path)});
  return {
    documents,
    collection(name) { return {doc(id) { return reference(`${name}/${id}`); }}; },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) { return snapshot(ref.path); },
        create(ref, data) { writes.push(["create", ref.path, data]); },
        set(ref, data) { writes.push(["set", ref.path, data]); },
        update(ref, data) { writes.push(["set", ref.path, data]); },
      };
      const result = await callback(transaction);
      for (const [kind, path, data] of writes) {
        if (kind === "create" && documents.has(path)) throw new Error("already exists");
        documents.set(path, {...(documents.get(path) || {}), ...data});
      }
      return result;
    },
  };
}

const FieldValue = {serverTimestamp: () => "SERVER_TIMESTAMP", increment: (value) => value};
const authUser = {email: "scaler@example.test", displayName: "Sam Scaler", disabled: false,
  emailVerified: false, metadata: {creationTime: "2026-08-20T12:00:00Z"}};
const signup = {role: "scaler", displayName: "Sam Scaler", postalCode: "21234",
  contactNumber: "555-0100", discoverySource: "search_engine", companyName: "", referrerName: ""};

function service(db = fakeDatabase(), now = () => 1_800_000_000_000) {
  const auth = {async generateEmailVerificationLink(address) {
    assert.equal(address, authUser.email);
    return "https://scaled-circle.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=REAL_CODE";
  }};
  return {db, value: email.createService({db, auth, FieldValue, now})};
}

test("Scaler finalization atomically creates profile and exactly two deterministic jobs", async () => {
  const {db, value} = service();
  await value.finalize({uid: "scaler-1", authUser, data: signup});
  assert.deepEqual([...db.documents.keys()].sort(), [
    "outboundEmailJobs/admin-new-user_scaler-1", "outboundEmailJobs/welcome-user_scaler-1",
    "users/scaler-1",
  ]);
  const welcome = db.documents.get("outboundEmailJobs/welcome-user_scaler-1");
  assert.match(welcome.subject, /Welcome to ScaledCircle/);
  assert.match(welcome.html, /Icon-192\.png/);
  assert.match(welcome.html, /alt="ScaledCircle"/);
  assert.match(welcome.text, /REAL_CODE/);
  assert.equal(welcome.trustedHtml, true);
});

test("finalization retry is idempotent", async () => {
  const {db, value} = service();
  await value.finalize({uid: "scaler-1", authUser, data: signup});
  await value.finalize({uid: "scaler-1", authUser, data: signup});
  assert.equal(db.documents.size, 3);
});

test("legacy signup trigger sees reserved IDs and creates no duplicate", async () => {
  const {db, value} = service();
  await value.finalize({uid: "scaler-1", authUser, data: signup});
  const result = await legacy.queueEmailJobs({db, serverTimestamp: "SERVER_TIMESTAMP",
    jobs: legacy.accountSignupJobs({uid: "scaler-1", authUser, profile: signup})});
  assert.deepEqual(result, {created: 0, existing: 2});
  assert.equal(db.documents.size, 3);
});

test("Business template is role-aware and contains no fake setup CTA", () => {
  const value = email.welcomeTemplate({role: "business", displayName: "Blair Builder",
    verificationUrl: "https://scaledcircle.com/#/verify-email?oobCode=x"});
  assert.match(value.text, /Business account/);
  assert.doesNotMatch(value.text + value.html, /SCALER PROFILE|Work Areas|vehicle/i);
});

test("templates escape user content and retain text fallback", () => {
  const value = email.welcomeTemplate({role: "scaler", displayName: "<script>alert(1)</script>",
    verificationUrl: "https://scaledcircle.com/#/verify-email?oobCode=x"});
  assert.doesNotMatch(value.html, /<script>/);
  assert.match(value.html, /&lt;script&gt;/);
  assert.ok(value.text.length > 100);
});

test("verification route wraps a real Admin-generated action code", () => {
  const value = email.brandedVerificationUrl(
    "https://scaled-circle.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=abc%2B123");
  assert.match(value, /^https:\/\/scaledcircle\.com\/#\/verify-email\?/);
  assert.match(value, /oobCode=abc%2B123/);
});

test("resend queues verification-only job and enforces cooldown", async () => {
  const {db, value} = service();
  const first = await value.resend({uid: "scaler-1", authUser});
  assert.equal(first.queued, true);
  const job = [...db.documents.entries()].find(([path]) => path.startsWith("outboundEmailJobs/verify-email_"))[1];
  assert.equal(job.template, "verification_email_v1");
  assert.doesNotMatch(job.text, /COMPLETE MY SCALER PROFILE/);
  await assert.rejects(() => value.resend({uid: "scaler-1", authUser}), /verification_rate_limited/);
});

test("already verified account cannot request resend", async () => {
  const {value} = service();
  await assert.rejects(() => value.resend({uid: "scaler-1",
    authUser: {...authUser, emailVerified: true}}), /already_verified/);
});

test("delivery accepts existing plain jobs and trusted HTML only", () => {
  const base = {to: "person@example.test", fromAddress: email.SUPPORT_EMAIL,
    template: "welcome_account", text: "Plain fallback"};
  assert.equal(email.validateDeliveryJob(base), true);
  assert.equal(email.validateDeliveryJob({...base, html: "<p>Trusted</p>", trustedHtml: true}), true);
  assert.equal(email.validateDeliveryJob({...base, html: "<script>x</script>"}), false);
  assert.equal(email.validateDeliveryJob({...base, fromAddress: "attacker@example.test"}), false);
});

function landingJob(template = "landing_page_business_inquiry") {
  return {to:"person@example.test",fromAddress:email.SUPPORT_EMAIL,template,eventType:"landing_page.inquiry",
    status:"queued",attempts:0,payload:{businessName:"Harbor Services",customerName:"Pat <script>x</script>",
      landingPageTitle:"Published A",inquirySummary:"Need an estimate <b>soon</b>",
      customerEmail:"pat@example.test",customerPhone:"555-0100",
      ...(template === "landing_page_business_inquiry" ? {inquiryUrl:"https://scaledcircle-staging.web.app/#/business/landing-pages"}: {})}};
}

test("Landing Page templates are narrowly accepted and rendered from structured data",()=>{
  for(const template of email.LANDING_PAGE_TEMPLATES){const job=landingJob(template);assert.equal(email.validateDeliveryJob(job),true);
    const content=email.deliveryContent(job);assert.ok(content.subject);assert.doesNotMatch(content.html,/<script>|<b>soon<\/b>/);assert.match(content.html,/&lt;b&gt;soon&lt;\/b&gt;/);}
  assert.equal(email.validateDeliveryJob({...landingJob(),template:"landing_page_arbitrary"}),false);
  assert.equal(email.validateDeliveryJob({...landingJob(),bcc:"attacker@example.test"}),false);
  assert.equal(email.validateDeliveryJob({...landingJob(),html:"<p>override</p>",trustedHtml:true}),false);
  assert.equal(email.validateDeliveryJob({...landingJob(),to:"victim@example.test\r\nBcc: attacker@example.test"}),false);
});

test("delivery health distinguishes unavailable worker, pending, sent, and failures",()=>{
  assert.deepEqual(email.deliveryHealth({workerAvailable:false,status:"queued"}),{state:"worker_unavailable",health:"degraded"});
  assert.equal(email.deliveryHealth({workerAvailable:true,status:"queued"}).health,"pending");
  assert.equal(email.deliveryHealth({workerAvailable:true,status:"sent"}).health,"healthy");
  assert.equal(email.deliveryHealth({workerAvailable:true,status:"failed_terminal"}).health,"degraded");
  assert.equal(email.deliveryHealth({workerAvailable:true,recipientAvailable:false,status:"queued"}).state,"recipient_unavailable");
});

test("mock SMTP worker claims once, records acceptance, and never resends sent jobs",async()=>{
  const db=fakeDatabase();const ref=db.collection("outboundEmailJobs").doc("landing-business_lead");db.documents.set(ref.path,landingJob());let sends=0;
  const args={db,reference:ref,jobId:"landing-business_lead",FieldValue,createTransport:()=>({sendMail:async()=>{sends++;return{messageId:"provider-accepted"};}}),smtpPassword:"mock-only"};
  assert.equal((await email.processDeliveryJob(args)).status,"sent");assert.equal((await email.processDeliveryJob(args)).reason,"ineligible_state");assert.equal(sends,1);
  assert.equal(db.documents.get(ref.path).providerResult,"accepted");
});

test("mock SMTP failures are bounded and classified",async()=>{
  for(const [code,status] of [["ETIMEDOUT","failed_retryable"],["EAUTH","failed_terminal"]]){const db=fakeDatabase();const ref=db.collection("outboundEmailJobs").doc(code);db.documents.set(ref.path,landingJob());
    const result=await email.processDeliveryJob({db,reference:ref,jobId:code,FieldValue,createTransport:()=>({sendMail:async()=>{const error=new Error("mock");error.code=code;throw error;}}),smtpPassword:"mock-only",logger:{error(){}}});assert.equal(result.status,status);}
});

test("overlapping workers can claim a queued job only once", async () => {
  const db = fakeDatabase();
  const ref = db.collection("outboundEmailJobs").doc("overlap-test");
  db.documents.set(ref.path, {status: "queued", attempts: 0});
  assert.equal(await email.claimQueuedJob({db, reference: ref, FieldValue, leaseId: "new-worker"}), true);
  assert.equal(await email.claimQueuedJob({db, reference: ref, FieldValue, leaseId: "old-worker"}), false);
  assert.equal(db.documents.get(ref.path).status, "sending");
  assert.equal(db.documents.get(ref.path).leaseId, "new-worker");
});

test("public role and signup values fail closed", () => {
  assert.throws(() => email.validateSignupInput({...signup, role: "admin"}), /signup_input_invalid/);
  assert.throws(() => email.validateSignupInput({...signup, role: "sales_rep"}), /signup_input_invalid/);
});

test("historical pending template is prepared without pretending it is a new signup", () => {
  const value = email.historicalPendingScalerTemplate({displayName: "Early Scaler",
    verificationUrl: "https://scaledcircle.com/#/verify-email?oobCode=x"});
  assert.equal(value.subject, "Finish Setting Up Your ScaledCircle Account");
  assert.match(value.text, /Thanks for getting in early/);
  assert.doesNotMatch(value.text, /Your Scaler account has been created/);
});

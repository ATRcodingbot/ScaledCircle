"use strict";

const crypto = require("node:crypto");

const SUPPORT_EMAIL = "support@scaledcircle.com";
const SUPPORT_NAME = "ScaledCircle Support";
const LOGO_URL = "https://scaledcircle.com/icons/Icon-192.png";
const VERIFY_ROUTE = "https://scaledcircle.com/#/verify-email";
const PROFILE_ROUTE = "https://scaledcircle.com/#/complete-scaler-profile";
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const PUBLIC_ROLES = new Set(["business", "scaler"]);
const DISCOVERY_SOURCES = new Set([
  "personal_referral", "search_engine", "social_media", "online_ad",
  "event_or_group", "other",
]);
const LANDING_PAGE_TEMPLATES = new Set([
  "landing_page_business_inquiry",
  "landing_page_customer_confirmation",
]);
const LANDING_PAGE_EMAIL_SCHEMA_VERSION = "LandingPageEmailJobV2";
const MAX_DELIVERY_ATTEMPTS = 3;

function cleanText(value, maximumLength = 320) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").slice(0, maximumLength);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function firstName(value) {
  return cleanText(value, 120).split(" ").filter(Boolean)[0] || "there";
}

function safeUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("https_url_required");
  return parsed.toString();
}

function verificationCodeFromAdminLink(link) {
  const parsed = new URL(link);
  const code = cleanText(parsed.searchParams.get("oobCode"), 2048);
  if (!code) throw new Error("verification_code_missing");
  return code;
}

function brandedVerificationUrl(adminLink, continuation = PROFILE_ROUTE) {
  const code = verificationCodeFromAdminLink(adminLink);
  return `${VERIFY_ROUTE}?mode=verifyEmail&oobCode=${encodeURIComponent(code)}` +
    `&continue=${encodeURIComponent(safeUrl(continuation))}`;
}

function button(label, url, color = "#1769e0") {
  const safeLabel = escapeHtml(label);
  const safeLink = escapeHtml(safeUrl(url));
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td ` +
    `style="border-radius:8px;background:${color}"><a href="${safeLink}" ` +
    `style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;` +
    `font:700 15px Arial,sans-serif">${safeLabel}</a></td></tr></table>`;
}

function shell({preheader, heading, greeting, bodyHtml, reason = "You received this email because a ScaledCircle account was created using this email address."}) {
  return `<!doctype html><html><body style="margin:0;background:#eef3f8">` +
    `<div style="display:none;max-height:0;overflow:hidden;color:transparent">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8">` +
    `<tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" ` +
    `cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;` +
    `border:1px solid #dbe5ef"><tr><td style="padding:30px 34px;font-family:Arial,sans-serif;color:#10243e">` +
    `<div style="text-align:center"><img src="${LOGO_URL}" width="72" height="72" alt="ScaledCircle" ` +
    `style="display:inline-block;border:0"><div style="font-size:22px;font-weight:800;color:#10243e">ScaledCircle</div></div>` +
    `<h1 style="margin:28px 0 14px;font-size:26px;line-height:1.2;color:#10243e">${escapeHtml(heading)}</h1>` +
    `<p style="font-size:16px;line-height:1.6">Hi ${escapeHtml(greeting)},</p>${bodyHtml}` +
    `<hr style="border:0;border-top:1px solid #dbe5ef;margin:28px 0">` +
    `<p style="font-size:13px;line-height:1.6;color:#60758a">Questions? ` +
    `<a href="mailto:${SUPPORT_EMAIL}" style="color:#1769e0">${SUPPORT_EMAIL}</a><br>` +
    `<a href="https://scaledcircle.com" style="color:#1769e0">scaledcircle.com</a></p>` +
    `<p style="font-size:12px;line-height:1.5;color:#7a8c9e">${escapeHtml(reason)} ` +
    `Questions or concerns can be sent to ${SUPPORT_EMAIL}.</p></td></tr></table></td></tr></table></body></html>`;
}

function welcomeTemplate({role, displayName, verificationUrl}) {
  if (!PUBLIC_ROLES.has(role)) throw new Error("public_role_required");
  const greeting = firstName(displayName);
  const verify = button("VERIFY MY EMAIL", verificationUrl);
  const profile = role === "scaler" ? button("COMPLETE MY SCALER PROFILE", PROFILE_ROUTE, "#0c9f73") : "";
  const scalerDetails = role === "scaler" ? `<h2 style="font-size:18px;color:#10243e">2. COMPLETE YOUR SCALER PROFILE</h2>` +
    `<p style="font-size:15px;line-height:1.6">Tell us where you want to work, how far you will travel, ` +
    `the work that interests you, vehicle information, other interests, and whether you want email alerts.</p>${profile}` +
    `<p style="font-size:15px;line-height:1.6">You can complete this while access is pending. ` +
    `No platform fees are charged to Scalers for taking jobs through ScaledCircle.</p>` :
    `<p style="font-size:15px;line-height:1.6">We are rolling out Business access in stages. ` +
    `Verifying now keeps your account secure and ready for the next step.</p>`;
  const bodyHtml = `<p style="font-size:16px;line-height:1.6">Your ${role === "scaler" ? "Scaler" : "Business"} ` +
    `account has been created.</p><h2 style="font-size:18px;color:#10243e">${role === "scaler" ? "GET READY IN TWO STEPS" : "VERIFY YOUR EMAIL"}</h2>` +
    `<h2 style="font-size:18px;color:#10243e">1. VERIFY YOUR EMAIL</h2>` +
    `<p style="font-size:15px;line-height:1.6">Verify your email address to secure your account${role === "scaler" ? " and unlock pre-launch profile setup" : ""}.</p>` +
    `${verify}${scalerDetails}<p style="font-size:15px;line-height:1.6">Welcome aboard,<br>${SUPPORT_NAME}</p>`;
  const text = role === "scaler" ? [
    "WELCOME TO SCALEDCIRCLE", `Hi ${greeting},`, "", "Your Scaler account has been created.", "",
    "1. VERIFY YOUR EMAIL", verificationUrl, "", "2. COMPLETE YOUR SCALER PROFILE", PROFILE_ROUTE, "",
    "Choose Work Areas, travel, work interests, vehicle/cargo, other interests, and notification preferences.",
    "You can complete this while access is pending.", "No platform fees are charged to Scalers for taking jobs through ScaledCircle.",
    "", `Questions? ${SUPPORT_EMAIL}`, "https://scaledcircle.com",
  ].join("\n") : [
    "WELCOME TO SCALEDCIRCLE", `Hi ${greeting},`, "", "Your Business account has been created.",
    "Verify your email to secure your account:", verificationUrl, "",
    "Business access is rolling out in stages.", "", `Questions? ${SUPPORT_EMAIL}`, "https://scaledcircle.com",
  ].join("\n");
  return {
    subject: "Welcome to ScaledCircle — Verify Your Email",
    preheader: role === "scaler" ?
      "Verify your email and finish your Scaler profile so you're ready when opportunities launch." :
      "Verify your email so your ScaledCircle Business account is ready for access.",
    text,
    html: shell({preheader: role === "scaler" ?
      "Verify your email and finish your Scaler profile so you're ready when opportunities launch." :
      "Verify your email so your Business account is ready.", heading: "WELCOME TO SCALEDCIRCLE", greeting, bodyHtml}),
  };
}

function adminTemplate({uid, role, displayName, email, source, created}) {
  const label = role === "scaler" ? "Scaler" : "Business";
  const rows = [
    ["Name", displayName || "Not provided"], ["Email", email], ["Role", label],
    ["Email Verified", "No"], ["Access Status", "Pending"], ["Created", created],
    ["Source / Platform", source],
  ];
  const table = rows.map(([key, value]) => `<tr><td style="padding:6px 10px;color:#60758a">${escapeHtml(key)}</td>` +
    `<td style="padding:6px 10px;color:#10243e">${escapeHtml(value)}</td></tr>`).join("");
  const bodyHtml = `<h2 style="font-size:17px">ACCOUNT</h2><table role="presentation">${table}</table>` +
    `${role === "scaler" ? `<h2 style="font-size:17px">WORK PROFILE</h2><p>Not completed yet</p>` : ""}` +
    `<h2 style="font-size:17px">STATUS</h2><p>Pending Review</p><p style="font-size:12px;color:#7a8c9e">Firebase UID: ${escapeHtml(uid)}</p>`;
  return {
    subject: `New ScaledCircle Signup — ${label}`,
    text: rows.map(([key, value]) => `${key}: ${value}`).concat(role === "scaler" ? ["Work Profile: Not completed yet"] : [], [`Firebase UID: ${uid}`]).join("\n"),
    html: shell({preheader: `New ${label} signup`, heading: `NEW SCALEDCIRCLE SIGNUP — ${label.toUpperCase()}`, greeting: "Support", bodyHtml}),
  };
}

function verificationOnlyTemplate({displayName, verificationUrl}) {
  const greeting = firstName(displayName);
  const bodyHtml = `<p style="font-size:16px;line-height:1.6">Use the button below to verify your ScaledCircle email.</p>` +
    button("VERIFY MY EMAIL", verificationUrl) + `<p style="font-size:14px;color:#60758a">If you did not request this, you can ignore it.</p>`;
  return {
    subject: "Verify your ScaledCircle email",
    text: `Hi ${greeting},\n\nVerify your ScaledCircle email:\n${verificationUrl}\n\nQuestions? ${SUPPORT_EMAIL}`,
    html: shell({preheader: "Verify your ScaledCircle email.", heading: "VERIFY YOUR EMAIL", greeting, bodyHtml}),
  };
}

function historicalPendingScalerTemplate({displayName, verificationUrl}) {
  const greeting = firstName(displayName);
  const bodyHtml = `<p style="font-size:16px;line-height:1.6">Thanks for getting in early with ScaledCircle.</p>` +
    `<p style="font-size:15px;line-height:1.6">We've upgraded Scaler setup so you can verify your email ` +
    `and tell us what opportunities you're looking for before launch.</p>` +
    button("VERIFY MY EMAIL", verificationUrl) +
    `<p style="font-size:15px;line-height:1.6">Then add Work Areas, travel distance, job interests, ` +
    `vehicle/cargo, other work interests, and job alerts.</p>` +
    button("COMPLETE MY SCALER PROFILE", PROFILE_ROUTE, "#0c9f73") +
    `<p style="font-size:15px;line-height:1.6">No platform fees are charged to Scalers for taking jobs through ScaledCircle.</p>`;
  return {
    subject: "Finish Setting Up Your ScaledCircle Account",
    text: [`Hi ${greeting},`, "", "Thanks for getting in early with ScaledCircle.",
      "Verify your email:", verificationUrl, "", "Complete your Scaler profile:", PROFILE_ROUTE,
      "", "Add Work Areas, travel distance, job interests, vehicle/cargo, other interests, and job alerts.",
      "No platform fees are charged to Scalers for taking jobs through ScaledCircle."].join("\n"),
    html: shell({preheader: "Verify your email and finish setting up ScaledCircle.",
      heading: "FINISH SETTING UP SCALEDCIRCLE", greeting, bodyHtml}),
  };
}

function emailJob({to, template, eventType, content, metadata}) {
  return {
    to: cleanText(to, 254).toLowerCase(), fromAddress: SUPPORT_EMAIL, fromName: SUPPORT_NAME,
    replyTo: SUPPORT_EMAIL, subject: content.subject, text: content.text.slice(0, 16000),
    html: content.html.slice(0, 60000), trustedHtml: true, template, eventType,
    metadata, status: "queued", attempts: 0,
  };
}

function validEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function landingPagePayload(job) {
  const payload = job?.payload || {};
  const common = {
    businessName: cleanText(payload.businessName, 120),
    customerName: cleanText(payload.customerName, 160),
    landingPageTitle: cleanText(payload.landingPageTitle, 160),
    inquirySummary: cleanText(payload.inquirySummary, 1000),
  };
  if (!common.businessName || !common.customerName || !common.landingPageTitle) {
    throw new Error("landing_page_email_payload_invalid");
  }
  if (job.template === "landing_page_business_inquiry") {
    const inquiryUrl = safeUrl(payload.inquiryUrl);
    if (!inquiryUrl.startsWith("https://scaledcircle.com/") &&
        !inquiryUrl.startsWith("https://scaledcircle-staging.web.app/")) {
      throw new Error("landing_page_email_url_invalid");
    }
    return {...common, customerEmail: validEmail(payload.customerEmail) || "Not provided",
      customerPhone: cleanText(payload.customerPhone, 80) || "Not provided", inquiryUrl};
  }
  return common;
}

function landingPageContent(job) {
  const payload = landingPagePayload(job);
  if (job.template === "landing_page_business_inquiry") {
    const subject = `New estimate request from ${payload.customerName}`;
    const text = [`New customer inquiry from ScaledCircle`, "", `Landing Page: ${payload.landingPageTitle}`,
      `Customer: ${payload.customerName}`, `Email: ${payload.customerEmail}`,
      `Phone: ${payload.customerPhone}`, `Request: ${payload.inquirySummary || "No additional details provided"}`,
      "", "Open the inquiry in ScaledCircle:", payload.inquiryUrl].join("\n");
    const bodyHtml = `<p style="font-size:15px;line-height:1.6">A customer sent a request through ` +
      `<strong>${escapeHtml(payload.landingPageTitle)}</strong>.</p><table role="presentation">` +
      [["Customer", payload.customerName], ["Email", payload.customerEmail], ["Phone", payload.customerPhone],
        ["Request", payload.inquirySummary || "No additional details provided"]]
        .map(([label, value]) => `<tr><td style="padding:6px 10px;color:#60758a">${escapeHtml(label)}</td>` +
          `<td style="padding:6px 10px;color:#10243e">${escapeHtml(value)}</td></tr>`).join("") +
      `</table><div style="margin-top:24px">${button("OPEN INQUIRY", payload.inquiryUrl, "#0c9f73")}</div>`;
    return {subject, text, html: shell({preheader: subject, heading: "NEW CUSTOMER INQUIRY",
      greeting: payload.businessName, bodyHtml, reason:"You received this transactional email because your published ScaledCircle Landing Page received an inquiry."})};
  }
  const subject = `Your request was sent to ${payload.businessName}`;
  const detail = payload.inquirySummary ? `\n\nYour request:\n${payload.inquirySummary}` : "";
  const text = `Hi ${firstName(payload.customerName)},\n\nYour request was sent to ${payload.businessName}.` +
    `${detail}\n\nThey can follow up using the contact details you provided. This message does not promise ` +
    `a response time, appointment, quote, or acceptance.\n\nThis is a transactional confirmation, not a marketing subscription.`;
  const bodyHtml = `<p style="font-size:15px;line-height:1.6">Your request was sent to ` +
    `<strong>${escapeHtml(payload.businessName)}</strong>.</p>` +
    (payload.inquirySummary ? `<p style="font-size:15px;line-height:1.6"><strong>Your request</strong><br>` +
      `${escapeHtml(payload.inquirySummary)}</p>` : "") +
    `<p style="font-size:14px;line-height:1.6;color:#60758a">They can follow up using the contact details ` +
    `you provided. This confirmation does not promise a response time, appointment, quote, or acceptance. ` +
    `It is not a marketing subscription.</p>`;
  return {subject, text, html: shell({preheader: subject, heading: "REQUEST RECEIVED",
    greeting: firstName(payload.customerName), bodyHtml,
    reason:"You received this transactional confirmation because you submitted a request through a ScaledCircle Landing Page."})};
}

function deliveryContent(job) {
  if (LANDING_PAGE_TEMPLATES.has(cleanText(job?.template, 80))) return landingPageContent(job);
  return {subject: cleanText(job?.subject, 180), text: String(job?.text || "").slice(0, 16000),
    html: job?.html && job.trustedHtml === true ? String(job.html).slice(0, 60000) : undefined};
}

function validateSignupInput(data) {
  const role = cleanText(data?.role, 24).toLowerCase();
  const displayName = cleanText(data?.displayName, 120);
  const postalCode = cleanText(data?.postalCode, 20);
  const contactNumber = cleanText(data?.contactNumber, 40);
  const companyName = cleanText(data?.companyName, 160);
  const discoverySource = cleanText(data?.discoverySource, 40);
  const referrerName = cleanText(data?.referrerName, 120);
  if (!PUBLIC_ROLES.has(role) || !displayName || !postalCode || !DISCOVERY_SOURCES.has(discoverySource)) {
    throw new Error("signup_input_invalid");
  }
  if (discoverySource === "personal_referral" && !referrerName) throw new Error("referrer_required");
  return {role, displayName, postalCode, contactNumber, companyName: role === "business" ? companyName : "",
    discoverySource, referrerName: discoverySource === "personal_referral" ? referrerName : ""};
}

function createService({db, auth, FieldValue, now = () => Date.now()}) {
  return {
    async finalize({uid, authUser, data}) {
      const input = validateSignupInput(data);
      const email = cleanText(authUser.email, 254).toLowerCase();
      if (!email || authUser.disabled) throw new Error("auth_identity_invalid");
      const adminLink = await auth.generateEmailVerificationLink(email, {
        url: PROFILE_ROUTE, handleCodeInApp: false,
      });
      const verificationUrl = brandedVerificationUrl(adminLink);
      const created = authUser.metadata?.creationTime || new Date(now()).toISOString();
      const welcome = welcomeTemplate({...input, verificationUrl});
      const admin = adminTemplate({uid, ...input, email, source: "public_account_creation", created});
      const userRef = db.collection("users").doc(uid);
      const welcomeRef = db.collection("outboundEmailJobs").doc(`welcome-user_${uid}`);
      const adminRef = db.collection("outboundEmailJobs").doc(`admin-new-user_${uid}`);
      await db.runTransaction(async (transaction) => {
        const [user, welcomeJob, adminJob] = await Promise.all([
          transaction.get(userRef), transaction.get(welcomeRef), transaction.get(adminRef),
        ]);
        if (user.exists) {
          const existing = user.data() || {};
          if (cleanText(existing.role, 24) !== input.role || cleanText(existing.email, 254).toLowerCase() !== email) {
            throw new Error("signup_already_finalized");
          }
        } else {
          transaction.create(userRef, {email, displayName: input.displayName, companyName: input.companyName,
            postalCode: input.postalCode, contactNumber: input.contactNumber, role: input.role,
            accountType: input.role, activeView: input.role, active: false, betaAccess: "pending",
            earlyAccessSource: "public_account_creation", discoverySource: input.discoverySource,
            referrerName: input.referrerName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
        }
        if (!welcomeJob.exists) transaction.create(welcomeRef, {...emailJob({to: email, template: `welcome_${input.role}_v2`,
          eventType: "signup.account.welcome", content: welcome, metadata: {uid, role: input.role}}),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
        if (!adminJob.exists) transaction.create(adminRef, {...emailJob({to: SUPPORT_EMAIL, template: `support_new_${input.role}_v2`,
          eventType: "signup.account.support_alert", content: admin, metadata: {uid, role: input.role}}),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      });
      return {finalized: true, role: input.role};
    },
    async resend({uid, authUser}) {
      if (!authUser.email || authUser.emailVerified) throw new Error(authUser.emailVerified ? "already_verified" : "auth_identity_invalid");
      const rateRef = db.collection("verificationEmailRateLimits").doc(uid);
      const current = await rateRef.get();
      const last = current.data()?.lastSentAtMillis || 0;
      if (now() - last < RESEND_COOLDOWN_MS) throw new Error("verification_rate_limited");
      const link = await auth.generateEmailVerificationLink(authUser.email, {url: PROFILE_ROUTE, handleCodeInApp: false});
      const verificationUrl = brandedVerificationUrl(link);
      const content = verificationOnlyTemplate({displayName: authUser.displayName, verificationUrl});
      const bucket = Math.floor(now() / RESEND_COOLDOWN_MS);
      const jobRef = db.collection("outboundEmailJobs").doc(`verify-email_${uid}_${bucket}`);
      await db.runTransaction(async (transaction) => {
        const [rate, job] = await Promise.all([transaction.get(rateRef), transaction.get(jobRef)]);
        const transactionLast = rate.data()?.lastSentAtMillis || 0;
        if (now() - transactionLast < RESEND_COOLDOWN_MS) throw new Error("verification_rate_limited");
        if (!job.exists) transaction.create(jobRef, {...emailJob({to: authUser.email, template: "verification_email_v1",
          eventType: "auth.email.verification", content, metadata: {uid}}), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
        transaction.set(rateRef, {lastSentAtMillis: now(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      });
      return {queued: true, cooldownSeconds: RESEND_COOLDOWN_MS / 1000};
    },
  };
}

function validateDeliveryJob(job) {
  const template = cleanText(job?.template, 80);
  const destination = cleanText(job?.to, 254).toLowerCase();
  const sender = cleanText(job?.fromAddress, 254).toLowerCase();
  const landingPageTemplate = LANDING_PAGE_TEMPLATES.has(template);
  const allowedTemplate = template.startsWith("welcome_") || template.startsWith("support_") ||
    template.startsWith("verification_") || landingPageTemplate;
  const recipientAllowed = destination === SUPPORT_EMAIL || template.startsWith("welcome_") ||
    template.startsWith("verification_") || landingPageTemplate;
  const html = job?.html == null ? undefined : String(job.html).slice(0, 60000);
  const htmlAllowed = !html || job.trustedHtml === true;
  if (!validEmail(destination) || sender !== SUPPORT_EMAIL || !allowedTemplate || !recipientAllowed || !htmlAllowed) return false;
  if (landingPageTemplate) {
    if (job?.schemaVersion !== LANDING_PAGE_EMAIL_SCHEMA_VERSION) return false;
    if (job?.html || job?.trustedHtml || job?.cc || job?.bcc || job?.smtp || job?.headers) return false;
    try { landingPagePayload(job); } catch (_) { return false; }
    return true;
  }
  return Boolean(cleanText(job?.text, 16000));
}

async function claimQueuedJob({db, reference, FieldValue, leaseId}) {
  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    if (!["queued", "retry_requested"].includes(current.data()?.status) ||
        Number(current.data()?.attempts || 0) >= MAX_DELIVERY_ATTEMPTS) return false;
    transaction.update(reference, {
      status: "sending",
      leaseId,
      attempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

function classifyDeliveryError(error) {
  const code = String(error?.code || "").toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  return code.includes("AUTH") || code === "EAUTH" || (responseCode >= 500 && responseCode < 600) ?
    "failed_terminal" : "failed_retryable";
}

function deliveryHealth({workerAvailable, recipientAvailable = true, applicable = true, status,
  attempts = 0, errorCode = null, providerResult = null}) {
  if (!applicable) return {state: "not_applicable", health: "healthy"};
  if (!recipientAvailable) return {state: "recipient_unavailable", health: "degraded"};
  if (!workerAvailable && ["queued", "retry_requested"].includes(status)) {
    return {state: "worker_unavailable", health: "degraded"};
  }
  if (["queued", "retry_requested", "sending"].includes(status)) return {state: status, health: "pending"};
  if (status === "sent") return {state: "sent", health: "healthy"};
  if (status === "failed_terminal" && Number(attempts) === 0 && errorCode === "invalid_server_email_job" && !providerResult) {
    return {state:"schema_invalid_never_attempted",health:"degraded"};
  }
  return {state: status || "job_missing", health: "degraded"};
}

async function processDeliveryJob({db, reference, jobId, FieldValue, createTransport, logger = console,
  smtpPassword, leaseId = crypto.randomUUID()}) {
  const snapshot = await reference.get();
  const job = snapshot.data() || {};
  if (!["queued", "retry_requested"].includes(job.status)) return {processed:false, reason:"ineligible_state"};
  if (!validateDeliveryJob(job)) {
    await reference.set({status:"failed_terminal",errorCode:"invalid_server_email_job",
      updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {processed:false, reason:"invalid_job"};
  }
  const claimed = await claimQueuedJob({db,reference,FieldValue,leaseId});
  if (!claimed) return {processed:false, reason:"not_claimed"};
  const content = deliveryContent(job);
  const transport = createTransport({service:"gmail",auth:{user:SUPPORT_EMAIL,pass:smtpPassword}});
  try {
    const result = await transport.sendMail({from:`${SUPPORT_NAME} <${SUPPORT_EMAIL}>`,to:validEmail(job.to),
      replyTo:SUPPORT_EMAIL,subject:content.subject,text:content.text,...(content.html?{html:content.html}:{}),
      headers:{"X-Scaled-Circle-Notification":jobId}});
    await reference.set({status:"sent",messageId:cleanText(result?.messageId,500),providerResult:"accepted",
      sentAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {processed:true,status:"sent"};
  } catch (error) {
    const status = classifyDeliveryError(error);
    logger.error?.("Outbound email delivery failed.",{jobId,template:job.template,status});
    await reference.set({status,errorCode:"email_delivery_failed",lastErrorClass:status,
      updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {processed:true,status};
  }
}

module.exports = {SUPPORT_EMAIL, SUPPORT_NAME, LOGO_URL, PROFILE_ROUTE, RESEND_COOLDOWN_MS,
  LANDING_PAGE_TEMPLATES, LANDING_PAGE_EMAIL_SCHEMA_VERSION, MAX_DELIVERY_ATTEMPTS,
  cleanText, escapeHtml, brandedVerificationUrl, welcomeTemplate, adminTemplate,
  verificationOnlyTemplate, historicalPendingScalerTemplate, validateSignupInput, createService, validateDeliveryJob,
  landingPagePayload, landingPageContent, deliveryContent, validEmail, claimQueuedJob, classifyDeliveryError,
  deliveryHealth, processDeliveryJob};

const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getStorage} = require("firebase-admin/storage");
const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");
const {
  LIMITS: TRACKING_LIMITS,
  assertAllowedKeys,
  canonicalChunkId,
  compatibilityRoutePoints,
  digestRawPoints,
  normalizeChunk,
  normalizePoint,
  serializedBytes,
} = require("./tracking_security");
const marketplace = require("./marketplace_finance");
const {
  parseSnapshotEvent,
  parseThinEvent,
  stripeAccountIdFromThinEvent,
} = require("./marketplace_webhook");
const {runFinancialOperation} = require("./marketplace_operations");

initializeApp();

const db = getFirestore();

setGlobalOptions({
  maxInstances: 10,
  region: "us-east1",
});

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";

const DEVELOPMENT_HOMES_PER_ACRE = 2.5;

const ADMIN_WALLET_ID = "scaled_circle_admin";

const SIGNUP_NOTIFICATION_EMAIL = "attractiveremodel@gmail.com";
const SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD = defineSecret(
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD",
);
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_THIN_WEBHOOK_SECRET = defineSecret("STRIPE_THIN_WEBHOOK_SECRET");
const STRIPE_STARTER_PRICE_ID = defineSecret("STRIPE_STARTER_PRICE_ID");
const STRIPE_GROWTH_PRICE_ID = defineSecret("STRIPE_GROWTH_PRICE_ID");
const STRIPE_SCALE_PRICE_ID = defineSecret("STRIPE_SCALE_PRICE_ID");


const SUBSCRIPTION_PRICES = {
  starter: 99,
  growth: 299,
  scale: 499,
};

const SUBSCRIPTION_RANKS = {
  starter: 1,
  growth: 2,
  scale: 3,
};

const MINIMUM_PAYABLE_COMPLETION_PERCENTAGE = 10;
const AUTOMATIC_BONUS_COMPLETION_PERCENTAGE = 95;
const ADMIN_COMPED_SUBSCRIPTION_EXPIRATION = Timestamp.fromDate(
  new Date("2099-12-31T23:59:59.000Z"),
);

async function authenticatedUserContext(request, message) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", message);
  }

  const userReference = db.collection("users").doc(request.auth.uid);
  const userSnapshot = await userReference.get();
  const user = userSnapshot.data() || {};
  const role = typeof user.role === "string" ? user.role.toLowerCase() : "";

  return {
    uid: request.auth.uid,
    user,
    role,
    isAdmin: role === "admin",
    emailVerified: request.auth.token.email_verified === true,
  };
}

async function requireVerifiedUser(request, message) {
  const context = await authenticatedUserContext(request, message);
  if (!context.isAdmin && !context.emailVerified) {
    throw new HttpsError(
      "permission-denied",
      "Verify your email address before using billing or receiving payments.",
    );
  }
  return context;
}

async function grantAdminScaleSubscription(adminId) {
  const walletReference = db.collection("wallets").doc(adminId);
  const subscriptionReference = db
    .collection("businessSubscriptions")
    .doc(adminId);
  const serverTimestamp = FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    transaction.set(walletReference, {
      ownerId: adminId,
      ownerType: "business",
      subscriptionPlan: "scale",
      subscriptionPrice: SUBSCRIPTION_PRICES.scale,
      subscriptionStatus: "active",
      subscriptionComped: true,
      subscriptionSource: "admin_comp",
      subscriptionExpiresAt: ADMIN_COMPED_SUBSCRIPTION_EXPIRATION,
      updatedAt: serverTimestamp,
    }, {merge: true});

    transaction.set(subscriptionReference, {
      businessId: adminId,
      plan: "scale",
      planId: "scale",
      price: SUBSCRIPTION_PRICES.scale,
      status: "active",
      comped: true,
      source: "admin_comp",
      expiresAt: ADMIN_COMPED_SUBSCRIPTION_EXPIRATION,
      updatedAt: serverTimestamp,
    }, {merge: true});
  });

  return {
    plan: "scale",
    chargedCredits: 0,
    comped: true,
    expiresAt: ADMIN_COMPED_SUBSCRIPTION_EXPIRATION.toMillis(),
  };
}

const TRACKING_CHANNELS = new Set([
  "web",
  "qr",
  "print",
  "phone",
  "email",
]);

const DISCOVERY_SOURCES = new Set([
  "personal_referral",
  "search_engine",
  "social_media",
  "online_ad",
  "event_or_group",
  "other",
]);

const DISCOVERY_SOURCE_LABELS = {
  personal_referral: "A person referred me",
  search_engine: "Google or another search engine",
  social_media: "Social media",
  online_ad: "Online advertisement",
  event_or_group: "Event or community group",
  other: "Other",
};

/**
 * Provision the web attribution layer for a campaign.
 *
 * The public tracking code is separate from the Firestore campaign id. It can
 * be printed safely, can later move behind go.scaledcircle.com, and can be
 * deactivated without deleting the campaign.
 */
exports.provisionCampaignTracking = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to configure campaign tracking.",
      );
    }

    const campaignId = readText(request.data?.campaignId, 160);
    const destinationType = request.data?.destinationType ===
      "scaled_circle_landing"
      ? "scaled_circle_landing"
      : "existing_website";
    const destinationUrl = normalizeExternalUrl(
      request.data?.destinationUrl,
    );
    const requestedChannels = Array.isArray(request.data?.channels)
      ? request.data.channels
        .map((value) => readText(value, 24))
        .filter((value) => TRACKING_CHANNELS.has(value))
      : ["web", "qr", "print"];

    if (!campaignId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaign is required.",
      );
    }

    if (!destinationUrl) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a complete https:// website destination.",
      );
    }

    const campaignReference = db.collection("campaigns").doc(campaignId);
    const businessId = request.auth.uid;

    return db.runTransaction(async (transaction) => {
      const campaignSnapshot = await transaction.get(campaignReference);

      if (!campaignSnapshot.exists) {
        throw new HttpsError("not-found", "The campaign does not exist.");
      }

      const campaign = campaignSnapshot.data() || {};

      if (campaign.businessId !== businessId) {
        throw new HttpsError(
          "permission-denied",
          "Only the campaign owner can configure tracking.",
        );
      }

      const existingCode = readText(campaign.trackingCode, 64);
      const trackingCode = /^[a-f0-9]{24}$/.test(existingCode)
        ? existingCode
        : crypto.randomBytes(12).toString("hex");
      const trackingReference = db
        .collection("campaignTrackingCodes")
        .doc(trackingCode);
      const trackingUrl = publicTrackingUrl(trackingCode);
      const qrTrackingUrl = `${trackingUrl}&source=qr`;
      const timestamp = FieldValue.serverTimestamp();
      const config = {
        destinationType,
        destinationUrl,
        landingPageHeadline: readText(
          request.data?.landingPageHeadline,
          120,
        ),
        landingPageBody: readText(request.data?.landingPageBody, 600),
        callToActionLabel: readText(
          request.data?.callToActionLabel,
          50,
        ) || "Learn More",
        channels: [...new Set(requestedChannels)],
        forwardingPhoneNumber: readText(
          request.data?.forwardingPhoneNumber,
          40,
        ),
        forwardingEmail: readText(request.data?.forwardingEmail, 200),
      };

      transaction.set(trackingReference, {
        active: true,
        trackingCode,
        campaignId,
        businessId,
        campaignName: readText(campaign.campaignName, 160),
        campaignDescription: readText(campaign.description, 1200),
        ...config,
        trackingUrl,
        qrTrackingUrl,
        createdAt: campaign.trackingCode ? campaign.trackingCreatedAt ||
          timestamp : timestamp,
        updatedAt: timestamp,
      }, {merge: true});

      transaction.update(campaignReference, {
        trackingEnabled: true,
        trackingStatus: "active",
        trackingCode,
        trackingUrl,
        qrCodeUrl: qrTrackingUrl,
        trackingDestinationType: destinationType,
        trackingDestinationUrl: destinationUrl,
        landingPageUrl: destinationType === "scaled_circle_landing"
          ? trackingUrl : null,
        landingPageHeadline: config.landingPageHeadline,
        landingPageBody: config.landingPageBody,
        trackingCallToActionLabel: config.callToActionLabel,
        trackingChannels: config.channels,
        forwardingPhoneNumber: config.forwardingPhoneNumber || null,
        forwardingEmail: config.forwardingEmail || null,
        phoneTrackingStatus: config.channels.includes("phone")
          ? "provider_connection_required" : "not_requested",
        emailTrackingStatus: config.channels.includes("email")
          ? "provider_connection_required" : "not_requested",
        trackingCreatedAt: campaign.trackingCreatedAt || timestamp,
        trackingUpdatedAt: timestamp,
        updatedAt: timestamp,
      });

      return {
        trackingCode,
        trackingUrl,
        qrTrackingUrl,
        landingPageUrl: destinationType === "scaled_circle_landing"
          ? trackingUrl : null,
        phoneTrackingStatus: config.channels.includes("phone")
          ? "provider_connection_required" : "not_requested",
        emailTrackingStatus: config.channels.includes("email")
          ? "provider_connection_required" : "not_requested",
      };
    });
  },
);

/**
 * Public campaign link used by QR codes, printable assets, Squarespace links,
 * and Scaled Circle landing pages.
 */
exports.campaignTracking = onRequest(
  {
    cors: false,
    maxInstances: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "no-store, max-age=0");
    response.set("Referrer-Policy", "strict-origin-when-cross-origin");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.status(405).send("Method not allowed.");
      return;
    }

    const trackingCode = readText(request.query.t, 64);

    if (!/^[a-f0-9]{24}$/.test(trackingCode)) {
      response.status(404).send("Tracking link not found.");
      return;
    }

    try {
      const trackingReference = db
        .collection("campaignTrackingCodes")
        .doc(trackingCode);
      const trackingSnapshot = await trackingReference.get();
      const tracking = trackingSnapshot.data() || {};

      if (!trackingSnapshot.exists || tracking.active !== true) {
        response.status(404).send("Tracking link is no longer active.");
        return;
      }

      const destinationUrl = normalizeExternalUrl(tracking.destinationUrl);

      if (!destinationUrl) {
        response.status(503).send("Campaign destination is unavailable.");
        return;
      }

      const source = readText(request.query.source, 24) === "qr"
        ? "qr" : "web";
      const action = readText(request.query.action, 24);

      if (action === "cta") {
        await recordTrackingEvent({
          tracking,
          trackingCode,
          eventType: "cta_click",
          source,
          request,
          metrics: ["ctaClicks"],
        });
        response.redirect(302, destinationUrl);
        return;
      }

      const destinationType = tracking.destinationType ===
        "scaled_circle_landing"
        ? "scaled_circle_landing"
        : "existing_website";
      const metrics = source === "qr" ? ["qrScans"] : ["webVisits"];

      if (destinationType === "existing_website") {
        await recordTrackingEvent({
          tracking,
          trackingCode,
          eventType: "destination_redirect",
          source,
          request,
          metrics,
        });
        response.redirect(302, destinationUrl);
        return;
      }

      await recordTrackingEvent({
        tracking,
        trackingCode,
        eventType: "landing_page_view",
        source,
        request,
        metrics: [...metrics, "landingPageViews"],
      });

      response.status(200).type("html").send(renderCampaignLandingPage({
        tracking,
        destinationUrl,
        source,
      }));
    } catch (error) {
      logger.error("Campaign tracking request failed.", {
        trackingCode,
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(500).send("Unable to open this campaign right now.");
    }
  },
);

/**
 * Public pre-launch waitlist shared by the Flutter web entry point and the
 * Squarespace embed. This creates no authenticated account and grants no
 * marketplace access.
 */
exports.joinWaitlist = onRequest(
  {
    cors: true,
    maxInstances: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "no-store, max-age=0");

    if (request.method !== "POST") {
      response.status(405).json({error: "Method not allowed."});
      return;
    }

    const body = request.body && typeof request.body === "object"
      ? request.body : {};

    // Quietly accept bot-filled forms so the honeypot does not teach bots how
    // to bypass it, while avoiding a Firestore write.
    if (readText(body.website, 200)) {
      response.status(200).json({status: "waiting"});
      return;
    }

    const email = readText(body.email, 254).toLowerCase();
    const role = body.role === "business" ? "business" :
      body.role === "scaler" ? "scaler" : "";
    const displayName = readText(body.displayName, 120);
    const companyName = readText(body.companyName, 160);
    const postalCode = readText(body.postalCode, 20);
    const contactNumber = readText(body.contactNumber, 40);
    const discoverySource = readText(body.discoverySource, 40);
    const referrerName = discoverySource === "personal_referral"
      ? readText(body.referrerName, 160) : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      response.status(400).json({error: "Enter a valid email address."});
      return;
    }

    if (!role) {
      response.status(400).json({error: "Choose Business or Scaler."});
      return;
    }

    if (!DISCOVERY_SOURCES.has(discoverySource)) {
      response.status(400).json({
        error: "Tell us how you heard about Scaled Circle.",
      });
      return;
    }

    if (discoverySource === "personal_referral" && !referrerName) {
      response.status(400).json({
        error: "Enter the name of the person who referred you.",
      });
      return;
    }

    if (body.consent !== true) {
      response.status(400).json({
        error: "Consent is required to send launch and beta invitations.",
      });
      return;
    }

    const waitlistId = crypto
      .createHash("sha256")
      .update(`${role}:${email}`)
      .digest("hex");
    const waitlistReference = db.collection("waitlist").doc(waitlistId);
    const snapshot = await waitlistReference.get();
    const timestamp = FieldValue.serverTimestamp();

    await waitlistReference.set({
      email,
      role,
      displayName,
      companyName: role === "business" ? companyName : "",
      postalCode,
      contactNumber,
      status: "waiting",
      source: readText(body.source, 80) || "scaled_circle_web",
      discoverySource,
      referrerName,
      consent: true,
      benefits: role === "business"
        ? {
          freeLaunchSubscription: true,
          platformFeeStillApplies: true,
          scalerPayStillApplies: true,
        }
        : {
          earlyHistoryPriority: true,
          earlyAccessCandidate: true,
        },
      ...(snapshot.exists ? {} : {createdAt: timestamp}),
      updatedAt: timestamp,
    }, {merge: true});

    response.status(snapshot.exists ? 200 : 201).json({
      status: "waiting",
      alreadyJoined: snapshot.exists,
      role,
      message: role === "business"
        ? "You are on the Business early-access list."
        : "You are on the Scaler early-access list.",
    });
  },
);

/**
 * Email the Scaled Circle launch administrator when a complete account profile
 * is created. The user profile is a better source than the raw Auth event
 * because it includes the selected Business/Scaler role and company details.
 */
exports.notifyAdminOnAccountSignup = onDocumentCreated(
  {
    document: "users/{userId}",
    secrets: [SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD],
    retry: true,
    maxInstances: 5,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) {
      return;
    }

    const notificationId = `account_${event.params.userId}`;
    await Promise.all([
      sendAdminSignupNotification({
        notificationId,
        signupType: "account",
        data,
      }),
      sendSignupWelcomeEmail({
        notificationId,
        signupType: "account",
        data,
      }),
    ]);
  },
);

/**
 * Notify the administrator about public early-access signups that did not
 * create an account. Account creation also submits the waitlist form when the
 * user requests updates, so Auth is checked first to prevent duplicate email.
 */
exports.notifyAdminOnWaitlistSignup = onDocumentCreated(
  {
    document: "waitlist/{waitlistId}",
    secrets: [SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD],
    retry: true,
    maxInstances: 5,
  },
  async (event) => {
    const data = event.data?.data();
    const email = readText(data?.email, 254).toLowerCase();
    if (!data || !email) {
      return;
    }

    try {
      await getAuth().getUserByEmail(email);
      logger.info("Skipping duplicate waitlist signup email", {
        waitlistId: event.params.waitlistId,
        email,
      });
      return;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }

    const notificationId = `waitlist_${event.params.waitlistId}`;
    await Promise.all([
      sendAdminSignupNotification({
        notificationId,
        signupType: "early_access",
        data,
      }),
      sendSignupWelcomeEmail({
        notificationId,
        signupType: "early_access",
        data,
      }),
    ]);
  },
);

async function sendAdminSignupNotification({
  notificationId,
  signupType,
  data,
}) {
  const auditReference = db
    .collection("systemEmailNotifications")
    .doc(notificationId);
  const auditSnapshot = await auditReference.get();
  if (auditSnapshot.data()?.status === "sent") {
    return;
  }

  const email = readText(data.email, 254).toLowerCase();
  const roleValue = readText(data.accountType || data.role, 40);
  const role = roleValue === "business" ? "Business" :
    roleValue === "scaler" ? "Scaler" : "User";
  const displayName = readText(data.displayName, 120) || "Not provided";
  const companyName = readText(data.companyName, 160) || "Not provided";
  const postalCode = readText(data.postalCode, 20) || "Not provided";
  const contactNumber = readText(data.contactNumber, 40) || "Not provided";
  const source = readText(data.source, 80) ||
    (signupType === "account" ? "account creation" : "early-access form");
  const discoverySource = readText(data.discoverySource, 40);
  const discoveryLabel = DISCOVERY_SOURCE_LABELS[discoverySource] ||
    "Not provided";
  const referrerName = discoverySource === "personal_referral"
    ? readText(data.referrerName, 160) || "Not provided"
    : "Not applicable";
  const signupLabel = signupType === "account"
    ? "new Scaled Circle account"
    : "new Maryland early-access signup";

  await auditReference.set({
    status: "sending",
    notificationId,
    signupType,
    recipient: SIGNUP_NOTIFICATION_EMAIL,
    signupEmail: email,
    updatedAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
  }, {merge: true});

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: SIGNUP_NOTIFICATION_EMAIL,
      pass: SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD.value(),
    },
  });
  const subject = `[Scaled Circle] New ${role} ${
    signupType === "account" ? "account" : "early-access signup"
  }`;
  const text = [
    `Scaled Circle received a ${signupLabel}.`,
    "",
    `Role: ${role}`,
    `Name: ${displayName}`,
    `Business: ${companyName}`,
    `Email: ${email || "Not provided"}`,
    `ZIP / postal code: ${postalCode}`,
    `Contact number: ${contactNumber}`,
    `Source: ${source}`,
    `How they heard about us: ${discoveryLabel}`,
    `Referred by: ${referrerName}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#102018">
      <h2 style="color:#087f5b">New Scaled Circle signup</h2>
      <p>Scaled Circle received a ${escapeHtml(signupLabel)}.</p>
      <table style="border-collapse:collapse">
        <tr><td><strong>Role</strong></td><td>${escapeHtml(role)}</td></tr>
        <tr><td><strong>Name</strong></td><td>${escapeHtml(displayName)}</td></tr>
        <tr><td><strong>Business</strong></td><td>${escapeHtml(companyName)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(
    email || "Not provided",
  )}</td></tr>
        <tr><td><strong>ZIP / postal code</strong></td><td>${escapeHtml(
    postalCode,
  )}</td></tr>
        <tr><td><strong>Contact number</strong></td><td>${escapeHtml(
    contactNumber,
  )}</td></tr>
        <tr><td><strong>Source</strong></td><td>${escapeHtml(source)}</td></tr>
        <tr><td><strong>How they heard about us</strong></td><td>${escapeHtml(
    discoveryLabel,
  )}</td></tr>
        <tr><td><strong>Referred by</strong></td><td>${escapeHtml(
    referrerName,
  )}</td></tr>
      </table>
    </div>`;

  try {
    const result = await transport.sendMail({
      from: `Scaled Circle Signups <${SIGNUP_NOTIFICATION_EMAIL}>`,
      to: SIGNUP_NOTIFICATION_EMAIL,
      replyTo: email || undefined,
      subject,
      text,
      html,
      headers: {
        "X-Scaled-Circle-Notification": notificationId,
      },
    });

    await auditReference.set({
      status: "sent",
      messageId: result.messageId || "",
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (error) {
    await auditReference.set({
      status: "failed",
      error: readText(error instanceof Error ? error.message : error, 500),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    throw error;
  }
}

async function sendSignupWelcomeEmail({
  notificationId,
  signupType,
  data,
}) {
  const email = readText(data.email, 254).toLowerCase();
  if (!email) {
    return;
  }

  const auditReference = db
    .collection("systemEmailNotifications")
    .doc(`welcome_${notificationId}`);
  const auditSnapshot = await auditReference.get();
  if (auditSnapshot.data()?.status === "sent") {
    return;
  }

  const roleValue = readText(data.accountType || data.role, 40);
  const isBusiness = roleValue === "business";
  const displayName = readText(data.displayName, 120);
  const greeting = displayName ? `Hi ${displayName},` : "Hello,";
  const accessLabel = signupType === "account"
    ? "Your Scaled Circle account has been created and placed in early access."
    : "You are now on the Scaled Circle Maryland early-access list.";
  const roleBenefit = isBusiness
    ? "Your Business launch benefit includes a free subscription. The 10% " +
      "platform fee and Scaler pay still apply when you run campaigns."
    : "As an early Scaler, you will have an opportunity to build verified " +
      "work history before the broader launch.";
  const text = [
    greeting,
    "",
    "Welcome to Scaled Circle!",
    accessLabel,
    "",
    "We plan to go live very soon and will keep you informed about launch " +
      "updates and beta invitations.",
    "",
    roleBenefit,
    "",
    "Thank you for joining us early.",
    "Scaled Circle",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102018;max-width:640px">
      <p>${escapeHtml(greeting)}</p>
      <h1 style="color:#087f5b">Welcome to Scaled Circle!</h1>
      <p>${escapeHtml(accessLabel)}</p>
      <p>We plan to go live very soon and will keep you informed about launch
        updates and beta invitations.</p>
      <div style="padding:16px 18px;border-left:4px solid #14e39a;background:#f1fbf7">
        ${escapeHtml(roleBenefit)}
      </div>
      <p>Thank you for joining us early.</p>
      <p><strong>Scaled Circle</strong></p>
    </div>`;

  await auditReference.set({
    status: "sending",
    notificationId,
    signupType,
    recipient: email,
    updatedAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
  }, {merge: true});

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: SIGNUP_NOTIFICATION_EMAIL,
      pass: SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD.value(),
    },
  });

  try {
    const result = await transport.sendMail({
      from: `Scaled Circle <${SIGNUP_NOTIFICATION_EMAIL}>`,
      to: email,
      replyTo: SIGNUP_NOTIFICATION_EMAIL,
      subject: "Welcome to Scaled Circle Early Access",
      text,
      html,
      headers: {
        "X-Scaled-Circle-Notification": `welcome_${notificationId}`,
      },
    });

    await auditReference.set({
      status: "sent",
      messageId: result.messageId || "",
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (error) {
    await auditReference.set({
      status: "failed",
      error: readText(error instanceof Error ? error.message : error, 500),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    throw error;
  }
}

/**
 * Public, cached NWS alert feed for the Local Opportunity Alerts website
 * module. Weather facts remain separate from Scaled Circle's experimental
 * lead-lift estimate.
 */
exports.localOpportunityAlerts = onRequest(
  {
    cors: true,
    maxInstances: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "public, max-age=120");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.status(405).json({error: "Method not allowed."});
      return;
    }

    const latitude = Number(request.query.latitude);
    const longitude = Number(request.query.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      response.status(400).json({
        error: "Valid latitude and longitude are required.",
      });
      return;
    }

    try {
      const feed = await loadWeatherOpportunityFeed({latitude, longitude});
      response.status(200).json(feed);
    } catch (error) {
      logger.error("Unable to load local opportunity alerts.", {
        latitude,
        longitude,
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(503).json({
        error: "Local opportunity alerts are temporarily unavailable.",
      });
    }
  },
);

/** Send queued weather emails independently so missing email credentials never
 * stop scheduled in-app notifications from being created. */
exports.sendWeatherAlertEmail = onDocumentCreated(
  {
    document: "weatherEmailQueue/{deliveryId}",
    maxInstances: 5,
    retry: true,
    secrets: [SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const queue = snapshot.data() || {};
    if (queue.status === "sent") return;

    const deliveryId = event.params.deliveryId;
    const alert = queue.alert && typeof queue.alert === "object" ? queue.alert : {};
    const countyName = readText(queue.countyName, 120);
    const destination = readText(queue.email, 320).toLowerCase();
    if (!destination) {
      await snapshot.ref.set({
        status: "failed",
        error: "A destination email is required.",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return;
    }

    try {
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: SIGNUP_NOTIFICATION_EMAIL,
          pass: SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD.value(),
        },
      });
      const eventName = readText(alert.event, 120) || "Weather alert";
      const officialDescription = readText(alert.officialDescription, 1000);
      const services = Array.isArray(alert.services) ?
        alert.services.join(", ") : "Local outreach";
      const low = Number(alert.leadLiftLowPercent) || 0;
      const high = Number(alert.leadLiftHighPercent) || 0;
      const sourceUrl = readText(alert.sourceUrl, 1000);
      const text = `${eventName} — ${countyName}\n\n` +
        `Official National Weather Service information:\n${officialDescription}\n\n` +
        `Experimental Scaled Circle planning estimate: +${low}% to +${high}% ` +
        `potential lead activity. Suggested services: ${services}.\n\n` +
        `Review signals: ${publicAppBaseUrl()}/`;
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0b1725">
          <h2>${escapeHtml(eventName)} — ${escapeHtml(countyName)}</h2>
          <h3>Official National Weather Service information</h3>
          <p>${escapeHtml(officialDescription).replaceAll("\n", "<br>")}</p>
          ${sourceUrl ? `<p><a href="${escapeHtml(sourceUrl)}">View official alert</a></p>` : ""}
          <hr>
          <h3>Experimental planning estimate</h3>
          <p><strong>+${low}% to +${high}%</strong> potential lead activity.</p>
          <p>Suggested services: ${escapeHtml(services)}</p>
          <p><em>This estimate is not a guarantee of leads or work.</em></p>
          <p><a href="${escapeHtml(publicAppBaseUrl())}/">Open Scaled Circle</a></p>
        </div>`;
      const result = await transport.sendMail({
        from: `Scaled Circle Weather <${SIGNUP_NOTIFICATION_EMAIL}>`,
        to: destination,
        subject: `[Scaled Circle Weather] ${eventName} — ${countyName}`,
        text,
        html,
        headers: {"X-Scaled-Circle-Notification": `weather_${deliveryId}`},
      });
      await Promise.all([
        snapshot.ref.set({
          status: "sent",
          messageId: result.messageId || "",
          sentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true}),
        db.collection("weatherAlertDeliveries").doc(deliveryId).set({
          emailSent: true,
          emailMessageId: result.messageId || "",
          emailSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true}),
      ]);
    } catch (error) {
      await snapshot.ref.set({
        status: "failed",
        error: readText(error instanceof Error ? error.message : error, 500),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw error;
    }
  },
);

/**
 * Purchase or upgrade the signed-in business subscription.
 *
 * Wallet debits and platform credits must run on the trusted server because
 * clients are not permitted to write the platform administrator wallet.
 */
exports.purchaseSubscription = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    const authContext = await requireVerifiedUser(
      request,
      "You must be logged in to purchase a subscription.",
    );

    const requestedPlan = request.data?.plan;

    if (typeof requestedPlan !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "A valid subscription plan is required.",
      );
    }

    const newPlan = requestedPlan.trim().toLowerCase();
    const targetPrice = SUBSCRIPTION_PRICES[newPlan];

    if (!Number.isFinite(targetPrice)) {
      throw new HttpsError(
        "invalid-argument",
        "Unknown subscription plan.",
      );
    }

    const businessId = request.auth.uid;
    if (authContext.isAdmin) {
      return grantAdminScaleSubscription(businessId);
    }
    throw new HttpsError(
      "failed-precondition",
      "Paid subscriptions must be purchased through Stripe Checkout.",
    );

    // Legacy credit-based subscription logic remains below temporarily so an
    // older deployed client receives a clear migration error instead of
    // silently creating a non-renewing production subscription.
    const walletReference = db.collection("wallets").doc(businessId);
    const subscriptionReference = db
      .collection("businessSubscriptions")
      .doc(businessId);
    const adminWalletReference = db
      .collection("wallets")
      .doc(ADMIN_WALLET_ID);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const walletSnapshot = await transaction.get(walletReference);
        const adminWalletSnapshot = await transaction.get(
          adminWalletReference,
        );

        if (!walletSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Business wallet does not exist.",
          );
        }

        const wallet = walletSnapshot.data() || {};
        const availableCredits = Number(wallet.availableCredits || 0);
        const currentPlan = typeof wallet.subscriptionPlan === "string"
          ? wallet.subscriptionPlan.toLowerCase()
          : null;
        const subscriptionStatus = typeof wallet.subscriptionStatus === "string"
          ? wallet.subscriptionStatus.toLowerCase()
          : null;
        const currentExpiration = wallet.subscriptionExpiresAt;
        const active =
          subscriptionStatus === "active" &&
          currentExpiration instanceof Timestamp &&
          currentExpiration.toDate() > new Date();

        let charge = targetPrice;
        let upgrading = false;

        if (active && currentPlan) {
          const currentRank = SUBSCRIPTION_RANKS[currentPlan];
          const targetRank = SUBSCRIPTION_RANKS[newPlan];

          if (!currentRank) {
            throw new HttpsError(
              "failed-precondition",
              "The current subscription plan is invalid.",
            );
          }

          if (targetRank === currentRank) {
            throw new HttpsError(
              "already-exists",
              "This subscription plan is already active.",
            );
          }

          if (targetRank < currentRank) {
            throw new HttpsError(
              "failed-precondition",
              "Subscription downgrades are not available.",
            );
          }

          charge = targetPrice - SUBSCRIPTION_PRICES[currentPlan];
          upgrading = true;
        }

        if (!Number.isFinite(availableCredits) || availableCredits < charge) {
          throw new HttpsError(
            "failed-precondition",
            `Insufficient credits. ${charge.toFixed(0)} required.`,
          );
        }

        const expiration = active
          ? currentExpiration
          : Timestamp.fromDate(
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          );
        const remainingCredits = availableCredits - charge;
        const adminWallet = adminWalletSnapshot.data() || {};
        const adminBalance = Number(adminWallet.availableBalance || 0);
        const serverTimestamp = FieldValue.serverTimestamp();

        transaction.update(walletReference, {
          availableCredits: remainingCredits,
          balance: remainingCredits,
          subscriptionPlan: newPlan,
          subscriptionPrice: targetPrice,
          subscriptionStatus: "active",
          subscriptionExpiresAt: expiration,
          ...(upgrading
            ? {
              previousSubscriptionPlan: currentPlan,
              subscriptionUpgradedAt: serverTimestamp,
            }
            : {
              subscriptionStartedAt: serverTimestamp,
            }),
          updatedAt: serverTimestamp,
        });

        transaction.set(
          subscriptionReference,
          {
            businessId,
            plan: newPlan,
            planId: newPlan,
            price: targetPrice,
            status: "active",
            expiresAt: expiration,
            ...(upgrading ? {previousPlan: currentPlan} : {}),
            updatedAt: serverTimestamp,
          },
          {merge: true},
        );

        const transactionReference = walletReference
          .collection("transactions")
          .doc();

        transaction.set(transactionReference, {
          type: upgrading
            ? "subscription_upgrade"
            : "subscription_payment",
          amount: charge,
          subscriptionPlan: newPlan,
          subscriptionFullPrice: targetPrice,
          previousSubscriptionPlan: currentPlan,
          description: upgrading
            ? "Scaled Circle subscription upgrade"
            : "Scaled Circle subscription purchase",
          createdAt: serverTimestamp,
        });

        transaction.set(
          adminWalletReference,
          {
            ownerId: ADMIN_WALLET_ID,
            ownerType: "admin",
            availableBalance: adminBalance + charge,
            balance: adminBalance + charge,
            updatedAt: serverTimestamp,
          },
          {merge: true},
        );

        return {
          plan: newPlan,
          chargedCredits: charge,
          remainingCredits,
          expiresAt: expiration.toMillis(),
        };
      });

      logger.info("Business subscription updated.", {
        businessId,
        plan: result.plan,
        chargedCredits: result.chargedCredits,
      });

      return result;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Subscription purchase failed.", {
        businessId,
        plan: newPlan,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to update the subscription right now.",
      );
    }
  },
);

/**
 * Ensures administrator accounts always receive the comped $499 Scale plan.
 * Normal businesses are read-only here and must subscribe through Stripe.
 */
exports.ensureBillingEntitlement = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    const authContext = await authenticatedUserContext(
      request,
      "You must be logged in to load billing access.",
    );
    if (authContext.isAdmin) {
      return grantAdminScaleSubscription(authContext.uid);
    }

    const walletSnapshot = await db.collection("wallets")
      .doc(authContext.uid)
      .get();
    const wallet = walletSnapshot.data() || {};
    return {
      plan: wallet.subscriptionPlan || null,
      status: wallet.subscriptionStatus || "inactive",
      comped: wallet.subscriptionComped === true,
    };
  },
);

/**
 * Creates the legacy wallet projection used by existing read-only screens.
 * It is not a cash ledger and cannot fund a Stripe marketplace campaign.
 * Development promotional value is granted only from trusted server state.
 */
exports.ensureLegacyWalletProjection = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const context = await authenticatedUserContext(
      request, "You must be logged in to load the wallet projection.",
    );
    const userSnapshot = await db.collection("users").doc(context.uid).get();
    const user = userSnapshot.data() || {};
    const ownerType = context.role === "scaler" ? "scaler" : "business";
    const walletRef = db.collection("wallets").doc(context.uid);
    const promoRef = walletRef.collection("promoRedemptions")
      .doc("development-business-10000-v1");
    await db.runTransaction(async (transaction) => {
      const [walletSnapshot, promoSnapshot] = await Promise.all([
        transaction.get(walletRef), transaction.get(promoRef),
      ]);
      if (!walletSnapshot.exists) {
        transaction.create(walletRef, {
          ownerId: context.uid,
          ownerType,
          balance: 0,
          availableCredits: 0,
          reservedCredits: 0,
          totalPaidOut: 0,
          availableBalance: 0,
          pendingBalance: 0,
          promotionalCreditsGranted: 0,
          projectionOnly: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (ownerType === "business" && user.developmentCreditsEnabled === true &&
          !promoSnapshot.exists) {
        const wallet = walletSnapshot.data() || {};
        const promotionalAmount = 10000;
        transaction.set(walletRef, {
          availableCredits: Number(wallet.availableCredits || 0) + promotionalAmount,
          balance: Number(wallet.availableCredits || 0) + promotionalAmount,
          promotionalCreditsGranted:
            Number(wallet.promotionalCreditsGranted || 0) + promotionalAmount,
          projectionOnly: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.create(promoRef, {
          promoKey: promoRef.id,
          amount: promotionalAmount,
          cashValue: 0,
          nonCash: true,
          nonTransferable: true,
          nonWithdrawable: true,
          developmentOnly: true,
          redeemedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return {projectionOnly: true, ownerType};
  },
);

function stripeClient() {
  const key = STRIPE_SECRET_KEY.value();
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe billing is not configured yet.",
    );
  }
  const environment = String(process.env.SCALEDCIRCLE_ENV || "local").toLowerCase();
  if (!["local", "staging", "production"].includes(environment)) {
    throw new HttpsError("failed-precondition", "Stripe environment is invalid.");
  }
  const liveKey = key.startsWith("sk_live_");
  if (environment !== "production" && liveKey) {
    throw new HttpsError(
      "failed-precondition",
      "Live Stripe credentials are disabled outside production.",
    );
  }
  if (environment === "production" && !liveKey) {
    throw new HttpsError(
      "failed-precondition",
      "Production Stripe credentials are not configured.",
    );
  }
  return new Stripe(key);
}

function scaledCircleEnvironment() {
  const value = String(process.env.SCALEDCIRCLE_ENV || "local").toLowerCase();
  if (!["local", "staging", "production"].includes(value)) {
    throw new HttpsError("failed-precondition", "Runtime environment is invalid.");
  }
  return value;
}

function publicAppBaseUrl() {
  if (scaledCircleEnvironment() === "local") {
    return String(process.env.PUBLIC_APP_BASE_URL || "http://127.0.0.1:5000")
      .replace(/\/$/, "");
  }
  return "https://scaledcircle.com";
}

function stripePriceForPlan(plan) {
  const prices = {
    starter: STRIPE_STARTER_PRICE_ID.value(),
    growth: STRIPE_GROWTH_PRICE_ID.value(),
    scale: STRIPE_SCALE_PRICE_ID.value(),
  };
  return prices[plan] || "";
}

function planForStripePrice(priceId) {
  const prices = {
    [STRIPE_STARTER_PRICE_ID.value()]: "starter",
    [STRIPE_GROWTH_PRICE_ID.value()]: "growth",
    [STRIPE_SCALE_PRICE_ID.value()]: "scale",
  };
  return prices[priceId] || null;
}

async function getOrCreateStripeCustomer(stripe, context) {
  const walletReference = db.collection("wallets").doc(context.uid);
  const walletSnapshot = await walletReference.get();
  const wallet = walletSnapshot.data() || {};
  const existingCustomerId = readText(wallet.stripeCustomerId, 120);
  if (existingCustomerId) return existingCustomerId;

  const authUser = await getAuth().getUser(context.uid);
  const customer = await stripe.customers.create({
    email: authUser.email || undefined,
    name: authUser.displayName || undefined,
    metadata: {firebaseUid: context.uid},
  });
  await walletReference.set({
    ownerId: context.uid,
    stripeCustomerId: customer.id,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return customer.id;
}

const STRIPE_CHECKOUT_SECRETS = [
  STRIPE_SECRET_KEY,
  STRIPE_STARTER_PRICE_ID,
  STRIPE_GROWTH_PRICE_ID,
  STRIPE_SCALE_PRICE_ID,
];

const STARTER_FREE_MONTH_PROMOTION_CODE = "SCALEDFREE99";
const STARTER_FREE_MONTH_COUPON_ID =
  "scaled_circle_starter_first_month_free_v1";

/**
 * Create the shareable first-month-free Starter promotion exactly once.
 * The coupon is restricted to the Starter product, so it cannot discount
 * wallet credits, campaign funding, platform fees, or Scaler compensation.
 */
exports.createStarterFreeMonthPromotion = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 2,
    secrets: [STRIPE_SECRET_KEY, STRIPE_STARTER_PRICE_ID],
  },
  async (request) => {
    const context = await authenticatedUserContext(
      request,
      "You must be logged in to create a promotion code.",
    );
    if (!context.isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only a Scaled Circle administrator can create this promotion.",
      );
    }

    const starterPriceId = STRIPE_STARTER_PRICE_ID.value();
    if (!starterPriceId) {
      throw new HttpsError(
        "failed-precondition",
        "The Stripe Starter price is not configured.",
      );
    }

    const stripe = stripeClient();
    const existingCodes = await stripe.promotionCodes.list({
      code: STARTER_FREE_MONTH_PROMOTION_CODE,
      active: true,
      limit: 1,
    });
    if (existingCodes.data.length > 0) {
      return {
        code: existingCodes.data[0].code,
        promotionCodeId: existingCodes.data[0].id,
        created: false,
      };
    }

    const starterPrice = await stripe.prices.retrieve(starterPriceId);
    const starterProductId = typeof starterPrice.product === "string" ?
      starterPrice.product : starterPrice.product?.id;
    if (!starterProductId) {
      throw new HttpsError(
        "failed-precondition",
        "The Stripe Starter price is not attached to a product.",
      );
    }

    let coupon;
    try {
      coupon = await stripe.coupons.retrieve(STARTER_FREE_MONTH_COUPON_ID);
      if (coupon.deleted) coupon = null;
    } catch (error) {
      if (error?.code !== "resource_missing") throw error;
      coupon = null;
    }
    if (!coupon) {
      coupon = await stripe.coupons.create({
        id: STARTER_FREE_MONTH_COUPON_ID,
        name: "Scaled Circle Starter - first month free",
        percent_off: 100,
        duration: "once",
        applies_to: {products: [starterProductId]},
        metadata: {
          purpose: "starter_first_month_free",
          workerPayDiscounted: "false",
        },
      });
    }

    let promotionCode;
    try {
      promotionCode = await stripe.promotionCodes.create({
        promotion: {type: "coupon", coupon: coupon.id},
        code: STARTER_FREE_MONTH_PROMOTION_CODE,
        active: true,
        restrictions: {first_time_transaction: true},
        metadata: {
          plan: "starter",
          duration: "first_month_only",
          createdBy: context.uid,
        },
      });
    } catch (error) {
      // A concurrent admin request may have created the same code first.
      const racedCodes = await stripe.promotionCodes.list({
        code: STARTER_FREE_MONTH_PROMOTION_CODE,
        active: true,
        limit: 1,
      });
      if (racedCodes.data.length === 0) throw error;
      promotionCode = racedCodes.data[0];
    }

    return {
      code: promotionCode.code,
      promotionCodeId: promotionCode.id,
      created: true,
    };
  },
);

/** Create a Stripe-hosted recurring subscription Checkout session. */
exports.createSubscriptionCheckoutSession = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
    secrets: STRIPE_CHECKOUT_SECRETS,
  },
  async (request) => {
    const context = await requireVerifiedUser(
      request,
      "You must be logged in to subscribe.",
    );
    if (context.isAdmin) {
      return {...await grantAdminScaleSubscription(context.uid), url: null};
    }

    const walletSnapshot = await db.collection("wallets").doc(context.uid).get();
    const wallet = walletSnapshot.data() || {};
    const activeStripeSubscriptionId = readText(
      wallet.stripeSubscriptionId,
      120,
    );
    const subscriptionStatus = readText(
      wallet.subscriptionStatus,
      30,
    ).toLowerCase();
    if (
      activeStripeSubscriptionId &&
      ["active", "trialing", "past_due"].includes(subscriptionStatus)
    ) {
      throw new HttpsError(
        "already-exists",
        "An active Stripe subscription already exists. Use Manage Billing " +
          "to change or cancel it.",
      );
    }

    const plan = readText(request.data?.plan, 20).toLowerCase();
    if (!SUBSCRIPTION_PRICES[plan]) {
      throw new HttpsError("invalid-argument", "Choose a valid plan.");
    }
    const price = stripePriceForPlan(plan);
    if (!price) {
      throw new HttpsError(
        "failed-precondition",
        `Stripe pricing for the ${plan} plan is not configured.`,
      );
    }

    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(stripe, context);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{price, quantity: 1}],
      allow_promotion_codes: true,
      success_url: `${publicAppBaseUrl()}/?billing=success`,
      cancel_url: `${publicAppBaseUrl()}/?billing=cancelled`,
      metadata: {firebaseUid: context.uid, purchaseType: "subscription", plan},
      subscription_data: {metadata: {firebaseUid: context.uid, plan}},
    });
    return {url: session.url, sessionId: session.id, plan, comped: false};
  },
);

/** Create a one-time Checkout session for wallet credits. */
exports.createCreditCheckoutSession = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const context = await requireVerifiedUser(
      request,
      "You must be logged in to purchase credits.",
    );
    const credits = Number(request.data?.credits);
    if (!Number.isInteger(credits) || credits < 10 || credits > 10000) {
      throw new HttpsError(
        "invalid-argument",
        "Credit purchases must be a whole amount from 10 to 10,000.",
      );
    }

    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(stripe, context);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: credits * 100,
          product_data: {name: `${credits} Scaled Circle credits`},
        },
      }],
      success_url: `${publicAppBaseUrl()}/?credits=success`,
      cancel_url: `${publicAppBaseUrl()}/?credits=cancelled`,
      metadata: {
        firebaseUid: context.uid,
        purchaseType: "credits",
        credits: String(credits),
      },
    });
    return {url: session.url, sessionId: session.id, credits};
  },
);

exports.createBillingPortalSession = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const context = await requireVerifiedUser(
      request,
      "You must be logged in to manage billing.",
    );
    if (context.isAdmin) {
      return {...await grantAdminScaleSubscription(context.uid), url: null};
    }
    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(stripe, context);
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${publicAppBaseUrl()}/`,
    });
    return {url: session.url};
  },
);

async function syncStripeSubscription(subscription, eventId) {
  const uid = cleanId(subscription.metadata?.firebaseUid);
  if (!uid) return;
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id || "";
  const plan = readText(subscription.metadata?.plan, 20) ||
    planForStripePrice(priceId);
  if (!plan || !SUBSCRIPTION_PRICES[plan]) return;
  const active = subscription.status === "active" ||
    subscription.status === "trialing";
  const periodEndSeconds = Number(firstItem?.current_period_end || 0);
  const expiration = periodEndSeconds > 0
    ? Timestamp.fromMillis(periodEndSeconds * 1000)
    : Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const eventReference = db.collection("stripeEvents").doc(eventId);
  const walletReference = db.collection("wallets").doc(uid);
  const subscriptionReference = db.collection("businessSubscriptions").doc(uid);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(eventReference)).exists) return;
    const values = {
      subscriptionPlan: plan,
      subscriptionPrice: SUBSCRIPTION_PRICES[plan],
      subscriptionStatus: active ? "active" : subscription.status,
      subscriptionExpiresAt: expiration,
      subscriptionComped: false,
      subscriptionSource: "stripe",
      stripeSubscriptionId: subscription.id,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(walletReference, {ownerId: uid, ...values}, {merge: true});
    transaction.set(subscriptionReference, {
      businessId: uid,
      plan,
      planId: plan,
      price: SUBSCRIPTION_PRICES[plan],
      status: active ? "active" : subscription.status,
      expiresAt: expiration,
      stripeSubscriptionId: subscription.id,
      source: "stripe",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    transaction.set(eventReference, {
      type: `customer.subscription.${subscription.status}`,
      processedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Reserve worker compensation and charge the campaign platform fee.
 *
 * This operation is idempotent: retrying an already funded campaign returns
 * its existing funding values without charging the business twice.
 */
exports.fundCampaign = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    const authContext = await requireVerifiedUser(
      request,
      "You must be logged in to fund a campaign.",
    );

    const campaignId = request.data?.campaignId;

    if (typeof campaignId !== "string" || campaignId.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaignId is required.",
      );
    }

    const cleanCampaignId = campaignId.trim();
    const businessId = request.auth.uid;
    const description = typeof request.data?.description === "string"
      ? request.data.description.trim().slice(0, 240)
      : "Worker funding reserved for campaign.";
    const campaignReference = db
      .collection("campaigns")
      .doc(cleanCampaignId);
    const walletReference = db.collection("wallets").doc(businessId);
    const adminWalletReference = db
      .collection("wallets")
      .doc(ADMIN_WALLET_ID);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const campaignSnapshot = await transaction.get(campaignReference);
        const walletSnapshot = await transaction.get(walletReference);
        const adminWalletSnapshot = await transaction.get(
          adminWalletReference,
        );

        if (!campaignSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The campaign does not exist.",
          );
        }

        const campaign = campaignSnapshot.data() || {};

        if (campaign.businessId !== businessId) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this campaign.",
          );
        }

        const existingReservedBudget = Number(
          campaign.reservedWorkerBudget || 0,
        );
        const existingFundingStatus = campaign.fundingStatus;
        const workerBudget = Number(
          campaign.maximumWorkerBudget || campaign.workerBudget || 0,
        );
        const platformFee = authContext.isAdmin
          ? 0
          : Number((workerBudget * 0.10).toFixed(2));
        const totalCharge = Number(
          (workerBudget + platformFee).toFixed(2),
        );

        if (
          existingFundingStatus === "reserved" &&
          existingReservedBudget > 0
        ) {
          return {
            workerBudget: existingReservedBudget,
            platformFee: Number(campaign.platformFee || platformFee),
            totalCharge: Number(campaign.totalCampaignCost || totalCharge),
            alreadyFunded: true,
          };
        }

        if (!Number.isFinite(workerBudget) || workerBudget <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "Campaign worker budget must be greater than zero.",
          );
        }

        if (!walletSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Business wallet does not exist.",
          );
        }

        const wallet = walletSnapshot.data() || {};
        const subscriptionStatus = typeof wallet.subscriptionStatus === "string"
          ? wallet.subscriptionStatus.toLowerCase()
          : null;
        const subscriptionExpiration = wallet.subscriptionExpiresAt;
        const activeSubscription =
          subscriptionStatus === "active" &&
          subscriptionExpiration instanceof Timestamp &&
          subscriptionExpiration.toDate() > new Date();

        if (!activeSubscription) {
          throw new HttpsError(
            "failed-precondition",
            "An active subscription is required to publish campaigns.",
          );
        }

        const availableCredits = Number(wallet.availableCredits || 0);
        const reservedCredits = Number(wallet.reservedCredits || 0);

        if (!Number.isFinite(availableCredits) || availableCredits < totalCharge) {
          throw new HttpsError(
            "failed-precondition",
            "Insufficient credits. " +
              `${totalCharge.toFixed(2)} required, ` +
              `${availableCredits.toFixed(2)} available.`,
          );
        }

        const adminWallet = adminWalletSnapshot.data() || {};
        const adminBalance = Number(adminWallet.availableBalance || 0);
        const remainingCredits = availableCredits - totalCharge;
        const serverTimestamp = FieldValue.serverTimestamp();

        transaction.update(walletReference, {
          availableCredits: remainingCredits,
          reservedCredits: reservedCredits + workerBudget,
          balance: remainingCredits,
          updatedAt: serverTimestamp,
        });

        transaction.update(campaignReference, {
          fundingStatus: "reserved",
          platformFeeStatus: "charged",
          workerBudget,
          reservedWorkerBudget: workerBudget,
          platformFee,
          totalCampaignCost: totalCharge,
          fundedAt: serverTimestamp,
          updatedAt: serverTimestamp,
        });

        const transactionReference = walletReference
          .collection("transactions")
          .doc();

        transaction.set(transactionReference, {
          type: "campaign_reserve",
          amount: workerBudget,
          platformFee,
          totalCharge,
          campaignId: cleanCampaignId,
          description,
          createdAt: serverTimestamp,
        });

        transaction.set(
          adminWalletReference,
          {
            ownerId: ADMIN_WALLET_ID,
            ownerType: "admin",
            availableBalance: adminBalance + platformFee,
            balance: adminBalance + platformFee,
            updatedAt: serverTimestamp,
          },
          {merge: true},
        );

        return {
          workerBudget,
          platformFee,
          totalCharge,
          remainingCredits,
          alreadyFunded: false,
        };
      });

      logger.info("Campaign funding secured.", {
        businessId,
        campaignId: cleanCampaignId,
        workerBudget: result.workerBudget,
        platformFee: result.platformFee,
        alreadyFunded: result.alreadyFunded,
      });

      return result;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Campaign funding failed.", {
        businessId,
        campaignId: cleanCampaignId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to fund the campaign right now.",
      );
    }
  },
);

/**
 * Permanently delete an unfunded draft and its setup records.
 * Launched or funded campaigns must be retained for payment and audit history.
 */
exports.deleteDraftCampaign = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to delete a draft campaign.",
      );
    }

    const campaignId = cleanId(request.data?.campaignId);

    if (!campaignId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaignId is required.",
      );
    }

    const campaignReference = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignReference.get();

    if (!campaignSnapshot.exists) {
      return {campaignId, alreadyDeleted: true};
    }

    const campaign = campaignSnapshot.data() || {};

    if (campaign.businessId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "You do not own this campaign.",
      );
    }

    if (campaign.status !== "draft") {
      throw new HttpsError(
        "failed-precondition",
        "Only draft campaigns can be deleted.",
      );
    }

    if (campaign.fundingStatus === "reserved" ||
        moneyValue(campaign.reservedWorkerBudget) > 0) {
      throw new HttpsError(
        "failed-precondition",
        "This draft has reserved funding and cannot be deleted until funding is released.",
      );
    }

    const [
      zonesSnapshot,
      locationsSnapshot,
      assetsSnapshot,
      routesSnapshot,
      completionsSnapshot,
      applicationsSnapshot,
      assignedScalersSnapshot,
    ] = await Promise.all([
      db.collection("campaignZones").where("campaignId", "==", campaignId).get(),
      db.collection("campaignLocations").where("campaignId", "==", campaignId).get(),
      db.collection("marketingAssets").where("campaignId", "==", campaignId).get(),
      db.collection("campaignRoutes").where("campaignId", "==", campaignId).get(),
      db.collection("campaignCompletions").where("campaignId", "==", campaignId).get(),
      campaignReference.collection("applications").get(),
      campaignReference.collection("assignedScalers").get(),
    ]);
    const writer = db.bulkWriter();
    const relatedDocuments = [
      ...zonesSnapshot.docs,
      ...locationsSnapshot.docs,
      ...assetsSnapshot.docs,
      ...routesSnapshot.docs,
      ...completionsSnapshot.docs,
      ...applicationsSnapshot.docs,
      ...assignedScalersSnapshot.docs,
    ];

    for (const document of relatedDocuments) {
      writer.delete(document.ref);
    }

    writer.delete(campaignReference);
    await writer.close();

    return {
      campaignId,
      deletedRelatedRecords: relatedDocuments.length,
      alreadyDeleted: false,
    };
  },
);

/**
 * Create or update a verified campaign review.
 *
 * The server derives the reviewer role from campaign ownership and completed
 * assignments. Clients cannot review unrelated businesses or Scalers.
 */
exports.submitCampaignReview = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to leave a review.",
      );
    }

    const campaignId = cleanId(request.data?.campaignId);
    const targetId = cleanId(request.data?.targetId);
    const targetType = cleanId(request.data?.targetType).toLowerCase();
    const rating = Number(request.data?.rating);
    const comment = typeof request.data?.comment === "string"
      ? request.data.comment.trim().slice(0, 2000)
      : "";

    if (!campaignId || !targetId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaign and review target are required.",
      );
    }

    if (targetType !== "business" && targetType !== "scaler") {
      throw new HttpsError(
        "invalid-argument",
        "The review target must be a business or Scaler.",
      );
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpsError(
        "invalid-argument",
        "Rating must be a whole number from 1 to 5.",
      );
    }

    if (!comment) {
      throw new HttpsError(
        "invalid-argument",
        "Please include a review comment.",
      );
    }

    const reviewerId = request.auth.uid;
    const campaignReference = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignReference.get();

    if (!campaignSnapshot.exists) {
      throw new HttpsError("not-found", "The campaign does not exist.");
    }

    const campaign = campaignSnapshot.data() || {};
    const businessId = cleanId(campaign.businessId);
    const [zonesSnapshot, locationsSnapshot] = await Promise.all([
      db.collection("campaignZones").where("campaignId", "==", campaignId).get(),
      db.collection("campaignLocations").where("campaignId", "==", campaignId).get(),
    ]);
    const paidAssignments = [
      ...zonesSnapshot.docs.map((document) => document.data()),
      ...locationsSnapshot.docs.map((document) => document.data()),
    ].filter((assignment) =>
      assignment.status === "completed" &&
      (assignment.paymentStatus === "paid" ||
        assignment.paidAt instanceof Timestamp),
    );
    const campaignPaymentSettled =
      campaign.fundingStatus === "settled" &&
      moneyValue(campaign.reservedWorkerBudget) <= 0;
    let reviewerType;

    if (targetType === "business") {
      const completedByReviewer = paidAssignments.some(
        (assignment) => cleanId(assignment.assignedScalerId) === reviewerId,
      ) || (campaignPaymentSettled &&
        cleanId(campaign.completedBy) === reviewerId);

      if (targetId !== businessId || !completedByReviewer) {
        throw new HttpsError(
          "permission-denied",
          "You can review the business after your campaign payment is released.",
        );
      }

      reviewerType = "scaler";
    } else {
      const completedByTarget = paidAssignments.some(
        (assignment) => cleanId(assignment.assignedScalerId) === targetId,
      ) || (campaignPaymentSettled &&
        cleanId(campaign.completedBy) === targetId);

      if (reviewerId !== businessId || !completedByTarget) {
        throw new HttpsError(
          "permission-denied",
          "You can review only a Scaler who completed your campaign work.",
        );
      }

      reviewerType = "business";
    }

    const reviewId = `${reviewerId}_${targetId}_${campaignId}`;
    const reviewReference = db.collection("reviews").doc(reviewId);
    const existingReview = await reviewReference.get();
    const timestamp = FieldValue.serverTimestamp();

    if (existingReview.exists) {
      throw new HttpsError(
        "already-exists",
        "This review has already been submitted and is permanently locked.",
      );
    }

    await reviewReference.create({
      campaignId,
      fromUserId: reviewerId,
      fromUserType: reviewerType,
      toUserId: targetId,
      toUserType: targetType,
      rating,
      comment,
      verifiedCampaignParticipant: true,
      locked: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      reviewId,
      locked: true,
    };
  },
);

/**
 * Report suspected fraud, scams, or safety concerns tied to a locked review.
 * Reports do not modify or remove the original review and must be filed within
 * 72 hours of review submission.
 */
exports.reportCampaignReview = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to report a review.",
      );
    }

    const reviewId = cleanId(request.data?.reviewId);
    const reason = cleanId(request.data?.reason).toLowerCase();
    const details = typeof request.data?.details === "string"
      ? request.data.details.trim().slice(0, 2000)
      : "";
    const allowedReasons = new Set([
      "suspected_fraud",
      "suspected_scam",
      "safety_concern",
      "other",
    ]);

    if (!reviewId || !allowedReasons.has(reason) || !details) {
      throw new HttpsError(
        "invalid-argument",
        "Choose a report reason and include details.",
      );
    }

    const reviewReference = db.collection("reviews").doc(reviewId);
    const reviewSnapshot = await reviewReference.get();

    if (!reviewSnapshot.exists) {
      throw new HttpsError("not-found", "The review does not exist.");
    }

    const review = reviewSnapshot.data() || {};
    const reporterId = request.auth.uid;

    if (review.fromUserId !== reporterId && review.toUserId !== reporterId) {
      throw new HttpsError(
        "permission-denied",
        "Only the people involved in this review can report it.",
      );
    }

    if (!(review.createdAt instanceof Timestamp)) {
      throw new HttpsError(
        "failed-precondition",
        "The review report window is not available yet.",
      );
    }

    const reportWindowMilliseconds = 72 * 60 * 60 * 1000;
    const reportDeadline = review.createdAt.toMillis() +
      reportWindowMilliseconds;

    if (Date.now() > reportDeadline) {
      throw new HttpsError(
        "failed-precondition",
        "The 72-hour fraud and scam reporting window has closed.",
      );
    }

    const reportId = `${reviewId}_${reporterId}`;
    const reportReference = db.collection("reviewReports").doc(reportId);
    const existingReport = await reportReference.get();

    if (existingReport.exists) {
      return {reportId, alreadyReported: true};
    }

    await reportReference.create({
      reviewId,
      campaignId: review.campaignId,
      reporterId,
      reportedUserId: review.fromUserId === reporterId
        ? review.toUserId
        : review.fromUserId,
      reason,
      details,
      reviewRating: review.rating,
      reviewComment: review.comment,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
    });

    return {reportId, alreadyReported: false};
  },
);

/**
 * Submit GPS-backed zone work for business review.
 *
 * Route coverage and pending payout values are calculated on the trusted
 * server. The client supplies only the completion record identifier and notes.
 */
exports.submitZoneCompletion = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(
      request,
      "You must be logged in to submit campaign work.",
    );

    const completionId = cleanId(request.data?.completionId);
    const scalerNotes = typeof request.data?.scalerNotes === "string"
      ? request.data.scalerNotes.trim().slice(0, 2000)
      : "";

    if (!completionId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid completionId is required.",
      );
    }

    const scalerId = request.auth.uid;
    const completionReference = db
      .collection("campaignCompletions")
      .doc(completionId);

    try {
      return await db.runTransaction(async (transaction) => {
        const completionSnapshot = await transaction.get(
          completionReference,
        );

        if (!completionSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The completion record does not exist.",
          );
        }

        const completion = completionSnapshot.data() || {};

        if (completion.scalerId !== scalerId) {
          throw new HttpsError(
            "permission-denied",
            "This completion belongs to another Scaler.",
          );
        }

        if (completion.status === "submitted") {
          return {
            completionId,
            compensationContractId: completion.compensationContractId || completion.zoneId,
            calculatedTransferAmountCents:
              Number(completion.calculatedTransferAmountCents || 0),
            alreadySubmitted: true,
          };
        }

        const campaignId = cleanId(completion.campaignId);
        const businessId = cleanId(completion.businessId);
        const zoneId = cleanId(completion.zoneId);
        const routeId = cleanId(completion.routeId);

        if (!campaignId || !businessId || !zoneId || !routeId) {
          throw new HttpsError(
            "failed-precondition",
            "The completion is missing assignment or GPS information.",
          );
        }

        const campaignReference = db.collection("campaigns").doc(campaignId);
        const zoneReference = db.collection("campaignZones").doc(zoneId);
        const routeReference = db.collection("campaignRoutes").doc(routeId);
        const contractReference = db.collection("assignmentCompensations").doc(zoneId);

        const campaignSnapshot = await transaction.get(campaignReference);
        const zoneSnapshot = await transaction.get(zoneReference);
        const routeSnapshot = await transaction.get(routeReference);
        const contractSnapshot = await transaction.get(contractReference);

        if (!campaignSnapshot.exists ||
            !zoneSnapshot.exists ||
            !routeSnapshot.exists || !contractSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The campaign assignment or GPS route no longer exists.",
          );
        }

        const campaign = campaignSnapshot.data() || {};
        const zone = zoneSnapshot.data() || {};
        const route = routeSnapshot.data() || {};

        if (campaign.businessId !== businessId ||
            zone.businessId !== businessId ||
            zone.campaignId !== campaignId) {
          throw new HttpsError(
            "failed-precondition",
            "The completion does not match its campaign assignment.",
          );
        }

        if (zone.assignedScalerId !== scalerId) {
          throw new HttpsError(
            "permission-denied",
            "This zone is no longer assigned to you.",
          );
        }

        if (route.scalerId !== scalerId ||
            route.campaignId !== campaignId ||
            route.zoneId !== zoneId) {
          throw new HttpsError(
            "failed-precondition",
            "The GPS route does not match this assigned zone.",
          );
        }

        if (route.tracking === true) {
          throw new HttpsError(
            "failed-precondition",
            "Stop and save GPS tracking before submitting.",
          );
        }

        const routePoints = validRoutePoints(route.points);

        if (routePoints.length < 2) {
          throw new HttpsError(
            "failed-precondition",
            "At least two saved GPS points are required.",
          );
        }

        const photoRequired = campaignRequiresPhotos(campaign.campaignType);

        if (photoRequired && !completionHasPhoto(completion)) {
          throw new HttpsError(
            "failed-precondition",
            "This field-service campaign requires photo proof.",
          );
        }

        const trackingResult = calculateRouteCompletion(zone, routePoints);
        const completionBasisPoints = Math.max(0, Math.min(
          10000, Math.round(trackingResult.completionPercentage * 100),
        ));
        const payoutResult = marketplace.payoutForCompletion(
          contractSnapshot.data() || {}, completionBasisPoints, false,
        );
        const timestamp = FieldValue.serverTimestamp();

        transaction.update(completionReference, {
          status: "submitted",
          scalerNotes,
          gpsVerified: true,
          gpsVerifiedAt: timestamp,
          proofRequirement: photoRequired
            ? "gps_and_photos"
            : "gps_route",
          assignedHomes: trackingResult.assignedHomes,
          completedHomes: trackingResult.completedHomes,
          completionPercentage: trackingResult.completionPercentage,
          eligibleForPayment: trackingResult.eligibleForPayment,
          compensationContractId: contractReference.id,
          calculatedBaseAmountCents: payoutResult.baseAmountCents,
          availableBonusAmountCents: contractSnapshot.data()?.bonusAmountCents || 0,
          calculatedBonusAmountCents: payoutResult.bonusAmountCents,
          calculatedTransferAmountCents: payoutResult.transferAmountCents,
          submittedAt: timestamp,
          updatedAt: timestamp,
        });

        transaction.update(zoneReference, {
          status: "submitted",
          verificationPassed: true,
          reviewStatus: "verification_pending",
          completionSubmittedAt: timestamp,
          submittedCompletionId: completionId,
          submittedAt: timestamp,
          submittedRoutePointCount: routePoints.length,
          submittedRouteSimulated: route.simulated === true,
          completedHomes: trackingResult.completedHomes,
          assignedHomes: trackingResult.assignedHomes,
          completionPercentage: trackingResult.completionPercentage,
          eligibleForPayment: trackingResult.eligibleForPayment,
          paymentStatus: "verification_pending",
          compensationContractId: contractReference.id,
          calculatedBaseAmountCents: payoutResult.baseAmountCents,
          availableBonusAmountCents: contractSnapshot.data()?.bonusAmountCents || 0,
          calculatedBonusAmountCents: payoutResult.bonusAmountCents,
          calculatedTransferAmountCents: payoutResult.transferAmountCents,
          gpsTracking: false,
          updatedAt: timestamp,
        });

        const notificationReference = db
          .collection("notifications")
          .doc(`zone_completion_${zoneId}`);
        const scalerLabel = request.auth.token.email || "A Scaler";

        transaction.set(notificationReference, {
          userId: businessId,
          type: "zone_completion_submitted",
          title: "Zone Completion Submitted",
          message: `${scalerLabel} submitted ${completion.zoneName || "Zone"}`,
          campaignId,
          zoneId,
          completionId,
          scalerId,
          payoutId: payoutReference.id,
          payoutAmount: payoutResult.totalPayout,
          read: false,
          createdAt: timestamp,
        }, {merge: true});

        return {
          completionId,
          payoutId: payoutReference.id,
          payoutAmount: payoutResult.totalPayout,
          completionPercentage: trackingResult.completionPercentage,
          alreadySubmitted: false,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Zone completion submission failed.", {
        completionId,
        scalerId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to submit the campaign completion right now.",
      );
    }
  },
);

/**
 * Approve a pending zone payout and move reserved business funds to the
 * Scaler's available balance.
 */
exports.approveZonePayout = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(
      request,
      "You must be logged in to approve a payout.",
    );

    const payoutId = cleanId(request.data?.payoutId);

    if (!payoutId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid payoutId is required.",
      );
    }

    const businessId = request.auth.uid;
    const releaseBonus = request.data?.releaseBonus === true;
    const payoutReference = db.collection("payouts").doc(payoutId);

    try {
      return await db.runTransaction(async (transaction) => {
        const payoutSnapshot = await transaction.get(payoutReference);

        if (!payoutSnapshot.exists) {
          throw new HttpsError("not-found", "The payout does not exist.");
        }

        const payout = payoutSnapshot.data() || {};

        if (payout.businessId !== businessId) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this payout.",
          );
        }

        if (payout.status === "paid") {
          return {
            payoutId,
            amount: moneyValue(payout.totalPayout),
            alreadyPaid: true,
          };
        }

        if (payout.status !== "pending_review") {
          throw new HttpsError(
            "failed-precondition",
            "This payout is not awaiting review.",
          );
        }

        const scalerId = cleanId(payout.scalerId);
        const campaignId = cleanId(payout.campaignId);
        const zoneId = cleanId(payout.zoneId);
        const proposedPayout = moneyValue(payout.totalPayout);

        if (!scalerId || !campaignId || !zoneId) {
          throw new HttpsError(
            "failed-precondition",
            "This completion does not qualify for payment.",
          );
        }

        const businessWalletReference = db
          .collection("wallets")
          .doc(businessId);
        const scalerWalletReference = db.collection("wallets").doc(scalerId);
        const campaignReference = db.collection("campaigns").doc(campaignId);
        const zoneReference = db.collection("campaignZones").doc(zoneId);

        const businessWalletSnapshot = await transaction.get(
          businessWalletReference,
        );
        const scalerWalletSnapshot = businessId === scalerId
          ? businessWalletSnapshot
          : await transaction.get(scalerWalletReference);
        const campaignSnapshot = await transaction.get(campaignReference);
        const zoneSnapshot = await transaction.get(zoneReference);

        if (!businessWalletSnapshot.exists ||
            !campaignSnapshot.exists ||
            !zoneSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The funded campaign or wallet no longer exists.",
          );
        }

        const businessWallet = businessWalletSnapshot.data() || {};
        const scalerWallet = scalerWalletSnapshot.data() || {};
        const campaign = campaignSnapshot.data() || {};
        const zone = zoneSnapshot.data() || {};
        const completionPercentage = Math.max(
          0,
          Math.min(
            100,
            Number(
              payout.completionPercentage ?? zone.completionPercentage ?? 0,
            ),
          ),
        );
        const contractBasePay = firstMoneyValue(
          campaign.basePay,
          zone.assignedBasePay,
          zone.suggestedBasePay,
          payout.basePay,
        );
        const correctedBasePayout = calculatePayout({
          completionPercentage,
          basePay: contractBasePay,
          completionBonus: 0,
        });
        const basePayout = correctedBasePayout.basePayout;

        if (basePayout <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "This completion does not qualify for payment.",
          );
        }

        const reservedCredits = moneyValue(businessWallet.reservedCredits);
        const reservedBudget = moneyValue(campaign.reservedWorkerBudget);
        const availableBonus = moneyValue(campaign.bonus);
        const bonusEarnedAutomatically =
          completionPercentage >= AUTOMATIC_BONUS_COMPLETION_PERCENTAGE;
        const releasedBonus = bonusEarnedAutomatically || releaseBonus
          ? availableBonus
          : 0;
        const totalPayout = roundMoney(basePayout + releasedBonus);
        const fundedAmount = Math.min(reservedCredits, reservedBudget);

        if (reservedCredits < totalPayout || reservedBudget < totalPayout) {
          const fundingMessage = releaseBonus && fundedAmount >= basePayout
            ? "The base payment is funded, but the optional bonus is not. " +
              "Approve without the bonus or add campaign funding."
            : `Only $${fundedAmount.toFixed(2)} remains reserved for this ` +
              `campaign, but $${totalPayout.toFixed(2)} is required.`;

          throw new HttpsError(
            "failed-precondition",
            fundingMessage,
          );
        }

        const availableBalance = moneyValue(scalerWallet.availableBalance);
        const pendingBalance = moneyValue(scalerWallet.pendingBalance);
        const newAvailableBalance = availableBalance + totalPayout;
        const newPendingBalance = Math.max(0, pendingBalance - proposedPayout);
        const timestamp = FieldValue.serverTimestamp();

        if (businessId === scalerId) {
          transaction.set(businessWalletReference, {
            reservedCredits: Math.max(0, reservedCredits - totalPayout),
            totalPaidOut: FieldValue.increment(totalPayout),
            availableBalance: newAvailableBalance,
            pendingBalance: newPendingBalance,
            updatedAt: timestamp,
          }, {merge: true});
        } else {
          transaction.update(businessWalletReference, {
            reservedCredits: Math.max(0, reservedCredits - totalPayout),
            totalPaidOut: FieldValue.increment(totalPayout),
            updatedAt: timestamp,
          });
          transaction.set(scalerWalletReference, {
            ownerId: scalerId,
            ...(!scalerWalletSnapshot.exists ? {ownerType: "scaler"} : {}),
            availableBalance: newAvailableBalance,
            balance: newAvailableBalance,
            pendingBalance: newPendingBalance,
            ...(!scalerWalletSnapshot.exists ? {createdAt: timestamp} : {}),
            updatedAt: timestamp,
          }, {merge: true});
        }

        transaction.update(campaignReference, {
          reservedWorkerBudget: Math.max(0, reservedBudget - totalPayout),
          totalPaidOut: FieldValue.increment(totalPayout),
          fundingUpdatedAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.update(payoutReference, {
          status: "paid",
          basePay: contractBasePay,
          basePayout,
          availableBonus,
          bonus: releasedBonus,
          totalPayout,
          bonusReleased: releasedBonus > 0,
          bonusEarnedAutomatically,
          approvedAt: timestamp,
          paidAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.update(zoneReference, {
          status: "completed",
          paymentStatus: "paid",
          basePayout,
          availableBonus,
          bonus: releasedBonus,
          bonusReleased: releasedBonus > 0,
          bonusEarnedAutomatically,
          payoutAmount: totalPayout,
          completedAt: timestamp,
          paidAt: timestamp,
          updatedAt: timestamp,
        });

        const completionId = cleanId(zoneSnapshot.data()?.submittedCompletionId);

        if (completionId) {
          transaction.update(
            db.collection("campaignCompletions").doc(completionId),
            {
              status: "approved",
              basePayout,
              availableBonus,
              bonus: releasedBonus,
              bonusReleased: releasedBonus > 0,
              bonusEarnedAutomatically,
              payoutAmount: totalPayout,
              approvedAt: timestamp,
              completedAt: timestamp,
              updatedAt: timestamp,
            },
          );
        }

        transaction.set(
          db.collection("walletTransactions").doc(payoutId),
          {
            type: "scaler_payment",
            payoutId,
            businessId,
            scalerId,
            campaignId,
            zoneId,
            amount: totalPayout,
            basePayout,
            bonus: releasedBonus,
            bonusReleased: releasedBonus > 0,
            bonusEarnedAutomatically,
            source: "reserved_credits",
            status: "completed",
            createdAt: timestamp,
          },
          {merge: true},
        );
        transaction.set(
          businessWalletReference
            .collection("transactions")
            .doc(`payout_${payoutId}_business`),
          {
            type: "reserved_payment",
            walletSide: "business",
            payoutId,
            amount: totalPayout,
            basePayout,
            bonus: releasedBonus,
            campaignId,
            zoneId,
            scalerId,
            description: "Scaler payment released from reserved campaign funds.",
            createdAt: timestamp,
          },
          {merge: true},
        );
        transaction.set(
          scalerWalletReference
            .collection("transactions")
            .doc(`payout_${payoutId}_scaler`),
          {
            type: "scaler_earnings",
            walletSide: "scaler",
            payoutId,
            amount: totalPayout,
            basePayout,
            bonus: releasedBonus,
            campaignId,
            zoneId,
            businessId,
            description: "Scaler earnings received from completed campaign work.",
            createdAt: timestamp,
          },
          {merge: true},
        );
        transaction.set(
          db.collection("notifications").doc(`payout_paid_${payoutId}`),
          {
            userId: scalerId,
            type: "payout_approved",
            title: "Campaign Payment Approved",
            message: `Your campaign payment of $${totalPayout.toFixed(2)} was approved.`,
            campaignId,
            zoneId,
            payoutId,
            amount: totalPayout,
            read: false,
            createdAt: timestamp,
          },
          {merge: true},
        );

        return {
          payoutId,
          amount: totalPayout,
          basePayout,
          bonus: releasedBonus,
          bonusReleased: releasedBonus > 0,
          bonusEarnedAutomatically,
          alreadyPaid: false,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Zone payout approval failed.", {
        payoutId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to approve this payout right now.",
      );
    }
  },
);

/**
 * Return a pending zone completion to the assigned Scaler for correction.
 * Payment and campaign-zone workflow fields are server-controlled.
 */
exports.requestZoneRedo = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(request, "You must be logged in to review a payout.");
    const payoutId = cleanId(request.data?.payoutId);
    const feedback = String(request.data?.feedback || "").trim().slice(0, 2000);
    if (!payoutId || !feedback) {
      throw new HttpsError("invalid-argument", "Payout and review feedback are required.");
    }
    const businessId = request.auth.uid;
    const payoutRef = db.collection("payouts").doc(payoutId);
    try {
      return await db.runTransaction(async (transaction) => {
        const payoutSnapshot = await transaction.get(payoutRef);
        const payout = payoutSnapshot.data() || {};
        if (!payoutSnapshot.exists) {
          throw new HttpsError("not-found", "The payout does not exist.");
        }
        if (payout.businessId !== businessId) {
          throw new HttpsError("permission-denied", "You do not own this payout.");
        }
        if (payout.status === "redo_requested") {
          return {payoutId, status: "redo_requested", alreadyProcessed: true};
        }
        if (payout.status !== "pending_review") {
          throw new HttpsError("failed-precondition", "This payout cannot be returned for redo.");
        }
        const zoneId = cleanId(payout.zoneId);
        const scalerId = cleanId(payout.scalerId);
        if (!zoneId || !scalerId) {
          throw new HttpsError("failed-precondition", "The payout assignment is incomplete.");
        }
        const zoneRef = db.collection("campaignZones").doc(zoneId);
        const walletRef = db.collection("wallets").doc(scalerId);
        const [zoneSnapshot, walletSnapshot] = await Promise.all([
          transaction.get(zoneRef),
          transaction.get(walletRef),
        ]);
        if (!zoneSnapshot.exists || zoneSnapshot.data()?.businessId !== businessId ||
            zoneSnapshot.data()?.assignedScalerId !== scalerId) {
          throw new HttpsError("failed-precondition", "The zone assignment has changed.");
        }
        const pending = moneyValue(walletSnapshot.data()?.pendingBalance);
        const total = moneyValue(payout.totalPayout);
        const timestamp = FieldValue.serverTimestamp();
        transaction.set(walletRef, {
          pendingBalance: Math.max(0, pending - total),
          updatedAt: timestamp,
        }, {merge: true});
        transaction.update(payoutRef, {
          status: "redo_requested",
          reviewFeedback: feedback,
          updatedAt: timestamp,
        });
        transaction.update(zoneRef, {
          status: "in_progress",
          reviewFeedback: feedback,
          paymentStatus: "redo_requested",
          updatedAt: timestamp,
        });
        return {payoutId, status: "redo_requested", alreadyProcessed: false};
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Zone redo request failed.", {
        payoutId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "Unable to request changes right now.");
    }
  },
);

/**
 * Remove a Scaler from an unpaid zone. This transition is intentionally
 * unavailable to clients because it changes assignment and payout state.
 */
exports.dropZoneScaler = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(request, "You must be logged in to review a payout.");
    const payoutId = cleanId(request.data?.payoutId);
    if (!payoutId) throw new HttpsError("invalid-argument", "A valid payout is required.");
    const businessId = request.auth.uid;
    const payoutRef = db.collection("payouts").doc(payoutId);
    try {
      return await db.runTransaction(async (transaction) => {
        const payoutSnapshot = await transaction.get(payoutRef);
        const payout = payoutSnapshot.data() || {};
        if (!payoutSnapshot.exists) {
          throw new HttpsError("not-found", "The payout does not exist.");
        }
        if (payout.businessId !== businessId) {
          throw new HttpsError("permission-denied", "You do not own this payout.");
        }
        if (payout.status === "scaler_dropped") {
          return {payoutId, status: "scaler_dropped", alreadyProcessed: true};
        }
        if (!['pending_review', 'redo_requested'].includes(String(payout.status))) {
          throw new HttpsError("failed-precondition", "This Scaler cannot be dropped now.");
        }
        const zoneId = cleanId(payout.zoneId);
        const scalerId = cleanId(payout.scalerId);
        if (!zoneId || !scalerId) {
          throw new HttpsError("failed-precondition", "The payout assignment is incomplete.");
        }
        const zoneRef = db.collection("campaignZones").doc(zoneId);
        const walletRef = db.collection("wallets").doc(scalerId);
        const [zoneSnapshot, walletSnapshot] = await Promise.all([
          transaction.get(zoneRef),
          transaction.get(walletRef),
        ]);
        if (!zoneSnapshot.exists || zoneSnapshot.data()?.businessId !== businessId ||
            zoneSnapshot.data()?.assignedScalerId !== scalerId) {
          throw new HttpsError("failed-precondition", "The zone assignment has changed.");
        }
        const pending = moneyValue(walletSnapshot.data()?.pendingBalance);
        const total = payout.status === "pending_review" ? moneyValue(payout.totalPayout) : 0;
        const timestamp = FieldValue.serverTimestamp();
        transaction.set(walletRef, {
          pendingBalance: Math.max(0, pending - total),
          updatedAt: timestamp,
        }, {merge: true});
        transaction.update(payoutRef, {
          status: "scaler_dropped",
          updatedAt: timestamp,
        });
        transaction.update(zoneRef, {
          status: "unassigned",
          assignedScalerId: FieldValue.delete(),
          assignedScalerEmail: FieldValue.delete(),
          assignedApplicationId: FieldValue.delete(),
          reviewFeedback: FieldValue.delete(),
          paymentStatus: "scaler_dropped",
          updatedAt: timestamp,
        });
        return {payoutId, status: "scaler_dropped", alreadyProcessed: false};
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Drop zone Scaler failed.", {
        payoutId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "Unable to remove this Scaler right now.");
    }
  },
);

/**
 * Analyze a mapped campaign zone.
 *
 * Strategy:
 * 1. Read saved geometry.
 * 2. Query OpenStreetMap through Overpass.
 * 3. Prefer residential address count.
 * 4. Fall back to residential building count.
 * 5. Fall back to area-density estimate if OSM data is sparse.
 */
exports.analyzeCampaignZone = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to analyze a campaign zone.",
      );
    }

    const zoneId = request.data?.zoneId;

    if (
      typeof zoneId !== "string" ||
      zoneId.trim().length === 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid zoneId is required.",
      );
    }

    const cleanZoneId = zoneId.trim();

    const zoneReference = db
      .collection("campaignZones")
      .doc(cleanZoneId);

    try {
      const zoneSnapshot =
        await zoneReference.get();

      if (!zoneSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The requested campaign zone does not exist.",
        );
      }

      const zoneData =
        zoneSnapshot.data() || {};

      const businessId =
        typeof zoneData.businessId === "string"
          ? zoneData.businessId
          : "";

      if (
        businessId.length === 0 ||
        businessId !== request.auth.uid
      ) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to analyze this zone.",
        );
      }

      const serviceArea = Array.isArray(
        zoneData.serviceArea,
      )
        ? zoneData.serviceArea
        : [];

      const validPoints = serviceArea.filter(
        (point) =>
          point &&
          typeof point === "object" &&
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude),
      );

      if (validPoints.length < 3) {
        throw new HttpsError(
          "failed-precondition",
          "The zone must contain at least three valid map points.",
        );
      }

      const areaSquareMeters = readNumber(
        zoneData.zoneAreaSquareMeters,
      );

      let areaAcres = readNumber(
        zoneData.zoneAreaAcres,
      );

      const areaSquareMiles = readNumber(
        zoneData.zoneAreaSquareMiles,
      );

      const perimeterMeters = readNumber(
        zoneData.zonePerimeterMeters,
      );

      const estimatedWalkingMiles = readNumber(
        zoneData.estimatedWalkingMiles,
      );

      const estimatedMinutes = readInteger(
        zoneData.estimatedMinutes,
      );

      const recommendedScalerCount = Math.max(
        1,
        readInteger(
          zoneData.recommendedScalerCount,
          1,
        ),
      );

      const suggestedBasePay = readNumber(
        zoneData.suggestedBasePay,
      );

      if (
        areaAcres <= 0 &&
        areaSquareMeters > 0
      ) {
        areaAcres =
          areaSquareMeters / 4046.8564224;
      }

      await zoneReference.update({
        analysisStatus: "analyzing",
        homeCountStatus: "analyzing",
        homeCountError: FieldValue.delete(),
        analysisRequestedBy: request.auth.uid,
        analysisRequestedAt:
          FieldValue.serverTimestamp(),
        analysisUpdatedAt:
          FieldValue.serverTimestamp(),
      });

      let geographicResult;

      try {
        geographicResult =
          await analyzeResidentialGeography(
            validPoints,
          );
      } catch (error) {
        logger.warn(
          "Geographic housing lookup failed; using fallback estimate.",
          {
            zoneId: cleanZoneId,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
        );

        geographicResult = {
          addressCount: 0,
          residentialBuildingCount: 0,
          totalBuildingCount: 0,
          source: "overpass_failed",
        };
      }

      const homeEstimate =
        determineHomeEstimate({
          geographicResult,
          areaAcres,
        });

      await zoneReference.update({
        estimatedHomes:
          homeEstimate.estimatedHomes,

        homeCountStatus:
          homeEstimate.estimatedHomes > 0
            ? "estimated"
            : "unavailable",

        homeCountMethod:
          homeEstimate.method,

        homeCountConfidence:
          homeEstimate.confidence,

        homeCountConfidenceScore:
          homeEstimate.confidenceScore,

        geographicAddressCount:
          geographicResult.addressCount,

        geographicResidentialBuildingCount:
          geographicResult
            .residentialBuildingCount,

        geographicTotalBuildingCount:
          geographicResult.totalBuildingCount,

        geographicDataSource:
          geographicResult.source,

        homeCountError:
          FieldValue.delete(),

        analysisStatus:
          "complete",

        analysisUpdatedAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      const response = {
        success: true,

        zoneId:
          cleanZoneId,

        analysisStatus:
          "complete",

        geometry: {
          pointCount:
            validPoints.length,

          shapeType:
            zoneData.serviceAreaType ||
            zoneData.shapeType ||
            "polygon",

          areaSquareMeters,
          areaAcres,
          areaSquareMiles,
          perimeterMeters,
        },

        workload: {
          estimatedWalkingMiles,
          estimatedMinutes,
          recommendedScalerCount,
          suggestedBasePay,
        },

        homes: {
          status:
            homeEstimate.estimatedHomes > 0
              ? "estimated"
              : "unavailable",

          estimatedHomes:
            homeEstimate.estimatedHomes,

          method:
            homeEstimate.method,

          confidence:
            homeEstimate.confidence,

          confidenceScore:
            homeEstimate.confidenceScore,

          addressCount:
            geographicResult.addressCount,

          residentialBuildingCount:
            geographicResult
              .residentialBuildingCount,

          totalBuildingCount:
            geographicResult.totalBuildingCount,

          source:
            geographicResult.source,
        },
      };

      logger.info(
        "Campaign zone geographic analysis completed.",
        {
          zoneId:
            cleanZoneId,

          businessId,

          pointCount:
            validPoints.length,

          areaAcres,

          addressCount:
            geographicResult.addressCount,

          residentialBuildingCount:
            geographicResult
              .residentialBuildingCount,

          estimatedHomes:
            homeEstimate.estimatedHomes,

          method:
            homeEstimate.method,

          confidence:
            homeEstimate.confidence,
        },
      );

      return response;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        "Campaign zone analysis failed.",
        {
          zoneId:
            cleanZoneId,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );

      try {
        await zoneReference.update({
          analysisStatus:
            "failed",

          homeCountStatus:
            "failed",

          homeCountError:
            error instanceof Error
              ? error.message
              : String(error),

          analysisUpdatedAt:
            FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        logger.error(
          "Unable to store zone analysis failure.",
          {
            zoneId:
              cleanZoneId,

            error:
              updateError instanceof Error
                ? updateError.message
                : String(updateError),
          },
        );
      }

      throw new HttpsError(
        "internal",
        "Unable to analyze the campaign zone.",
      );
    }
  },
);

/**
 * Query OpenStreetMap via Overpass.
 */
async function analyzeResidentialGeography(
  points,
) {
  const polygon = points
    .map(
      (point) =>
        `${point.latitude} ${point.longitude}`,
    )
    .join(" ");

  const query = `
[out:json][timeout:25];

(
  nwr["addr:housenumber"](poly:"${polygon}");

  nwr["building"](poly:"${polygon}");
);

out tags center;
`;

  const body =
    new URLSearchParams();

  body.set(
    "data",
    query,
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      20000,
    );

  try {
    const response =
      await fetch(
        OVERPASS_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",

            "User-Agent":
              "ScaledCircle-Development/1.0",
          },

          body:
            body.toString(),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        `Overpass returned HTTP ${response.status}.`,
      );
    }

    const payload =
      await response.json();

    const elements =
      Array.isArray(payload.elements)
        ? payload.elements
        : [];

    const addressKeys =
      new Set();

    const residentialBuildings =
      new Set();

    const totalBuildings =
      new Set();

    for (const element of elements) {
      const tags =
        element.tags || {};

      const elementKey =
        `${element.type}:${element.id}`;

      if (
        typeof tags["addr:housenumber"] ===
          "string" &&
        tags["addr:housenumber"].trim()
          .length > 0
      ) {
        const houseNumber =
          tags["addr:housenumber"].trim();

        const street =
          typeof tags["addr:street"] ===
          "string"
            ? tags["addr:street"].trim()
            : "";

        const postcode =
          typeof tags["addr:postcode"] ===
          "string"
            ? tags["addr:postcode"].trim()
            : "";

        addressKeys.add(
          `${houseNumber}|${street}|${postcode}|${elementKey}`,
        );
      }

      const building =
        tags.building;

      if (
        typeof building === "string" &&
        building.length > 0 &&
        building !== "no"
      ) {
        totalBuildings.add(
          elementKey,
        );

        if (
          isResidentialBuildingType(
            building,
          )
        ) {
          residentialBuildings.add(
            elementKey,
          );
        }
      }
    }

    return {
      addressCount:
        addressKeys.size,

      residentialBuildingCount:
        residentialBuildings.size,

      totalBuildingCount:
        totalBuildings.size,

      source:
        "openstreetmap_overpass",
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

function isResidentialBuildingType(
  building,
) {
  const residentialTypes =
    new Set([
      "apartments",
      "bungalow",
      "cabin",
      "detached",
      "dormitory",
      "farm",
      "house",
      "residential",
      "semidetached_house",
      "static_caravan",
      "terrace",
    ]);

  return residentialTypes.has(
    building,
  );
}

function determineHomeEstimate({
  geographicResult,
  areaAcres,
}) {
  const addressCount =
    geographicResult.addressCount;

  const residentialBuildingCount =
    geographicResult
      .residentialBuildingCount;

  if (addressCount >= 5) {
    return {
      estimatedHomes:
        addressCount,

      method:
        "osm_address_points_v1",

      confidence:
        "high",

      confidenceScore:
        0.85,
    };
  }

  if (
    residentialBuildingCount >= 3
  ) {
    return {
      estimatedHomes:
        residentialBuildingCount,

      method:
        "osm_residential_buildings_v1",

      confidence:
        "medium",

      confidenceScore:
        0.65,
    };
  }

  const fallbackHomes =
    calculateDevelopmentHomeEstimate({
      areaAcres,
    });

  return {
    estimatedHomes:
      fallbackHomes,

    method:
      "development_area_density_fallback_v1",

    confidence:
      "low",

    confidenceScore:
      fallbackHomes > 0
        ? 0.35
        : 0.0,
  };
}

function calculateDevelopmentHomeEstimate({
  areaAcres,
}) {
  if (
    !Number.isFinite(areaAcres) ||
    areaAcres <= 0
  ) {
    return 0;
  }

  return Math.max(
    1,
    Math.round(
      areaAcres *
        DEVELOPMENT_HOMES_PER_ACRE,
    ),
  );
}

function cleanId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function moneyValue(value) {
  const number = typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) ? number : 0;
}

function firstMoneyValue(...values) {
  for (const value of values) {
    const number = moneyValue(value);

    if (number > 0) {
      return number;
    }
  }

  return 0;
}

function normalizedCampaignType(value) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function campaignRequiresPhotos(campaignType) {
  return new Set([
    "yardsigninstallation",
    "yardcleanup",
    "dumprun",
    "junkremoval",
  ]).has(normalizedCampaignType(campaignType));
}

function completionHasPhoto(completion) {
  const proofs = Array.isArray(completion.proofs) ? completion.proofs : [];

  return proofs.some((proof) => {
    if (!proof || typeof proof !== "object") {
      return false;
    }

    const fileUrl = typeof proof.fileUrl === "string"
      ? proof.fileUrl.trim()
      : "";
    const proofType = normalizedCampaignType(proof.type);

    return fileUrl.length > 0 && proofType !== "gpsroute";
  });
}

function validRoutePoints(rawPoints) {
  if (!Array.isArray(rawPoints)) {
    return [];
  }

  return rawPoints
    .filter((point) =>
      point &&
      typeof point === "object" &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
    )
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
}

function calculateRouteCompletion(zone, routePoints) {
  const assignedHomes = Math.round(
    firstMoneyValue(zone.assignedHomes, zone.estimatedHomes),
  );

  if (assignedHomes <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "The zone does not have a valid assigned home count.",
    );
  }

  const serviceArea = validRoutePoints(zone.serviceArea);

  if (serviceArea.length < 3) {
    throw new HttpsError(
      "failed-precondition",
      "The zone does not contain a valid mapped service area.",
    );
  }

  let expectedWalkingMeters = moneyValue(zone.estimatedWalkingMeters);

  if (expectedWalkingMeters <= 0) {
    expectedWalkingMeters = moneyValue(zone.estimatedWalkingMiles) * 1609.344;
  }

  if (expectedWalkingMeters <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "The zone does not have a valid expected walking distance.",
    );
  }

  let totalRouteMeters = 0;
  let insideZoneMeters = 0;

  for (let index = 1; index < routePoints.length; index++) {
    const previous = routePoints[index - 1];
    const current = routePoints[index];
    const segmentMeters = distanceMeters(previous, current);

    if (segmentMeters < 2 || segmentMeters > 250) {
      continue;
    }

    totalRouteMeters += segmentMeters;

    const midpoint = {
      latitude: (previous.latitude + current.latitude) / 2,
      longitude: (previous.longitude + current.longitude) / 2,
    };

    if (pointInsidePolygon(midpoint, serviceArea)) {
      insideZoneMeters += segmentMeters;
    }
  }

  const completionRatio = Math.max(
    0,
    Math.min(1, insideZoneMeters / expectedWalkingMeters),
  );
  const completionPercentage = completionRatio * 100;
  const completedHomes = Math.max(
    0,
    Math.min(assignedHomes, Math.round(assignedHomes * completionRatio)),
  );

  return {
    assignedHomes,
    completedHomes,
    completionPercentage,
    eligibleForPayment:
      completionPercentage >= MINIMUM_PAYABLE_COMPLETION_PERCENTAGE,
    routeDistanceMeters: totalRouteMeters,
    insideZoneDistanceMeters: insideZoneMeters,
  };
}

function distanceMeters(start, end) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) *
    Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(1 - haversine),
  );
}

function pointInsidePolygon(point, polygon) {
  let inside = false;
  let previousIndex = polygon.length - 1;

  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects =
      (current.latitude > point.latitude) !==
        (previous.latitude > point.latitude) &&
      point.longitude <
        (previous.longitude - current.longitude) *
          (point.latitude - current.latitude) /
          (previous.latitude - current.latitude) +
        current.longitude;

    if (intersects) {
      inside = !inside;
    }

    previousIndex = index;
  }

  return inside;
}

function calculatePayout({
  completionPercentage,
  basePay,
  completionBonus,
}) {
  const safeCompletion = Math.max(0, Math.min(100, completionPercentage));
  const safeBasePay = Math.max(0, basePay);
  const safeBonus = Math.max(0, completionBonus);

  if (safeCompletion < MINIMUM_PAYABLE_COMPLETION_PERCENTAGE) {
    return {
      basePayout: 0,
      bonus: 0,
      totalPayout: 0,
      status: "redo_required",
    };
  }

  if (safeCompletion >= AUTOMATIC_BONUS_COMPLETION_PERCENTAGE) {
    const basePayout = roundMoney(safeBasePay);
    const bonus = roundMoney(safeBonus);

    return {
      basePayout,
      bonus,
      totalPayout: roundMoney(basePayout + bonus),
      status: "completed_with_bonus",
    };
  }

  const basePayout = roundMoney(safeBasePay * safeCompletion / 100);

  return {
    basePayout,
    bonus: 0,
    totalPayout: basePayout,
    status: "partial_completion",
  };
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function readText(value, maximumLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maximumLength);
}

function normalizeExternalUrl(value) {
  const text = readText(value, 2000);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString();
  } catch (_) {
    return null;
  }
}

function publicTrackingUrl(trackingCode) {
  const projectId = process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    (scaledCircleEnvironment() === "local" ? "demo-scaledcircle" : "scaled-circle");

  if (scaledCircleEnvironment() === "local" && projectId === "scaled-circle") {
    throw new HttpsError(
      "failed-precondition",
      "Local runtime refuses the production Firebase project.",
    );
  }

  const baseUrl = scaledCircleEnvironment() === "local" ?
    `http://${process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001"}/` +
      `${projectId}/us-east1` :
    `https://us-east1-${projectId}.cloudfunctions.net`;
  return `${baseUrl}/` +
    `campaignTracking?t=${encodeURIComponent(trackingCode)}`;
}

async function loadWeatherOpportunityFeed({
  latitude,
  longitude,
  maximumCacheAgeMs = 5 * 60 * 1000,
}) {
  const roundedLatitude = Math.round(latitude * 100) / 100;
  const roundedLongitude = Math.round(longitude * 100) / 100;
  const cacheId = `${roundedLatitude}_${roundedLongitude}`
    .replaceAll(".", "_")
    .replaceAll("-", "m");
  const cacheReference = db.collection("weatherOpportunityCache").doc(cacheId);
  const cacheSnapshot = await cacheReference.get();
  const cache = cacheSnapshot.data() || {};
  const fetchedAt = cache.fetchedAt instanceof Timestamp ?
    cache.fetchedAt.toMillis() : 0;

  if (maximumCacheAgeMs > 0 &&
      Date.now() - fetchedAt < maximumCacheAgeMs &&
      Array.isArray(cache.alerts)) {
    const cachedAlerts = cache.alerts.filter((alert) =>
      !/\b(test message|required weekly test|practice\/demo)\b/i.test(
        `${readText(alert?.event, 120)} ${readText(alert?.headline, 240)}`,
      ));
    return {
      source: "National Weather Service",
      experimentalOpportunityModel: true,
      cached: true,
      alerts: cachedAlerts,
    };
  }

  try {
    const endpoint = new URL("https://api.weather.gov/alerts/active");
    endpoint.searchParams.set("point", `${roundedLatitude},${roundedLongitude}`);
    const nwsResponse = await fetch(endpoint, {
      headers: {
        "Accept": "application/geo+json",
        "User-Agent": "ScaledCircle/1.0 (https://scaledcircle.com)",
      },
    });

    if (!nwsResponse.ok) {
      throw new Error(`NWS returned ${nwsResponse.status}.`);
    }

    const payload = await nwsResponse.json();
    const features = Array.isArray(payload.features) ? payload.features : [];
    const alerts = features
      .map((feature) => weatherOpportunityFromFeature(feature))
      .filter(Boolean)
      .slice(0, 12);

    await cacheReference.set({
      latitude: roundedLatitude,
      longitude: roundedLongitude,
      source: "National Weather Service",
      alerts,
      fetchedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      source: "National Weather Service",
      experimentalOpportunityModel: true,
      cached: false,
      alerts,
    };
  } catch (error) {
    if (Array.isArray(cache.alerts)) {
      const cachedAlerts = cache.alerts.filter((alert) =>
        !/\b(test message|required weekly test|practice\/demo)\b/i.test(
          `${readText(alert?.event, 120)} ${readText(alert?.headline, 240)}`,
        ));
      return {
        source: "National Weather Service",
        experimentalOpportunityModel: true,
        cached: true,
        stale: true,
        alerts: cachedAlerts,
      };
    }
    throw error;
  }
}

function weatherOpportunityFromFeature(feature) {
  if (!feature || typeof feature !== "object") {
    return null;
  }

  const properties = feature.properties &&
    typeof feature.properties === "object" ? feature.properties : {};
  const event = readText(properties.event, 120);
  const headline = readText(properties.headline, 240) || event;
  const status = readText(properties.status, 40).toLowerCase();
  const messageType = readText(properties.messageType, 40).toLowerCase();
  const responseType = readText(properties.response, 40).toLowerCase();
  const combinedText = `${event} ${headline} ${
    readText(properties.description, 1800)
  }`.toLowerCase();

  if (!event && !headline) {
    return null;
  }

  const testProduct = /\b(test message|required weekly test|practice\/demo)\b/i;
  if (status === "test" || status === "exercise" ||
      messageType === "test" || messageType === "cancel" ||
      responseType === "test" || testProduct.test(`${event} ${headline}`) ||
      event.toLowerCase() === "administrative message") {
    return null;
  }

  let services = ["Local outreach"];
  let leadLiftRange = {lowPercent: 0, highPercent: 8};
  let rationale = "Active weather can change near-term local service demand.";
  let confidence = "experimental_low";

  if (combinedText.includes("hail")) {
    services = ["Roofing", "Siding", "Windows", "Exterior inspection"];
    leadLiftRange = {lowPercent: 10, highPercent: 30};
    rationale = "Hail alerts may increase demand for exterior inspections and repairs.";
    confidence = "experimental_medium";
  } else if (combinedText.includes("tornado") ||
      combinedText.includes("severe thunderstorm") ||
      combinedText.includes("damaging wind") ||
      combinedText.includes("high wind")) {
    services = ["Roofing", "Siding", "Tree service", "Storm cleanup"];
    leadLiftRange = {lowPercent: 8, highPercent: 25};
    rationale = "Severe wind alerts may increase demand for exterior and debris services.";
    confidence = "experimental_medium";
  } else if (combinedText.includes("flood")) {
    services = ["Water mitigation", "Basement cleanup", "Mold inspection"];
    leadLiftRange = {lowPercent: 8, highPercent: 24};
    rationale = "Flood alerts may increase demand for water and property restoration services.";
    confidence = "experimental_medium";
  } else if (combinedText.includes("snow") ||
      combinedText.includes("ice") ||
      combinedText.includes("winter storm")) {
    services = ["Snow removal", "Ice management", "Emergency property service"];
    leadLiftRange = {lowPercent: 5, highPercent: 18};
    rationale = "Winter weather alerts may increase demand for removal and emergency services.";
  } else if (combinedText.includes("heat")) {
    services = ["HVAC", "Cooling service", "Energy efficiency"];
    leadLiftRange = {lowPercent: 4, highPercent: 15};
    rationale = "Heat alerts may increase demand for cooling and HVAC services.";
  }

  return {
    id: readText(feature.id, 500) || readText(properties.id, 500),
    event,
    headline,
    severity: readText(properties.severity, 40) || "Unknown",
    urgency: readText(properties.urgency, 40) || "Unknown",
    certainty: readText(properties.certainty, 40) || "Unknown",
    areaDescription: readText(properties.areaDesc, 500),
    sent: readText(properties.sent, 80),
    onset: readText(properties.onset, 80),
    expires: readText(properties.expires, 80),
    officialDescription: readText(properties.description, 1000),
    sourceUrl: readText(feature.id, 1000),
    opportunity: {
      services,
      estimatedLeadLiftLowPercent: leadLiftRange.lowPercent,
      estimatedLeadLiftHighPercent: leadLiftRange.highPercent,
      confidence,
      rationale,
      experimental: true,
      modelVersion: "weather-opportunity-v1",
    },
  };
}

async function recordTrackingEvent({
  tracking,
  trackingCode,
  eventType,
  source,
  request,
  metrics,
}) {
  const campaignId = readText(tracking.campaignId, 160);

  if (!campaignId) {
    return;
  }

  const eventReference = db
    .collection("campaignTrackingCodes")
    .doc(trackingCode)
    .collection("events")
    .doc();
  const event = {
    campaignId,
    businessId: readText(tracking.businessId, 160),
    trackingCode,
    eventType,
    source,
    referrer: readText(request.get("referer"), 500),
    userAgent: readText(request.get("user-agent"), 500),
    createdAt: FieldValue.serverTimestamp(),
  };
  const metricUpdates = {
    trackingLastEventAt: FieldValue.serverTimestamp(),
    trackingEventCount: FieldValue.increment(1),
  };

  for (const metric of [...new Set(metrics || [])]) {
    metricUpdates[`trackingMetrics.${metric}`] = FieldValue.increment(1);
  }

  await Promise.all([
    eventReference.set(event),
    db.collection("campaigns").doc(campaignId).update(metricUpdates),
  ]);
}

function renderCampaignLandingPage({tracking, source}) {
  const campaignName = readText(tracking.campaignName, 160) ||
    "Local offer";
  const headline = readText(tracking.landingPageHeadline, 120) ||
    campaignName;
  const body = readText(tracking.landingPageBody, 600) ||
    readText(tracking.campaignDescription, 600) ||
    "Learn more about this local campaign.";
  const callToActionLabel = readText(tracking.callToActionLabel, 50) ||
    "Learn More";
  const trackingUrl = readText(tracking.trackingUrl, 2000);
  const separator = trackingUrl.includes("?") ? "&" : "?";
  const callToActionUrl = `${trackingUrl}${separator}` +
    `action=cta&source=${encodeURIComponent(source)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(headline)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      padding: 28px; color: #f5fbff; background:
        radial-gradient(circle at 75% 15%, #053e63 0, transparent 35%),
        radial-gradient(circle at 15% 80%, #043c2e 0, transparent 38%),
        #020914; font: 16px/1.6 system-ui, -apple-system, Segoe UI, sans-serif;
    }
    main {
      width: min(720px, 100%); padding: clamp(28px, 7vw, 68px);
      border: 1px solid #153452; border-radius: 28px;
      background: rgba(5, 17, 31, .92); box-shadow: 0 28px 90px #0009;
    }
    .eyebrow { color: #15e39a; font-weight: 800; letter-spacing: .12em;
      text-transform: uppercase; font-size: .78rem; }
    h1 { margin: .4rem 0 1rem; font-size: clamp(2.2rem, 8vw, 4.6rem);
      line-height: .98; letter-spacing: -.055em; }
    p { color: #b8c9d8; font-size: clamp(1rem, 2.6vw, 1.22rem); }
    a { display: inline-flex; margin-top: 22px; padding: 15px 24px;
      border-radius: 12px; color: #00150e; background: #15e39a;
      font-weight: 850; text-decoration: none; }
    footer { margin-top: 34px; color: #6f879a; font-size: .8rem; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">A Scaled Circle local campaign</div>
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(body)}</p>
    <a href="${escapeHtml(callToActionUrl)}">${escapeHtml(callToActionLabel)}</a>
    <footer>Campaign attribution and verified local delivery by Scaled Circle.</footer>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readNumber(
  value,
  fallback = 0,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return fallback;
}

function readInteger(
  value,
  fallback = 0,
) {
  const number = readNumber(
    value,
    fallback,
  );

  return Math.round(
    number,
  );
}

// Native active-job tracking -------------------------------------------------
const TRACKING_CALLABLE_OPTIONS = {
  memory: "512MiB",
  timeoutSeconds: 120,
  maxInstances: 20,
  concurrency: 40,
};

const TRACKING_SESSION_STATES = new Set([
  "active", "finalizing", "completed", "cancelled",
]);

function trackingCallable(name, handler) {
  return onCall(TRACKING_CALLABLE_OPTIONS, async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Unexpected ${name} failure`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        uid: request.auth?.uid || null,
      });
      throw new HttpsError("internal", "The tracking request could not be completed.");
    }
  });
}

function trackingTimestampMs(value, fallback) {
  return value instanceof Timestamp ? value.toMillis() : fallback;
}

function firestoreTrackingPoint(point) {
  return {...point, recordedAt: Timestamp.fromMillis(point.timestampMs)};
}

function assertTrackingPayload(data, allowed, maximumBytes) {
  try {
    assertAllowedKeys(data || {}, allowed, "Tracking request");
  } catch (error) {
    throw new HttpsError("invalid-argument", "The tracking request is malformed.");
  }
  if (serializedBytes(data) > maximumBytes) {
    throw new HttpsError("invalid-argument", "The tracking request is too large.");
  }
}

// Compatibility bridge for the development/browser GPS simulator. Client
// writes to campaignRoutes are denied by rules; this callable is the sole
// writer for legacy route documents and stamps an unforgeable server source.
exports.saveLegacyTrackingRoute = trackingCallable(
  "saveLegacyTrackingRoute",
  async (request) => {
    assertTrackingPayload(
      request.data,
      new Set([
        "campaignId", "zoneId", "routeId", "operation", "points",
        "tracking", "simulated", "lastAccuracyMeters",
      ]),
      393216,
    );
    const context = await requireVerifiedUser(request, "Sign in before saving GPS evidence.");
    if (context.role !== "scaler" && !context.isAdmin) {
      throw new HttpsError("permission-denied", "Only the assigned Scaler can save this route.");
    }
    const campaignId = String(request.data?.campaignId || "").trim();
    const zoneId = String(request.data?.zoneId || "").trim();
    const routeId = String(request.data?.routeId || "").trim();
    const operation = String(request.data?.operation || "save");
    if (!campaignId || !zoneId || !routeId || !["save", "clear"].includes(operation)) {
      throw new HttpsError("invalid-argument", "The legacy route request is malformed.");
    }
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(routeId)) {
      throw new HttpsError("invalid-argument", "The route identifier is invalid.");
    }
    const rawPoints = request.data?.points ?? [];
    if (!Array.isArray(rawPoints) || rawPoints.length > 6000) {
      throw new HttpsError("resource-exhausted", "The legacy route contains too many points.");
    }
    const points = rawPoints.map((point) => {
      try {
        assertAllowedKeys(point || {}, new Set(["latitude", "longitude"]), "Legacy point");
      } catch (_) {
        throw new HttpsError("invalid-argument", "A legacy route point is malformed.");
      }
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new HttpsError("invalid-argument", "A legacy route coordinate is invalid.");
      }
      return {latitude, longitude};
    });
    const zoneRef = db.collection("campaignZones").doc(zoneId);
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const routeRef = db.collection("campaignRoutes").doc(routeId);
    await db.runTransaction(async (transaction) => {
      const [zoneSnapshot, campaignSnapshot, routeSnapshot] = await Promise.all([
        transaction.get(zoneRef), transaction.get(campaignRef), transaction.get(routeRef),
      ]);
      if (!zoneSnapshot.exists || !campaignSnapshot.exists) {
        throw new HttpsError("not-found", "The assigned job was not found.");
      }
      const zone = zoneSnapshot.data();
      if (zone.campaignId !== campaignId ||
          (!context.isAdmin && zone.assignedScalerId !== context.uid)) {
        throw new HttpsError("permission-denied", "This zone is not assigned to you.");
      }
      const existing = routeSnapshot.data();
      if (existing && existing.source !== "legacy_browser_v1") {
        throw new HttpsError("failed-precondition", "Native GPS evidence cannot be changed.");
      }
      if (existing && existing.scalerId !== context.uid && !context.isAdmin) {
        throw new HttpsError("permission-denied", "This route belongs to another Scaler.");
      }
      if (operation === "clear") {
        if (routeSnapshot.exists) transaction.delete(routeRef);
        transaction.update(zoneRef, {
          routeId: FieldValue.delete(),
          gpsTracking: false,
          gpsRoutePointCount: 0,
          gpsRouteSimulated: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      const tracking = request.data?.tracking === true;
      const simulated = request.data?.simulated === true;
      transaction.set(routeRef, {
        source: "legacy_browser_v1",
        schemaVersion: 1,
        campaignId,
        zoneId,
        zoneName: zone.zoneName || "Zone",
        scalerId: context.uid,
        scalerEmail: context.email || null,
        points,
        pointCount: points.length,
        tracking,
        simulated,
        lastAccuracyMeters: Number.isFinite(Number(request.data?.lastAccuracyMeters)) ?
          Math.max(0, Number(request.data.lastAccuracyMeters)) : null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing?.createdAt || FieldValue.serverTimestamp(),
      }, {merge: false});
      transaction.update(zoneRef, {
        routeId,
        gpsTracking: tracking,
        gpsRoutePointCount: points.length,
        gpsRouteSimulated: simulated,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return {routeId, pointCount: points.length, cleared: operation === "clear"};
  },
);

exports.startAssignedZone = trackingCallable("startAssignedZone", async (request) => {
  assertTrackingPayload(request.data, new Set(["campaignId", "zoneId"]), 4096);
  const context = await requireVerifiedUser(request, "Sign in before starting this job.");
  if (context.role !== "scaler" && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only the assigned Scaler can start this job.");
  }
  const campaignId = String(request.data?.campaignId || "").trim();
  const zoneId = String(request.data?.zoneId || "").trim();
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  await db.runTransaction(async (transaction) => {
    const zoneSnapshot = await transaction.get(zoneRef);
    if (!zoneSnapshot.exists) throw new HttpsError("not-found", "The assigned zone was not found.");
    const zone = zoneSnapshot.data();
    if (zone.campaignId !== campaignId ||
        (!context.isAdmin && zone.assignedScalerId !== context.uid)) {
      throw new HttpsError("permission-denied", "This zone is not assigned to you.");
    }
    const status = String(zone.status || "assigned");
    if (status === "in_progress") return;
    if (!["assigned", "accepted"].includes(status)) {
      throw new HttpsError("failed-precondition", "This job cannot be started in its current state.");
    }
    transaction.update(zoneRef, {
      status: "in_progress",
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {status: "in_progress"};
});

exports.assignScalerToZone = trackingCallable("assignScalerToZone", async (request) => {
  assertTrackingPayload(
    request.data,
    new Set(["campaignId", "zoneId", "applicationId"]),
    4096,
  );
  const context = await requireVerifiedUser(request, "Sign in before assigning a Scaler.");
  if (context.role !== "business" && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only the campaign business can assign this zone.");
  }
  const campaignId = String(request.data?.campaignId || "").trim();
  const zoneId = String(request.data?.zoneId || "").trim();
  const applicationId = String(request.data?.applicationId || "").trim();
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const applicationRef = campaignRef.collection("applications").doc(applicationId);
  let result = {};
  await db.runTransaction(async (transaction) => {
    const [campaignSnapshot, zoneSnapshot, applicationSnapshot] = await Promise.all([
      transaction.get(campaignRef), transaction.get(zoneRef), transaction.get(applicationRef),
    ]);
    if (!campaignSnapshot.exists || !zoneSnapshot.exists || !applicationSnapshot.exists) {
      throw new HttpsError("not-found", "The campaign assignment is no longer available.");
    }
    const campaign = campaignSnapshot.data();
    const zone = zoneSnapshot.data();
    const application = applicationSnapshot.data();
    if (!context.isAdmin && campaign.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "This campaign does not belong to you.");
    }
    if (zone.campaignId !== campaignId || zone.businessId !== campaign.businessId) {
      throw new HttpsError("failed-precondition", "The zone does not belong to this campaign.");
    }
    if (application.status !== "pending" ||
        (application.campaignId && application.campaignId !== campaignId)) {
      throw new HttpsError("failed-precondition", "This application has already been processed.");
    }
    if (zone.assignedScalerId) {
      throw new HttpsError("failed-precondition", "This zone has already been assigned.");
    }
    const scalerId = String(application.scalerId || "").trim();
    const scalerEmail = String(application.scalerEmail || application.email || "").trim();
    const pointCount = Number(zone.serviceAreaPointCount || 0);
    const assignedHomes = Number(zone.estimatedHomes || 0);
    if (!scalerId || pointCount < 3 || !Number.isSafeInteger(assignedHomes) || assignedHomes <= 0) {
      throw new HttpsError("failed-precondition", "The mapped assignment is incomplete.");
    }
    const zoneName = String(zone.zoneName || "Zone");
    const baseAmountCents = Number.isSafeInteger(zone.baseAmountCents) ?
      zone.baseAmountCents : Math.round(Number(campaign.basePay || 0) * 100);
    const bonusAmountCents = Number.isSafeInteger(zone.bonusAmountCents) ?
      zone.bonusAmountCents : Math.round(Number(campaign.bonus || 0) * 100);
    const counterofferAmountCents = Number.isSafeInteger(
      application.counterofferAmountCents,
    ) ? application.counterofferAmountCents : null;
    marketplace.assertSafeCents(baseAmountCents, "baseAmountCents");
    marketplace.assertSafeCents(bonusAmountCents, "bonusAmountCents");
    if (counterofferAmountCents !== null) {
      marketplace.assertSafeCents(
        counterofferAmountCents,
        "acceptedCounterofferAmountCents",
      );
    }
    const compensationRef = db.collection("assignmentCompensations").doc(zoneId);
    const compensationSnapshot = await transaction.get(compensationRef);
    if (compensationSnapshot.exists) {
      throw new HttpsError(
        "failed-precondition",
        "This zone already has an authoritative compensation contract.",
      );
    }
    transaction.create(compensationRef, {
      campaignId,
      zoneId,
      scalerId,
      businessId: campaign.businessId,
      currency: marketplace.CURRENCY,
      baseAmountCents,
      bonusAmountCents,
      acceptedCounterofferAmountCents: counterofferAmountCents,
      compensationVersion: 1,
      immutable: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(applicationRef, {
      status: "accepted", assignmentMode: "zone", assignedZoneId: zoneId,
      assignedZoneName: zoneName, assignedHomes,
      acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(zoneRef, {
      assignedScalerId: scalerId, assignedScalerEmail: scalerEmail || null,
      assignedApplicationId: applicationId, assignedHomes,
      assignedHomeCountSource: "estimatedHomes",
      assignedHomeCountLockedAt: FieldValue.serverTimestamp(), status: "assigned",
      compensationContractId: compensationRef.id,
      assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection("notifications").doc(), {
      userId: scalerId, type: "application_accepted", title: "Zone Assignment Accepted",
      message: `You were assigned to ${zoneName} for ${campaign.name || "this campaign"}. ` +
        `${assignedHomes} homes are assigned.`,
      campaignId, campaignName: campaign.name || "Campaign", assignmentMode: "zone",
      zoneId, zoneName, assignedHomes, read: false, createdAt: FieldValue.serverTimestamp(),
    });
    result = {scalerId, scalerEmail, zoneName, assignedHomes};
  });
  return result;
});

exports.startTrackingSession = trackingCallable("startTrackingSession", async (request) => {
  assertTrackingPayload(request.data, new Set(["campaignId", "zoneId"]), 4096);
  const context = await requireVerifiedUser(
    request,
    "Sign in before starting GPS tracking.",
  );
  if (context.role !== "scaler" && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only an assigned Scaler can track a job.");
  }
  const campaignId = String(request.data?.campaignId || "").trim();
  const zoneId = String(request.data?.zoneId || "").trim();
  if (!campaignId || !zoneId) {
    throw new HttpsError("invalid-argument", "Campaign and zone are required.");
  }
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const pointerRef = db.collection("activeTrackingSessions").doc(context.uid);
  const sessionRef = db.collection("trackingSessions").doc();
  let result = {sessionId: sessionRef.id, status: "active", recovered: false};
  await db.runTransaction(async (transaction) => {
    const campaignSnapshot = await transaction.get(campaignRef);
    const zoneSnapshot = await transaction.get(zoneRef);
    const pointerSnapshot = await transaction.get(pointerRef);
    if (!campaignSnapshot.exists || !zoneSnapshot.exists) {
      throw new HttpsError("not-found", "The assigned job was not found.");
    }
    if (pointerSnapshot.exists) {
      const pointerSessionId = String(pointerSnapshot.data()?.sessionId || "");
      const pointedRef = db.collection("trackingSessions").doc(pointerSessionId);
      const pointedSnapshot = pointerSessionId ? await transaction.get(pointedRef) : null;
      const pointed = pointedSnapshot?.data() || null;
      if (pointed && ["active", "finalizing"].includes(String(pointed.status))) {
        if (pointed.scalerId === context.uid && pointed.campaignId === campaignId &&
            pointed.zoneId === zoneId && pointed.status === "active") {
          result = {sessionId: pointerSessionId, status: "active", recovered: true};
          return;
        }
        throw new HttpsError("already-exists", "Another GPS tracking session is active.");
      }
      transaction.delete(pointerRef);
    }
    const campaign = campaignSnapshot.data() || {};
    const zone = zoneSnapshot.data() || {};
    if (zone.campaignId !== campaignId || zone.assignedScalerId !== context.uid) {
      throw new HttpsError("permission-denied", "This zone is not assigned to you.");
    }
    if (!["assigned", "accepted", "in_progress"].includes(String(zone.status))) {
      throw new HttpsError("failed-precondition", "This job cannot be started.");
    }
    transaction.create(sessionRef, {
      campaignId,
      zoneId,
      businessId: String(campaign.businessId || zone.businessId || ""),
      scalerId: context.uid,
      status: "active",
      syncStatus: "collecting",
      simulated: false,
      startedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      uploadedPointCount: 0,
      acceptedPointCount: 0,
      rejectedPointCount: 0,
      pointCount: 0,
      chunkCount: 0,
      checkpointCount: 0,
      nextExpectedSequence: 1,
      lastUploadedSequence: 0,
      schemaVersion: 2,
    });
    transaction.create(pointerRef, {
      sessionId: sessionRef.id,
      campaignId,
      zoneId,
      scalerId: context.uid,
      startedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(zoneRef, {
      status: "in_progress",
      activeTrackingSessionId: sessionRef.id,
      gpsTracking: true,
      gpsTrackingStartedAt: FieldValue.serverTimestamp(),
      startedAt: zone.startedAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return result;
});

exports.getTrackingSessionState = trackingCallable(
  "getTrackingSessionState", async (request) => {
    assertTrackingPayload(request.data, new Set(["sessionId"]), 4096);
    const context = await authenticatedUserContext(request, "Sign in to check tracking.");
    const sessionId = String(request.data?.sessionId || "").trim();
    if (!sessionId) throw new HttpsError("invalid-argument", "Session is required.");
    const snapshot = await db.collection("trackingSessions").doc(sessionId).get();
    const session = snapshot.data();
    if (!snapshot.exists || !session ||
        (session.scalerId !== context.uid && !context.isAdmin)) {
      throw new HttpsError("permission-denied", "The tracking session is unavailable.");
    }
    return {
      sessionId,
      status: String(session.status || "unknown"),
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      syncStatus: session.syncStatus,
      lastUploadedSequence: Number(session.lastUploadedSequence || 0),
    };
  },
);

exports.uploadTrackingChunk = trackingCallable("uploadTrackingChunk", async (request) => {
  const context = await requireVerifiedUser(
    request,
    "Sign in before syncing GPS evidence.",
  );
  assertTrackingPayload(request.data, new Set([
    "sessionId", "chunkId", "startSequence", "endSequence", "points",
  ]), TRACKING_LIMITS.maxUploadPayloadBytes);
  const sessionId = String(request.data?.sessionId || "").trim();
  const rawPoints = request.data?.points;
  if (!sessionId || !Array.isArray(rawPoints) || rawPoints.length < 1 ||
      rawPoints.length > TRACKING_LIMITS.maxPointsPerChunk) {
    throw new HttpsError("invalid-argument", "The GPS chunk is invalid.");
  }
  let rawDigest;
  try {
    rawDigest = digestRawPoints(rawPoints);
  } catch (_) {
    throw new HttpsError("invalid-argument", "One or more GPS points are malformed.");
  }
  const startSequence = rawPoints[0]?.sequence;
  const endSequence = rawPoints.at(-1)?.sequence;
  if (!Number.isSafeInteger(startSequence) || !Number.isSafeInteger(endSequence) ||
      Number(request.data?.startSequence) !== startSequence ||
      Number(request.data?.endSequence) !== endSequence) {
    throw new HttpsError("invalid-argument", "GPS chunk sequence does not match its points.");
  }
  const chunkId = canonicalChunkId(startSequence, endSequence);
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  const chunkRef = sessionRef.collection("chunks").doc(chunkId);
  let duplicate = false;
  await db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const existing = await transaction.get(chunkRef);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || !session || session.scalerId !== context.uid) {
      throw new HttpsError("permission-denied", "This tracking session is not yours.");
    }
    if (existing.exists) {
      const existingData = existing.data() || {};
      if (existingData.payloadDigest === rawDigest &&
          existingData.startSequence === startSequence &&
          existingData.endSequence === endSequence) {
        duplicate = true;
        return;
      }
      throw new HttpsError("already-exists", "Conflicting GPS evidence already exists.");
    }
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "This tracking session is closed.");
    }
    const nowMs = Date.now();
    const startedAtMs = trackingTimestampMs(session.startedAt, nowMs);
    if (nowMs - startedAtMs > TRACKING_LIMITS.maxSessionDurationMs) {
      throw new HttpsError("resource-exhausted", "This tracking session exceeded its duration limit.");
    }
    if (startSequence !== Number(session.nextExpectedSequence || 1)) {
      throw new HttpsError("failed-precondition", "GPS evidence is missing or overlaps existing data.");
    }
    if (Number(session.chunkCount || 0) >= TRACKING_LIMITS.maxChunksPerSession ||
        Number(session.pointCount || 0) + rawPoints.length >
          TRACKING_LIMITS.maxPointsPerSession) {
      throw new HttpsError("resource-exhausted", "This tracking session reached its evidence limit.");
    }
    let normalized;
    try {
      normalized = normalizeChunk(rawPoints, {
        sessionId,
        campaignId: session.campaignId,
        zoneId: session.zoneId,
        scalerId: context.uid,
        nowMs,
        startedAtMs,
        previousPoint: session.lastEvidencePoint || null,
      });
    } catch (_) {
      throw new HttpsError("invalid-argument", "One or more GPS points are malformed.");
    }
    const points = normalized.points.map(firestoreTrackingPoint);
    const acceptedCount = points.filter((point) => point.accepted).length;
    transaction.create(chunkRef, {
      sessionId,
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      scalerId: context.uid,
      chunkId,
      payloadDigest: rawDigest,
      startSequence,
      endSequence,
      pointCount: points.length,
      acceptedCount,
      points,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(sessionRef, {
      uploadedPointCount: FieldValue.increment(points.length),
      pointCount: FieldValue.increment(points.length),
      chunkCount: FieldValue.increment(1),
      acceptedPointCount: FieldValue.increment(acceptedCount),
      rejectedPointCount: FieldValue.increment(points.length - acceptedCount),
      lastUploadedSequence: endSequence,
      nextExpectedSequence: endSequence + 1,
      lastEvidencePoint: normalized.lastPoint,
      lastSyncAt: FieldValue.serverTimestamp(),
      syncStatus: "syncing",
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {duplicate, endSequence};
});

exports.completeTrackingSession = trackingCallable("completeTrackingSession", async (request) => {
  assertTrackingPayload(request.data, new Set(["sessionId"]), 4096);
  const context = await requireVerifiedUser(
    request,
    "Sign in before completing GPS tracking.",
  );
  const sessionId = String(request.data?.sessionId || "").trim();
  if (!sessionId) throw new HttpsError("invalid-argument", "Session is required.");
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  let session;
  let alreadyCompleted = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    session = snapshot.data();
    if (!snapshot.exists || !session || session.scalerId !== context.uid) {
      throw new HttpsError("permission-denied", "This tracking session is not yours.");
    }
    if (session.status === "completed") { alreadyCompleted = true; return; }
    if (session.status === "cancelled") {
      throw new HttpsError("failed-precondition", "This tracking session was cancelled.");
    }
    if (!["active", "finalizing"].includes(String(session.status))) {
      throw new HttpsError("failed-precondition", "This tracking session cannot be completed.");
    }
    if (session.status === "active") {
      transaction.update(sessionRef, {
        status: "finalizing",
        syncStatus: "finalizing",
        finalizingAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  if (alreadyCompleted) {
    return {routeId: session.routeId || sessionId, status: "completed"};
  }
  const chunks = await sessionRef.collection("chunks").orderBy("startSequence").get();
  if (chunks.size !== Number(session.chunkCount || 0) ||
      chunks.size > TRACKING_LIMITS.maxChunksPerSession) {
    logger.error("Tracking chunk count integrity failure", {sessionId});
    throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
  }
  const evidencePoints = [];
  let expectedSequence = 1;
  const digestParts = [];
  for (const chunk of chunks.docs) {
    const data = chunk.data() || {};
    const points = Array.isArray(data.points) ? data.points : [];
    if (data.startSequence !== expectedSequence ||
        data.endSequence !== expectedSequence + points.length - 1 ||
        data.pointCount !== points.length ||
        chunk.id !== canonicalChunkId(data.startSequence, data.endSequence)) {
      logger.error("Tracking sequence integrity failure", {sessionId, chunkId: chunk.id});
      throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
    }
    for (const point of points) {
      if (Number(point.sequence) !== expectedSequence) {
        logger.error("Duplicate or missing GPS sequence", {sessionId, expectedSequence});
        throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
      }
      evidencePoints.push(point);
      expectedSequence += 1;
    }
    digestParts.push(`${data.startSequence}:${data.endSequence}:${data.payloadDigest}`);
  }
  if (evidencePoints.length !== Number(session.pointCount || 0) ||
      evidencePoints.length > TRACKING_LIMITS.maxPointsPerSession) {
    logger.error("Tracking point count integrity failure", {sessionId});
    throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
  }
  const accepted = evidencePoints.filter((point) => point.accepted === true);
  if (accepted.length < 2) {
    throw new HttpsError("failed-precondition", "Record at least two usable GPS points.");
  }
  const compatible = compatibilityRoutePoints(accepted).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    timestampMs: point.timestampMs,
    horizontalAccuracy: point.horizontalAccuracy,
    speed: point.speed,
    heading: point.heading,
    sequence: point.sequence,
  }));
  const routeRef = db.collection("campaignRoutes").doc(sessionId);
  const zoneRef = db.collection("campaignZones").doc(session.zoneId);
  const pointerRef = db.collection("activeTrackingSessions").doc(context.uid);
  const evidenceDigest = crypto.createHash("sha256")
    .update(digestParts.join("|"), "utf8").digest("hex");
  await db.runTransaction(async (transaction) => {
    const freshSession = await transaction.get(sessionRef);
    const freshRoute = await transaction.get(routeRef);
    const freshZone = await transaction.get(zoneRef);
    const freshPointer = await transaction.get(pointerRef);
    const current = freshSession.data() || {};
    if (current.status === "completed") return;
    if (current.status !== "finalizing") {
      throw new HttpsError("failed-precondition", "This tracking session changed state.");
    }
    if (!freshZone.exists) throw new HttpsError("not-found", "The assigned zone is unavailable.");
    if (freshRoute.exists &&
        (freshRoute.data()?.trackingSessionId !== sessionId ||
         freshRoute.data()?.evidenceDigest !== evidenceDigest)) {
      logger.error("Campaign route finalization conflict", {sessionId, routeId: routeRef.id});
      throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
    }
    if (!freshRoute.exists) transaction.create(routeRef, {
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      scalerId: context.uid,
      trackingSessionId: sessionId,
      tracking: false,
      simulated: false,
      startedAt: session.startedAt || FieldValue.serverTimestamp(),
      endedAt: FieldValue.serverTimestamp(),
      points: compatible,
      pointCount: compatible.length,
      fullEvidencePointCount: evidencePoints.length,
      rejectedPointCount: evidencePoints.length - accepted.length,
      evidenceStorage: "trackingSessions/chunks",
      routeSource: "native_background_v1",
      schemaVersion: 2,
      evidenceDigest,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(sessionRef, {
      status: "completed",
      syncStatus: "synced",
      routeId: routeRef.id,
      endedAt: FieldValue.serverTimestamp(),
      finalPointCount: evidencePoints.length,
      finalAcceptedPointCount: accepted.length,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(zoneRef, {
      routeId: routeRef.id,
      activeTrackingSessionId: FieldValue.delete(),
      gpsTracking: false,
      gpsRoutePointCount: compatible.length,
      gpsRouteSimulated: false,
      gpsTrackingEndedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (freshPointer.exists && freshPointer.data()?.sessionId === sessionId) {
      transaction.delete(pointerRef);
    }
  });
  return {routeId: routeRef.id, status: "completed", pointCount: compatible.length};
});

exports.cancelTrackingSession = trackingCallable("cancelTrackingSession", async (request) => {
  assertTrackingPayload(request.data, new Set(["sessionId", "reason"]), 8192);
  const context = await authenticatedUserContext(
    request,
    "Sign in before stopping GPS tracking.",
  );
  const sessionId = String(request.data?.sessionId || "").trim();
  const reason = String(request.data?.reason || "cancelled").slice(0, 120);
  if (!sessionId) throw new HttpsError("invalid-argument", "Session is required.");
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  let resultStatus = "cancelled";
  await db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || !session ||
        (session.scalerId !== context.uid && !context.isAdmin)) {
      throw new HttpsError("permission-denied", "This tracking session is not yours.");
    }
    if (session.status === "completed" || session.status === "cancelled") {
      resultStatus = session.status;
      return;
    }
    if (session.status === "finalizing") {
      throw new HttpsError("failed-precondition", "Completion is already finalizing.");
    }
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "This session cannot be cancelled.");
    }
    const pointerRef = db.collection("activeTrackingSessions").doc(session.scalerId);
    const zoneRef = db.collection("campaignZones").doc(session.zoneId);
    const pointer = await transaction.get(pointerRef);
    const zone = await transaction.get(zoneRef);
    transaction.update(sessionRef, {
      status: "cancelled",
      syncStatus: "closed",
      stopReason: reason,
      endedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (zone.exists) transaction.update(zoneRef, {
      status: "accepted",
      activeTrackingSessionId: FieldValue.delete(),
      gpsTracking: false,
      gpsTrackingEndedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (pointer.exists && pointer.data()?.sessionId === sessionId) {
      transaction.delete(pointerRef);
    }
  });
  return {status: resultStatus};
});

exports.registerTrackingCheckpoint = trackingCallable(
  "registerTrackingCheckpoint", async (request) => {
  assertTrackingPayload(request.data, new Set([
    "sessionId", "storagePath", "location",
  ]), TRACKING_LIMITS.maxCheckpointPayloadBytes);
  const context = await requireVerifiedUser(
    request,
    "Sign in before adding a checkpoint.",
  );
  const sessionId = String(request.data?.sessionId || "").trim();
  const storagePath = String(request.data?.storagePath || "").trim();
  const expectedPrefix = `tracking_checkpoints/${context.uid}/${sessionId}/`;
  if (!sessionId || !storagePath.startsWith(expectedPrefix) ||
      storagePath.length <= expectedPrefix.length || storagePath.includes("..")) {
    throw new HttpsError("invalid-argument", "Checkpoint photo is required.");
  }
  let photoMetadata;
  try {
    [photoMetadata] = await getStorage().bucket().file(storagePath).getMetadata();
  } catch (error) {
    logger.warn("Checkpoint object lookup failed", {sessionId, storagePath, error: String(error)});
    throw new HttpsError("failed-precondition", "The checkpoint photo is unavailable.");
  }
  const contentType = String(photoMetadata.contentType || "").toLowerCase();
  const photoSize = Number(photoMetadata.size || 0);
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(contentType) ||
      !Number.isFinite(photoSize) || photoSize < 1 ||
      photoSize > TRACKING_LIMITS.maxPhotoBytes) {
    throw new HttpsError("invalid-argument", "The checkpoint photo is not an allowed image.");
  }
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  const checkpointRef = sessionRef.collection("checkpoints").doc();
  await db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || !session || session.scalerId !== context.uid) {
      throw new HttpsError("permission-denied", "This active tracking session is not yours.");
    }
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "This tracking session is closed.");
    }
    if (Number(session.checkpointCount || 0) >=
        TRACKING_LIMITS.maxCheckpointsPerSession) {
      throw new HttpsError("resource-exhausted", "This session reached its checkpoint limit.");
    }
    const nowMs = Date.now();
    const startedAtMs = trackingTimestampMs(session.startedAt, nowMs);
    let point;
    try {
      point = normalizePoint(request.data?.location, {
        sessionId,
        campaignId: session.campaignId,
        zoneId: session.zoneId,
        scalerId: context.uid,
        nowMs,
        startedAtMs,
        previousPoint: session.lastEvidencePoint || null,
      });
    } catch (_) {
      throw new HttpsError("invalid-argument", "Checkpoint location is invalid.");
    }
    const receiptDeltaMs = Math.abs(nowMs - point.timestampMs);
    const checkpointFlags = [...point.flags];
    if (receiptDeltaMs > 10 * 60 * 1000) checkpointFlags.push("stale_checkpoint_time");
    transaction.create(checkpointRef, {
      sessionId,
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      scalerId: context.uid,
      storagePath,
      storageGeneration: String(photoMetadata.generation || ""),
      contentType,
      size: photoSize,
      location: firestoreTrackingPoint({...point, flags: checkpointFlags}),
      measurementTimestampMs: point.timestampMs,
      receivedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(sessionRef, {
      checkpointCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {checkpointId: checkpointRef.id};
});

exports._trackingTest = {
  trackingLimits: TRACKING_LIMITS,
  normalizeChunk,
  normalizePoint,
  compatibilityRoutePoints,
  canonicalChunkId,
};

// ---------------------------------------------------------------------------
// Stripe marketplace (sandbox-ready, server-authoritative)
// ---------------------------------------------------------------------------

const MARKETPLACE_FUNCTION_OPTIONS = {
  enforceAppCheck: false,
  maxInstances: 10,
  concurrency: 20,
  timeoutSeconds: 60,
  memory: "256MiB",
  secrets: [STRIPE_SECRET_KEY],
};

function safeStripeCallable(name, handler) {
  return onCall(MARKETPLACE_FUNCTION_OPTIONS, async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`${name} failed.`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "The financial operation could not be completed.");
    }
  });
}

async function requireFinancialRole(request, role, message) {
  const context = await requireVerifiedUser(request, message);
  if (!context.isAdmin && context.role !== role) {
    throw new HttpsError("permission-denied", `Only a ${role} can perform this operation.`);
  }
  return context;
}

function firestoreFinancialOperationStore() {
  return {
    async claim(input) {
      const ref = db.collection("financialOperations").doc(input.operationId);
      let result;
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.data() || {};
        if (current.inputDigest && current.inputDigest !== input.inputDigest) {
          result = {status: "conflict", execute: false}; return;
        }
        if (current.status === "succeeded") {
          result = {status: "succeeded", execute: false, result: current.result}; return;
        }
        if (current.status === "processing") {
          result = {status: "processing", execute: false}; return;
        }
        transaction.set(ref, {...input, status: "processing",
          attempt: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
          createdAt: snapshot.exists ? current.createdAt : FieldValue.serverTimestamp()}, {merge: true});
        result = {status: "processing", execute: true};
      });
      return result;
    },
    async get(operationId) {
      const snapshot = await db.collection("financialOperations").doc(operationId).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    succeed(operationId, result) {
      return db.collection("financialOperations").doc(operationId).set({status: "succeeded", result,
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    },
    fail(operationId, failure) {
      return db.collection("financialOperations").doc(operationId).set({
        status: failure.retryable ? "failed_retryable" : "failed_terminal",
        lastErrorCode: failure.code, updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },
  };
}

async function marketplaceCustomer(stripe, context) {
  const customerRef = db.collection("stripeCustomers").doc(context.uid);
  const current = await customerRef.get();
  if (current.exists && current.data()?.stripeCustomerId) {
    return current.data().stripeCustomerId;
  }
  const operationId = marketplace.operationId("customer", context.uid);
  const result = await runFinancialOperation({
    store: firestoreFinancialOperationStore(), operationId, kind: "customer_creation",
    trustedInput: {businessId: context.uid},
    reconcile: async () => {
      const snapshot = await customerRef.get();
      return snapshot.data()?.stripeCustomerId ? {stripeCustomerId: snapshot.data().stripeCustomerId} : null;
    },
    execute: async () => {
      const user = await getAuth().getUser(context.uid);
      const customer = await stripe.customers.create({email: user.email || undefined,
        name: user.displayName || undefined, metadata: {firebaseUid: context.uid}},
      {idempotencyKey: marketplace.stripeIdempotencyKey("customer", context.uid)});
      await customerRef.set({businessId: context.uid, stripeCustomerId: customer.id,
        mode: customer.livemode ? "live" : "test", updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()}, {merge: true});
      return {stripeCustomerId: customer.id};
    },
  });
  return result.stripeCustomerId;
}

exports.getMarketplacePolicy = safeStripeCallable("getMarketplacePolicy", async (request) => {
  await requireVerifiedUser(request, "Sign in to view marketplace pricing.");
  return {
    currency: marketplace.CURRENCY,
    platformFeeBasisPoints: marketplace.PLATFORM_FEE_BASIS_POINTS,
    platformFeeLabel: "ScaledCircle Platform Fee",
    reviewWindowHours: marketplace.REVIEW_WINDOW_HOURS,
    promotionalCreditsAreCash: false,
  };
});

exports.quoteCampaignFunding = safeStripeCallable("quoteCampaignFunding", async (request) => {
  await requireFinancialRole(
    request, "business", "Sign in as a Business to request campaign pricing.",
  );
  const workerAmountCents = Number(request.data?.workerAmountCents);
  try {
    return {...marketplace.quoteCampaignFunding(workerAmountCents), quoteVersion: 1};
  } catch (_) {
    throw new HttpsError("invalid-argument", "The worker amount is invalid.");
  }
});

// Purchased wallet credits are intentionally retired for marketplace money.
// Historical promotional balances remain readable but cannot fund Scaler pay.
exports.createCreditCheckoutSession = safeStripeCallable(
  "createCreditCheckoutSession",
  async (request) => {
    await requireFinancialRole(
      request, "business", "Sign in as a Business to view funding options.",
    );
    throw new HttpsError(
      "failed-precondition",
      "Purchased credits are retired. Fund campaigns directly through secure checkout.",
    );
  },
);

exports.publishFundedCampaign = safeStripeCallable(
  "publishFundedCampaign",
  async (request) => {
    const context = await requireFinancialRole(
      request, "business", "Sign in as a Business to launch a campaign.",
    );
    const campaignId = cleanId(request.data?.campaignId);
    if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const zonesQuery = db.collection("campaignZones").where("campaignId", "==", campaignId);
    await db.runTransaction(async (transaction) => {
      const campaignSnapshot = await transaction.get(campaignRef);
      if (!campaignSnapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
      const campaign = campaignSnapshot.data() || {};
      if (!context.isAdmin && campaign.businessId !== context.uid) {
        throw new HttpsError("permission-denied", "You do not own this campaign.");
      }
      if (campaign.status === "open") return;
      if (campaign.status !== "draft" || campaign.fundingStatus !== "funded" ||
          !cleanId(campaign.fundingPaymentId)) {
        throw new HttpsError(
          "failed-precondition", "Backend-confirmed campaign funding is required before launch.",
        );
      }
      transaction.update(campaignRef, {
        status: "open",
        publishedAt: FieldValue.serverTimestamp(),
        zonesLockedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    const zones = await zonesQuery.get();
    const batch = db.batch();
    for (const zone of zones.docs) {
      batch.update(zone.ref, {
        mapLocked: true,
        mapLockedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    return {campaignId, status: "open", zonesLocked: zones.size};
  },
);

exports.createScalerConnectedAccount = safeStripeCallable(
  "createScalerConnectedAccount",
  async (request) => {
    const context = await requireFinancialRole(
      request, "scaler", "Sign in as a Scaler to set up payouts.",
    );
    const accountRef = db.collection("stripeConnectedAccounts").doc(context.uid);
    const existing = await accountRef.get();
    if (existing.exists && existing.data()?.stripeAccountId) {
      return {...existing.data(), created: false};
    }
    const stripe = stripeClient();
    const operationId = marketplace.operationId("account-v2", context.uid);
    const result = await runFinancialOperation({
      store: firestoreFinancialOperationStore(), operationId, kind: "connected_account_creation",
      trustedInput: {authenticatedScalerId: context.uid},
      reconcile: async () => {
        const current = await accountRef.get();
        return current.data()?.stripeAccountId ? {account: current.data()} : null;
      },
      execute: async () => {
        const authUser = await getAuth().getUser(context.uid);
        if (!authUser.email) {
          throw new HttpsError("failed-precondition", "A verified email is required.");
        }
        const account = await stripe.v2.core.accounts.create({contact_email: authUser.email,
          display_name: authUser.displayName || "ScaledCircle Scaler", dashboard: "express",
          configuration: {recipient: {capabilities: {stripe_balance: {
            stripe_transfers: {requested: true}}}}},
          include: ["configuration.recipient", "identity", "requirements"]},
        {idempotencyKey: marketplace.stripeIdempotencyKey("account-v2", context.uid)});
        const sanitized = marketplace.sanitizedConnectedAccount(account);
        await accountRef.set({scalerId: context.uid, ...sanitized,
          mode: account.livemode ? "live" : "test", createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        return {account: sanitized};
      },
    });
    return {...result.account, created: result.recovered !== true};
  },
);

async function retrieveScalerAccount(stripe, scalerId) {
  const ref = db.collection("stripeConnectedAccounts").doc(scalerId);
  const snapshot = await ref.get();
  if (!snapshot.exists || !snapshot.data()?.stripeAccountId) {
    throw new HttpsError("failed-precondition", "Create a Stripe payout account first.");
  }
  const account = await stripe.v2.core.accounts.retrieve(
    snapshot.data().stripeAccountId,
    {include: ["configuration.recipient", "identity", "requirements"]},
  );
  const sanitized = marketplace.sanitizedConnectedAccount(account);
  await ref.set({...sanitized, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return sanitized;
}

exports.refreshScalerConnectedAccountStatus = safeStripeCallable(
  "refreshScalerConnectedAccountStatus",
  async (request) => {
    const context = await requireFinancialRole(
      request, "scaler", "Sign in as a Scaler to refresh payout status.",
    );
    return retrieveScalerAccount(stripeClient(), context.uid);
  },
);

exports.createScalerOnboardingLink = safeStripeCallable(
  "createScalerOnboardingLink",
  async (request) => {
    const context = await requireFinancialRole(
      request, "scaler", "Sign in as a Scaler to continue onboarding.",
    );
    const returnUrl = `${publicAppBaseUrl()}/?connect=return`;
    const refreshUrl = `${publicAppBaseUrl()}/?connect=refresh`;
    const stripe = stripeClient();
    const stored = await db.collection("stripeConnectedAccounts").doc(context.uid).get();
    if (!stored.exists || !stored.data()?.stripeAccountId) {
      throw new HttpsError("failed-precondition", "Create a Stripe payout account first.");
    }
    const link = await stripe.v2.core.accountLinks.create({
      account: stored.data().stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    }, {idempotencyKey: marketplace.stripeIdempotencyKey(
      "account-link", context.uid, Math.floor(Date.now() / (10 * 60 * 1000)),
    )});
    return {url: link.url, expiresAt: link.expires_at || null};
  },
);

exports.createCampaignFundingCheckoutSession = safeStripeCallable(
  "createCampaignFundingCheckoutSession",
  async (request) => {
    const context = await requireFinancialRole(
      request, "business", "Sign in as a Business to fund a campaign.",
    );
    const campaignId = cleanId(request.data?.campaignId);
    if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignRef.get();
    if (!campaignSnapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
    const campaign = campaignSnapshot.data() || {};
    if (!context.isAdmin && campaign.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "You do not own this campaign.");
    }
    const fundingVersion = Number.isSafeInteger(campaign.fundingVersion) ?
      campaign.fundingVersion + 1 : 1;
    const quote = marketplace.quoteCampaignFunding(
      marketplace.campaignWorkerAmountCents(campaign),
    );
    const paymentId = marketplace.operationId(
      "campaign-payment", campaignId, fundingVersion,
    );
    const paymentRef = db.collection("campaignPayments").doc(paymentId);
    const existing = await paymentRef.get();
    if (existing.exists && existing.data()?.stripeCheckoutUrl) {
      return {paymentId, url: existing.data().stripeCheckoutUrl, quote, recovered: true};
    }
    const stripe = stripeClient();
    const operationId = marketplace.operationId("campaign-checkout", campaignId, fundingVersion);
    const result = await runFinancialOperation({
      store: firestoreFinancialOperationStore(), operationId, kind: "campaign_checkout_creation",
      trustedInput: {campaignId, businessId: context.uid, fundingVersion,
        businessChargeCents: quote.businessChargeCents},
      reconcile: async () => {
        const current = await paymentRef.get();
        const data = current.data() || {};
        return data.stripeCheckoutSessionId && data.stripeCheckoutUrl ? {
          sessionId: data.stripeCheckoutSessionId, url: data.stripeCheckoutUrl,
        } : null;
      },
      execute: async () => {
        const customer = await marketplaceCustomer(stripe, context);
        await paymentRef.set({id: paymentId, businessId: context.uid, campaignId, fundingVersion,
          stripeCustomerId: customer, ...quote, status: marketplace.PAYMENT_STATES.pending,
          transferredWorkerAmountCents: 0, reservedWorkerAmountCents: 0,
          refundedWorkerAmountCents: 0, refundedPlatformFeeCents: 0, refundedTotalCents: 0,
          disputedAmountCents: 0, platformFeePendingCents: quote.platformFeeCents,
          platformFeeRecognizedCents: 0, platformFeeRefundedCents: 0,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()},
        {merge: false});
        const session = await stripe.checkout.sessions.create({mode: "payment", customer,
          client_reference_id: paymentId,
          line_items: [{quantity: 1, price_data: {currency: quote.currency,
            unit_amount: quote.businessChargeCents,
            product_data: {name: `ScaledCircle campaign funding: ${readText(campaign.name, 80) || campaignId}`}}}],
          payment_intent_data: {transfer_group: `campaign_${campaignId}`,
            metadata: {paymentId, campaignId, businessId: context.uid}},
          success_url: `${publicAppBaseUrl()}/?campaignFunding=return`,
          cancel_url: `${publicAppBaseUrl()}/?campaignFunding=cancelled`,
          metadata: {paymentId, campaignId, businessId: context.uid,
            purchaseType: "campaign_funding_v2"}},
        {idempotencyKey: marketplace.stripeIdempotencyKey("campaign-checkout", paymentId)});
        await paymentRef.update({stripeCheckoutSessionId: session.id,
          stripeCheckoutUrl: session.url, updatedAt: FieldValue.serverTimestamp()});
        return {sessionId: session.id, url: session.url};
      },
    });
    return {paymentId, ...result, quote};
  },
);

async function claimStripeEvent(event) {
  const ref = db.collection("stripeEvents").doc(event.id);
  let claimed = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = snapshot.data()?.status;
    if (state === "processed" || state === "failed_terminal") return;
    // A failed delivery is deliberately claimable again. Stripe retries use
    // the same event ID, while the durable event record prevents duplicate
    // dependent operations. A currently processing delivery is left alone.
    if (state === "processing") {
      const updatedAt = snapshot.data()?.updatedAt;
      const leaseAgeMs = updatedAt instanceof Timestamp ?
        Date.now() - updatedAt.toMillis() : 0;
      if (leaseAgeMs < 5 * 60 * 1000) return;
    }
    transaction.set(ref, {
      stripeEventId: event.id,
      type: event.type,
      livemode: event.livemode === true,
      status: "processing",
      attempts: FieldValue.increment(1),
      receivedAt: snapshot.exists ? snapshot.data().receivedAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    claimed = true;
  });
  return {ref, claimed};
}

async function processCampaignCheckout(stripe, event) {
  const hinted = event.data.object || {};
  const session = await stripe.checkout.sessions.retrieve(hinted.id);
  const paymentRef = db.collection("campaignPayments").doc(session.client_reference_id || "missing");
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists) throw new Error("campaign_payment_record_missing");
  const record = {id: paymentSnapshot.id, ...paymentSnapshot.data()};
  marketplace.validatePaymentAgainstRecord(session, record);
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(paymentRef);
    const current = fresh.data() || {};
    if (current.status === marketplace.PAYMENT_STATES.funded) return;
    if (current.status !== marketplace.PAYMENT_STATES.pending) {
      throw new Error("invalid_campaign_payment_transition");
    }
    transaction.update(paymentRef, {
      status: marketplace.PAYMENT_STATES.funded,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      fundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(db.collection("campaigns").doc(current.campaignId), {
      fundingStatus: "funded",
      fundingPaymentId: paymentRef.id,
      fundingVersion: current.fundingVersion,
      workerAmountCents: current.workerAmountCents,
      platformFeeCents: current.platformFeeCents,
      businessChargeCents: current.businessChargeCents,
      fundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function stripeAccountIdFromSnapshotEvent(event) {
  return cleanId(
    event.data?.object?.account || event.account,
  );
}

async function reconcileScalerAccountFromStripe(stripe, stripeAccountId, extra = {}) {
  if (!stripeAccountId) throw new Error("stripe_account_reference_missing");
  const matches = await db.collection("stripeConnectedAccounts")
    .where("stripeAccountId", "==", stripeAccountId).limit(1).get();
  if (matches.empty) {
    logger.warn("Ignored Stripe account event without a ScaledCircle owner.", {stripeAccountId});
    return null;
  }
  // Accounts v2 webhook payloads are thin. Always fetch current state before
  // writing sanitized capability/requirements fields.
  const account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
    include: ["configuration.recipient", "identity", "requirements"],
  });
  const sanitized = marketplace.sanitizedConnectedAccount(account);
  const ref = matches.docs[0].ref;
  await ref.set({...sanitized, ...extra, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  if (sanitized.transfersStatus === "active") {
    const waiting = await db.collection("scalerTransfers")
      .where("scalerId", "==", matches.docs[0].id)
      .where("status", "==", "waiting_for_account").limit(100).get();
    const batch = db.batch();
    for (const snapshot of waiting.docs) {
      batch.update(snapshot.ref, {status: marketplace.TRANSFER_STATES.pending,
        updatedAt: FieldValue.serverTimestamp()});
    }
    if (!waiting.empty) await batch.commit();
  }
  return sanitized;
}

async function processStripeEvent(stripe, event) {
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    const session = event.data.object;
    if (session.metadata?.purchaseType === "campaign_funding_v2") {
      await processCampaignCheckout(stripe, event);
    } else if (session.metadata?.purchaseType === "credits") {
      logger.warn("Ignored retired purchased-credit Checkout completion.", {eventId: event.id});
    }
  } else if (event.type === "checkout.session.async_payment_failed" ||
      event.type === "payment_intent.payment_failed") {
    let resource = event.data.object || {};
    if (event.type === "payment_intent.payment_failed" && resource.id) {
      resource = await stripe.paymentIntents.retrieve(resource.id);
    } else if (resource.id) {
      resource = await stripe.checkout.sessions.retrieve(resource.id);
    }
    const paymentId = cleanId(resource.metadata?.paymentId || resource.client_reference_id);
    if (paymentId) {
      const paymentRef = db.collection("campaignPayments").doc(paymentId);
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(paymentRef);
        if (!current.exists || current.data()?.status !== marketplace.PAYMENT_STATES.pending) return;
        transaction.update(paymentRef, {status: marketplace.PAYMENT_STATES.failed,
          updatedAt: FieldValue.serverTimestamp()});
      });
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    const current = await stripe.subscriptions.retrieve(event.data.object.id);
    await syncStripeSubscription(current, `${event.id}_subscription`);
  } else if (event.type.startsWith("charge.dispute.")) {
    const dispute = await stripe.disputes.retrieve(event.data.object.id);
    const paymentId = cleanId(dispute.metadata?.paymentId);
    if (paymentId) await db.collection("campaignPayments").doc(paymentId).set({
      status: marketplace.PAYMENT_STATES.disputed,
      disputedAmountCents: Number(dispute.amount || 0),
      settlementFrozen: dispute.status !== "won",
      stripeDisputeId: dispute.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } else if (["refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
    const refund = await stripe.refunds.retrieve(event.data.object.id);
    const paymentId = cleanId(refund.metadata?.paymentId);
    const refundOperationId = cleanId(refund.metadata?.refundOperationId);
    if (refundOperationId) {
      await db.collection("financialOperations").doc(refundOperationId).set({
        status: refund.status === "succeeded" ? "processed" :
          refund.status === "failed" || event.type === "refund.failed" ? "failed_terminal" : "processing",
        stripeRefundId: refund.id || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    if (paymentId && refund.status === "succeeded") {
      await db.collection("campaignPayments").doc(paymentId).set({
        lastStripeRefundId: refund.id || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  } else if (event.type === "transfer.created") {
    const transfer = event.data.object || {};
    const operationId = cleanId(transfer.metadata?.transferOperationId);
    if (operationId) await db.collection("scalerTransfers").doc(operationId).set({
      stripeTransferId: transfer.id || null,
      transferCreatedEventId: event.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } else if (event.type === "transfer.reversed") {
    const transfer = await stripe.transfers.retrieve(event.data.object.id);
    const operationId = cleanId(transfer.metadata?.transferOperationId);
    if (operationId && transfer.reversed === true) {
      await db.collection("scalerTransfers").doc(operationId).set({
        status: marketplace.TRANSFER_STATES.reversed,
        reversedAmountCents: Number(transfer.amount_reversed || transfer.amount || 0),
        bankPayoutStatus: "not_observed",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  } else if (event.type === "payout.failed") {
    await reconcileScalerAccountFromStripe(stripe, stripeAccountIdFromSnapshotEvent(event), {
      bankPayoutStatus: "attention_required",
      payoutAttention: {
        code: "payout_failed",
        stripePayoutId: cleanId(event.data.object?.id),
        observedAt: FieldValue.serverTimestamp(),
      },
    });
  }
}

async function processStripeThinEvent(stripe, event) {
  // The signed thin payload identifies only the resource to retrieve. Current
  // Accounts v2 state, never payload capability fields, drives sanitized state.
  await reconcileScalerAccountFromStripe(stripe, stripeAccountIdFromThinEvent(event));
}

function stripeModeMatchesEnvironment(event) {
  const environment = String(process.env.SCALEDCIRCLE_ENV || "local").toLowerCase();
  // Snapshot Events include livemode. Thin Event Notifications may not; their
  // independently configured endpoint secret is the environment boundary.
  return typeof event.livemode !== "boolean" ||
    (environment === "production") === (event.livemode === true);
}

async function processClaimedStripeEvent(event, processor) {
  const {ref, claimed} = await claimStripeEvent(event);
  if (!claimed) return {received: true, duplicate: true};
  try {
    await processor(event);
    await ref.set({status: "processed", processedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {received: true};
  } catch (error) {
    await ref.set({
      status: error?.retryable === false ? "failed_terminal" : "failed_retryable",
      lastErrorCode: error?.code || "processing_failed",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    throw error;
  }
}

async function handleStripeWebhook(request, response, {secret, parseEvent, processEvent, label}) {
  if (request.method !== "POST") return response.status(405).send("Method Not Allowed");
  let event;
  try {
    const stripe = stripeClient();
    event = parseEvent({
      stripe,
      rawBody: request.rawBody,
      signature: request.headers["stripe-signature"],
      secret: secret.value(),
    });
    if (!stripeModeMatchesEnvironment(event)) {
      logger.error("Stripe webhook mode did not match the configured environment.", {
        eventId: event.id, eventType: event.type, endpoint: label,
      });
      return response.status(400).send("Stripe webhook mode mismatch.");
    }
    const result = await processClaimedStripeEvent(event, (verified) => processEvent(stripe, verified));
    return response.status(200).json(result);
  } catch (error) {
    logger.error("Stripe webhook processing failed.", {
      eventId: event?.id || null,
      eventType: event?.type || null,
      endpoint: label,
      errorCode: error?.code || "webhook_processing_failed",
    });
    return response.status(event ? 500 : 400).send("Stripe webhook could not be processed.");
  }
}

// Canonical snapshot/v1 webhook. Accounts v2 thin events use stripeThinWebhook.
exports.stripeWebhook = onRequest(
  {
    maxInstances: 10,
    concurrency: 20,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: STRIPE_CHECKOUT_SECRETS.concat([STRIPE_WEBHOOK_SECRET]),
  },
  (request, response) => handleStripeWebhook(request, response, {
    secret: STRIPE_WEBHOOK_SECRET,
    parseEvent: parseSnapshotEvent,
    processEvent: processStripeEvent,
    label: "snapshot",
  }),
);

// Canonical Accounts v2 thin-event webhook with an independent signing secret.
exports.stripeThinWebhook = onRequest(
  {
    maxInstances: 10,
    concurrency: 20,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [STRIPE_SECRET_KEY, STRIPE_THIN_WEBHOOK_SECRET],
  },
  (request, response) => handleStripeWebhook(request, response, {
    secret: STRIPE_THIN_WEBHOOK_SECRET,
    parseEvent: parseThinEvent,
    processEvent: processStripeThinEvent,
    label: "accounts_v2_thin",
  }),
);

async function queueScalerTransfer(zoneId, releaseOptionalBonus = false) {
  if (!zoneId) throw new HttpsError("invalid-argument", "A zone is required.");
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const zoneSnapshot = await zoneRef.get();
  if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Zone not found.");
  const zone = zoneSnapshot.data() || {};
  const campaignRef = db.collection("campaigns").doc(zone.campaignId || "missing");
  const campaignSnapshot = await campaignRef.get();
  const campaign = campaignSnapshot.data() || {};
  const contractRef = db.collection("assignmentCompensations").doc(zoneId);
  const contractSnapshot = await contractRef.get();
  const paymentRef = db.collection("campaignPayments").doc(
    zone.fundingPaymentId || campaign.fundingPaymentId || "missing",
  );
  const paymentSnapshot = await paymentRef.get();
  const connectedRef = db.collection("stripeConnectedAccounts").doc(zone.assignedScalerId || "missing");
  const connectedSnapshot = await connectedRef.get();
  const routeRef = db.collection("campaignRoutes").doc(zone.routeId || "missing");
  const routeSnapshot = await routeRef.get();
  const completionRef = db.collection("campaignCompletions")
    .doc(zone.submittedCompletionId || "missing");
  const completionSnapshot = await completionRef.get();
  if (!campaignSnapshot.exists || !contractSnapshot.exists ||
      !paymentSnapshot.exists ||
      !routeSnapshot.exists || !completionSnapshot.exists) {
    throw new HttpsError("failed-precondition", "Financial prerequisites are incomplete.");
  }
  const payment = paymentSnapshot.data() || {};
  const connected = connectedSnapshot.data() || {};
  const route = routeSnapshot.data() || {};
  const completion = completionSnapshot.data() || {};
  const completionBasisPoints = Math.round(Number(zone.completionPercentage || 0) * 100);
  const payout = marketplace.payoutForCompletion(
    contractSnapshot.data(), completionBasisPoints, releaseOptionalBonus,
  );
  if (payment.status !== marketplace.PAYMENT_STATES.funded || payment.settlementFrozen === true ||
      zone.verificationPassed !== true || !["approved", "auto_approved"].includes(zone.reviewStatus) ||
      zone.redoRequired === true ||
      route.scalerId !== zone.assignedScalerId || route.zoneId !== zoneId ||
      route.campaignId !== zone.campaignId || route.tracking === true ||
      completion.scalerId !== zone.assignedScalerId || completion.zoneId !== zoneId ||
      completion.campaignId !== zone.campaignId || completion.status !== "submitted" ||
      completion.compensationContractId !== contractRef.id) {
    throw new HttpsError("failed-precondition", "This work is not eligible for transfer.");
  }
  const transferId = marketplace.operationId("scaler-transfer", zoneId, 1);
  const transferRef = db.collection("scalerTransfers").doc(transferId);
  await db.runTransaction(async (transaction) => {
    const [existingTransfer, freshPayment] = await Promise.all([
      transaction.get(transferRef), transaction.get(paymentRef),
    ]);
    if (existingTransfer.exists) return;
    marketplace.assertAllocationAvailable(freshPayment.data() || {}, payout.transferAmountCents);
    const ready = connectedSnapshot.exists && connected.transfersStatus === "active" &&
      cleanId(connected.stripeAccountId);
    transaction.create(transferRef, {
    transferOperationId: transferId,
    paymentId: paymentSnapshot.id,
    campaignId: zone.campaignId,
    zoneId,
    businessId: zone.businessId,
    scalerId: zone.assignedScalerId,
    currency: marketplace.CURRENCY,
    amountCents: payout.transferAmountCents,
    baseAmountCents: payout.baseAmountCents,
    bonusAmountCents: payout.bonusAmountCents,
    earningsVersion: 1,
    status: ready ? marketplace.TRANSFER_STATES.pending : marketplace.TRANSFER_STATES.waitingForAccount,
    bankPayoutStatus: "not_observed",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(paymentRef, {
      reservedWorkerAmountCents: FieldValue.increment(payout.transferAmountCents),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {transferRef, transferId, transfer: (await transferRef.get()).data(),
    paymentRef, zoneRef, connected, payout};
}

async function executeQueuedScalerTransfer(transferId) {
  const transferRef = db.collection("scalerTransfers").doc(transferId);
  const initial = await transferRef.get();
  if (!initial.exists) throw new Error("transfer_operation_missing");
  const reserved = initial.data() || {};
  if (reserved.status === marketplace.TRANSFER_STATES.submitted) {
    return {transferOperationId: transferId, status: reserved.status, recovered: true};
  }
  if (reserved.status === marketplace.TRANSFER_STATES.waitingForAccount) {
    return {transferOperationId: transferId, status: reserved.status, recovered: true};
  }
  const connectedRef = db.collection("stripeConnectedAccounts").doc(reserved.scalerId || "missing");
  const connected = (await connectedRef.get()).data() || {};
  if (connected.transfersStatus !== "active" || !cleanId(connected.stripeAccountId)) {
    await transferRef.set({status: marketplace.TRANSFER_STATES.waitingForAccount,
      updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {transferOperationId: transferId, status: marketplace.TRANSFER_STATES.waitingForAccount};
  }
  let claimedExecutor = false;
  const executorLeaseStartedAtMillis = Date.now();
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(transferRef);
    const current = fresh.data() || {};
    const leaseIsFresh = current.executorClaimed === true &&
      Number.isSafeInteger(current.executorLeaseStartedAtMillis) &&
      executorLeaseStartedAtMillis - current.executorLeaseStartedAtMillis < 5 * 60 * 1000;
    if (current.status !== marketplace.TRANSFER_STATES.pending || leaseIsFresh) return;
    transaction.update(transferRef, {executorClaimed: true,
      executorLeaseStartedAtMillis,
      executorClaimedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    claimedExecutor = true;
  });
  if (!claimedExecutor) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = (await transferRef.get()).data() || {};
      if (current.status === marketplace.TRANSFER_STATES.submitted) {
        return {transferOperationId: transferId, status: current.status, recovered: true};
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("transfer_operation_in_progress");
  }
  try {
    const transfer = await stripeClient().transfers.create({
      amount: reserved.amountCents,
      currency: marketplace.CURRENCY,
      destination: connected.stripeAccountId,
      transfer_group: `campaign_${reserved.campaignId}`,
      metadata: {transferOperationId: transferId, campaignId: reserved.campaignId,
        zoneId: reserved.zoneId},
    }, {idempotencyKey: marketplace.stripeIdempotencyKey("transfer", transferId)});
    const paymentRef = db.collection("campaignPayments").doc(reserved.paymentId);
    const zoneRef = db.collection("campaignZones").doc(reserved.zoneId);
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(transferRef);
      if (fresh.data()?.status === marketplace.TRANSFER_STATES.submitted) return;
      transaction.update(transferRef, {status: marketplace.TRANSFER_STATES.submitted,
        stripeTransferId: transfer.id, transferredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()});
      transaction.update(paymentRef, {
        transferredWorkerAmountCents: FieldValue.increment(reserved.amountCents),
        reservedWorkerAmountCents: FieldValue.increment(-reserved.amountCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(zoneRef, {paymentStatus: "transferred_to_connected_account",
        transferOperationId: transferId, paidAmountCents: reserved.amountCents,
        updatedAt: FieldValue.serverTimestamp()});
    });
    return {transferOperationId: transferId, status: marketplace.TRANSFER_STATES.submitted};
  } catch (error) {
    await transferRef.set({executorClaimed: false, executorLeaseStartedAtMillis: FieldValue.delete(),
      status: marketplace.TRANSFER_STATES.pending,
      retryableErrorCode: "stripe_transfer_retryable", updatedAt: FieldValue.serverTimestamp()},
    {merge: true});
    throw error;
  }
}

exports.createScalerTransfer = safeStripeCallable("createScalerTransfer", async (request) => {
  const context = await requireVerifiedUser(request, "Sign in to finalize a transfer.");
  const zoneId = cleanId(request.data?.zoneId);
  const zoneSnapshot = await db.collection("campaignZones").doc(zoneId || "missing").get();
  if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Zone not found.");
  if (!context.isAdmin && zoneSnapshot.data()?.businessId !== context.uid) {
    throw new HttpsError("permission-denied", "Only the campaign Business may approve work.");
  }
  const queued = await queueScalerTransfer(zoneId, request.data?.releaseOptionalBonus === true);
  return executeQueuedScalerTransfer(queued.transferId);
});

exports.finalizeZoneReview = safeStripeCallable("finalizeZoneReview", async (request) => {
  const context = await requireVerifiedUser(request, "Sign in to review completed work.");
  const zoneId = cleanId(request.data?.zoneId);
  const decision = String(request.data?.decision || "");
  const feedback = String(request.data?.feedback || "").trim().slice(0, 2000);
  const releaseOptionalBonus = request.data?.releaseOptionalBonus === true;
  if (!zoneId || !["approve", "request_redo", "dispute"].includes(decision)) {
    throw new HttpsError("invalid-argument", "A valid zone and review decision are required.");
  }
  if (decision !== "approve" && !feedback) {
    throw new HttpsError("invalid-argument", "Review feedback is required.");
  }
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  return db.runTransaction(async (transaction) => {
    const zoneSnapshot = await transaction.get(zoneRef);
    if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Zone not found.");
    const zone = zoneSnapshot.data() || {};
    if (!context.isAdmin && zone.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "Only the campaign Business may review this work.");
    }
    const current = String(zone.reviewStatus || "");
    const target = decision === "approve" ? "approved" :
      decision === "request_redo" ? "redo_required" : "disputed";
    if (["approved", "auto_approved", "disputed"].includes(current)) {
      if (current === target || (current === "auto_approved" && target === "approved")) {
        return {zoneId, reviewStatus: current, alreadyProcessed: true};
      }
      throw new HttpsError("failed-precondition", "This review is already final.");
    }
    if (current !== "verification_pending") {
      throw new HttpsError("failed-precondition", "This work is not awaiting review.");
    }
    const contractRef = db.collection("assignmentCompensations").doc(zoneId);
    const completionRef = db.collection("campaignCompletions")
      .doc(cleanId(zone.submittedCompletionId) || "missing");
    const paymentRef = db.collection("campaignPayments")
      .doc(cleanId(zone.fundingPaymentId) || "missing");
    const [contractSnapshot, completionSnapshot, paymentSnapshot] = await Promise.all([
      transaction.get(contractRef), transaction.get(completionRef), transaction.get(paymentRef),
    ]);
    if (!contractSnapshot.exists || !completionSnapshot.exists || !paymentSnapshot.exists) {
      throw new HttpsError("failed-precondition", "Review prerequisites are incomplete.");
    }
    const completion = completionSnapshot.data() || {};
    const payment = paymentSnapshot.data() || {};
    if (completion.zoneId !== zoneId || completion.scalerId !== zone.assignedScalerId ||
        completion.campaignId !== zone.campaignId || payment.campaignId !== zone.campaignId ||
        payment.businessId !== zone.businessId) {
      throw new HttpsError("failed-precondition", "Review records do not match the assignment.");
    }
    const timestamp = FieldValue.serverTimestamp();
    if (decision === "request_redo") {
      const redoCount = Number(zone.redoCount || 0);
      if (!Number.isSafeInteger(redoCount) || redoCount >= marketplace.DEFAULT_REDO_LIMIT) {
        throw new HttpsError("failed-precondition", "The redo limit has been reached.");
      }
      transaction.update(zoneRef, {
        reviewStatus: "redo_required", redoRequired: true, redoCount: redoCount + 1,
        reviewFeedback: feedback, reviewedBy: context.uid, reviewedAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.update(completionRef, {
        reviewStatus: "redo_required", reviewFeedback: feedback, updatedAt: timestamp,
      });
      return {zoneId, reviewStatus: "redo_required", redoCount: redoCount + 1};
    }
    if (decision === "dispute") {
      const disputeRef = db.collection("financialOperations")
        .doc(marketplace.operationId("work-dispute", zoneId, 1));
      transaction.update(zoneRef, {
        reviewStatus: "disputed", disputeOpen: true, reviewFeedback: feedback,
        reviewedBy: context.uid, reviewedAt: timestamp, updatedAt: timestamp,
      });
      transaction.update(paymentRef, {settlementFrozen: true, updatedAt: timestamp});
      transaction.set(disputeRef, {
        type: "work_dispute", status: "admin_review_required", zoneId,
        campaignId: zone.campaignId, paymentId: paymentSnapshot.id,
        businessId: zone.businessId, scalerId: zone.assignedScalerId,
        feedback, createdAt: timestamp, updatedAt: timestamp,
      }, {merge: false});
      return {zoneId, reviewStatus: "disputed"};
    }
    const completionBasisPoints = Math.round(Number(zone.completionPercentage || 0) * 100);
    const payout = marketplace.payoutForCompletion(
      contractSnapshot.data() || {}, completionBasisPoints, releaseOptionalBonus,
    );
    transaction.update(zoneRef, {
      reviewStatus: "approved", redoRequired: false,
      releaseOptionalBonus: payout.bonusAmountCents > 0,
      approvedTransferAmountCents: payout.transferAmountCents,
      approvedBaseAmountCents: payout.baseAmountCents,
      approvedBonusAmountCents: payout.bonusAmountCents,
      reviewedBy: context.uid, reviewedAt: timestamp, reviewFinalizedAt: timestamp,
      paymentStatus: "transfer_pending", updatedAt: timestamp,
    });
    transaction.update(completionRef, {
      reviewStatus: "approved", approvedTransferAmountCents: payout.transferAmountCents,
      reviewedAt: timestamp, updatedAt: timestamp,
    });
    return {zoneId, reviewStatus: "approved", payout};
  });
});

exports.requestCampaignCancellationRefund = safeStripeCallable(
  "requestCampaignCancellationRefund",
  async (request) => {
    const context = await requireFinancialRole(
      request, "business", "Sign in as a Business to cancel campaign funding.",
    );
    const campaignId = cleanId(request.data?.campaignId);
    if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignRef.get();
    if (!campaignSnapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
    const campaign = campaignSnapshot.data() || {};
    if (!context.isAdmin && campaign.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "You do not own this campaign.");
    }
    if (["in_progress", "submitted", "completed"].includes(campaign.status) ||
        campaign.workStartedAt || campaign.startedAt) {
      throw new HttpsError(
        "failed-precondition",
        "Work has started. Cancellation requires trusted support review.",
      );
    }
    const paymentId = cleanId(campaign.fundingPaymentId);
    if (!paymentId) throw new HttpsError("failed-precondition", "Campaign funding was not found.");
    const paymentRef = db.collection("campaignPayments").doc(paymentId);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists) throw new HttpsError("failed-precondition", "Funding record missing.");
    const payment = paymentSnapshot.data() || {};
    if (payment.businessId !== campaign.businessId || payment.campaignId !== campaignId) {
      throw new HttpsError("failed-precondition", "Funding record does not match campaign.");
    }
    if ((payment.transferredWorkerAmountCents || 0) > 0) {
      throw new HttpsError("failed-precondition", "A transfer exists; cancellation requires support review.");
    }
    if (payment.status === marketplace.PAYMENT_STATES.refunded) {
      return {paymentId, status: payment.status, recovered: true};
    }
    if (payment.status !== marketplace.PAYMENT_STATES.funded) {
      throw new HttpsError("failed-precondition", "Campaign is not eligible for an automatic refund.");
    }
    const refundAmountCents = payment.businessChargeCents - (payment.refundedTotalCents || 0);
    marketplace.assertSafeCents(refundAmountCents, "refundAmountCents");
    if (refundAmountCents <= 0) return {paymentId, status: marketplace.PAYMENT_STATES.refunded, recovered: true};
    const operationId = marketplace.operationId("campaign-refund", paymentId, "before-start-full");
    const operationRef = db.collection("financialOperations").doc(operationId);
    await db.runTransaction(async (transaction) => {
      const [operationDoc, freshPayment] = await Promise.all([
        transaction.get(operationRef), transaction.get(paymentRef),
      ]);
      if (operationDoc.exists) return;
      const current = freshPayment.data() || {};
      if (current.status !== marketplace.PAYMENT_STATES.funded) return;
      marketplace.assertAllocationAvailable(current, 0, current.workerAmountCents);
      transaction.create(operationRef, {
        operationId,
        type: "campaign_refund",
        ownerId: campaign.businessId,
        businessId: campaign.businessId,
        campaignId,
        paymentId,
        currency: marketplace.CURRENCY,
        workerRefundCents: current.workerAmountCents,
        platformFeeRefundCents: current.platformFeeCents,
        totalRefundCents: current.businessChargeCents,
        status: "processing",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(paymentRef, {
        status: marketplace.PAYMENT_STATES.refundPending,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    const operation = (await operationRef.get()).data() || {};
    if (operation.status === "processed") {
      return {paymentId, refundOperationId: operationId, status: marketplace.PAYMENT_STATES.refunded, recovered: true};
    }
    const executorToken = crypto.randomUUID();
    const executorLeaseStartedAtMillis = Date.now();
    let executorClaimed = false;
    await db.runTransaction(async (transaction) => {
      const freshOperation = await transaction.get(operationRef);
      const current = freshOperation.data() || {};
      if (current.status === "processed") return;
      const leaseIsFresh = current.executorToken &&
        Number.isSafeInteger(current.executorLeaseStartedAtMillis) &&
        executorLeaseStartedAtMillis - current.executorLeaseStartedAtMillis < 5 * 60 * 1000;
      if (leaseIsFresh) return;
      transaction.set(operationRef, {
        executorToken,
        executorLeaseStartedAtMillis,
        executorClaimedAt: FieldValue.serverTimestamp(),
        status: "processing",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      executorClaimed = true;
    });
    if (!executorClaimed) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const current = (await operationRef.get()).data() || {};
        if (current.status === "processed") {
          return {
            paymentId,
            refundOperationId: operationId,
            status: marketplace.PAYMENT_STATES.refunded,
            recovered: true,
          };
        }
        if (!current.executorToken) break;
      }
      throw new HttpsError("unavailable", "The refund is already being processed. Retry shortly.");
    }
    let refund;
    try {
      refund = await stripeClient().refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refundAmountCents,
        metadata: {refundOperationId: operationId, paymentId, campaignId},
      }, {idempotencyKey: marketplace.stripeIdempotencyKey("refund", operationId)});
    } catch (error) {
      await operationRef.set({
        status: "failed_retryable",
        executorToken: FieldValue.delete(),
        executorLeaseStartedAtMillis: FieldValue.delete(),
        executorClaimedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw error;
    }
    if (refund.status !== "succeeded" && refund.status !== "pending") {
      await operationRef.set({
        status: "failed_retryable",
        executorToken: FieldValue.delete(),
        executorLeaseStartedAtMillis: FieldValue.delete(),
        executorClaimedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw new HttpsError("unavailable", "Stripe has not confirmed the refund.");
    }
    await db.runTransaction(async (transaction) => {
      const [freshOperation, freshPayment] = await Promise.all([
        transaction.get(operationRef), transaction.get(paymentRef),
      ]);
      if (freshOperation.data()?.status === "processed") return;
      const current = freshPayment.data() || {};
      transaction.update(operationRef, {
        status: refund.status === "succeeded" ? "processed" : "processing",
        stripeRefundId: refund.id,
        executorToken: FieldValue.delete(),
        executorLeaseStartedAtMillis: FieldValue.delete(),
        executorClaimedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (refund.status === "succeeded") {
        transaction.update(paymentRef, {
          status: marketplace.PAYMENT_STATES.refunded,
          refundedWorkerAmountCents: current.workerAmountCents,
          refundedPlatformFeeCents: current.platformFeeCents,
          refundedTotalCents: current.businessChargeCents,
          platformFeePendingCents: 0,
          platformFeeRefundedCents: current.platformFeeCents,
          stripeRefundId: refund.id,
          refundedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(campaignRef, {
          fundingStatus: "refunded",
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return {paymentId, refundOperationId: operationId, status: refund.status};
  },
);

exports.autoApproveVerifiedCompletions = onSchedule(
  {schedule: "every 30 minutes", timeZone: "Etc/UTC", maxInstances: 1},
  async () => {
    const cutoff = Timestamp.fromMillis(
      Date.now() - marketplace.REVIEW_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const query = await db.collection("campaignZones")
      .where("reviewStatus", "==", "verification_pending")
      .where("verificationPassed", "==", true)
      .where("completionSubmittedAt", "<=", cutoff)
      .limit(100)
      .get();
    for (const snapshot of query.docs) {
      let approved = false;
      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(snapshot.ref);
        const zone = fresh.data() || {};
        if (zone.reviewStatus !== "verification_pending" ||
            zone.verificationPassed !== true || zone.disputeOpen === true ||
            zone.redoRequired === true) return;
        transaction.update(snapshot.ref, {
          reviewStatus: "auto_approved",
          reviewFinalizedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        approved = true;
      });
      if (approved) {
        try {
          // Auto-approval queues the exact deterministic transfer operation
          // used by explicit Business approval. The Stripe executor remains a
          // separate idempotent step; no second payout algorithm exists here.
          await queueScalerTransfer(snapshot.id, false);
        } catch (error) {
          logger.error("Auto-approved completion could not queue its transfer.", {
            zoneId: snapshot.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  },
);

exports.executeQueuedScalerTransfers = onSchedule(
  {schedule: "every 5 minutes", timeZone: "Etc/UTC", maxInstances: 1,
    secrets: [STRIPE_SECRET_KEY]},
  async () => {
    const pending = await db.collection("scalerTransfers")
      .where("status", "==", marketplace.TRANSFER_STATES.pending).limit(50).get();
    for (const snapshot of pending.docs) {
      try {
        await executeQueuedScalerTransfer(snapshot.id);
      } catch (error) {
        logger.error("Queued Scaler transfer remains retryable.", {
          transferOperationId: snapshot.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

exports._marketplaceTest = marketplace;

// Retired cash-wallet settlement callables. Keeping controlled stubs avoids a
// silent client break while ensuring no caller can bypass the Connect transfer
// and server-authoritative review state machines.
for (const legacyName of ["approveZonePayout", "requestZoneRedo", "dropZoneScaler"]) {
  exports[legacyName] = onCall({enforceAppCheck: false, maxInstances: 5}, async (request) => {
    await requireVerifiedUser(request, "Sign in to review completed work.");
    throw new HttpsError(
      "failed-precondition",
      "This legacy financial operation is retired. Update the app and use the secure review flow.",
    );
  });
}

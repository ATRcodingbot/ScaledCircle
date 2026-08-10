const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

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

    const roundedLatitude = Math.round(latitude * 100) / 100;
    const roundedLongitude = Math.round(longitude * 100) / 100;
    const cacheId = `${roundedLatitude}_${roundedLongitude}`
      .replaceAll(".", "_")
      .replaceAll("-", "m");
    const cacheReference = db
      .collection("weatherOpportunityCache")
      .doc(cacheId);
    const cacheSnapshot = await cacheReference.get();
    const cache = cacheSnapshot.data() || {};
    const fetchedAt = cache.fetchedAt instanceof Timestamp
      ? cache.fetchedAt.toMillis() : 0;

    if (Date.now() - fetchedAt < 5 * 60 * 1000 &&
        Array.isArray(cache.alerts)) {
      response.status(200).json({
        source: "National Weather Service",
        experimentalOpportunityModel: true,
        cached: true,
        alerts: cache.alerts,
      });
      return;
    }

    try {
      const endpoint = new URL("https://api.weather.gov/alerts/active");
      endpoint.searchParams.set(
        "point",
        `${roundedLatitude},${roundedLongitude}`,
      );
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

      response.status(200).json({
        source: "National Weather Service",
        experimentalOpportunityModel: true,
        cached: false,
        alerts,
      });
    } catch (error) {
      logger.error("Unable to load local opportunity alerts.", {
        latitude: roundedLatitude,
        longitude: roundedLongitude,
        error: error instanceof Error ? error.message : String(error),
      });

      if (Array.isArray(cache.alerts)) {
        response.status(200).json({
          source: "National Weather Service",
          experimentalOpportunityModel: true,
          cached: true,
          stale: true,
          alerts: cache.alerts,
        });
        return;
      }

      response.status(503).json({
        error: "Local opportunity alerts are temporarily unavailable.",
      });
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
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to purchase a subscription.",
      );
    }

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
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to fund a campaign.",
      );
    }

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
        const platformFee = Number(
          (workerBudget * 0.10).toFixed(2),
        );
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
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to submit campaign work.",
      );
    }

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

        if (completion.status === "submitted" &&
            cleanId(completion.pendingPayoutId)) {
          return {
            completionId,
            payoutId: completion.pendingPayoutId || completion.zoneId,
            payoutAmount: Number(completion.payoutAmount || 0),
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
        const payoutReference = db.collection("payouts").doc(zoneId);
        const scalerWalletReference = db.collection("wallets").doc(scalerId);

        const campaignSnapshot = await transaction.get(campaignReference);
        const zoneSnapshot = await transaction.get(zoneReference);
        const routeSnapshot = await transaction.get(routeReference);
        const payoutSnapshot = await transaction.get(payoutReference);
        const scalerWalletSnapshot = await transaction.get(
          scalerWalletReference,
        );

        if (!campaignSnapshot.exists ||
            !zoneSnapshot.exists ||
            !routeSnapshot.exists) {
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
        const basePay = firstMoneyValue(
          campaign.basePay,
          zone.assignedBasePay,
          zone.suggestedBasePay,
          campaign.workerBudget,
        );
        const bonus = moneyValue(campaign.bonus);
        const payoutResult = calculatePayout({
          completionPercentage: trackingResult.completionPercentage,
          basePay,
          completionBonus: bonus,
        });
        const existingPayout = payoutSnapshot.data() || {};

        if (existingPayout.status === "paid") {
          throw new HttpsError(
            "already-exists",
            "This zone has already been paid.",
          );
        }

        const previousPendingAmount = existingPayout.status === "pending_review"
          ? moneyValue(existingPayout.totalPayout)
          : 0;
        const scalerWallet = scalerWalletSnapshot.data() || {};
        const currentPendingBalance = moneyValue(
          scalerWallet.pendingBalance,
        );
        const pendingBalance = Math.max(
          0,
          currentPendingBalance - previousPendingAmount +
            payoutResult.totalPayout,
        );
        const timestamp = FieldValue.serverTimestamp();

        transaction.set(payoutReference, {
          businessId,
          scalerId,
          campaignId,
          zoneId,
          assignedHomes: trackingResult.assignedHomes,
          completedHomes: trackingResult.completedHomes,
          completionPercentage: trackingResult.completionPercentage,
          basePay,
          basePayout: payoutResult.basePayout,
          availableBonus: bonus,
          recommendedBonus: payoutResult.bonus,
          recommendedBonusEligible: payoutResult.bonus > 0,
          bonus: payoutResult.bonus,
          totalPayout: payoutResult.totalPayout,
          calculationStatus: payoutResult.status,
          status: "pending_review",
          ...(existingPayout.createdAt
            ? {}
            : {createdAt: timestamp}),
          updatedAt: timestamp,
        }, {merge: true});

        transaction.set(scalerWalletReference, {
          ownerId: scalerId,
          ...(!scalerWalletSnapshot.exists ? {ownerType: "scaler"} : {}),
          pendingBalance,
          ...(!scalerWalletSnapshot.exists ? {createdAt: timestamp} : {}),
          updatedAt: timestamp,
        }, {merge: true});

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
          pendingPayoutId: payoutReference.id,
          basePayout: payoutResult.basePayout,
          availableBonus: bonus,
          recommendedBonus: payoutResult.bonus,
          payoutAmount: payoutResult.totalPayout,
          submittedAt: timestamp,
          updatedAt: timestamp,
        });

        transaction.update(zoneReference, {
          status: "submitted",
          submittedCompletionId: completionId,
          submittedAt: timestamp,
          submittedRoutePointCount: routePoints.length,
          submittedRouteSimulated: route.simulated === true,
          completedHomes: trackingResult.completedHomes,
          assignedHomes: trackingResult.assignedHomes,
          completionPercentage: trackingResult.completionPercentage,
          eligibleForPayment: trackingResult.eligibleForPayment,
          paymentStatus: "pending_review",
          pendingPayoutId: payoutReference.id,
          basePayout: payoutResult.basePayout,
          availableBonus: bonus,
          recommendedBonus: payoutResult.bonus,
          payoutAmount: payoutResult.totalPayout,
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
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to approve a payout.",
      );
    }

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
        const bonusEarnedAutomatically = completionPercentage >= 100;
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
    eligibleForPayment: completionPercentage >= 30,
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

  if (safeCompletion < 30) {
    return {
      basePayout: 0,
      bonus: 0,
      totalPayout: 0,
      status: "redo_required",
    };
  }

  if (safeCompletion >= 100) {
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
    "scaled-circle";

  return `https://us-east1-${projectId}.cloudfunctions.net/` +
    `campaignTracking?t=${encodeURIComponent(trackingCode)}`;
}

function weatherOpportunityFromFeature(feature) {
  if (!feature || typeof feature !== "object") {
    return null;
  }

  const properties = feature.properties &&
    typeof feature.properties === "object" ? feature.properties : {};
  const event = readText(properties.event, 120);
  const headline = readText(properties.headline, 240) || event;
  const combinedText = `${event} ${headline} ${
    readText(properties.description, 1800)
  }`.toLowerCase();

  if (!event && !headline) {
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

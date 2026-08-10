const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const crypto = require("node:crypto");

initializeApp();
const db = getFirestore();

const COUNTIES = [
  {id: "howard", name: "Howard County", latitude: 39.25, longitude: -76.93},
  {id: "baltimore", name: "Baltimore County", latitude: 39.46, longitude: -76.64},
  {id: "anne_arundel", name: "Anne Arundel County", latitude: 39.00, longitude: -76.58},
  {id: "montgomery", name: "Montgomery County", latitude: 39.15, longitude: -77.20},
];

exports.monitorMarylandWeatherAlerts = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/New_York",
    region: "us-east1",
    timeoutSeconds: 240,
    maxInstances: 1,
  },
  async () => {
    const configuredUsers = await db.collection("users")
      .where("weatherCoverageEnabled", "==", true)
      .get();
    if (configuredUsers.empty) {
      logger.info("Weather monitor finished: no configured businesses.");
      return;
    }

    const users = [];
    for (const userSnapshot of configuredUsers.docs) {
      const user = userSnapshot.data() || {};
      const role = text(user.role, 40).toLowerCase();
      if (role !== "business" && role !== "admin") continue;
      const walletSnapshot = await db.collection("wallets").doc(userSnapshot.id).get();
      if (!hasWeatherSubscription(user, walletSnapshot.data() || {})) continue;
      const countyIds = Array.isArray(user.weatherCoverageCountyIds) ?
        user.weatherCoverageCountyIds.filter((value) => typeof value === "string") : [];
      if (countyIds.length === 0) continue;
      users.push({
        id: userSnapshot.id,
        email: text(user.email, 320).toLowerCase(),
        displayName: text(user.displayName, 120) || "there",
        countyIds: new Set(countyIds),
        emailEnabled: user.weatherEmailAlertsEnabled === true,
      });
    }

    let alertsSeen = 0;
    let notificationsCreated = 0;
    let emailsQueued = 0;
    for (const county of COUNTIES) {
      const interestedUsers = users.filter((user) => user.countyIds.has(county.id));
      if (interestedUsers.length === 0) continue;
      let alerts;
      try {
        alerts = await fetchAlerts(county);
      } catch (error) {
        logger.error("Scheduled county weather fetch failed.", {
          county: county.name,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      for (const alert of alerts) {
        alertsSeen += 1;
        for (const user of interestedUsers) {
          const result = await deliverAlert({user, county, alert});
          if (result.notificationCreated) notificationsCreated += 1;
          if (result.emailQueued) emailsQueued += 1;
        }
      }
    }
    logger.info("Weather monitor finished.", {
      configuredUsers: users.length,
      alertsSeen,
      notificationsCreated,
      emailsQueued,
    });
  },
);

async function fetchAlerts(county) {
  const endpoint = new URL("https://api.weather.gov/alerts/active");
  endpoint.searchParams.set("point", `${county.latitude},${county.longitude}`);
  const response = await fetch(endpoint, {
    headers: {
      "Accept": "application/geo+json",
      "User-Agent": "ScaledCircle/1.0 (https://scaledcircle.com)",
    },
  });
  if (!response.ok) throw new Error(`NWS returned ${response.status}.`);
  const payload = await response.json();
  const features = Array.isArray(payload.features) ? payload.features : [];
  return features.map(mapFeature).filter(Boolean).slice(0, 12);
}

function mapFeature(feature) {
  if (!feature || typeof feature !== "object") return null;
  const properties = feature.properties && typeof feature.properties === "object" ?
    feature.properties : {};
  const event = text(properties.event, 120);
  const headline = text(properties.headline, 240) || event;
  if (!event && !headline) return null;
  const status = text(properties.status, 40).toLowerCase();
  const messageType = text(properties.messageType, 40).toLowerCase();
  const responseType = text(properties.response, 40).toLowerCase();
  const testProduct = /\b(test message|required weekly test|practice\/demo)\b/i;
  if (status === "test" || status === "exercise" ||
      messageType === "test" || messageType === "cancel" ||
      responseType === "test" || testProduct.test(`${event} ${headline}`) ||
      event.toLowerCase() === "administrative message") return null;

  const combined = `${event} ${headline} ${text(properties.description, 1800)}`.toLowerCase();
  let services = ["Local outreach"];
  let low = 0;
  let high = 8;
  let rationale = "Active weather can change near-term local service demand.";
  if (combined.includes("hail")) {
    services = ["Roofing", "Siding", "Windows", "Exterior inspection"];
    low = 10; high = 30;
    rationale = "Hail alerts may increase demand for exterior inspections and repairs.";
  } else if (combined.includes("tornado") || combined.includes("severe thunderstorm") ||
      combined.includes("damaging wind") || combined.includes("high wind")) {
    services = ["Roofing", "Siding", "Tree service", "Storm cleanup"];
    low = 8; high = 25;
    rationale = "Severe wind alerts may increase demand for exterior and debris services.";
  } else if (combined.includes("flood")) {
    services = ["Water mitigation", "Basement cleanup", "Mold inspection"];
    low = 8; high = 24;
    rationale = "Flood alerts may increase demand for water and property restoration services.";
  } else if (combined.includes("snow") || combined.includes("ice") ||
      combined.includes("winter storm")) {
    services = ["Snow removal", "Ice management", "Emergency property service"];
    low = 5; high = 18;
    rationale = "Winter weather alerts may increase demand for removal and emergency services.";
  } else if (combined.includes("heat")) {
    services = ["HVAC", "Cooling service", "Energy efficiency"];
    low = 4; high = 15;
    rationale = "Heat alerts may increase demand for cooling and HVAC services.";
  }
  return {
    id: text(feature.id, 500) || text(properties.id, 500),
    event,
    headline,
    severity: text(properties.severity, 40) || "Unknown",
    onset: text(properties.onset, 80),
    areaDescription: text(properties.areaDesc, 500),
    officialDescription: text(properties.description, 1000),
    sourceUrl: text(feature.id, 1000),
    services,
    leadLiftLowPercent: low,
    leadLiftHighPercent: high,
    rationale,
  };
}

function hasWeatherSubscription(user, wallet) {
  if (text(user.role, 40).toLowerCase() === "admin") return true;
  return text(wallet.subscriptionPlan, 40).toLowerCase() === "scale" &&
    text(wallet.subscriptionStatus, 40).toLowerCase() === "active" &&
    wallet.subscriptionExpiresAt instanceof Timestamp &&
    wallet.subscriptionExpiresAt.toMillis() > Date.now();
}

function alertKey(alert) {
  const identity = text(alert.id, 1000) ||
    `${text(alert.event, 120)}|${text(alert.onset, 80)}|${text(alert.areaDescription, 500)}`;
  return crypto.createHash("sha256").update(identity).digest("hex").slice(0, 40);
}

async function deliverAlert({user, county, alert}) {
  const key = alertKey(alert);
  const deliveryId = `${user.id}_${key}`;
  const deliveryReference = db.collection("weatherAlertDeliveries").doc(deliveryId);
  const existing = (await deliveryReference.get()).data() || {};
  let notificationCreated = false;
  let emailQueued = false;
  if (existing.notificationCreated !== true) {
    await Promise.all([
      db.collection("notifications").doc(`weather_${deliveryId}`).set({
        userId: user.id,
        type: "weather_opportunity",
        title: `${county.name} Weather Alert`,
        message: `${alert.event}. Official NWS alert; opportunity estimates are experimental.`,
        countyId: county.id,
        county: county.name,
        weatherEvent: alert.event,
        severity: alert.severity,
        services: alert.services,
        leadLiftLowPercent: alert.leadLiftLowPercent,
        leadLiftHighPercent: alert.leadLiftHighPercent,
        source: "National Weather Service",
        sourceUrl: alert.sourceUrl,
        experimentalOpportunityModel: true,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      }),
      deliveryReference.set({
        userId: user.id,
        alertKey: key,
        weatherEvent: alert.event,
        countyId: county.id,
        notificationCreated: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true}),
    ]);
    notificationCreated = true;
  }
  if (!user.emailEnabled || !user.email || existing.emailSent === true ||
      existing.emailQueued === true) return {notificationCreated, emailQueued};

  await Promise.all([
    db.collection("weatherEmailQueue").doc(deliveryId).set({
      status: "pending",
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      countyId: county.id,
      countyName: county.name,
      alert: {
        event: alert.event,
        officialDescription: alert.officialDescription,
        sourceUrl: alert.sourceUrl,
        services: alert.services,
        leadLiftLowPercent: alert.leadLiftLowPercent,
        leadLiftHighPercent: alert.leadLiftHighPercent,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    deliveryReference.set({
      emailQueued: true,
      emailQueuedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true}),
  ]);
  emailQueued = true;
  return {notificationCreated, emailQueued};
}

function text(value, maximumLength = 500) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maximumLength);
}

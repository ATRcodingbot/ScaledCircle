const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const crypto = require("node:crypto");
const {
  hasWeatherSubscription,
  shouldMonitorWeatherUser,
  weatherPreferenceDecision,
} = require("./weather_preference_policy");

initializeApp();
const db = getFirestore();

const COUNTIES = [
  {id: "allegany", name: "Allegany County", latitude: 39.6215762, longitude: -78.6976934},
  {id: "anne_arundel", name: "Anne Arundel County", latitude: 38.9939586, longitude: -76.5675565},
  {id: "baltimore", name: "Baltimore County", latitude: 39.4429054, longitude: -76.6160576},
  {id: "baltimore_city", name: "Baltimore City", latitude: 39.3009639, longitude: -76.6106288},
  {id: "calvert", name: "Calvert County", latitude: 38.5345651, longitude: -76.5303934},
  {id: "caroline", name: "Caroline County", latitude: 38.8715369, longitude: -75.8316417},
  {id: "carroll", name: "Carroll County", latitude: 39.5627551, longitude: -77.0224938},
  {id: "cecil", name: "Cecil County", latitude: 39.5623167, longitude: -75.9480092},
  {id: "charles", name: "Charles County", latitude: 38.4736097, longitude: -77.0134736},
  {id: "dorchester", name: "Dorchester County", latitude: 38.4224051, longitude: -76.0834840},
  {id: "frederick", name: "Frederick County", latitude: 39.4720806, longitude: -77.3980370},
  {id: "garrett", name: "Garrett County", latitude: 39.5287500, longitude: -79.2732056},
  {id: "harford", name: "Harford County", latitude: 39.5363334, longitude: -76.2987057},
  {id: "howard", name: "Howard County", latitude: 39.2507098, longitude: -76.9310884},
  {id: "kent", name: "Kent County", latitude: 39.2355851, longitude: -76.0960831},
  {id: "montgomery", name: "Montgomery County", latitude: 39.1363497, longitude: -77.2041501},
  {id: "prince_georges", name: "Prince George's County", latitude: 38.8293082, longitude: -76.8472812},
  {id: "queen_annes", name: "Queen Anne's County", latitude: 39.0375919, longitude: -76.0854694},
  {id: "saint_marys", name: "St. Mary's County", latitude: 38.2157512, longitude: -76.5286105},
  {id: "somerset", name: "Somerset County", latitude: 38.0800671, longitude: -75.8536775},
  {id: "talbot", name: "Talbot County", latitude: 38.7490936, longitude: -76.1787218},
  {id: "washington", name: "Washington County", latitude: 39.6037098, longitude: -77.8137988},
  {id: "wicomico", name: "Wicomico County", latitude: 38.3694692, longitude: -75.6315726},
  {id: "worcester", name: "Worcester County", latitude: 38.2164033, longitude: -75.2969460},
];

exports.monitorMarylandWeatherAlerts = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/New_York",
    region: "us-east1",
    timeoutSeconds: 240,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    return weatherService().monitor();
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
        relevanceReason: user.relevance.reason,
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

function weatherService(){return require('./weather_monitor').createService({db,getOwner:uid=>require('firebase-admin/auth').getAuth().getUser(uid)});}
exports.weatherWorkspaceV1 = require('firebase-functions/v2/https').onCall({region:'us-east1',maxInstances:4},async request=>{
 const {HttpsError}=require('firebase-functions/v2/https');
 if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in to view your weather coverage.');
 const input=request.data||{};if(Object.keys(input).some(k=>!['operation','preferences','alertId','businessId'].includes(k)))throw new HttpsError('invalid-argument','Unsupported weather request.');
 try{
 const service=weatherService(),actorUid=request.auth.uid,uid=input.businessId||actorUid;
 if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('weather_request_invalid');
 if(uid!==actorUid){
   const auth=require('firebase-admin/auth').getAuth();
   const authority=require('./business_workspace').createWorkspaceService({db,auth,FieldValue,Timestamp:require('firebase-admin/firestore').Timestamp});
   await authority.actor(actorUid);await authority.authority({uid:actorUid,businessId:uid,permission:'intelligence'});
   if(input.operation==='save')throw Error('weather_owner_required');
 }

 if(input.operation==='read')return {...await service.settings(uid),canConfigure:uid===actorUid};
 if(input.operation==='save')return await service.settings(uid,input.preferences);
 if(input.operation==='alert')return await service.readAlert(uid,input.alertId);
 throw Error('weather_request_invalid');
 }catch(error){throw new HttpsError('failed-precondition',({weather_preferences_changed:'Your preferences changed. Reload before saving.',weather_timezone_required:'Save your Business timezone in Schedule before enabling weather email.',weather_entitlement_required:'Weather access is unavailable for this account.',weather_alert_forbidden:'This weather alert is unavailable for this account.'})[error.message]||'Weather settings are unavailable. Please try again.');}
});

"use strict";

const {stateById} = require("./market_states");
const {CONFIG,statusFor,requireActiveBusiness} = require("./market_rollout");
const ENDPOINT="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query";
const fail=message=>{const e=new Error(message);e.code="failed-precondition";throw e;};
function envelope(data) {
  const raw=data.serviceArea;
  const points=Array.isArray(raw)?raw:Array.isArray(raw?.points)?raw.points:[];
  if(points.length<3 || points.length>10000) fail("Confirm the assigned work area before continuing.");
  const coordinates=points.map(p=>[Number(p.longitude??p.lng),Number(p.latitude??p.lat)]);
  if(coordinates.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>85))
    fail("The assigned work area needs review.");
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
  const box={xmin:Math.min(...xs),ymin:Math.min(...ys),xmax:Math.max(...xs),ymax:Math.max(...ys),spatialReference:{wkid:4326}};
  if(box.xmax<=box.xmin || box.ymax<=box.ymin || box.xmax-box.xmin>10 || box.ymax-box.ymin>10)
    fail("Choose a bounded work area within one active state.");
  return box;
}
async function stateForWork(data,{fetchImpl=fetch}={}) {
  const box=envelope(data),url=new URL(ENDPOINT);
  for(const [key,value] of Object.entries({where:"1=1",geometry:JSON.stringify(box),
    geometryType:"esriGeometryEnvelope",inSR:"4326",spatialRel:"esriSpatialRelWithin",
    outFields:"STATE",returnGeometry:"false",f:"json"}))url.searchParams.set(key,value);
  // ArcGIS evaluates the input envelope WITHIN the stored state feature.
  // Deliberately conservative at state borders. A contained envelope proves the
  // entire work area is in one state; intersecting a state at one point does not.
  let payload;
  try {
    const response=await fetchImpl(url,{signal:AbortSignal.timeout(8000)});
    if(!response.ok) throw Error("provider_unavailable");
    payload=await response.json();
  } catch(_) { fail("We could not verify the work area's state. Please retry."); }
  if(payload?.error || payload?.exceededTransferLimit || payload?.features?.length!==1)
    fail("Keep the work area within one active state, or ask support to review a border area.");
  const state=stateById(`us_census_tigerweb:state:${payload.features[0].attributes?.STATE}`);
  if(!state) fail("The work area's state could not be verified.");
  return state;
}
async function requireCampaign(db,campaign,reader={get:ref=>ref.get()},options={}) {
  await requireActiveBusiness(db,campaign.businessId,reader);
  let area=campaign.serviceArea;
  if(campaign.id) {
    const zones=await reader.get(db.collection('campaignZones').where('campaignId','==',campaign.id).limit(101));
    if(zones.size>100)fail('This work area needs a bounded state review before continuing.');
    const zonePoints=zones.docs.flatMap(zone=>zone.data().serviceArea || []);
    if(zonePoints.length)area=[...(Array.isArray(area)?area:[]),...zonePoints];
  }
  const state=await stateForWork({...campaign,serviceArea:area},options);
  const config=(await reader.get(db.doc(CONFIG))).data();
  if(statusFor(config,state.id)!=="ACTIVE")
    fail("ScaledCircle marketplace campaigns are not active in this work area's state yet.");
  return state;
}
module.exports={envelope,stateForWork,requireCampaign};

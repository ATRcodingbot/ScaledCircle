'use strict';

// A descriptive projection of the maintained map/PI analysis, not a ranking,
// execution route, compensation calculation or permission to start work.
const planning = require('./smart_zone_planning');
const serviceability = require('./smart_zone_serviceability');
const {zoneGeometryDigest} = require('./operational_layer');
const VERSION = 'ZoneIntelligenceV1';
const distinct = values => [...new Set(values.filter(Boolean))];
function propertyMix(features, intent) {
  const counts = {}, unknown = [];
  for (const feature of features) {
    const t = feature.observedTags || {};
    let label;
    if (intent === 'business') {
      label = t.shop ? 'Retail' : t.office ? 'Office' : t.craft ? 'Trade/service' :
        ['restaurant', 'cafe', 'fast_food', 'bar', 'pub'].includes(t.amenity) ? 'Food/drink' :
        t.amenity ? 'Other mapped business amenity' : ['commercial', 'retail', 'office'].includes(t.building) ? 'Commercial building' : null;
    } else {
      label = t.building === 'detached' ? 'Detached' :
        ['terrace', 'semidetached_house'].includes(t.building) ? 'Attached/semi-detached' :
        ['apartments', 'dormitory'].includes(t.building) ? 'Multifamily/shared residential' :
        t.building === 'house' ? 'House (attachment unknown)' : null;
    }
    if (label) counts[label] = (counts[label] || 0) + 1;
    else unknown.push(feature.id || feature.sourceId);
  }
  return {basis:'observed_osm_tags', classifiedCount:features.length-unknown.length,
    unknownCount:unknown.length, categories:Object.entries(counts).map(([label,count])=>({label,count}))};
}
function project({geometry, features, segments, workload, source, intent, workType,
  ranking = null, propertyContext = null, limitations = [], status = 'available'}) {
  const known = Array.isArray(features), targets = features || [];
  const network = Array.isArray(segments) ? segments : [];
  const seen = new Set();
  let meters = 0;
  for (const segment of network) {
    const a = segment.from, b = segment.to;
    if (!a || !b || ![a.latitude,a.longitude,b.latitude,b.longitude].every(Number.isFinite)) continue;
    const key = [JSON.stringify(a),JSON.stringify(b)].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = (a.latitude+b.latitude)/2*Math.PI/180;
    meters += Math.hypot((b.latitude-a.latitude)*111320,(b.longitude-a.longitude)*111320*Math.cos(lat));
  }
  // PI sections and Census aggregates are context, never target-level facts.
  const context = propertyContext || (ranking ? {scope:'regional_property_context',
    signals:ranking.displaySignals || [], source:ranking.evidence || null} : null);
  const signals = (context?.signals || []).filter(s => intent !== 'business' ||
    !/housing|residential|construction|age|era/i.test(s.label || ''));
  const minutes = known && targets.length > 0 && meters > 0 && Number.isFinite(workload?.estimatedMinutes)
    ? workload.estimatedMinutes : null;
  return {version:VERSION, geometryDigest:zoneGeometryDigest(geometry), status,
    mode:ranking?'recommended':'manual', targetIntent:intent, campaignType:workType,
    mappedTargetCount:known?targets.length:null, propertyMix:known?propertyMix(targets,intent):null,
    supportingStreetMeters:meters>0?Math.round(meters):null,
    workload:minutes===null?null:{minutes,oneScaler:minutes<=planning.SINGLE_SCALER_MAX_MINUTES,
      exceedsSingleScalerLimit:minutes>planning.SINGLE_SCALER_MAX_MINUTES,
      limitMinutes:planning.SINGLE_SCALER_MAX_MINUTES,version:workload.version,
      supportedTargetCount:workload.estimatedProperties ?? targets.length,propertiesPerHour:45,walkingMetersPerMinute:80,networkTraversalFactor:2,minimumMinutes:15,
      campaignType:workType,conversationDuration:null},
    regionalContext:context?{...context,signals}:null,
    reasons:ranking?.reasons || [], source:source || null,
    limitations:distinct([...limitations,...ranking?.limitations || [],
      'Mapped features are not verified households, entrances, delivery points or a material quantity.',
      'Property condition, ownership and customer intent are not established.',
      'Local access and actual field duration need review.']),
    executionRouteVerified:false};
}
function recommended(candidate, workType, intent) {
  return project({geometry:candidate.geometry,features:candidate.features,segments:candidate.networkSegments,
    workload:candidate.workload,source:candidate.source,intent,workType,ranking:candidate.ranking,
    limitations:candidate.source?.uncertaintyGuards>0?
      ['Incomplete mapped exclusion features have conservative avoidance areas.']:[]});
}
function analyze({geometry, snapshot, workType, propertyContext}) {
  const intent = serviceability.intent(workType);
  const unavailable = message => project({geometry,features:null,segments:null,source:null,intent,workType,
    propertyContext,status:'unavailable',limitations:[message]});
  if (planning.polygonAreaSquareMeters(geometry)>planning.MAX_GEOGRAPHIC_QUERY_SQUARE_METERS)
    return unavailable('This boundary exceeds the 25 km² map-analysis limit. Your territory has not been changed.');
  if (!['residential','business'].includes(intent))
    return unavailable('This campaign type needs manual target and workload review.');
  if (!snapshot) return unavailable('Reliable mapping evidence is unavailable for this boundary. You can keep or adjust your area.');
  const shaped = serviceability.shape({boundary:geometry,snapshot,workType,propertiesPerHour:45,
    anchor:geometry[0],desiredTargetLimit:5000,maximumZones:32,desiredMinutes:360},planning);
  const analysis = shaped.analysis;
  if (!analysis) return unavailable(shaped.reasons.join(' '));
  const meters = analysis.streetMeters;
  const workload = analysis.supportedFeatures.length && meters>0 ? planning.estimateWorkload({
    estimatedProperties:analysis.supportedFeatures.length,estimatedWalkingMeters:meters*2,propertiesPerHour:45,workType}) : null;
  return project({geometry,features:analysis.features,segments:analysis.segments,workload,intent,workType,propertyContext,
    status:analysis.supportedFeatures.length < shaped.eligibleMappedFeatureCount?'partial':'available',
    source:{name:'OpenStreetMap',dataTimestamp:snapshot.dataTimestamp||null,fetchedAt:snapshot.fetchedAt||null,
      ...snapshot.cacheEvidence},limitations:[
      `${analysis.supportedFeatures.length} of ${shaped.eligibleMappedFeatureCount} eligible mapped features have supporting local-street evidence.`,
      'The street network may contain separate components; no connectors or walking itinerary are inferred.',
      ...(shaped.geometryDiagnostics?.localizedUncertainties>0?['Uncertain exclusion features are conservatively avoided.']:[])]});
}
module.exports={VERSION,propertyMix,project,recommended,analyze};

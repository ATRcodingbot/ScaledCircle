'use strict';

// Business profile bindings to the existing place resolver. The browser sends
// selection IDs; labels, coordinates and boundaries always come from the server.
const crypto = require('node:crypto');
const resolution = require('./service_area_resolution');
const VERSION = 'BusinessGeographyProfileV1';
const AREA_TYPES = new Set(['county', 'city', 'zcta']);
const MAX_AREAS = 8;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function fail(code, message) {const error = new Error(message); error.code = code; throw error;}
function canonicalPlace(result) {
  if (!result || typeof result.id !== 'string' || !result.id || result.id.includes('unknown') ||
      !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude) ||
      Math.abs(result.latitude) > 90 || Math.abs(result.longitude) > 180 ||
      !result.fullAddress || !['openstreetmap_nominatim', 'us_census_tigerweb'].includes(result.resolutionSource)) return null;
  const value = resolution.encodeCacheResult(result);
  value.canonicalId = result.geographicId
    ? `${result.resolutionSource}:${result.geographyType}:${result.geographicId}`
    : `${result.resolutionSource}:${result.id}`;
  value.countryCode = 'US'; // The maintained resolver explicitly restricts searches to the US.
  value.displayLabel = result.fullAddress;
  // Keep the maintained geometry encoding and bound the private profile size.
  if (Buffer.byteLength(JSON.stringify(value)) > 60000) return null;
  return value;
}
function decode(place) {return place ? {...resolution.decodeCacheResult(place),
  canonicalId:place.canonicalId, selectionId:place.selectionId,
  displayLabel:place.displayLabel, countryCode:place.countryCode} : null;}
function view(geography) {
  if (geography?.schemaVersion !== VERSION) return null;
  return {schemaVersion:VERSION, base:decode(geography.base), serviceAreas:(geography.serviceAreas || []).map(decode)};
}
function createService({db, FieldValue, resolvePlace = resolution.resolvePlace}) {
  const ref = (uid, id) => db.doc(`businessOnboarding/${uid}/placeSelections/${id}`);
  return {
    async search({uid, query, kind}) {
      if (typeof query !== 'string' || query.trim().length < 2 || query.length > 180 ||
          !['base','service_area'].includes(kind)) fail('invalid-argument','Search for a city, county, ZIP or address.');
      let response;
      try {response = await resolvePlace({query,db});}
      catch (error) {
        if (error.message === 'rate_limited') fail('resource-exhausted','Location search is busy. Please try again in a moment.');
        fail('unavailable','Location search is unavailable. Please retry.');
      }
      const choices = [];
      for (const result of response.results.slice(0,6)) {
        const place = canonicalPlace(result); if (!place) continue;
        if (kind === 'service_area' && (!AREA_TYPES.has(place.geographyType) || result.geometry?.length < 3)) continue;
        const selectionId = sha(JSON.stringify(place));
        const reference = ref(uid,selectionId);
        await db.runTransaction(async tx => {
          if (!(await tx.get(reference)).exists) tx.create(reference,{version:VERSION,ownerUid:uid,
            place:{...place,selectionId},resolvedAt:FieldValue.serverTimestamp()});
        });
        choices.push(decode({...place,selectionId}));
      }
      return {results:choices, version:VERSION};
    },
    async select({uid, input, transaction}) {
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
          Object.keys(input).some(k=>!['baseSelectionId','serviceAreaSelectionIds'].includes(k)) ||
          !Array.isArray(input.serviceAreaSelectionIds) || !input.serviceAreaSelectionIds.length ||
          input.serviceAreaSelectionIds.length > MAX_AREAS) fail('invalid-argument','Select your Business base and one to eight service areas.');
      const ids = [input.baseSelectionId,...input.serviceAreaSelectionIds];
      if (ids.some(id=>typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) fail('invalid-argument','Choose a location from the search results.');
      const snapshots = await Promise.all(ids.map(id=>transaction.get(ref(uid,id))));
      const places = snapshots.map((snapshot,index)=>{
        const data=snapshot.data();
        if (!snapshot.exists || data.version !== VERSION || data.ownerUid !== uid || data.place?.selectionId !== ids[index])
          fail('failed-precondition','Search and select the location again before saving.');
        return data.place;
      });
      const [base,...serviceAreas] = places;
      if (serviceAreas.some(p=>!AREA_TYPES.has(p.geographyType) || decode(p).geometry.length < 3))
        fail('invalid-argument','Choose a city, county or ZIP as a service area.');
      if (new Set(serviceAreas.map(p=>p.canonicalId)).size !== serviceAreas.length)
        fail('invalid-argument','Each service area may be selected only once.');
      return {schemaVersion:VERSION,base,serviceAreas,confirmedAt:FieldValue.serverTimestamp()};
    },
    async suggestions(businessId) {
      const geography=(await db.doc(`businessOnboarding/${businessId}`).get()).data()?.geography;
      // The precise base location and legacy text never enter campaign suggestions.
      return {areas:(view(geography)?.serviceAreas || []).map(p=>({
        id:p.canonicalId,name:p.displayLabel,type:'place',enabled:true,
        center:p.center,geometry:p.geometry,geometryParts:p.geometryParts,bounds:p.bounds,
        geographyType:p.geographyType,geographicId:p.geographicId,
        city:p.city,county:p.county,state:p.state,country:p.country,countryCode:p.countryCode,postalCode:p.postalCode,
        resolutionSource:p.resolutionSource,resolutionVersion:p.resolutionVersion,sourceVintage:p.sourceVintage,
      })),source:VERSION};
    },
  };
}
module.exports = {VERSION,MAX_AREAS,createService,view,canonicalPlace};

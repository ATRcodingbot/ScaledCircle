const {test}=require('node:test');
const assert=require('node:assert/strict');
const {completionStatus}=require('./business_onboarding');
const {canonicalPlace}=require('./business_geography');
const {decodeCacheResult,normalizeQuery}=require('./service_area_resolution');
const zip=decodeCacheResult(require('./fixtures/business-base-21061.json'));
test('production 21061 Census identity survives missing upstream OSM ID without altered geometry',()=>{
 assert.equal(zip.id,'place-unknown');const p=canonicalPlace(zip);
 assert.equal(p.id,'census-zcta-21061');assert.equal(p.canonicalId,'us_census_tigerweb:zcta:21061');
 const decoded=decodeCacheResult(p);assert.deepEqual(decoded.geometry,zip.geometry);
 assert.deepEqual(decoded.geometryParts,zip.geometryParts);assert.equal(p.postalCode,'21061');
});
test('leading zero ZIP identity retained; unknown OSM is not accepted without Census authority',()=>{
 assert.equal(canonicalPlace({...zip,geographicId:'02108',postalCode:'02108'}).id,'census-zcta-02108');
 assert.equal(normalizeQuery('  02108  '),'02108');
 for(const change of [{resolutionSource:'openstreetmap_nominatim'},{geographicId:''},{geographicId:'guessed'},{geographyType:'address'}])
  assert.equal(canonicalPlace({...zip,...change}),null);
});
test('existing completion rules exclude optional fields and preserve grandfathered completed onboarding',()=>{
 const p={businessName:'Business',businessDescription:'Repairs',servicesOffered:['Decks'],serviceAreas:['21061']};
 assert.deepEqual(completionStatus(p),{complete:true,missingFields:[]});
 for(const k of Object.keys(p))assert.deepEqual(completionStatus({...p,[k]:null}),{complete:false,missingFields:[k]});
 assert.equal(completionStatus({}, {completedAt:1}).complete,true);
 assert.equal(completionStatus({...p,website:'',primaryPhone:'',businessAddress:'',brandVoice:''}).complete,true);
});

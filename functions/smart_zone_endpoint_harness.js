'use strict';
// Evaluate only maintained callable declarations with explicit local dependencies.
const fs = require('node:fs'), parser = require('@babel/parser');
const source = fs.readFileSync(require.resolve('./index'), 'utf8');
const names = ['smartZoneAnchor','smartZoneSelectedArea','smartZoneRecommendationContext',
  'smartZoneCampaign','smartZonePlanArguments','generateSmartZonePlan'];
const ast = parser.parse(source).program.body;
const declarations = ast.filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name));
if (declarations.length !== names.length) throw Error('missing_smart_zone_endpoint_declaration');
const exportNames = ['getSmartZonePlan','applySmartZonePlan'];
const assignments = ast.filter(n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' &&
  n.expression.left.object?.name === 'exports' && exportNames.includes(n.expression.left.property?.name));
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
function endpointHarness({db,context,resolution,fetchSnapshot,FieldValue,analyzeProperty}={}) {
  const calls={resolver:0,provider:0,property:0,cache:0},events=[];
  const localRequire=name=>name==='./smart_zone_public_cache_runtime'?{createAcquirer:({liveFetch})=>async options=>{calls.cache++;return liveFetch(options);}}:name==='./property_service_area_runtime'?{createAnalyzer:()=>async geometry=>{calls.property++;if(!analyzeProperty)throw Error('test_property_provider_missing');return analyzeProperty(geometry);}}:require(name);
  const env={require:localRequire,exports:{},db,FieldValue,HttpsError,admin:{firestore:{FieldValue}},
    CENSUS_API_KEY:{value:()=>''},getStorage:()=>({bucket:()=>({})}),
    smartZoneEntryContract:require('./smart_zone_entry_contract'),smartZonePlanning:require('./smart_zone_planning'),
    smartZoneGeography:{fetchSnapshot:async options=>{calls.provider++;return fetchSnapshot(options);}},
    propertyIntelligence:require('./property_intelligence'),PROPERTY_INTELLIGENCE_CACHE_COLLECTION:'propertyIntelligenceCache',
    operations:require('./operational_layer'),crypto:require('node:crypto'),
    subscriptionEntitlements:require('./subscription_entitlements'),campaignExecution:require('./campaign_execution_authority'),
    businessWorkspaceService:()=>require('./business_workspace').createWorkspaceService({db,FieldValue}),
    authenticatedUserContext:async()=>{if(!context)throw new HttpsError('unauthenticated','Sign in');return context;},
    serviceAreaResolution:{resolvePlace:async()=>{calls.resolver++;return resolution;}},
    readText:(value,max=240)=>String(value||'').trim().slice(0,max),process:{env:{}},OVERPASS_URL:'https://invalid.test',
    logger:{info:(name,data)=>events.push({name,data}),warn:()=>{},error:()=>{}},
    stagingPhysicalQa:{reserved:()=>false},businessOperation:(_name,handler)=>handler,onCall:(_options,handler)=>handler};
  const code=[...declarations,...assignments].map(n=>source.slice(n.start,n.end)).join('\n');
  const api=new Function(...Object.keys(env),`${code}; return {...exports,smartZoneCampaign,generateSmartZonePlan};`)(...Object.values(env));
  return {...api,calls,events};
}
module.exports={endpointHarness,HttpsError};

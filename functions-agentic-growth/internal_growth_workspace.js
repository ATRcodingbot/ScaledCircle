'use strict';

// This registry describes an internal agent namespace, never a customer
// Business, subscription, consent, membership or identity-role conversion.
const crypto = require('node:crypto');
const VERSION = 'InternalGrowthWorkspaceV1';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code, message) { const e = Error(message); e.code = code; throw e; }
function scope(record, target) {
  if (!record || record.schemaVersion !== VERSION || record.namespace !== target ||
      record.kind !== 'internal_admin_dogfood' || record.ownerUid !== target)
    return {status:'MISSING_INTERNAL_WORKSPACE',areas:[],preferenceVersion:null};
  return {status:record.areas.length ? 'AVAILABLE' : 'NO_ENABLED_SERVICE_AREAS',
    areas:record.areas.map(p => ({id:p.selectionId,label:p.displayLabel,type:p.geographyType,
      locality:p.geographyType === 'city' ? p.city : p.geographyType === 'county' ? p.county : p.postalCode,state:p.state})),
    preferenceVersion:record.revision};
}
function createService({db, FieldValue, target, project, resolvePlace, canonicalPlace}) {
  function guard(actor) {
    if ((project !== 'scaledcircle-staging' && !project?.startsWith('demo-')) || !target ||
        actor?.uid !== target || actor.role !== 'admin' || !actor.verified || !actor.active)
      fail('permission-denied','This internal workspace is available only to its maintained Admin.');
  }
  const registry = () => db.doc('internalGrowthWorkspaces/'+target);
  const selection = id => registry().collection('placeSelections').doc(id);
  async function register(actor) {
    guard(actor);
    return db.runTransaction(async tx => {
      const [old, user, health] = await Promise.all([tx.get(registry()),tx.get(db.doc('users/'+target)),tx.get(db.doc('agentHealth/'+target))]);
      if(user.data()?.role !== 'admin' || user.data()?.active !== true || health.data()?.businessUid !== target ||
          health.data()?.externalActionsEnabled !== false || health.data()?.killSwitchActive !== true)
        fail('failed-precondition','The existing Admin and Supervisor safety state are required.');
      if(old.exists) {
        if(scope(old.data(),target).status === 'MISSING_INTERNAL_WORKSPACE') fail('failed-precondition','Workspace identity conflicts with the registry.');
        return {registered:true,reused:true};
      }
      tx.create(registry(),{schemaVersion:VERSION,namespace:target,ownerUid:target,kind:'internal_admin_dogfood',
        displayName:'ScaledCircle',purpose:'Internal ScaledCircle Growth Agent dogfood',areas:[],revision:0,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      tx.create(db.doc('internalGrowthWorkspaceAudits/'+hash([target,'register',VERSION])),{
        namespace:target,actorUid:actor.auditUid||actor.uid,action:'register',version:VERSION,createdAt:FieldValue.serverTimestamp()});
      return {registered:true,reused:false};
    });
  }
  async function search(actor, input) {
    guard(actor);
    if(!input || Object.keys(input).some(k=>k!=='query') || typeof input.query !== 'string' || input.query.trim().length < 2 || input.query.length > 180)
      fail('invalid-argument','Search for a city, county or ZIP.');
    if(!(await registry().get()).exists) fail('failed-precondition','Register this internal workspace first.');
    const response = await resolvePlace({query:input.query,db});
    const results=[];
    for(const result of response.results.slice(0,6)) {
      const place=canonicalPlace(result);
      if(!place || !['city','county','zcta'].includes(place.geographyType) || result.geometry?.length < 3) continue;
      // Maryland's independent Baltimore city must never be confused with
      // Baltimore County. Keep provider identity and geometry unchanged.
      if(place.state === 'Maryland' && place.geographyType === 'city' && place.city === 'Baltimore')
        place.displayLabel='Baltimore City, Maryland';
      const selectionId=hash(place),value={...place,selectionId};
      await db.runTransaction(async tx=>{const ref=selection(selectionId);if(!(await tx.get(ref)).exists)
        tx.create(ref,{ownerUid:target,place:value,resolvedAt:FieldValue.serverTimestamp()});});
      results.push({selectionId,label:place.displayLabel,type:place.geographyType});
    }
    return {results};
  }
  async function save(actor,input) {
    guard(actor);
    if(!input || Object.keys(input).some(k=>!['selectionIds','expectedRevision'].includes(k)) || !Number.isInteger(input.expectedRevision) ||
        !Array.isArray(input.selectionIds) || !input.selectionIds.length || input.selectionIds.length>8 ||
        input.selectionIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)) || new Set(input.selectionIds).size!==input.selectionIds.length)
      fail('invalid-argument','Choose one to eight distinct areas in priority order.');
    return db.runTransaction(async tx=>{
      const old=await tx.get(registry());
      if(!old.exists || scope(old.data(),target).status==='MISSING_INTERNAL_WORKSPACE') fail('failed-precondition','Register the internal workspace first.');
      if(old.data().revision!==input.expectedRevision) fail('aborted','Territories changed. Refresh before saving.');
      const snapshots=await Promise.all(input.selectionIds.map(id=>tx.get(selection(id))));
      const areas=snapshots.map((s,i)=>{const data=s.data();if(data?.ownerUid!==target || data.place?.selectionId!==input.selectionIds[i])
        fail('failed-precondition','Select each area from the maintained search results.');return data.place;});
      if(new Set(areas.map(a=>a.canonicalId)).size!==areas.length) fail('invalid-argument','Each jurisdiction may appear only once.');
      if(JSON.stringify(old.data().areas.map(a=>a.selectionId))===JSON.stringify(input.selectionIds)) return {saved:true,reused:true,revision:old.data().revision};
      const revision=old.data().revision+1;
      tx.update(registry(),{areas,revision,updatedAt:FieldValue.serverTimestamp()});
      tx.create(db.doc('internalGrowthWorkspaceAudits/'+hash([target,'geography',revision])),{
        namespace:target,actorUid:actor.auditUid||actor.uid,action:'set_territory_priority',version:VERSION,revision,
        selectionIds:input.selectionIds,createdAt:FieldValue.serverTimestamp()});
      return {saved:true,revision};
    });
  }
  return {register,search,save};
}
module.exports={VERSION,scope,createService};

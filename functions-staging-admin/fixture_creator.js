"use strict";
const crypto = require('node:crypto');
const {AGREEMENTS} = require('./scaler_approval');
const geometry = require('./fixture_geometry');
const PROJECT = 'scaledcircle-staging';
const VERSION = 'DualMobileFixtureV1';
const GEOMETRY_VERSION = 'dual_mobile_v1';
const GEOMETRY_HASH = '118b4539f95a7700579b9a9a634cf9f8ee068e05c52e0252571090865f04233a';
const BUSINESS = 'MVDgxekmb6TbRbgCHJ6ERnXGqwh2';
const FIXTURES = Object.freeze([
  {campaignId:'ios_physical_qa_v1',zoneId:'ios_physical_qa_zone_v1',scalerUid:'JIJjOSgk41cI7EyG0V5SCPcVAsk1',purpose:'IOS_PHYSICAL_CERTIFICATION'},
  {campaignId:'android_physical_qa_v1',zoneId:'android_physical_qa_zone_v1',scalerUid:'vEpWAvh2KAbNixC17Dcn1JA8Mtl2',purpose:'ANDROID_PHYSICAL_CERTIFICATION'},
]);
const canonical = value => Array.isArray(value)?value.map(canonical):
  value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail = code => { throw new Error(code); };
function binding(f) {
  return {actionVersion:VERSION,projectId:PROJECT,businessUid:BUSINESS,...f,
    geometryVersion:GEOMETRY_VERSION,geometryHash:GEOMETRY_HASH,
    compensationCents:1500,platformFeeCents:300,requiredTestFundingCents:1800,currency:'usd'};
}
function validateGeometry(packet) {
  if(packet?.projectId!==PROJECT || packet.version!==GEOMETRY_VERSION ||
    packet.immutable!==true || packet.geometryHash!==GEOMETRY_HASH ||
    !Array.isArray(packet.geometry) || packet.geometry.length!==8 ||
    hash(packet.geometry)!==GEOMETRY_HASH) fail('geometry_mismatch');
  geometry.zoneGeometryDigest(packet.geometry);
  const estimate=geometry.calculateGeometryWalkingEstimate(packet.geometry);
  if(estimate.areaSquareMeters<5500 || estimate.areaSquareMeters>5700 ||
    estimate.estimatedWalkingMinutes<=0 || estimate.estimatedWalkingMinutes>360) fail('geometry_mismatch');
  return estimate;
}
function createFixtureService({db,auth,FieldValue,projectId}) {
  return async function create({actorUid,data={}}) {
    if(projectId!==PROJECT) fail('staging_only');
    if(!actorUid) fail('admin_required');
    if(!data || Array.isArray(data) || Object.keys(data).length) fail('empty_request_required');
    const people=await Promise.all([actorUid,BUSINESS,...FIXTURES.map(f=>f.scalerUid)].map(async uid=>{
      const user=await auth.getUser(uid).catch(()=>fail('account_ineligible'));
      if(user.disabled || user.emailVerified!==true) fail('account_ineligible');
      return user;
    }));
    if(people.length!==4) fail('account_ineligible');
    return db.runTransaction(async tx=>{
      const paths=[`users/${actorUid}`,`users/${BUSINESS}`,
        `internalCertificationGeometry/${GEOMETRY_VERSION}`];
      for(const uid of [BUSINESS,...FIXTURES.map(f=>f.scalerUid)]) {
        if(uid!==BUSINESS) paths.push(`users/${uid}`,`discoveryPreferences/${uid}`);
        for(const [type,v] of Object.entries(AGREEMENTS)) {
          if(uid!==BUSINESS || type!=='scaler_work') paths.push(`legalConsents/${uid}_${type}_${v}`);
        }
      }
      for(const f of FIXTURES) paths.push(`internalCertificationAuthorities/${f.campaignId}`,
        `campaigns/${f.campaignId}`,`campaignZones/${f.zoneId}`,`adminAuditEvents/qa_fixture_${hash(binding(f))}`);
      const snapshots=await Promise.all(paths.map(p=>tx.get(db.doc(p))));
      const zoneSets=await Promise.all(FIXTURES.map(f=>tx.get(db.collection('campaignZones').where('campaignId','==',f.campaignId))));
      if(zoneSets.some((set,i)=>set.docs.some(doc=>doc.id!==FIXTURES[i].zoneId))) fail('fixture_conflict');
      const records=new Map(paths.map((p,i)=>[p,snapshots[i].data()]));
      const read=p=>records.get(p);
      if(read(`users/${actorUid}`)?.role!=='admin') fail('admin_required');
      const eligible=(uid,role)=>{
        const u=read(`users/${uid}`);
        if(u?.role!==role || u.active!==true || u.betaAccess!=='approved') fail('account_ineligible');
      };
      eligible(BUSINESS,'business');
      for(const f of FIXTURES) {
        eligible(f.scalerUid,'scaler');
        const p=read(`discoveryPreferences/${f.scalerUid}`);
        if(p?.userUid!==f.scalerUid || p.role!=='scaler' || !p.initialSetupCompletedAt?.toMillis?.()) fail('profile_incomplete');
        const a=read(`internalCertificationAuthorities/${f.campaignId}`);
        if(a?.projectId!==PROJECT || a.immutable!==true || a.certificationFixture!==true ||
          a.businessUid!==BUSINESS || a.scalerUid!==f.scalerUid || a.campaignId!==f.campaignId || a.zoneId!==f.zoneId) fail('authority_mismatch');
      }
      for(const uid of [BUSINESS,...FIXTURES.map(f=>f.scalerUid)]) for(const [type,v] of Object.entries(AGREEMENTS)) {
        if(uid===BUSINESS && type==='scaler_work') continue;
        const c=read(`legalConsents/${uid}_${type}_${v}`);
        if(c?.uid!==uid || c.agreementType!==type || c.agreementVersion!==v || !c.acceptedAt) fail('consent_required');
      }
      const packet=read(`internalCertificationGeometry/${GEOMETRY_VERSION}`);
      const estimate=validateGeometry(packet);
      const states=FIXTURES.map(f=>{
        const b=binding(f), digest=hash(b);
        const campaign=read(`campaigns/${f.campaignId}`),zone=read(`campaignZones/${f.zoneId}`);
        const audit=read(`adminAuditEvents/qa_fixture_${digest}`);
        if(!campaign&&!zone&&!audit) return {f,b,digest,exists:false};
        if(!campaign || !zone || !audit || hash(audit.binding)!==digest ||
          campaign.certificationBindingDigest!==digest || zone.certificationBindingDigest!==digest ||
          campaign.businessId!==BUSINESS || zone.businessId!==BUSINESS || zone.campaignId!==f.campaignId ||
          campaign.certificationScalerUid!==f.scalerUid || zone.certificationScalerUid!==f.scalerUid ||
          hash(campaign.certificationContract)!==hash(b) || hash(zone.certificationContract)!==hash(b) ||
          campaign.workerAmountCents!==1500 || campaign.basePay!==15 || zone.baseAmountCents!==1500 ||
          campaign.bonus!==0 || zone.bonusAmountCents!==0 || hash(zone.serviceArea)!==GEOMETRY_HASH) fail('fixture_conflict');
        return {f,b,digest,exists:true};
      });
      if(states.some(s=>s.exists)!==states.every(s=>s.exists)) fail('fixture_conflict');
      if(states.every(s=>s.exists)) return {replayed:true,fixtures:states.map(s=>({...s.f,bindingDigest:s.digest,auditId:`qa_fixture_${s.digest}`}))};
      const at=FieldValue.serverTimestamp();
      for(const {f,b,digest} of states) {
        const common={businessId:BUSINESS,certificationFixture:true,isTestCampaign:true,
          certificationAuthorityId:f.campaignId,certificationScalerUid:f.scalerUid,
          certificationBusinessUid:BUSINESS,certificationPurpose:f.purpose,
          certificationContract:b,certificationBindingDigest:digest,
          geometryVersion:GEOMETRY_VERSION,geometryHash:GEOMETRY_HASH,environment:'staging',
          createdAt:at,updatedAt:at};
        tx.create(db.doc(`campaigns/${f.campaignId}`),{...common,name:f.purpose,campaignName:f.purpose,
          description:'Internal staging physical-device certification. No marketing activity.',
          status:'draft',fundingStatus:'unfunded',archived:false,type:'neighborhoodCanvassing',
          workerAmountCents:1500,workerBudget:15,basePay:15,bonus:0,qualityBonus:0,
          requiredTestFundingCents:1800,scalersNeeded:1,zoneCount:1,applicationCount:0,
          materialFulfillmentType:'no_materials_required',timeZone:'America/New_York',
          workWindowStart:'00:00',workWindowEnd:'23:59'});
        tx.create(db.doc(`campaignZones/${f.zoneId}`),{...common,campaignId:f.campaignId,
          zoneName:f.purpose,status:'unassigned',assignedScalerId:null,mapped:true,mapLocked:true,
          serviceArea:packet.geometry,serviceAreaType:'basic_area_estimate',serviceAreaPointCount:8,
          estimatedHomes:23,homeCountStatus:'estimated',homeCountMethod:'certified_qa_planning_estimate',
          homeCountConfidence:'low',analysisStatus:'complete',baseAmountCents:1500,bonusAmountCents:0,
          serverZoneMetricsVersion:estimate.version,serverZoneGeometryDigest:geometry.zoneGeometryDigest(packet.geometry),
          serverEstimatedWalkingMinutes:estimate.estimatedWalkingMinutes,
          estimatedWalkingMeters:estimate.estimatedWalkingMeters,estimatedMinutes:estimate.estimatedWalkingMinutes});
        tx.create(db.doc(`adminAuditEvents/qa_fixture_${digest}`),{actionVersion:VERSION,
          eventType:'staging_qa_fixture_created',actorUid,environment:'staging',binding:b,
          bindingDigest:digest,createdAt:at});
      }
      return {replayed:false,fixtures:states.map(s=>({...s.f,bindingDigest:s.digest,auditId:`qa_fixture_${s.digest}`}))};
    });
  };
}
module.exports={createFixtureService,validateGeometry,binding,hash,PROJECT,VERSION,GEOMETRY_VERSION,GEOMETRY_HASH,BUSINESS,FIXTURES};

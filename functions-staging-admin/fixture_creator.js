"use strict";
const crypto = require('node:crypto');
const {AGREEMENTS} = require('./scaler_approval');
const geometry = require('./fixture_geometry');
const {quoteCampaignFunding} = require('./campaign_funding_quote');
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
function createFixtureService({db,auth,FieldValue,projectId,retest=false,finalRetest=false}) {
  if (retest && finalRetest) fail('unsupported_fixture_version');
  const version=finalRetest?3:retest?2:1;
  retest=version>1;
  const bonusCents=finalRetest?300:0;
  const quote=quoteCampaignFunding(1500+bonusCents);
  const fixtures=retest?FIXTURES.map(f=>({...f,campaignId:f.campaignId.replace('_v1',`_v${version}`),zoneId:f.zoneId.replace('_v1',`_v${version}`)})):FIXTURES;
  const geometryVersion=retest?'dual_mobile_kenilworth_v2':GEOMETRY_VERSION;
  const geometryHash=retest?'0b3ac6c4545771f6a4d9e0b0c393243b84a6223dfc51a85c699a2edd2a5ecb93':GEOMETRY_HASH;
  const bind=f=>({...binding(f),...(retest?{actionVersion:`DualMobileRetestV${version}`,geometryVersion,geometryHash}: {}),...(finalRetest?{acceptedBonusCents:bonusCents,workerReserveCents:quote.workerAmountCents,platformFeeCents:quote.platformFeeCents,requiredTestFundingCents:quote.businessChargeCents}: {})});
  return async function create({actorUid,data={}}) {
    if(projectId!==PROJECT) fail('staging_only');
    if(!actorUid) fail('admin_required');
    if(!data || Array.isArray(data) || Object.keys(data).length) fail('empty_request_required');
    const people=await Promise.all([actorUid,BUSINESS,...fixtures.map(f=>f.scalerUid)].map(async uid=>{
      const user=await auth.getUser(uid).catch(()=>fail('account_ineligible'));
      if(user.disabled || user.emailVerified!==true) fail('account_ineligible');
      return user;
    }));
    if(people.length!==4) fail('account_ineligible');
    return db.runTransaction(async tx=>{
      const paths=[`users/${actorUid}`,`users/${BUSINESS}`,
        `internalCertificationGeometry/${geometryVersion}`];
      for(const uid of [BUSINESS,...fixtures.map(f=>f.scalerUid)]) {
        if(uid!==BUSINESS) paths.push(`users/${uid}`,`discoveryPreferences/${uid}`);
        for(const [type,v] of Object.entries(AGREEMENTS)) {
          if(uid!==BUSINESS || type!=='scaler_work') paths.push(`legalConsents/${uid}_${type}_${v}`);
        }
      }
      for(const f of fixtures) paths.push(`internalCertificationAuthorities/${f.campaignId}`,
        `campaigns/${f.campaignId}`,`campaignZones/${f.zoneId}`,`adminAuditEvents/qa_fixture_${hash(bind(f))}`);
      const snapshots=await Promise.all(paths.map(p=>tx.get(db.doc(p))));
      const zoneSets=await Promise.all(fixtures.map(f=>tx.get(db.collection('campaignZones').where('campaignId','==',f.campaignId))));
      if(zoneSets.some((set,i)=>set.docs.some(doc=>doc.id!==fixtures[i].zoneId))) fail('fixture_conflict');
      const records=new Map(paths.map((p,i)=>[p,snapshots[i].data()]));
      const read=p=>records.get(p);
      if(read(`users/${actorUid}`)?.role!=='admin') fail('admin_required');
      const eligible=(uid,role)=>{
        const u=read(`users/${uid}`);
        if(u?.role!==role || u.active!==true || u.betaAccess!=='approved') fail('account_ineligible');
      };
      eligible(BUSINESS,'business');
      for(const f of fixtures) {
        eligible(f.scalerUid,'scaler');
        const p=read(`discoveryPreferences/${f.scalerUid}`);
        if(p?.userUid!==f.scalerUid || p.role!=='scaler' || !p.initialSetupCompletedAt?.toMillis?.()) fail('profile_incomplete');
        const a=read(`internalCertificationAuthorities/${f.campaignId}`);
        if(!(retest&&!a) && (a?.projectId!==PROJECT || a.immutable!==true || a.certificationFixture!==true ||
          a.businessUid!==BUSINESS || a.scalerUid!==f.scalerUid || a.campaignId!==f.campaignId || a.zoneId!==f.zoneId)) fail('authority_mismatch');
      }
      for(const uid of [BUSINESS,...fixtures.map(f=>f.scalerUid)]) for(const [type,v] of Object.entries(AGREEMENTS)) {
        if(uid===BUSINESS && type==='scaler_work') continue;
        const c=read(`legalConsents/${uid}_${type}_${v}`);
        if(c?.uid!==uid || c.agreementType!==type || c.agreementVersion!==v || !c.acceptedAt) fail('consent_required');
      }
      const packet=read(`internalCertificationGeometry/${geometryVersion}`);
      let estimate;
      let executionRoute;
      if(retest) {
        if(packet?.projectId!==PROJECT||packet.version!==geometryVersion||packet.immutable!==true||
          packet.geometryHash!==geometryHash||hash(packet.geometry)!==geometryHash||
          hash(packet.routeCenterline)!=='bf4601a989e80e8c9b85b9cfd8f2e8ff9ad586705fc3c07f84c54df7f796950f')fail('geometry_mismatch');
        const rad=x=>x*Math.PI/180;
        const meters=packet.routeCenterline.slice(1).reduce((sum,b,i)=>{
          const a=packet.routeCenterline[i],h=Math.sin(rad(b.latitude-a.latitude)/2)**2+
            Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
          return sum+12742000*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
        },0);
        if(Math.abs(meters-packet.completionDenominatorMeters)>.01)fail('geometry_mismatch');
        // Keep the maintained assignment planning checks intact. Completion has
        // its own immutable route-distance denominator, independent of area planning.
        estimate={...geometry.calculateGeometryWalkingEstimate(packet.geometry),estimatedWalkingMeters:meters};
        executionRoute={version:geometryVersion,centerline:packet.routeCenterline,
          routeHash:hash(packet.routeCenterline),corridorHash:geometryHash,denominatorMeters:meters,
          checkpoints:packet.checkpoints,instructions:packet.routeInstructions};
      } else estimate=validateGeometry(packet);
      const states=fixtures.map(f=>{
        const b=bind(f), digest=hash(b);
        const campaign=read(`campaigns/${f.campaignId}`),zone=read(`campaignZones/${f.zoneId}`);
        const audit=read(`adminAuditEvents/qa_fixture_${digest}`);
        if(!campaign&&!zone&&!audit) return {f,b,digest,exists:false};
        if(!campaign || !zone || !audit || hash(audit.binding)!==digest ||
          campaign.certificationBindingDigest!==digest || zone.certificationBindingDigest!==digest ||
          campaign.businessId!==BUSINESS || zone.businessId!==BUSINESS || zone.campaignId!==f.campaignId ||
          campaign.certificationScalerUid!==f.scalerUid || zone.certificationScalerUid!==f.scalerUid ||
          hash(campaign.certificationContract)!==hash(b) || hash(zone.certificationContract)!==hash(b) ||
          campaign.workerAmountCents!==quote.workerAmountCents || campaign.basePay!==15 || zone.baseAmountCents!==1500 ||
          campaign.bonus!==bonusCents/100 || zone.bonusAmountCents!==bonusCents || hash(zone.serviceArea)!==geometryHash ||
          (finalRetest && (campaign.workerBudget!==18 || campaign.qualityBonus!==3 || campaign.requiredTestFundingCents!==2160)) ||
          (retest && hash(zone.executionRoute)!==hash(executionRoute))) fail('fixture_conflict');
        return {f,b,digest,exists:true};
      });
      if(states.some(s=>s.exists)!==states.every(s=>s.exists)) fail('fixture_conflict');
      if(states.every(s=>s.exists)) return {replayed:true,fixtures:states.map(s=>({...s.f,bindingDigest:s.digest,auditId:`qa_fixture_${s.digest}`}))};
      const at=FieldValue.serverTimestamp();
      for(const {f,b,digest} of states) {
        if(retest&&!read(`internalCertificationAuthorities/${f.campaignId}`)) {
          tx.create(db.doc(`internalCertificationAuthorities/${f.campaignId}`),{
            projectId:PROJECT,immutable:true,certificationFixture:true,businessUid:BUSINESS,
            scalerUid:f.scalerUid,campaignId:f.campaignId,zoneId:f.zoneId,createdAt:at});
        }
        const displayName=finalRetest?`${f.purpose.startsWith('IOS')?'iOS':'Android'} Physical Certification — Retest V3`:f.purpose;
        const common={businessId:BUSINESS,certificationFixture:true,isTestCampaign:true,
          certificationAuthorityId:f.campaignId,certificationScalerUid:f.scalerUid,
          certificationBusinessUid:BUSINESS,certificationPurpose:f.purpose,
          certificationContract:b,certificationBindingDigest:digest,
          geometryVersion,geometryHash,environment:'staging',
          createdAt:at,updatedAt:at};
        tx.create(db.doc(`campaigns/${f.campaignId}`),{...common,name:displayName,campaignName:displayName,
          description:'Internal staging physical-device certification. No marketing activity.',
          status:'draft',fundingStatus:'unfunded',archived:false,type:'neighborhoodCanvassing',
          workerAmountCents:quote.workerAmountCents,workerBudget:quote.workerAmountCents/100,basePay:15,bonus:bonusCents/100,qualityBonus:bonusCents/100,
          requiredTestFundingCents:quote.businessChargeCents,scalersNeeded:1,zoneCount:1,applicationCount:0,
          materialFulfillmentType:'no_materials_required',timeZone:'America/New_York',
          workWindowStart:'00:00',workWindowEnd:'23:59'});
        tx.create(db.doc(`campaignZones/${f.zoneId}`),{...common,campaignId:f.campaignId,
          zoneName:displayName,status:'unassigned',assignedScalerId:null,mapped:true,mapLocked:true,
          serviceArea:packet.geometry,serviceAreaType:'basic_area_estimate',serviceAreaPointCount:packet.geometry.length,
          ...(executionRoute?{executionRoute}:{}),
          estimatedHomes:23,homeCountStatus:'estimated',homeCountMethod:'certified_qa_planning_estimate',
          homeCountConfidence:'low',analysisStatus:'complete',baseAmountCents:1500,bonusAmountCents:bonusCents,
          serverZoneMetricsVersion:estimate.version,serverZoneGeometryDigest:geometry.zoneGeometryDigest(packet.geometry),
          serverEstimatedWalkingMinutes:estimate.estimatedWalkingMinutes,
          estimatedWalkingMeters:estimate.estimatedWalkingMeters,estimatedMinutes:estimate.estimatedWalkingMinutes});
        tx.create(db.doc(`adminAuditEvents/qa_fixture_${digest}`),{actionVersion:b.actionVersion,
          eventType:'staging_qa_fixture_created',actorUid,environment:'staging',binding:b,
          bindingDigest:digest,createdAt:at});
      }
      return {replayed:false,fixtures:states.map(s=>({...s.f,bindingDigest:s.digest,auditId:`qa_fixture_${s.digest}`}))};
    });
  };
}
module.exports={createFixtureService,validateGeometry,binding,hash,PROJECT,VERSION,GEOMETRY_VERSION,GEOMETRY_HASH,BUSINESS,FIXTURES};

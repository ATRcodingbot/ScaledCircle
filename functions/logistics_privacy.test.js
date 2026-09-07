const {test}=require('node:test');
const assert=require('node:assert/strict');
const op=require('./operational_layer');
const campaign={businessId:'owner',campaignName:'Public job',campaignType:'flyer_distribution',status:'open',basePay:15,
 materialFulfillmentType:'scaler_pickup_business',materialHandoffAddress:'PRIVATE ADDRESS',materialHandoffInstructions:'PRIVATE CODE',
 materialHandoffLatitude:1,materialHandoffLongitude:2,businessPhone:'PRIVATE PHONE',publicLogistics:{postalCode:'21061',gateCode:'PRIVATE CODE',accessStatus:'restricted_or_uncertain'}};
test('discovery surfaces omit every private logistics field, including nested injected fields',()=>{
 for(const value of [op.safeDiscoveryProjection(campaign),op.publicCampaignDocument('job',campaign)]){
  assert.equal(JSON.stringify(value).includes('PRIVATE'),false);
  assert.equal(value.materialLogistics.postalCode,'21061');
  assert.equal(value.materialLogistics.approximateDistanceMiles,null);
  assert.equal(value.materialLogistics.exactDetailsAfterAssignment,true);
 }
});
test('private assignment authority is exact, role scoped and revocable',()=>{
 const c={uid:'scaler',role:'scaler',zoneId:'zone',campaignId:'job',businessId:'owner',zone:{campaignId:'job',businessId:'owner',assignedScalerId:'scaler',status:'accepted'}};
 assert.equal(op.privateLogisticsAssignmentAllowed(c),true);
 for(const change of [{uid:'other'},{role:'business'},{campaignId:'other'},{businessId:'other'},
   {zone:{...c.zone,status:'cancelled'}},{zone:{...c.zone,status:'approved'}},{zone:{...c.zone,status:'unassigned'}}])
  assert.equal(op.privateLogisticsAssignmentAllowed({...c,...change}),false);
});
test('historical Job Room retains evidence counts and pay without revoked private details',()=>{
 const r=op.historicalJobRoomProjection({viewerRole:'scaler',room:{id:'z',materialLogistics:{location:'PRIVATE'}},campaign:{...campaign,id:'job'},zone:{id:'z',status:'approved'},
 compensation:{baseAmountCents:1500,acceptedMaterialLogistics:{location:'PRIVATE'}},completions:[{id:'c',gpsPointCount:18,scalerNotes:'PRIVATE'}]});
 assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(r.completions[0].gpsPointCount,18);assert.equal(r.compensation.baseAmountCents,1500);
});
const groupZone={campaignId:'job',businessId:'owner',status:'unassigned',assignedScalerIds:['assigned']};
test('accepted group slot permits necessary logistics but cancellation or wrong membership does not',()=>{
 const args={uid:'assigned',role:'scaler',zoneId:'group',campaignId:'job',businessId:'owner',zone:groupZone,participant:{scalerUid:'assigned',zoneId:'group',campaignId:'job',businessId:'owner',status:'accepted'}};
 assert.equal(require('./operational_layer').privateLogisticsAssignmentAllowed(args),true);
 assert.equal(require('./operational_layer').privateLogisticsAssignmentAllowed({...args,participant:{...args.participant,status:'replaced'}}),false);
 assert.equal(require('./operational_layer').privateLogisticsAssignmentAllowed({...args,zone:{...groupZone,assignedScalerIds:[]}}),false);
});

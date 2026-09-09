"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {load}=require("./job_room_participant_labels");
test("Job Room names are assigned-member-only and never expose contact fields",async()=>{
 const read=[];const db={collection:c=>({doc:uid=>({get:async()=>{read.push(uid);return {data:()=>({displayName:'Assigned Person',email:'private@example.test',phone:'private'})};}})})};
 const room={businessId:'business',scalerId:'one',scalerIds:['one','two']};
 await assert.rejects(load(db,room,{uid:'unrelated'}),/member_required/);assert.equal(read.length,0);
 const owner=await load(db,room,{uid:'business'});assert.deepEqual(read,['one','two']);
 assert.equal(JSON.stringify(owner).includes('private'),false);
 read.length=0;const scaler=await load(db,room,{uid:'one'});assert.deepEqual(read,['one']);assert.equal(scaler.participants.length,1);
});
test("missing display name and failed profile read remain explicitly unavailable",async()=>{
 const room={businessId:'business',scalerId:'one'};
 const db={collection:()=>({doc:()=>({get:async()=>({data:()=>({email:'not-a-name'})})})})};
 assert.equal((await load(db,room,{uid:'business'})).participants[0].displayName,null);
 assert.equal((await load({collection(){throw Error('private');}},room,{uid:'business'})).available,false);
});

test('authorized legacy names survive historical projection without contact or private logistics',async()=>{
 const room={id:'zone',businessId:'business',scalerId:'scaler',materialLogistics:{location:'PRIVATE'}};
 const db={collection:()=>({doc:()=>({get:async()=>({data:()=>({firstName:'Avery',lastName:'Walker',email:'PRIVATE',phone:'PRIVATE'})})})})};
 const labels=await load(db,room,{uid:'scaler'});
 const response=require('./operational_layer').historicalJobRoomProjection({
  viewerRole:'scaler',room,campaign:{id:'campaign',campaignName:'Finished job'},zone:{status:'completed'},
  compensation:{baseAmountCents:1500,acceptedMaterialLogistics:{location:'PRIVATE'}},participantLabels:labels,
  completions:[{id:'completion',scalerId:'scaler',scalerEmail:'PRIVATE',status:'approved',earning:{amountCents:1800,baseAmountCents:1500,bonusAmountCents:300}}],
 });
 assert.equal(response.participantLabels.participants[0].displayName,'Avery Walker');
 assert.equal(response.completions[0].scalerId,'scaler');
 assert.equal(response.completions[0].earning.bonusAmountCents,300);
 assert.doesNotMatch(JSON.stringify(response),/PRIVATE|scalerEmail|phone/);
 assert.equal(response.room.materialLogistics,undefined);
 assert.equal(response.privateLogisticsAvailable,false);
});

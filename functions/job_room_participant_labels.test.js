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

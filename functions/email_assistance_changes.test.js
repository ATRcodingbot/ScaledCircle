'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {review}=require('../functions-business-email/assistance_changes');
const policy=()=>({expiresAt:123,newInquiriesEnabled:true,mailboxMode:'inbox',inquiryLabel:'',inquiryFilterDescription:'',introductionsEnabled:true,followupsEnabled:true,limits:{initialPerDay:10,followupsPerContact:2,followupIntervalHours:120},sendingDays:[1,2,3,4,5],opensMinute:540,closesMinute:1020,timeZone:'America/New_York',services:['Decks'],claims:[],destinations:['https://example.test'],audiences:['requested'],modelAssistance:true,bookingEnabled:false});
test('narrowing coverage/caps and disabling capabilities require no expansion approval',()=>{
 const prior=policy(),next={...prior,mailboxMode:'labels',inquiryLabel:'Selected',inquiryFilterDescription:'explicit filter',introductionsEnabled:false,followupsEnabled:false,limits:{initialPerDay:1,followupsPerContact:0,followupIntervalHours:240},sendingDays:[1],opensMinute:600,closesMinute:960};
 assert.deepEqual(review({version:4,policy:prior},next).expansions,[]);
});
test('expansion summary reflects actual scope/cap; digest binds exact base and proposed copy',()=>{
 const prior={...policy(),newInquiriesEnabled:false,introductionsEnabled:false},next={...prior,newInquiriesEnabled:true,introductionsEnabled:true};
 const r=review({version:4,policy:prior},next);assert.ok(r.expansions.includes('Begin monitoring future Inbox inquiries.'));assert.ok(r.expansions.includes('Enable eligible introductions, up to 10 per day.'));
 assert.notEqual(r.changeDigest,review({version:5,policy:prior},next).changeDigest);
 assert.notEqual(r.changeDigest,review({version:4,policy:prior},{...next,voice:'changed'}).changeDigest);
});

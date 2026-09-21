'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveTerm,localStop}=require('../functions-business-email/assistance_term');
const {proposal}=require('../functions-business-email/assistance_proposal');
const {WORKSPACES,TERM}=require('../functions-business-email/inference_budget');
const now=Date.parse('2026-09-21T12:00:00Z');
test('draft term does not start shared grant; activation binds both owners to original expiry',()=>{
 const p={termMode:'shared_pilot',expiresAt:null,timeZone:'America/New_York'},g={status:'prepared',termMs:TERM,startsAt:null,expiresAt:null};
 assert.equal(resolveTerm(p,g,now).expiresAt,now+TERM);assert.equal(g.startsAt,null);assert.equal(p.expiresAt,null);
 const active={...g,status:'active',startsAt:now,expiresAt:now+TERM};
 assert.equal(resolveTerm(p,active,now+86400000).expiresAt,now+TERM);
 assert.equal(resolveTerm({...p,ownerStopLocal:'2026-09-23T17:00'},active,now).expiresAt,Date.parse('2026-09-23T21:00:00Z'));
 assert.equal(resolveTerm({...p,ownerStopLocal:'2026-10-30T17:00'},active,now).expiresAt,active.expiresAt);
 assert.equal(resolveTerm(p,{...active,status:'revoked'},now).expiresAt,null);
});
test('local stop uses workspace DST and rejects gaps / repeated clock times',()=>{
 assert.equal(localStop('2026-09-23T17:00','America/New_York'),Date.parse('2026-09-23T21:00:00Z'));
 assert.equal(localStop('2026-12-23T17:00','America/New_York'),Date.parse('2026-12-23T22:00:00Z'));
 assert.throws(()=>localStop('2026-11-01T01:30','America/New_York'));
 assert.throws(()=>localStop('2026-03-08T02:30','America/New_York'));
});
test('proposal draws scoped maintained facts and approved public footer only; never grants consent',()=>{
 const id=WORKSPACES[1],r=proposal({businessId:id,profile:{businessUid:id,businessName:'Business',servicesOffered:['decks'],brandVoice:'Clear',differentiators:['Owner-supplied fact']},social:{businessUid:id,approvedByUid:id,destinations:['https://example.test']},campaigns:[{businessId:id,approved:true,footerIdentitySource:'owner_supplied',mailingAddress:'Public footer'}]});
 assert.deepEqual(r.values.services,['decks']);assert.equal(r.values.mailingAddress,'Public footer');assert.equal(r.controlled.recipient,'skotiatrades@gmail.com');assert.equal(r.values.modelDataConsent,undefined);assert.equal(r.values.introductionsEnabled,undefined);
 const isolated=proposal({businessId:'other',profile:{businessUid:id,servicesOffered:['decks']},social:{businessUid:id,approvedByUid:id,destinations:['https://example.test']},campaigns:[{businessId:id,approved:true,footerIdentitySource:'owner_supplied',mailingAddress:'Private'}]});
 assert.equal(isolated.values.services,undefined);assert.equal(isolated.values.destinations,undefined);assert.equal(isolated.values.mailingAddress,undefined);assert.equal(isolated.controlled,null);
});

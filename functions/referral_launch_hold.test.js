'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {payoutPresentation}=require('./referral_runtime');
test('elapsed referral hold is not customer Available before rail activation; history and ledger stay intact',()=>{
 const raw={availableCents:1100,pendingCents:1500,paidCents:200,history:[{status:'AVAILABLE',currentCents:1100},{status:'PAID',currentCents:200}]};
 const before=structuredClone(raw),held=payoutPresentation(raw,false);
 assert.equal(held.availableCents,0);assert.equal(held.heldCents,1100);assert.equal(held.history[0].status,'HELD');assert.equal(held.history[1].status,'PAID');
 assert.deepEqual(raw,before);assert.equal(payoutPresentation(raw,true).availableCents,1100);
});

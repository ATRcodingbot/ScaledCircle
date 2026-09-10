'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {render,links,changes,invoiceUrl,TEMPLATES}=require('./billing_communications');
const {validateDeliveryJob}=require('./transactional_email');
const current={plan:'starter',addons:[],monthlyCents:9900,seats:1,end:1791626684,cancel:false,status:'active'};
const invoice={status:'paid',amount_paid:100,number:'SC-100',created:1788948284,billing_reason:'subscription_create'};
test('$1 receipt and welcome separate collected amount from $99 recurrence',()=>{
 for(const type of ['welcome','receipt']){
  const mail=render({type,current,invoice,environment:'production',businessName:'Healthy <Business>'});
  assert.match(mail.text,/Payment received: \$1\.00/);assert.match(mail.text,/Recurring monthly total: \$99\.00/);
  assert.match(mail.text,/October 10, 2026/);assert.doesNotMatch(mail.html,/<Business>/);
  assert.doesNotMatch(mail.text,/Existing funded campaigns and accepted Scaler obligations/);
  assert.doesNotMatch(mail.html,/Existing funded campaigns and accepted Scaler obligations/);
  assert.equal(validateDeliveryJob({...mail,to:'owner@example.com',fromAddress:'support@scaledcircle.com'}),true);
 }
});
test('all billing actions use product authentication destinations, never mutation links',()=>{
 const l=links('production');assert.equal(l.cancel,'https://scaledcircle.com/#/billing/cancel');
 assert.equal(l.upgrade,'https://scaledcircle.com/#/billing/upgrade');assert.equal(l.history,'https://scaledcircle.com/#/billing/history');
 assert.ok(Object.values(l).every(url=>url.startsWith('https://scaledcircle.com/#/')));
 assert.throws(()=>links('unknown'));
});
test('state transitions include plan, addon, cancel, reactivate and end only when changed',()=>{
 assert.deepEqual(changes(current,current),[]);assert.deepEqual(changes(null,current),[]);
 assert.deepEqual(changes(current,{...current,plan:'managed_growth'}),['plan_changed']);
 assert.deepEqual(changes(current,{...current,addons:['business_assistant']}),['addons_changed']);
 assert.deepEqual(changes(current,{...current,cancel:true}),['cancellation']);
 assert.deepEqual(changes({...current,cancel:true},current),['reactivation']);
 assert.deepEqual(changes(current,{...current,status:'canceled'}),['ended']);
});
test('cancellation preserves obligations and accurately states no renewal',()=>{
 const mail=render({type:'cancellation',current:{...current,cancel:true},environment:'production',businessName:'Business'});
 assert.match(mail.text,/Next renewal: \$0.00 — renewal canceled/);assert.match(mail.text,/accepted Scaler obligations are not canceled/);
 assert.match(mail.text,/Reactivate Membership/);
});
test('payment failure and action required show due amount, no receipt success',()=>{
 for(const type of ['payment_failed','payment_action_required']){
  const mail=render({type,current,invoice:{amount_remaining:9900},environment:'staging',businessName:'Business'});
  assert.match(mail.text,/Amount due: \$99.00/);assert.doesNotMatch(mail.text,/Payment received:/);
 }
 assert.throws(()=>render({type:'receipt',current,invoice:{status:'open'},environment:'production'}));
});
test('provider invoice URLs fail closed and unsupported billing templates cannot send',()=>{
 assert.equal(invoiceUrl('https://invoice.stripe.com/i/test'),'https://invoice.stripe.com/i/test');
 for(const url of ['https://invoice.stripe.com.evil.test/i','http://invoice.stripe.com/i','https://evil.test/i','https://user:pass@invoice.stripe.com/i'])assert.equal(invoiceUrl(url),null);
 assert.equal(TEMPLATES.has('billing_arbitrary'),false);
 assert.equal(validateDeliveryJob({template:'billing_arbitrary',to:'owner@example.com',fromAddress:'support@scaledcircle.com',text:'bad'}),false);
});

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
test('verified no-proration change email separates zero charged from full recurring price',()=>{
 const next={...current,plan:'managed_growth',monthlyCents:99900,seats:10};
 for(const verified of [true,false]){
  const mail=render({type:'plan_changed',previous:current,current:next,environment:'production',businessName:'Business',changeFinancials:{verified,chargedCents:0}});
  assert.match(mail.text,/Previous plan: Starter — \$99.00\/month/);assert.match(mail.text,/New plan: Managed Growth — \$999.00\/month/);
  assert.match(mail.text,/Next renewal: \$999.00 on October 10, 2026/);
  if(verified)assert.match(mail.text,/Charged today: \$0.00/);else assert.doesNotMatch(mail.text,/Charged today:/);
  assert.doesNotMatch(mail.text,/Payment received:/);
 }
});
test('signed exact audit binding yields one plan-change email; mismatches cannot claim zero',async()=>{
 const {reconcile}=require('./billing_communications');
 for(const fault of [null,'customerId','expired','request']){
  const operation='a'.repeat(64),sub={id:'sub_example',customer:'cus_example',livemode:true,status:'active',cancel_at_period_end:false,latest_invoice:'in_previous',metadata:{firebaseUid:'owner',plan:'managed_growth',billingPackage:'individual',founderUpgradeCertification:operation},items:{data:[{quantity:1,current_period_end:current.end,price:{id:'price_target',livemode:true,active:true,currency:'usd',unit_amount:99900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'},product:'scaledcircle_workspace_production_v1',metadata:{plan:'managed_growth',purpose:'workspace_membership_production_v1'}}}]}};
  const event={id:'evt_change',type:'customer.subscription.updated',created:100,request:{idempotency_key:'founder_upgrade_'+operation},data:{object:sub}};
  const proof={version:'no_proration_upgrade_v1',businessId:'owner',subscriptionId:sub.id,customerId:'cus_example',sourcePlan:'starter',targetPlan:'managed_growth',previousMonthlyCents:9900,monthlyCents:99900,periodEnd:current.end,dueNowCents:0,proration:'none',latestInvoiceId:'in_previous',createdAtSeconds:99,expiresAtSeconds:101,targetPrice:'price_target'};
  if(fault==='customerId')proof.customerId='unrelated';if(fault==='expired')proof.expiresAtSeconds=99;if(fault==='request')event.request.idempotency_key='unrelated';
  const docs=new Map([['subscriptionCommunicationStates/'+sub.id,{snapshot:current,eventCreated:90,revision:0}],['users/owner',{role:'business'}],['wallets/owner',{stripeCustomerId:'cus_example',stripeSubscriptionId:sub.id}],['subscriptionChangeCertificationAudits/'+operation,proof]]);
  const db={doc:p=>({path:p}),runTransaction:async fn=>fn({get:async r=>({exists:docs.has(r.path),data:()=>docs.get(r.path)}),create:(r,d)=>{assert.ok(!docs.has(r.path));docs.set(r.path,d)},set:(r,d)=>docs.set(r.path,d)})};
  const args={db,FieldValue:{serverTimestamp:()=>100},auth:{getUser:async()=>({email:'owner@example.com',emailVerified:true,disabled:false})},event,subscription:sub,environment:'production',planForPrice:()=> 'managed_growth'};
  await reconcile(args);await reconcile(args);
  const mails=[...docs.entries()].filter(([k])=>k.startsWith('outboundEmailJobs/')).map(([,v])=>v);
  assert.equal(mails.length,1);assert.equal(mails[0].template,'billing_plan_changed_v1');
  if(!fault)assert.match(mails[0].text,/Charged today: \$0.00/);else assert.doesNotMatch(mails[0].text,/Charged today:/);
 }
});

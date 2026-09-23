'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const a=require('./product_availability'),c=require('./subscription_contract');
test('Core plans keep exact catalog terms and need no internal invitation',async()=>{
 const db={doc(){throw Error('No invitation or grant lookup allowed');}};
 for(const [plan,cents,seats] of [['starter',9900,1],['growth',29900,3],['scale',49900,5]]){
  const t=c.selectionTerms({plan});assert.equal(t.monthlyCents,cents);assert.equal(t.seats,seats);
  await a.assertPurchase({db,businessId:'ordinary',selection:t});assert.deepEqual(t.entitlements,[plan]);
 }
});
test('closed premium rejects fresh checkout, add-on and bundle even with an invitation',async()=>{
 const db={doc(){throw Error('Private invitations cannot open public purchases');}};
 for(const selection of [{plan:'managed_growth'},{plan:'starter',addons:['business_assistant']},{plan:'scale',addons:['lead_generation_research']},{bundle:'growth_department'}])
  await assert.rejects(a.assertPurchase({db,businessId:'ordinary',selection:c.selectionTerms(selection)}),{code:'failed-precondition'});
});
test('verified existing premium item may be retained/removed, never expanded',async()=>{
 const existingItems=['managed_growth','business_assistant'];
 await a.assertPurchase({selection:c.selectionTerms({plan:'managed_growth'}),existingItems});
 await assert.rejects(a.assertPurchase({selection:c.selectionTerms({plan:'managed_growth',addons:['lead_generation_research']}),existingItems}),{code:'failed-precondition'});
});
test('enrollment gates do not rewrite provider terms or comped/paid entitlement access',()=>{
 const ent=require('./subscription_entitlements');assert.equal(c.selectionTerms({bundle:'growth_department'}).monthlyCents,200000);
 assert.equal(a.allowed({product:'postcards',businessId:'b',grant:{businessId:'b',status:'approved',products:['postcards'],expiresAtMillis:200},now:100}),true);
 assert.equal(typeof ent,'object');
 const sync=fs.readFileSync(__dirname+'/workspace_subscription_sync.js','utf8');assert(!sync.includes('assertPurchase'));
});
test('opening is held; prepared opening admits only new Business accounts, never paid access or Scalers',()=>{
 assert.equal(a.PUBLIC_CORE_SIGNUP_OPEN,false);assert.equal(a.publicSignupAccess('business').active,false);
 const source=fs.readFileSync(__dirname+'/product_availability.js','utf8').replace('const PUBLIC_CORE_SIGNUP_OPEN=false;','const PUBLIC_CORE_SIGNUP_OPEN=true;');
 const module={exports:{}};vm.runInNewContext(source,{module,require});const open=module.exports;
 assert.equal(open.publicSignupAccess('business').active,true);assert.equal(open.publicSignupAccess('scaler').active,false);assert.equal(open.publicSignupAccess('admin').active,false);
 assert.equal(open.publicSignupAccess('business').plan,undefined);
});
test('maintained purchase handlers gate new selection before provider calls; recovery and events remain independent',()=>{
 const source=fs.readFileSync(__dirname+'/index.js','utf8');const checkout=source.slice(source.indexOf('exports.createSubscriptionCheckoutSession ='),source.indexOf('exports.createBillingPortalSession ='));
 assert(checkout.indexOf('assertPurchase')<checkout.indexOf('stripe.checkout.sessions.create'));
 const preview=source.slice(source.indexOf('exports.previewBusinessMembershipChange ='),source.indexOf('exports.changeBusinessMembership ='));
 assert(preview.indexOf('assertPurchase')<preview.indexOf('certifyPrice'));
 const changed=fs.readFileSync(__dirname+'/workspace_billing_catalog.js','utf8');assert(changed.includes('existingItems:provider.items.data.map(i=>planForPrice(id(i.price)))'));
 assert(!changed.includes('existingItems:request'));
});

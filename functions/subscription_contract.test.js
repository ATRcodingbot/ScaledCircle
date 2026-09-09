'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),c=require('./subscription_contract');
function price(plan,env='staging'){return {id:'price_'+plan.replace('_',''),active:true,livemode:env==='production',currency:'usd',unit_amount:c.PLANS[plan].cents,
 product:`scaledcircle_workspace_${env}_v1`,metadata:{plan,purpose:`workspace_membership_${env}_v1`},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};}
const config=env=>({environment:env,requireActive:true,planForPrice:id=>Object.keys(c.PLANS).find(p=>price(p).id===id)});
test('APP_ENV is explicit and cross-mode credentials never construct a client',()=>{
 for(const env of ['staging','production']){
  assert.equal(c.environment({APP_ENV:env}),env);const key=env==='production'?'sk_live_fixture':'sk_test_fixture';assert.equal(c.credential(key,env),key);
  assert.throws(()=>c.credential(env==='production'?'sk_test_fixture':'sk_live_fixture',env));
 }
 for(const env of [{},{SCALEDCIRCLE_ENV:'production'},{APP_ENV:'typo'},{APP_ENV:'production',SCALEDCIRCLE_ENV:'staging'}])assert.throws(()=>c.environment(env));
});
test('each exact plan price has one owner-inclusive seat cap and correct LIVE/TEST terms',()=>{
 assert.deepEqual(Object.values(c.PLANS).map(p=>[p.cents,p.seats]),[[9900,1],[29900,3],[49900,5],[99900,10]]);
 for(const env of ['staging','production'])for(const plan of Object.keys(c.PLANS))assert.equal(c.priceTerms(price(plan,env),config(env)).plan,plan);
});
test('arbitrary same-priced Price IDs, product, metadata and modes fail closed',()=>{
 for(const changes of [{id:'price_unbound'},{livemode:true},{unit_amount:99},{currency:'eur'},{active:false},{product:'unrelated'},
  {metadata:{plan:'growth',purpose:'workspace_membership_production_v1'}},{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}},
  {recurring:{interval:'month',interval_count:1,usage_type:'metered'}}])assert.throws(()=>c.priceTerms({...price('growth'),...changes},config('staging')));
 assert.throws(()=>c.priceTerms(price('growth'),{environment:'staging'}));
});
test('price/product provider certification completes before any creation, archived product rejected for new Checkout',async()=>{
 const p=price('scale'),product={id:p.product,livemode:false,active:true,metadata:{purpose:p.metadata.purpose}};
 const stripe={prices:{retrieve:async()=>p},products:{retrieve:async()=>product}};
 assert.equal((await c.certifyPrice(stripe,p.id,config('staging'))).terms.cents,49900);
 product.active=false;await assert.rejects(c.certifyPrice(stripe,p.id,config('staging')));
 product.active=true;product.metadata.purpose='other';await assert.rejects(c.certifyPrice(stripe,p.id,config('staging')));
});
module.exports={price,config};

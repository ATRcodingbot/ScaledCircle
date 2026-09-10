'use strict';

const VERSION='workspace_membership_v1';
const PLANS={starter:{cents:9900,seats:1},growth:{cents:29900,seats:3},
  scale:{cents:49900,seats:5},managed_growth:{cents:99900,seats:10}};
const ADDONS={business_assistant:{cents:39900,name:'Business Assistant — Beta'},
  lead_generation_research:{cents:69900,name:'Lead Generation Research — Beta'}};
const BUNDLE='growth_department';
const ITEMS=Object.freeze({...Object.fromEntries(Object.entries(PLANS).map(([id,p])=>[id,{...p,kind:'BASE_PLAN',entitlements:[id]}])),
 ...Object.fromEntries(Object.entries(ADDONS).map(([id,p])=>[id,{...p,seats:0,kind:'ADD_ON',entitlements:[id]}])),
 [BUNDLE]:{cents:200000,seats:10,name:'ScaledCircle Growth Department',kind:'BUNDLE',entitlements:['managed_growth','business_assistant','lead_generation_research']}});
function selection(input) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('subscription_selection_required');
 const bundle=input.bundle||null,addons=input.addons||[];
 if(!Array.isArray(addons)||addons.some(a=>typeof a!=='string'||!ADDONS[a])||new Set(addons).size!==addons.length)throw Error('subscription_addons_invalid');
 if(bundle){if(bundle!==BUNDLE||addons.length||input.plan&&input.plan!=='managed_growth')throw Error('subscription_bundle_conflict');return {plan:'managed_growth',bundle:BUNDLE,addons:[],items:[BUNDLE]};}
 if(!PLANS[input.plan])throw Error('subscription_plan_invalid');
 return {plan:input.plan,bundle:null,addons:[...addons].sort(),items:[input.plan,...addons].sort()};
}
function selectionTerms(input) {
 const s=selection(input),monthlyCents=s.items.reduce((n,id)=>n+ITEMS[id].cents,0);
 return {...s,monthlyCents,seats:PLANS[s.plan].seats,entitlements:s.bundle?[...ITEMS[BUNDLE].entitlements]:[s.plan,...s.addons],
  name:s.bundle?ITEMS[BUNDLE].name:null};
}
function selectionMetadata(input){const s=selection(input);return {plan:s.plan,billingPackage:s.bundle||'individual'};}
function providerTerms(subscription,config) {
 assertMode(subscription,config.environment);
 const items=subscription.items?.data||[];
 if(items.length<1||items.length>3||items.some(i=>i.quantity!==1))throw Error('subscription_terms_mismatch');
 const ids=items.map(i=>priceTerms(i.price,config).itemId||config.planForPrice(i.price.id));
 if(new Set(ids).size!==ids.length)throw Error('subscription_duplicate_item');
 let chosen;if(ids.includes(BUNDLE)){if(ids.length!==1)throw Error('subscription_bundle_double_billing');chosen=selectionTerms({bundle:BUNDLE});}
 else {const bases=ids.filter(id=>PLANS[id]);if(bases.length!==1||ids.some(id=>!ITEMS[id]))throw Error('subscription_base_plan_required');chosen=selectionTerms({plan:bases[0],addons:ids.filter(id=>ADDONS[id])});}
 if(subscription.metadata?.plan!==chosen.plan || (subscription.metadata?.billingPackage&&subscription.metadata.billingPackage!==(chosen.bundle||'individual')))throw Error('subscription_plan_identity_mismatch');
 const ends=items.map(i=>Number(i.current_period_end||subscription.current_period_end)*1000);
 if(ends.some(end=>!Number.isFinite(end)||end<=0)||new Set(ends).size!==1)throw Error('subscription_period_required');
 return {...chosen,end:ends[0],price:chosen.monthlyCents/100};
}
function environment(env=process.env) {
  const value=env.APP_ENV;
  if(!['local','staging','production'].includes(value))throw Error('subscription_environment_required');
  if(env.SCALEDCIRCLE_ENV && env.SCALEDCIRCLE_ENV!==value)throw Error('subscription_environment_conflict');
  return value;
}
function credential(key,env) {
  if(!['local','staging','production'].includes(env) || typeof key!=='string' ||
      !key.startsWith(env==='production'?'sk_live_':'sk_test_'))throw Error('subscription_credential_mode_mismatch');
  return key;
}
function assertMode(object,env) {
  if(!['local','staging','production'].includes(env) || object?.livemode!==(env==='production'))throw Error('subscription_provider_mode_mismatch');
}
function priceTerms(price,{planForPrice,environment:env,requireActive=false}) {
  const plan=planForPrice?.(price?.id),expected=ITEMS[plan];
  assertMode(price,env);
  const configEnv=env==='local'?'staging':env;
  const purpose=`workspace_${expected?.kind==='ADD_ON'?'addon':expected?.kind==='BUNDLE'?'bundle':'membership'}_${configEnv}_v1`;
  const expectedProduct=`scaledcircle_${expected?.kind==='BASE_PLAN'?'workspace':plan}_${configEnv}_v1`;
  const productId=typeof price?.product==='string'?price.product:price?.product?.id;
  if(!expected || !/^price_[A-Za-z0-9]+$/.test(price?.id||'') ||
      (requireActive && price.active!==true) || price.currency!=='usd' ||
      price.unit_amount!==expected.cents || price.recurring?.interval!=='month' ||
      price.recurring.interval_count!==1 || price.recurring.usage_type!=='licensed' ||
      (price.billing_scheme && price.billing_scheme!=='per_unit') || price.transform_quantity ||
      price.metadata?.plan!==plan || price.metadata?.purpose!==purpose ||
      productId!==expectedProduct ||
      (expected.kind!=='BASE_PLAN'&&(price.metadata?.catalog_kind!==expected.kind||price.metadata?.entitlements!==expected.entitlements.join(',')||price.metadata?.seats!==String(expected.seats))) ||
      (price.metadata?.entitlements!=null&&price.metadata.entitlements!==expected.entitlements.join(',')) ||
      (price.metadata?.seats!=null&&price.metadata.seats!==String(expected.seats)) ||
      (price.metadata?.catalog_kind&&price.metadata.catalog_kind!==expected.kind))throw Error('subscription_price_binding_mismatch');
  // Retain the established base-price return contract for existing callers.
  return {plan,cents:expected.cents,seats:expected.seats,purpose,productId,version:VERSION};
}
async function certifyPrice(stripe,id,config) {
  if(!/^price_[A-Za-z0-9]+$/.test(id||''))throw Error('subscription_price_binding_missing');
  const price=await stripe.prices.retrieve(id),terms=priceTerms(price,config);
  const product=await stripe.products.retrieve(terms.productId);
  assertMode(product,config.environment);
  if(product.id!==terms.productId || product.deleted ||
      (config.requireActive && product.active!==true) || product.metadata?.purpose!==terms.purpose)
    throw Error('subscription_product_binding_mismatch');
  const item=ITEMS[terms.plan];
  if(item.kind!=='BASE_PLAN'&&(product.metadata?.catalog_kind!==item.kind||product.metadata?.entitlements!==item.entitlements.join(',')||product.metadata?.seats!==String(item.seats)))throw Error('subscription_product_binding_mismatch');
  return {price,terms};
}
async function certifySubscription(stripe,subscription,config) {
  assertMode(subscription,config.environment);
  if(!subscription.items?.data?.length || subscription.items.data.length>3 || subscription.items.data.some(i=>i.quantity!==1))
    throw Error('subscription_terms_mismatch');
  const data=[];for(const item of subscription.items.data){const {price}=await certifyPrice(stripe,item.price?.id,config);data.push({...item,price});}
  const verified={...subscription,items:{...subscription.items,data}};providerTerms(verified,config);return verified;
}
module.exports={VERSION,PLANS,ADDONS,BUNDLE,ITEMS,selection,selectionTerms,selectionMetadata,providerTerms,environment,credential,assertMode,priceTerms,certifyPrice,certifySubscription};

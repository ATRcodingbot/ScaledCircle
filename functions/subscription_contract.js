'use strict';

const VERSION='workspace_membership_v1';
const PLANS={starter:{cents:9900,seats:1},growth:{cents:29900,seats:3},
  scale:{cents:49900,seats:5},managed_growth:{cents:99900,seats:10}};
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
  const plan=planForPrice?.(price?.id),expected=PLANS[plan];
  assertMode(price,env);
  const configEnv=env==='local'?'staging':env;
  const purpose=`workspace_membership_${configEnv}_v1`;
  const productId=typeof price?.product==='string'?price.product:price?.product?.id;
  if(!expected || !/^price_[A-Za-z0-9]+$/.test(price?.id||'') ||
      (requireActive && price.active!==true) || price.currency!=='usd' ||
      price.unit_amount!==expected.cents || price.recurring?.interval!=='month' ||
      price.recurring.interval_count!==1 || price.recurring.usage_type!=='licensed' ||
      (price.billing_scheme && price.billing_scheme!=='per_unit') || price.transform_quantity ||
      price.metadata?.plan!==plan || price.metadata?.purpose!==purpose ||
      productId!==`scaledcircle_workspace_${configEnv}_v1`)throw Error('subscription_price_binding_mismatch');
  return {plan,...expected,purpose,productId,version:VERSION};
}
async function certifyPrice(stripe,id,config) {
  if(!/^price_[A-Za-z0-9]+$/.test(id||''))throw Error('subscription_price_binding_missing');
  const price=await stripe.prices.retrieve(id),terms=priceTerms(price,config);
  const product=await stripe.products.retrieve(terms.productId);
  assertMode(product,config.environment);
  if(product.id!==terms.productId || product.deleted ||
      (config.requireActive && product.active!==true) || product.metadata?.purpose!==terms.purpose)
    throw Error('subscription_product_binding_mismatch');
  return {price,terms};
}
async function certifySubscription(stripe,subscription,config) {
  assertMode(subscription,config.environment);
  if(subscription.items?.data?.length!==1 || subscription.items.data[0].quantity!==1)
    throw Error('subscription_terms_mismatch');
  const {price,terms}=await certifyPrice(stripe,subscription.items.data[0].price?.id,config);
  if(subscription.metadata?.plan!==terms.plan)throw Error('subscription_plan_identity_mismatch');
  return {...subscription,items:{...subscription.items,data:[{...subscription.items.data[0],price}]}};
}
module.exports={VERSION,PLANS,environment,credential,assertMode,priceTerms,certifyPrice,certifySubscription};

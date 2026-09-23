'use strict';
const PRIVATE=new Set(['business_assistant','growth_department','postcards']);
// New public enrollment only. Entitlements and historical provider events do
// not consult this gate; existing approved service operation is unchanged.
const COMING_SOON=new Set(['managed_growth','business_assistant','lead_generation_research','growth_department']);
const PUBLIC_PLANS=Object.freeze(['starter','growth','scale']);
// Founder-authorized public Core Business opening, September 23, 2026.
// This controls NEW Business account admission, never paid entitlement.
const PUBLIC_CORE_SIGNUP_OPEN=true;
// Registration only; Maryland activation is checked by the maintained market workflow.
const PUBLIC_MD_SCALER_REGISTRATION_OPEN=true;
function publicSignupAccess(role){
 return PUBLIC_CORE_SIGNUP_OPEN&&role==='business'
  ? {active:true,betaAccess:'approved',accessSource:'public_core_signup'}
  : PUBLIC_MD_SCALER_REGISTRATION_OPEN&&role==='scaler'
    ? {active:false,betaAccess:'pending',accessSource:'public_maryland_scaler_registration'}
    : {active:false,betaAccess:'pending'};
}
function allowed({product,businessId,grant,now=Date.now()}) {
  if(!PRIVATE.has(product))return true;
  const end=grant?.expiresAt?.toMillis?.()??grant?.expiresAtMillis;
  return grant?.businessId===businessId&&grant?.status==='approved'&&Array.isArray(grant.products)&&grant.products.includes(product)&&Number.isFinite(end)&&end>now;
}
async function assertPurchase({db,businessId,selection,existingItems=[],transaction,now=Date.now()}) {
 const products=selection?.items||[selection?.bundle||selection?.plan,...(selection?.addons||[])];
 // existingItems is supplied only from the verified current Stripe subscription,
 // never from request data. Retaining/removing an existing item is not enrollment.
 if(products.some(p=>COMING_SOON.has(p)&&!existingItems.includes(p))){
  const e=Error('This product is Coming Soon for new purchases and upgrades. Existing subscription access and cancellation remain available.');
  e.code='failed-precondition';throw e;
 }
 const restricted=products.filter(p=>PRIVATE.has(p)&&!COMING_SOON.has(p));if(!restricted.length)return;
  const ref=db.doc('privateProductAccess/'+businessId),grant=(await(transaction?transaction.get(ref):ref.get())).data();
  if(restricted.some(product=>!allowed({product,businessId,grant,now}))){const e=Error('This product is Private Beta / Coming Soon. New purchases require a current invitation. Existing membership and cancellation remain available.');e.code='failed-precondition';throw e;}
}
module.exports={PRIVATE,COMING_SOON,PUBLIC_PLANS,PUBLIC_CORE_SIGNUP_OPEN,PUBLIC_MD_SCALER_REGISTRATION_OPEN,publicSignupAccess,allowed,assertPurchase};

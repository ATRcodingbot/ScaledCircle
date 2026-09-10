'use strict';
const PRIVATE=new Set(['managed_growth','business_assistant','lead_generation_research','growth_department','postcards']);
function allowed({product,businessId,grant,now=Date.now()}) {
  if(!PRIVATE.has(product))return true;
  const end=grant?.expiresAt?.toMillis?.()??grant?.expiresAtMillis;
  return grant?.businessId===businessId&&grant?.status==='approved'&&Array.isArray(grant.products)&&grant.products.includes(product)&&Number.isFinite(end)&&end>now;
}
async function assertPurchase({db,businessId,selection,transaction,now=Date.now()}) {
  const products=selection?.items||[selection?.bundle||selection?.plan,...(selection?.addons||[])];
  const restricted=products.filter(p=>PRIVATE.has(p));if(!restricted.length)return;
  const ref=db.doc('privateProductAccess/'+businessId),grant=(await(transaction?transaction.get(ref):ref.get())).data();
  if(restricted.some(product=>!allowed({product,businessId,grant,now}))){const e=Error('This product is Private Beta / Coming Soon. New purchases require a current invitation. Existing membership and cancellation remain available.');e.code='failed-precondition';throw e;}
}
module.exports={PRIVATE,allowed,assertPurchase};

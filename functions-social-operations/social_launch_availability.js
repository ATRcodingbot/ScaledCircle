'use strict';
// Internal provider evidence is not normal-customer lifecycle certification.
function channels({isAdmin=false}={}){return isAdmin?['facebook','instagram','x','youtube']:['facebook','instagram'];}
function canConnect(provider,business){return provider==='meta'||channels(business).includes(provider);}
function canUseMarketingEmail(business){return business?.isAdmin===true;}
function invited(business, allowlist='') {
  return business?.isAdmin===true || business?.role==='business' && typeof business.uid==='string' &&
    allowlist.split(',').map(s=>s.trim()).filter(Boolean).includes(business.uid);
}
module.exports={channels,canConnect,canUseMarketingEmail,invited};

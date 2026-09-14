'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const launch=require('../functions-social-operations/social_launch_availability');
test('Social enrollment uses the current server subscription, never a plan label or invitation',()=>{
 const paid={uid:'business',role:'business',planId:'managed_growth',entitlement:{planId:'managed_growth',status:'active',expiresAt:new Date(Date.now()+86400000)}};
 assert.equal(launch.invited(paid,''),true);
 assert.equal(launch.invited(paid,'other'),true);
 assert.equal(launch.invited(paid,' business,other '),true);
 assert.equal(launch.invited({...paid,role:'scaler'},'business'),false);
 assert.equal(launch.invited({...paid,entitlement:null},'business'),false);
 assert.equal(launch.invited({...paid,entitlement:{...paid.entitlement,status:'canceled'}},'business'),false);
 assert.equal(launch.invited({isAdmin:true}),true);
});
test('normal customers only get Meta channels; internal certification cannot enable X or YouTube',()=>{
  const business={isAdmin:false,planId:'managed_growth',firstXCertificationAvailable:true};
  assert.deepEqual(launch.channels(business),['facebook','instagram']);
  for(const provider of ['x','youtube'])assert.equal(launch.canConnect(provider,business),false);
  assert.equal(launch.canConnect('meta',business),true);
  assert.equal(launch.canUseMarketingEmail(business),false);
});
test('private Admin development keeps historical provider and Email foundations',()=>{
  assert.equal(launch.canConnect('youtube',{isAdmin:true}),true);
  assert.equal(launch.canUseMarketingEmail({isAdmin:true}),true);
});

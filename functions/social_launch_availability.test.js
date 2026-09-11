'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const launch=require('../functions-social-operations/social_launch_availability');
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

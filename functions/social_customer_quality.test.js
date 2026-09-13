const test=require('node:test'),a=require('node:assert/strict'),{reviewChecks}=require('../functions-social-operations/social_customer_quality');
const variant={provider:'facebook',copy:'Before your estimate, prepare your project dimensions and preferred timing.',mediaRequirement:'none'};
test('owner review does not require a keyword/hashtag/performance score',()=>{a.equal(reviewChecks({variant}).passed,true);});
test('missing creative, invalid destination, template text and exact duplicates remain blockers',()=>{
 for(const v of [{...variant,mediaRequirement:'image'},{...variant,provider:'instagram'}, {...variant,copy:'Hello {{Business}}'}, {...variant,destinationUrl:'http://example.com'}])a.equal(reviewChecks({variant:v}).passed,false);
 a.equal(reviewChecks({variant,recentVariants:[variant]}).passed,false);
 a.equal(reviewChecks({variant,recentVariants:[{...variant,provider:'instagram'}]}).passed,true);
});
test('media review requires exact prepared output checksum and current source authority',()=>{
 const v={...variant,mediaRequirement:'image'},revision={preparation:{policy:'SocialFeedCreativeV2',pixelCheck:'passed',checkedSha256:'a'},images:[{sha256:'a'}]};
 a.equal(reviewChecks({variant:v,revision,mediaAuthorityValid:true}).passed,true);
 a.equal(reviewChecks({variant:v,revision,mediaAuthorityValid:false}).passed,false);
 a.equal(reviewChecks({variant:v,revision:{...revision,images:[{sha256:'b'}]},mediaAuthorityValid:true}).passed,false);
});
test('generated concepts retain their disclosure before owner approval',()=>{
 const disclosure='Service concept image — not completed Business work.';
 const revision={sourceOrigin:'generated_service_concept',truthfulnessDisclosure:disclosure,preparation:{policy:'SocialFeedCreativeV2',pixelCheck:'passed',checkedSha256:'a'},images:[{sha256:'a'}]};
 const v={...variant,mediaRequirement:'image'};
 a.equal(reviewChecks({variant:v,revision,mediaAuthorityValid:true}).passed,false);
 a.equal(reviewChecks({variant:{...v,copy:v.copy+'\n'+disclosure},revision,mediaAuthorityValid:true}).passed,true);
});

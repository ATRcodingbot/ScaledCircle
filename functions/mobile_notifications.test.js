'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const p=require('../functions-mobile-notifications/policy');
test('push identity carries no contact, money, provider or route details',()=>{const n={type:'business_email_reply',message:'Private customer at a private address $999',deepLink:{operationId:'secret'}};const m=p.message(n,'reply_123',{token:'device-secret'},'production');assert.deepEqual(m.data,{notificationId:'reply_123',environment:'production'});assert.equal(m.notification.body.includes('Private'),false);assert.equal(m.android.restrictedPackageName,'com.scaledcircle.app');assert.equal(m.android.notification.tag,m.apns.headers['apns-collapse-id']);});
test('cold prospects are in-app only; Growth briefs grouped; replies briefly grouped',()=>{assert.equal(p.policy({type:'agent_qualified_prospect'}),null);assert.equal(p.policy({type:'agent_daily_brief'}).immediate,false);assert.equal(p.policy({type:'business_email_reply'}).immediate,false);assert.equal(p.policy({type:'payout_failed'}).immediate,true);});
test('preferences preserve opt-out and account notices cannot be categorically disabled',()=>{assert.equal(p.preferences().enabled,false);assert.equal(p.preferences({growthDigest:false,categories:{money:false}}).growthDigest,false);assert.equal(p.preferences({categories:{money:false}}).categories.money,false);assert.equal(p.categories.includes('account'),false);assert.equal(p.policy({type:'security_notice'}).required,true);});
test('production/staging project binding fails closed',()=>{assert.equal(p.validEnvironment('scaled-circle','production'),true);assert.equal(p.validEnvironment('scaled-circle','staging'),false);assert.equal(p.validEnvironment('scaledcircle-staging','production'),false);assert.equal(p.validEnvironment('random','production'),false);});
test('only confirmed unusable tokens are removed; ambiguous sends not blindly retried',()=>{assert.equal(p.failure('messaging/registration-token-not-registered'),'invalid_device');assert.equal(p.failure('messaging/invalid-argument'),'uncertain');assert.equal(p.failure('messaging/server-unavailable'),'retryable');assert.equal(p.failure('messaging/third-party-auth-error'),'provider_configuration');});
const {signal}=require('../functions-mobile-notifications/signals');
test('actual reply event has one stable identity and no conversion inference; certification excluded',()=>{const source={businessId:'owner',operationId:'op1',providerMessageId:'provider1'};const a=signal('reply','owner/replies/provider1',null,source);assert.equal(a.identity,signal('reply','owner/replies/provider1',null,source).identity);assert.equal(a.type,'business_email_reply');assert.equal(a.deepLink.operationId,'op1');assert.equal(a.stage,undefined);assert.equal(signal('reply','id',null,{...source,certification:true}),null);});
test('submitted/reserved work and payout initiation never claim money sent',()=>{const a={kind:'scaler_cashout_v1',authorityVersion:'ProductionApprovedEarningCashoutV1',mode:'live',ownerId:'scaler'};assert.equal(signal('payout','operation',null,{...a,state:'reserved'}),null);assert.equal(signal('payout','operation',null,{...a,state:'completed'}),null);assert.equal(signal('payout','operation',null,{...a,state:'completed',settled:true,fundingTransferRecorded:true}).type,'payout_paid');assert.equal(signal('payout','operation',null,{...a,state:'payout_pending'}).type,'payout_processing');});
test('Social review does not assert approval; publication requires actual provider receipt',()=>{assert.equal(signal('social','quality',null,{businessUid:'owner',contentItemId:'item',readyToPublish:false}),null);assert.equal(signal('social','quality',null,{businessUid:'owner',contentItemId:'item',provider:'instagram',readyToPublish:true}).type,'social_drafts_ready');assert.equal(signal('published','job',null,{businessUid:'owner',status:'scheduled',customerApproval:true}),null);assert.equal(signal('published','job',null,{businessUid:'owner',status:'published',customerApproval:true,providerPostId:'actual'}).type,'social_post_published');});

test('Social notifications never guess a missing provider',()=>{assert.equal(signal('social','quality',null,{businessUid:'owner',contentItemId:'item',readyToPublish:true}),null);});

test('preparation noise and routine publications never enter push; urgent attention remains immediate',()=>{
 for(const type of ['social_post_published','generated_image_ready','creative_ready','image_ready','agent_qualified_prospect','email_sent'])assert.equal(p.policy({type}),null);
 for(const type of ['social_publishing_failed','social_connection_attention','email_campaign_attention','security_notice','earnings_available','job_assignment'])assert.equal(p.policy({type}).immediate,true);
 for(const type of ['social_drafts_ready','business_email_reply','job_opportunity'])assert.equal(p.policy({type}).aggregateMs,300000);
});
test('legacy Growth opt-out also protects the new categories',()=>{
 const prefs=p.preferences({categories:{growth:false}});assert.equal(prefs.categories.social,false);assert.equal(prefs.categories.email,false);
 assert.equal(p.preferences({categories:{growth:false,social:true}}).categories.social,true);
});
test('repeat quality assessments for the same post version share an identity',()=>{
 const after={businessUid:'owner',contentItemId:'post',provider:'facebook',readyToPublish:true,contentVersion:3};
 assert.equal(signal('social','assessment1',null,after).identity,signal('social','assessment2',null,after).identity);
 assert.equal(signal('social','a',null,{...after,humanReviewRequired:false}),null);
});

test('campaign outcomes use provider submission counts, not invented delivery or interest',()=>{
 const {summary}=require('../functions-business-email/campaign_notifications');
 const done={approved:true,status:'sent',results:{sent:7,suppressed:0}};
 assert.equal(summary({status:'sent'},done),null);
 assert.equal(summary({status:'sending'},{...done,certification:true}),null);
 const result=summary({status:'sending'},done);assert.equal(result.type,'email_campaign_completed');assert.match(result.message,/7 sent to the provider/);
 assert.equal(summary({status:'sending'},{...done,status:'needs_attention'}).type,'email_campaign_attention');
});

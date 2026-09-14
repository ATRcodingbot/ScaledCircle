'use strict';
const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v)?v:null;
const categories=['work','customers','growth','social','email','money','marketplace'];
const types={
 work:['business_schedule_update','business_estimate_reminder','job_room_message','zone_completion_submitted','completion_submitted','campaign_completed','campaign_canceled','campaign_cancelled','material_change_proposed','material_change_confirmed'],
 customers:['landing_page_inquiry','business_email_reply','customer_reply','appointment_requested'],
 growth:['agent_daily_brief','agent_weekly_report','business_recommendations_ready'],
 social:['social_drafts_ready','social_publishing_failed','social_connection_attention','social_approval_required'],
 email:['email_campaign_review_ready','email_campaign_completed','email_campaign_attention'],
 money:['worker_earning_established','earnings_available','payout_approved','payout_processing','payout_paid','payout_failed','payout_needs_attention','referral_reward_earned','referral_earned','referral_available','referral_paid','referral_adjusted','subscription_payment_failed','billing_payment_failed','subscription_updated'],
 marketplace:['job_assignment','application_accepted','application_rejected','application_received','nearby_job','campaign_opportunity','job_opportunity','travel_job_opportunity','scaler_profile_completion'],
 account:['security_notice','account_action_required','mobile_push_check'],
};
function policy(n){const category=Object.keys(types).find(c=>types[c].includes(n.type));if(!category)return null;
 const aggregateMs=['social_drafts_ready','email_campaign_review_ready','business_email_reply','customer_reply','nearby_job','campaign_opportunity','job_opportunity','travel_job_opportunity'].includes(n.type)?300000:category==='growth'||n.type==='email_campaign_completed'?3600000:0;
 return {category,aggregateMs,immediate:aggregateMs===0,required:category==='account',title:{work:'Work & schedule update',customers:'Customer activity',growth:'Growth summary',social:'Social needs your attention',email:'Email campaign update',money:'Earnings or account update',marketplace:'Work opportunity update',account:'ScaledCircle notification'}[category],body:n.type==='mobile_push_check'?'Your notification check is ready. Tap to open it.':'Open ScaledCircle to securely view the details.'};}
function preferences(value={}){return {enabled:value.enabled===true,categories:Object.fromEntries(categories.map(c=>[c,value.categories?.[c]!==false&&(!['social','email'].includes(c)||value.categories?.[c]!==undefined||value.categories?.growth!==false)])),growthDigest:value.growthDigest!==false};}
function validEnvironment(project,environment){return(project==='scaled-circle'&&environment==='production')||(project==='scaledcircle-staging'&&environment==='staging')||(/^demo-/.test(project)&&environment==='local');}
function safeRecord(n){return {type:n.type,deepLink:n.deepLink||{},campaignId:n.campaignId||null,zoneId:n.zoneId||null,metadata:n.metadata?{businessId:n.metadata.businessId||null,itemId:n.metadata.itemId||null}:null};}
function message(n,notificationId,device,environment,count=1){const p=policy(n);count=Math.max(count,n.aggregateCount||1);const collapse=hash(notificationId).slice(0,40);return {token:device.token,notification:{title:p.title,body:count>1?`${count} updates are ready. Open ScaledCircle to review them.`:p.body},data:{notificationId,environment},android:{priority:p.immediate?'high':'normal',restrictedPackageName:'com.scaledcircle.app',ttl:3600000,notification:{tag:collapse,channelId:'scaledcircle_updates',icon:'ic_stat_notification'}},apns:{headers:{'apns-collapse-id':collapse,'apns-priority':p.immediate?'10':'5','apns-expiration':String(Math.floor(Date.now()/1000)+3600)},payload:{aps:{sound:'default','thread-id':'scaledcircle_'+p.category}}}};}
function failure(code){if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code))return 'invalid_device';if(['messaging/server-unavailable','messaging/internal-error','messaging/quota-exceeded'].includes(code))return 'retryable';if(['messaging/third-party-auth-error','messaging/authentication-error','messaging/mismatched-credential'].includes(code))return 'provider_configuration';return 'uncertain';}
module.exports={hash,id,categories,policy,preferences,validEnvironment,safeRecord,message,failure};

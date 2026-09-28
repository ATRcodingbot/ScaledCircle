'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const email=require('./transactional_email');
const landing=require('./landing_page');
const push=require('../functions-mobile-notifications/policy');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
test('future Scaler alert snapshots sender while the delivery fallback preserves unversioned jobs',()=>{
 const alerts=require('./scaler_job_alert_email');
 const job=alerts.createJob({campaignId:'fixture',scalerUid:'fixture',recipient:'recipient@example.test'});
 assert.equal(job.fromName,'Scaled Circle');
 assert.equal(alerts.validateJob(job),true);
 const source=fs.readFileSync(path.join(root,'functions-job-alert-email/index.js'),'utf8');
 assert.match(source,/queued\.fromName === "Scaled Circle" \? "Scaled Circle" : "ScaledCircle"/);
});
test('old payload email renders the original approved brand without modifying customer words',()=>{
 const job={template:'landing_page_business_inquiry',payload:{businessName:'Scaled Circle customer company',customerName:'ScaledCircle customer',landingPageTitle:'Customer Scaled Circle',inquiryUrl:'https://scaledcircle.com/#/business/landing-pages'}};
 const old=email.deliveryContent(job),future=email.deliveryContent({...job,templateRevision:'brand-20260928'});
 assert.match(old.text,/from ScaledCircle/);assert.match(future.text,/from Scaled Circle/);
 assert.match(old.html,/>ScaledCircle<\/div>/);assert.match(future.html,/>Scaled Circle<\/div>/);
 for(const value of [old,future])assert.match(value.text,/ScaledCircle customer/);
});
test('future landing email creation pins the presentation revision; stored bodies stay exact',()=>{
 const job=landing.businessInquiryEmail({businessName:'Example',contact:{name:'Customer',email:'customer@example.test'},pageName:'Page',metadata:{recipient:'owner@example.test'}});
 assert.equal(job.templateRevision,'brand-20260928');
 const stored={template:'welcome_business_v2',subject:'Approved ScaledCircle',text:'Approved ScaledCircle text',html:'<p>ScaledCircle</p>',trustedHtml:true};
 assert.deepEqual(email.deliveryContent(stored),{subject:stored.subject,text:stored.text,html:stored.html});
});
test('queued push copy remains legacy and new queue revision changes presentation only',()=>{
 const n={type:'mobile_push_check'},device={token:'synthetic'};
 const old=push.message(n,'fixture',device,'local');
 const next=push.message({...n,push:{templateVersion:'MobilePushCopyV2'}},'fixture',device,'local');
 assert.equal(old.notification.title,'ScaledCircle notification');assert.equal(next.notification.title,'Scaled Circle notification');
 assert.deepEqual(old.data,next.data);assert.deepEqual(old.android,next.android);
 const src=fs.readFileSync(path.join(root,'functions-mobile-notifications/service.js'),'utf8');
 assert.match(src,/if\(!n\|\|n\.push\?\.status\)return/);assert.match(src,/templateVersion:'MobilePushCopyV2'/);
});
test('weather recheck preserves queued presentation revision',()=>{
 const p=require('./weather_delivery_policy');const event={event:'Wind',status:'active',source:'NWS',issuedAt:1,effectiveAt:1,expiresAt:2,description:'Scaled Circle is customer text',instructions:'',officialUrl:'https://weather.gov/'};
 const input={event,matches:[],timeZone:'UTC',url:'https://scaledcircle.com/',preferencesUrl:'https://scaledcircle.com/'};
 assert.match(p.content(input).subject,/ScaledCircle Weather/);assert.match(p.content({...input,templateRevision:'brand-20260928'}).subject,/Scaled Circle Weather/);
 assert.match(p.content(input).text,/Scaled Circle is customer text/);
});
test('artifact delivery preserves approved sender and body despite new global branding',async()=>{
 const delivery=require('./managed_growth_delivery');let sent;
 const job={status:'queued',template:delivery.DELIVERY_TEMPLATE,schemaVersion:delivery.DELIVERY_SCHEMA_VERSION,
  attachmentIncluded:false,fromAddress:'support@scaledcircle.com',fromName:'ScaledCircle Support',
  businessUid:'fixture',artifactId:'fixture',bodyHash:'a'.repeat(64),to:'recipient@example.test',
  subject:'Approved ScaledCircle subject',text:'Approved ScaledCircle body'};
 await delivery.processArtifactEmailJob({jobId:'fixture',job,senderEmail:'support@scaledcircle.com',senderName:'Scaled Circle Support',
  reject:async()=>assert.fail('valid historical job rejected'),claim:async()=>true,
  sendMail:async(value)=>{sent=value;return {messageId:'fixture'};},markSent:async()=>{},markFailed:async()=>assert.fail('send fixture failed'),logFailure:()=>{}});
 assert.equal(sent.from,'ScaledCircle Support <support@scaledcircle.com>');assert.equal(sent.text,job.text);
});
test('immutable old landing page keeps old platform footer while a new version opts in',()=>{
 const content={headline:'Customer ScaledCircle',supportingText:'Customer copy',valuePoints:[],style:'clean',ctaLabel:'Contact',contactFields:['name','email']};
 const old=landing.renderPage({page:{publicSlug:'fixture'},version:{content}});
 const next=landing.renderPage({page:{publicSlug:'fixture'},version:{content,brandRevision:'brand-20260928'}});
 assert.match(old,/Powered by ScaledCircle/);assert.match(next,/Powered by Scaled Circle/);
 assert.match(next,/Customer ScaledCircle/);
 const service=fs.readFileSync(path.join(root,'functions-mobile-notifications/service.js'),'utf8');
 assert.match(service,/n\.push\?\.templateVersion\|\|'MobilePushCopyV1'/);
});
for(const face of ['dark','light'])test(`${face} spaced wordmark preserves every original symbol/letter pixel`,async()=>{
 const file=`scaledcircle-lockup-${face}-surface.png`,base=path.join(root,'apps/mobile/assets/brand');
 const old=await sharp(path.join(base,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const next=await sharp(path.join(base,'wordmark-20260928',file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(old.info.width,1189);assert.equal(next.info.width,1232);assert.equal(next.info.height,145);
 for(let y=0;y<145;y++){
  assert.deepEqual(next.data.subarray(y*1232*4,(y*1232+725)*4),old.data.subarray(y*1189*4,(y*1189+725)*4));
  assert.deepEqual(next.data.subarray((y*1232+772)*4,(y*1232+1232)*4),old.data.subarray((y*1189+729)*4,(y*1189+1189)*4));
  for(let x=725;x<772;x++)assert.equal(next.data[(y*1232+x)*4+3],0);
 }
 assert.deepEqual(fs.readFileSync(path.join(base,file)),cp.execFileSync('git',['show',`dcaf3e2:apps/mobile/assets/brand/${file}`],{cwd:root,maxBuffer:3000000}));
});
test('social preview remains 1200 x 630 and the historical asset is retained',async()=>{
 const base=path.join(root,'apps/mobile/web/social');const m=await sharp(path.join(base,'scaled-circle-social-preview-20260928.png')).metadata();
 assert.equal(m.width,1200);assert.equal(m.height,630);
 assert.deepEqual(fs.readFileSync(path.join(base,'scaled-circle-social-preview.png')),cp.execFileSync('git',['show','dcaf3e2:apps/mobile/web/social/scaled-circle-social-preview.png'],{cwd:root,maxBuffer:3000000}));
});

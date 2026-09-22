'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),p=require('./weather_delivery_policy');
const now=Date.parse('2026-09-22T12:30:00Z');
const feature={id:'https://api.weather.gov/alerts/example',geometry:null,properties:{status:'Actual',event:'Flood Warning',sent:'2026-09-22T12:00:00Z',effective:'2026-09-22T12:00:00Z',expires:'2026-09-22T18:00:00Z',severity:'Severe'}};
function input(){const event=p.event(feature,now);return {userId:'owner',job:{businessUid:'owner',to:'owner@example.com',eventId:event.eventId,eventRevision:event.revision},owner:{uid:'owner',emailVerified:true,email:'owner@example.com'},entitled:true,preferences:{emailEnabled:true,emailEnabledAt:now-86400000,timeZone:'America/New_York',quietHours:{enabled:true,startMinute:1320,endMinute:480}},event,matches:[{name:'Saved area',reason:'Intersects saved area',partial:true}],now};}
test('dispatch rechecks tenant, current recipient, opt out, area and event revision',()=>{
 assert.equal(p.decision(input()).state,'eligible');
 for(const change of [{userId:'other'},{entitled:false},{matches:[]},{owner:{...input().owner,email:'other@example.com'}},{preferences:{...input().preferences,emailEnabled:false}},{event:{...input().event,revision:'new'}}])assert.equal(p.decision({...input(),...change}).state,'suppressed');
});
test('quiet hours are weather-specific; urgency requires explicit owner opt-in',()=>{
 const x=input();x.now=Date.parse('2026-09-22T11:00:00Z');assert.equal(p.decision(x).state,'held_quiet');
 x.preferences.urgentOutsideQuietHours=true;assert.equal(p.decision(x).state,'eligible');
 x.event.status='cancelled';assert.equal(p.decision(x).state,'held_quiet');
});
test('expiry, prior opt-in, updates and cancellation retain distinct states',()=>{
 const x=input();assert.equal(p.decision({...x,now:x.event.expiresAt}).reason,'weather_event_expired');
 x.preferences.emailEnabledAt=now;assert.equal(p.decision(x).reason,'weather_before_email_opt_in');
 const cancelled=p.event({...feature,properties:{...feature.properties,messageType:'Cancel'}},now);assert.equal(cancelled.status,'cancelled');assert.notEqual(cancelled.revision,x.event.revision);
});
test('official content has local times and partial overlap without inferred commercial demand',()=>{
 const x=input(),result=p.content({...x,timeZone:'America/New_York',url:'https://scaledcircle.com/#/business/weather',preferencesUrl:'https://scaledcircle.com/#/business/weather-preferences'});
 assert.match(result.text,/EDT/);assert.match(result.text,/Only part/);assert.doesNotMatch(result.text,/lead activity|repair jobs|customer demand/);
});

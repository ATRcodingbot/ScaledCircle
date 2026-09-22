'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../functions-social-operations/social_cadence_policy');
const b=require('../functions-social-operations/social_bounded_authority');
const now=Date.parse('2030-06-01T12:00:00Z');
function policy(target=5){return {businessUid:'owner',providers:['facebook','instagram'],startsAt:now,endsAt:now+30*c.DAY,maxPerWeek:target,
 cadence:{...c.initialize({scope:{maxPerWeek:target,providers:['facebook','instagram'],cadenceSettings:{mode:'adaptive'},timeZone:'America/New_York'},now:now-60*c.DAY})}};}
function observations(){return Array.from({length:16},(_,n)=>({businessUid:'owner',provider:'facebook',format:'feed',paidPromotion:false,source:'meta_graph_read_only',scope:'post',hoursAfterPublication:168,publicationJobId:'p'+n,observedAt:new Date(now-(n<8?7:35)*c.DAY).toISOString(),qualityReady:true,fatigueObserved:false,metrics:[{name:'reach',value:100,status:'OBSERVED',period:'lifetime'},{name:'total_interactions',value:n<8?40:10,status:'OBSERVED',period:'lifetime'},{name:'link_clicks',value:4,status:'OBSERVED',period:'lifetime'}]}));}
test('five target counts legacy jobs; independent channel/tenant; no catch-up burst',()=>{
 const p=policy(),history=[];
 for(let i=0;i<5;i++){const at=b.nextSlot({policy:p,history,provider:'facebook',now});assert.ok(at);history.push({businessUid:'owner',provider:'facebook',status:'scheduled',scheduledFor:at});}
 const sixth=Date.parse(b.nextSlot({policy:p,history,provider:'facebook',now}));assert.ok(sixth>=now+c.WEEK);
 assert.ok(Date.parse(b.nextSlot({policy:p,history,provider:'instagram',now}))<now+c.WEEK);
 for(let i=1;i<history.length;i++)assert.ok(Date.parse(history[i].scheduledFor)-Date.parse(history[i-1].scheduledFor)>=c.WEEK/5*0.8);
 assert.ok(Date.parse(b.nextSlot({policy:p,history:[{...history[0],businessUid:'other'}],provider:'facebook',now}))<now+c.DAY);
});
test('adaptive evidence can cross seven and adjust by more than one',()=>{
 const r=c.evaluate({uid:'owner',provider:'facebook',policy:policy(8),observations:observations(),now});
 assert.equal(r.decision,'INCREASE');assert.equal(r.currentPerWeek,16);
 assert.equal(c.setting({mode:'adaptive'},14).maxPerWeek,undefined);
 assert.ok(c.valid(policy(28).cadence,['facebook','instagram']));
});
test('missing/unequal-age/paid/other-provider data hold, never become poor performance',()=>{
 for(const rows of [[],observations().map(r=>({...r,paidPromotion:undefined})),observations().map(r=>({...r,hoursAfterPublication:24})),observations().map(r=>({...r,provider:'instagram'})),observations().map(r=>({...r,businessUid:'other'}))]){
 const r=c.evaluate({uid:'owner',provider:'facebook',policy:policy(),observations:rows,now});assert.equal(r.decision,'HOLD');assert.equal(r.currentPerWeek,5);}
});
test('recent adjustment holds while its results mature; fixed does not silently adapt',()=>{
 const p=policy();p.cadence.platforms.facebook.lastAdjustedAt=now-7*c.DAY;
 assert.equal(c.evaluate({uid:'owner',provider:'facebook',policy:p,observations:observations(),now}).currentPerWeek,5);
 p.cadence.mode='fixed';p.cadence.platforms.facebook.lastAdjustedAt=null;
 assert.equal(c.evaluate({uid:'owner',provider:'facebook',policy:p,observations:observations(),now}).currentPerWeek,5);
});
test('quality/fatigue and weaker measured business response prevent increase',()=>{
 for(const rows of [observations().map(r=>({...r,qualityReady:false})),observations().map(r=>({...r,fatigueObserved:true})),observations().map((r,i)=>({...r,metrics:r.metrics.map(m=>m.name==='link_clicks'&&i<8?{...m,value:0}:m)}))])assert.equal(c.evaluate({uid:'owner',provider:'facebook',policy:policy(),observations:rows,now}).decision,'HOLD');
});
test('stale comparable results and mixed provider accounts hold rather than adjusting cadence',()=>{
 const old=observations().map(r=>({...r,observedAt:new Date(Date.parse(r.observedAt)-86400000).toISOString()}));
 const stale=c.evaluate({uid:'owner',provider:'facebook',policy:policy(),observations:old,now});
 assert.equal(stale.decision,'HOLD');assert.match(stale.reason,/seven days old/);
 const mixed=observations().map((r,i)=>({...r,providerAccountId:i<8?'new-account':'old-account'}));
 const result=c.evaluate({uid:'owner',provider:'facebook',policy:policy(),observations:mixed,now});
 assert.equal(result.decision,'HOLD');assert.match(result.reason,/different provider accounts/);
});

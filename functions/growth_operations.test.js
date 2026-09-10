'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const growth=require('../functions-agentic-growth/growth_operations');
const catalog=require('../functions-agentic-growth/growth_sources');
const availability=require('./product_availability');
test('dogfood has exact authenticated tenant and staging binding',()=>{
  const scope={project:'scaledcircle-staging',target:'owner',actor:{uid:'owner',verified:true,active:true,role:'admin'}};
  growth.assertScope(scope);
  for(const bad of [{...scope,project:'scaled-circle'},{...scope,actor:null},{...scope,actor:{...scope.actor,uid:'other'}},{...scope,actor:{...scope.actor,verified:false}},{...scope,actor:{...scope.actor,role:'business'}}])assert.throws(()=>growth.assertScope(bad));
});
test('organization sources never invent individual workforce facts or contacts',()=>{
  const s=catalog[0],r=growth.analyzeSource(s,'<html>Unrelated page</html>',100);
  assert.equal(r.qualified,false);assert.equal(r.email,null);assert.equal(r.phone,null);
  const valid=growth.analyzeSource(s,'Glen Burnie Landscape 443-782-5489',100);
  assert.equal(valid.qualified,true);assert.equal(valid.phone,'443-782-5489');assert.equal(valid.contactConfidence,'source_published_not_contact_authorized');
  assert.equal(catalog.filter(x=>x.kind==='referral_partner').length,3);
});
test('hidden learning suppresses small cohorts and rejects private/freeform dimensions',()=>{
  const rows=Array.from({length:20},(_,i)=>({businessUid:'b'+i%5,industry:'landscaping',channel:'email',outcome:'positive_reply',verifiedOutcome:true,email:'secret@example.org',privateText:'private'}));
  const out=growth.networkPattern(rows);assert.equal(out.status,'AVAILABLE');assert.equal(JSON.stringify(out).includes('secret'),false);
  assert.equal(growth.networkPattern(rows.slice(0,4)).status,'INSUFFICIENT_EVIDENCE');
  assert.equal(growth.networkPattern(rows.map(x=>({...x,verifiedOutcome:false}))).status,'INSUFFICIENT_EVIDENCE');
  assert.equal(growth.recommendationEvidence({local:['own'],network:['network']}).source,'business');
});
test('reports distinguish partner organizations, unknown conversion and zero outreach',()=>{
  const r=growth.report([{kind:'referral_partner',qualified:true,approvalState:'awaiting_approval'}],[]);
  assert.equal(r.partnersFound,1);assert.equal(r.individualScalersFound,0);assert.equal(r.contacted,0);assert.equal(r.paid,null);
});
test('communication preferences validate exact input and daily/weekly independently',()=>{
  assert.deepEqual(growth.preferences({mode:'off'}),{mode:'off',important:false,daily:false,weekly:false});
  assert.equal(growth.preferences({mode:'daily_weekly'}).weekly,true);
  assert.throws(()=>growth.preferences({mode:'daily',to:'other@example.org'}));
});
test('premium purchases fail closed while ordinary plans remain available',()=>{
  for(const product of ['starter','growth','scale'])assert.equal(availability.allowed({product}),true);
  for(const product of availability.PRIVATE){assert.equal(availability.allowed({product,businessId:'biz'}),false);
    const grant={businessId:'biz',status:'approved',products:[product],expiresAtMillis:200};
    assert.equal(availability.allowed({product,businessId:'biz',grant,now:100}),true);
    assert.equal(availability.allowed({product,businessId:'other',grant,now:100}),false);
    assert.equal(availability.allowed({product,businessId:'biz',grant,now:201}),false);
  }
});

test('growth report jobs are accepted only with bounded preferences and no unrelated templates',()=>{
 const email=require('./transactional_email');
 const job={template:'growth_agent_report_v1',businessUid:'owner',preferenceKind:'daily',to:'support@scaledcircle.com',fromAddress:'support@scaledcircle.com',text:'Real report'};
 assert.equal(email.validateDeliveryJob(job),true);
 assert.equal(email.validateDeliveryJob({...job,preferenceKind:'every_event'}),false);
});

test('staging compatibility boundary preserves ordinary billing and rejects uninvited purchases before delegation',async()=>{
 const {wrap}=require('./staging_purchase_boundary');let calls=0;
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const records={};const db={doc:path=>({get:async()=>({data:()=>records[path]})})};
 const invoke=wrap({original:{run:async r=>{calls++;return r.data.action||'checkout';}},db,project:'scaledcircle-staging',HttpsError});
 const auth={uid:'owner'};
 await assert.rejects(invoke({data:{plan:'starter'}}),e=>e.code==='unauthenticated');
 await assert.rejects(invoke({auth,data:{plan:'managed_growth'}}),e=>e.code==='failed-precondition');
 assert.equal(calls,0);
 assert.equal(await invoke({auth,data:{plan:'starter'}}),'checkout');
 assert.equal(await invoke({auth,data:{action:'cancel'}}),'cancel');
 assert.equal(await invoke({auth,data:{action:'reactivate'}}),'reactivate');
 records['businessBillingQuotes/q']={actorUid:'other',businessId:'owner',plan:'scale'};
 await assert.rejects(invoke({auth,data:{action:'changePlan',quoteId:'q'}}),e=>e.code==='permission-denied');
 records['businessBillingQuotes/q']={actorUid:'owner',businessId:'owner',plan:'managed_growth'};
 await assert.rejects(invoke({auth,data:{action:'changePlan',quoteId:'q'}}),e=>e.code==='failed-precondition');
 assert.equal(calls,3);
 const prod=wrap({original:{run:async()=>{calls++;}},db,project:'scaled-circle',HttpsError});
 await assert.rejects(prod({auth,data:{plan:'starter'}}),e=>e.code==='failed-precondition');
 assert.equal(calls,3);
});

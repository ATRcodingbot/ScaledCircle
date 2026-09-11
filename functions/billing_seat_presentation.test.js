'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBillingService}=require('./workspace_billing');
function setup({plan='growth',members=[],invitations=[],failInventory=false,allow=true}={}){
 const provider={id:'sub_local',customer:'cus_local',status:'active',metadata:{firebaseUid:'owner'},cancel_at_period_end:false,items:{data:[{quantity:1,id:'si_local',price:{id:'price_'+plan},current_period_end:2000000000}]}};
 let inventoryReads=0;
 const db={doc:p=>({get:async()=>({data:()=>p==='wallets/owner'?{stripeSubscriptionId:'sub_local',stripeCustomerId:'cus_local'}:{}})})};
 const workspace={actor:async()=>{},authority:async input=>{assert.equal(input.permission,'billing');if(!allow)throw Object.assign(Error('Not authorized'),{code:'permission-denied'});return {businessId:'owner',entitlement:{stripeSubscriptionId:'sub_local'}};},inventory:async()=>{inventoryReads++;if(failInventory)throw Error('Local simulated read failure');return {members,invitations};}};
 return {billing:createBillingService({db,FieldValue:{},workspace,stripe:()=>({subscriptions:{retrieve:async()=>provider}}),planForPrice:()=>plan,priceForPlan:()=> 'price_'+plan,sync:async()=>{},now:()=>1800000000000}),get reads(){return inventoryReads;}};
}
test('owner counts in Starter seat; no extra seats invented',async()=>{const f=setup({plan:'starter'}),v=await f.billing.get({uid:'owner',businessId:'owner'});assert.equal(v.seatsUsed,1);assert.equal(v.seatLimit,1);assert.equal(v.seatsAvailable,0);});
test('Growth reserves pending invitation, ignores expired invitation and returns no private membership identities',async()=>{const f=setup({members:[{status:'active',uid:'private-member',email:'private@example.test'}],invitations:[{status:'pending',expiresAt:{toMillis:()=>1900000000000}},{status:'pending',expiresAt:{toMillis:()=>1700000000000}}]}),v=await f.billing.get({uid:'owner',businessId:'owner'});assert.equal(v.seatsUsed,2);assert.equal(v.seatLimit,3);assert.equal(v.seatsReserved,1);assert.equal(v.seatsAvailable,0);assert.equal(JSON.stringify(v).includes('private-member'),false);});
test('seat read failure is explicit; cancellation availability is preserved',async()=>{const f=setup({failInventory:true}),v=await f.billing.get({uid:'owner',businessId:'owner'});assert.equal(v.seatStatus,'unavailable');assert.equal(v.seatsUsed,undefined);assert.equal(v.canCancel,true);});
test('unauthorized Billing actor cannot read seat inventory',async()=>{const f=setup({allow:false});await assert.rejects(f.billing.get({uid:'unrelated',businessId:'owner'}),{code:'permission-denied'});assert.equal(f.reads,0);});

test('complimentary access is a read-only display, never a Stripe membership or new entitlement',async()=>{
 const entitlement={plan:'managed_growth',status:'active',comped:true,expiresAt:{toMillis:()=>2000000000000}};
 let reads=0;const workspace={actor:async()=>{},authority:async()=>({businessId:'owner',entitlement}),inventory:async()=>{reads++;return {members:[],invitations:[]};}};
 const db={doc:()=>({get:async()=>({data:()=>({})})})};
 const billing=createBillingService({db,FieldValue:{},workspace,stripe:()=>{throw Error('No provider call permitted');},sync:()=>{throw Error('No write permitted');},now:()=>1800000000000});
 const v=await billing.get({uid:'owner',businessId:'owner'});
 assert.equal(v.complimentary,true);assert.equal(v.monthlyCents,0);assert.equal(v.seatLimit,10);assert.equal(v.seatsUsed,1);assert.equal(v.canCancel,false);assert.deepEqual(v.addons,[]);assert.equal(reads,1);
 entitlement.status='expired';await assert.rejects(billing.get({uid:'owner',businessId:'owner'}),{code:'failed-precondition'});
 assert.equal(entitlement.plan,'managed_growth');
});
for(const [plan,capacity,monthly] of [['starter',1,99],['growth',3,299],['scale',5,499],['managed_growth',10,999],['growth_department',10,2000]])
 test(plan+' keeps the frozen owner-inclusive capacity and price',async()=>{const f=setup({plan}),v=await f.billing.get({uid:'owner',businessId:'owner'});assert.equal(v.seatLimit,capacity);assert.equal(v.seatsUsed,1);assert.equal(v.seatsAvailable,capacity-1);assert.equal(v.price,monthly);});

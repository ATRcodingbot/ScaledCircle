'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-schedule'},'email-schedule'),db=app.firestore();
const {createService}=require('../functions-business-operations/service'),{inboundDigest}=require('../functions-business-operations/email_scheduling');
const at=Date.parse('2026-09-21T14:00:00Z'),start=at+3600000;let seq=0;
const authority=async request=>{const businessId=request.data.businessId,uid=request.auth.uid;if(uid!==businessId)throw Object.assign(Error('owner'),{code:'permission-denied'});return {businessId,actorUid:uid,ownerUid:uid,isOwner:true,permissions:[],activePaid:true,capacity:1,actorName:'Fixture owner'};};
const svc=createService({db,FieldValue:admin.firestore.FieldValue,authority,now:()=>at});
const call=(operation,input,requestId='fixture_request_'+(++seq),businessId='owner')=>svc.execute({auth:{uid:businessId},data:{businessId,operation,input,requestId}});
const reply={id:'reply',businessId:'owner',operationId:'op',providerMessageId:'gmail-inbound',receivedAt:at-1000,from:'contact@example.test',body:'Yes, that time works.',classification:'substantive'};
const emailConversation=()=>({operationId:'op',inboundDigest:inboundDigest([{...reply}]),availabilityVersion:1});
const item=()=>({title:'Fixture estimate',type:'estimate',customerId:'customer',startMs:start,durationMinutes:30,timeZone:'America/New_York',assignedPeople:['user:owner'],status:'tentative'});
beforeEach(async()=>{for(const col of ['businessOperations','businessMailboxes','businessWorkspaces','users','notifications','agentPermissions'])for(const ref of await db.collection(col).listDocuments())await db.recursiveDelete(ref);
 await db.doc('users/owner').set({name:'Fixture owner'});
 await db.doc('businessOperations/owner/customers/customer').set({businessId:'owner',name:'Fixture contact',email:'contact@example.test',stage:'replied',assignedPeople:[],version:1});
 await db.doc('businessMailboxes/owner').set({status:'connected',permissions:{read:true}});
 await db.doc('businessMailboxes/owner/operations/op').set({businessId:'owner',state:'sent',recipient:'contact@example.test',crmCustomerId:'customer'});
 await db.doc('businessMailboxes/owner/replies/reply').set(reply);
 await call('saveSchedulingAvailability',{expectedVersion:0,settings:{timeZone:'America/New_York',days:[1,2,3,4,5],opensMinute:540,closesMinute:1020,durationMinutes:30,bufferMinutes:15,assignedPeople:['user:owner'],locationRequired:false}});
});
after(()=>app.delete());

test('exact accepted owner-offered slot confirms through the existing Schedule transaction once',async()=>{
 await db.doc('businessMailboxes/owner').update({generation:'g1'});
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').set({businessId:'owner',status:'active',connectionGeneration:'g1',policy:{expiresAt:at+86400000,bookingEnabled:true,availabilityRevision:1}});
 const offered=await call('saveItem',{expectedVersion:0,item:item(),emailConversation:{...emailConversation(),authorizeAcceptedSlot:true}},'bounded_offer_123');
 assert.ok(offered.acceptanceCode);
 await db.doc('businessMailboxes/owner/replies/accepted').set({...reply,id:'accepted',providerMessageId:'provider-acceptance',receivedAt:at,body:'Please book '+offered.acceptanceCode});
 const result=await svc.acceptEmailOffer({auth:{uid:'owner'},data:{businessId:'owner'}});assert.equal(result.results[0].saved,true);
 await svc.acceptEmailOffer({auth:{uid:'owner'},data:{businessId:'owner'}});
 const saved=(await db.doc('businessOperations/owner/items/'+offered.itemId).get()).data();assert.equal(saved.status,'scheduled');assert.equal(saved.version,2);
 assert.equal(saved.emailLink.approvalSource,'owner_authorized_exact_slot_acceptance');assert.equal(saved.emailLink.confirmationEmailState,'not_requested');
 assert.equal((await db.collection('businessOperations/owner/items').get()).size,1);
});
test('tentative offer is distinct; owner-reviewed acceptance confirms same linked item once without sending email',async()=>{
 const prepared=await call('saveItem',{expectedVersion:0,item:item(),emailConversation:emailConversation()},'fixture_offer_12345');
 assert.equal((await db.doc('businessOperations/owner/customers/customer').get()).data().stage,'replied');
 const confirmation={itemId:prepared.itemId,expectedVersion:1,item:{...item(),status:'scheduled'},emailConversation:{...emailConversation(),acceptanceReplyId:'reply',ownerConfirmsAcceptance:true}};
 const result=await call('saveItem',confirmation,'fixture_confirm_123');assert.equal((await call('saveItem',confirmation,'fixture_confirm_123')).duplicate,true);
 assert.equal(result.itemId,prepared.itemId);
 const saved=(await db.doc('businessOperations/owner/items/'+prepared.itemId).get()).data();assert.equal(saved.status,'scheduled');assert.equal(saved.emailLink.operationId,'op');assert.equal(saved.emailLink.confirmationEmailState,'not_requested');
 assert.equal((await db.doc('businessOperations/owner/customers/customer').get()).data().stage,'estimate_scheduled');
 assert.equal((await db.collection('businessOperations/owner/items').get()).size,1);
});
test('new inbound, missing timezone/availability, ambiguous acceptance and conflicts cannot confirm',async()=>{
 await assert.rejects(call('saveItem',{expectedVersion:0,item:{...item(),status:'scheduled'},emailConversation:emailConversation()}),/acceptance/);
 await assert.rejects(call('saveItem',{expectedVersion:0,item:item(),emailConversation:{...emailConversation(),inboundDigest:'stale'}}),{code:'aborted'});
 await assert.rejects(call('saveItem',{expectedVersion:0,item:{...item(),timeZone:'UTC'},emailConversation:emailConversation()}),/availability/);
 await call('saveItem',{expectedVersion:0,item:item(),emailConversation:emailConversation()});
 await assert.rejects(call('saveItem',{expectedVersion:0,item:{...item(),startMs:start+40*60000}}),/already scheduled/);
 await db.doc('businessOperations/owner/settings/scheduling').delete();
 await assert.rejects(call('saveItem',{expectedVersion:0,item:item(),emailConversation:emailConversation()}),/Availability changed/);
});
test('cancel retains same event/history and direct status changes cannot turn a tentative offer into confirmation',async()=>{
 const created=await call('saveItem',{expectedVersion:0,item:item(),emailConversation:emailConversation()});
 await assert.rejects(call('setItemStatus',{itemId:created.itemId,expectedVersion:1,status:'scheduled'}),/conversation/);
 await call('removeItem',{itemId:created.itemId,expectedVersion:1,removalAction:'cancel'});
 const saved=(await db.doc('businessOperations/owner/items/'+created.itemId).get()).data();assert.equal(saved.status,'canceled');assert.equal(saved.emailLink.operationId,'op');
});

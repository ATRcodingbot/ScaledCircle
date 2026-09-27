'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {TEST_RETIREMENT_ID:I,TEST_RETIREMENT_PATHS:P,planTestRetirement,createTestRetirementService}=require('./production_hygiene_admin.cjs');
function fixture(){
 const actor={kind:'google_iam_admin',email:'admin@example.invalid'};
 const review={projectId:'scaled-circle',operatorEmail:actor.email,identity:{...I},
  ownerConfirmation:'Test only; no genuine worker obligation',noGenuineOngoingWork:true,
  preserveAllFinancialHistory:true,authorizationReference:'Synthetic test of explicit owner approval'};
 const common={campaignId:I.campaign,businessId:I.business};
 const data={campaign:{businessId:I.business,campaignName:'Columbia',status:'accepted',fundingStatus:'reserved'},
  zone:{...common,assignedScalerId:I.scaler,status:'submitted',submittedCompletionId:I.completion,routeId:I.route,eligibleForPayment:false},
  completion:{...common,scalerId:I.scaler,status:'submitted',routeId:I.route,eligibleForPayment:false,routeSimulated:false},
  route:{...common,scalerId:I.scaler,zoneId:I.zone,endedAt:'2026-08-10T20:46:50.637Z',tracking:false,simulated:false},
  payout:{...common,scalerId:I.scaler,status:'pending_review',calculationStatus:'redo_required',basePay:25,bonus:0},
  discovery:{...common,status:'accepted'},application:{...common,status:'accepted',assignedZoneId:I.zone,scalerId:I.scaler},
  owner:{role:'business',email:'attractiveremodel@gmail.com'},scaler:{role:'scaler'},
  grant:{type:'promotional_credit',developmentOnly:true,cashValue:0,amount:10000,promoKey:'development-business-10000-v1'},
  subscription:{type:'subscription_payment',amount:499},reserve:{type:'campaign_reserve',campaignId:I.campaign,amount:50,totalCharge:55,platformFee:5},
  wallet:{ownerId:I.business,ownerType:'business',availableCredits:9446,reservedCredits:50}};
 const state={rows:Object.entries(data).map(([key,value])=>({path:P[key],data:value,version:'1:0'})),queries:{}};
 return {actor,review,state,data};
}
test('Exact owner-confirmed test retirement preserves original non-simulated evidence and all financial history',()=>{
 const f=fixture(),before=JSON.stringify(f.state),p=planTestRetirement(f.state,f.review,f.actor);
 assert.equal(p.financialRecordsChanged,0);assert.equal(JSON.stringify(f.state),before);
 assert.deepEqual(Object.keys(p.patches).sort(),[P.campaign,P.zone,P.completion,P.discovery].sort());
 assert.equal(p.patches[P.zone].status,'test_retired');assert.equal(p.patches[P.campaign].workEntryClosed,true);
 assert.equal(p.before.find(x=>x.path===P.completion).data.routeSimulated,false);
 assert.equal(p.before.find(x=>x.path===P.campaign).data.status,'accepted');
});
test('Owner disposition, IAM Admin and exact immutable identity are mandatory',()=>{
 for(const mutate of [f=>f.review.ownerConfirmation='',f=>f.review.noGenuineOngoingWork=false,
 f=>f.review.preserveAllFinancialHistory=false,f=>f.review.identity.campaign='another',
 f=>f.actor.kind='business',f=>f.actor.email='other@example.invalid',f=>f.review.projectId='staging']){
  const f=fixture();mutate(f);assert.throws(()=>planTestRetirement(f.state,f.review,f.actor));
 }
 assert.throws(()=>createTestRetirementService({projectId:'scaled-circle',review:fixture().review,actor:{kind:'business'}}));
});
test('LIVE, missing, ambiguous, earned or active evidence is held without writes',()=>{
 for(const mutate of [f=>f.data.campaign.stripePaymentIntentId='pi_live',f=>f.data.reserve.livemode=true,
 f=>f.data.grant.developmentOnly=false,f=>f.data.grant.cashValue=1,f=>f.data.wallet.availableCredits++,
 f=>f.data.zone.gpsTracking=true,f=>f.data.route.tracking=true,f=>delete f.data.route.endedAt,
 f=>f.data.zone.activeTrackingSessionId='s',f=>f.data.completion.eligibleForPayment=true,
 f=>f.data.payout.status='paid',f=>f.data.payout.basePay=30,f=>f.state.rows.pop(),
 f=>f.state.rows.push({path:'scalerEarnings/new',data:{campaignId:I.campaign,amountCents:2500},version:'1:0'})]){
  const f=fixture();mutate(f);assert.throws(()=>planTestRetirement(f.state,f.review,f.actor));
 }
});
test('Version and newly discovered relationship invalidate reviewed seal',()=>{
 const f=fixture(),p=planTestRetirement(f.state,f.review,f.actor);f.state.rows[0].version='2:0';
 assert.notEqual(planTestRetirement(f.state,f.review,f.actor).seal,p.seal);
});
test('Maintained Admin and earnings projections exclude retired queue state without changing balances',()=>{
 const f=fixture(),state=planTestRetirement(f.state,f.review,f.actor);
 const {completionIssues}=require('../functions/admin_ops_read_model');
 assert.deepEqual(completionIssues([{id:I.completion,data:{...f.data.completion,...state.patches[P.completion]}}],new Set(),Date.now()),[]);
 const {project}=require('../functions/scaler_earnings_view');
 const result=project({wallet:{availableBalance:2.64},ledger:[{id:'real',type:'scaler_earnings',walletSide:'scaler',amount:2.64}],
  zones:[{id:I.zone,...f.data.zone,...state.patches[P.zone]}],campaigns:new Map(),contracts:new Map(),staging:false});
 assert.equal(result.awaitingReviewCents,0);assert.equal(result.availableCents,264);assert.equal(result.lifetimeCents,264);
});
module.exports={fixture};

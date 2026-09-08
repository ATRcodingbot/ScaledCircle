'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {project}=require('./scaler_earnings_view');
const fixture=()=>({wallet:{availableBalance:2.64,pendingBalance:987,cashoutAvailableCents:10000},
 ledger:[{id:'old',type:'scaler_earnings',walletSide:'scaler',amount:2.64}],
 zones:[{id:'v3',campaignId:'c',status:'submitted',reviewStatus:'verification_pending',calculatedTransferAmountCents:1800,calculatedBonusAmountCents:300,completionPercentage:98.58515}],
 campaigns:new Map([['c',{campaignName:'Retest'}]]),contracts:new Map([['v3',{baseAmountCents:1500}]]),staging:true});
test('Wallet available, submitted expected and lifetime are distinct; pending and fixture funds never added',()=>{
 const input=fixture(), before=JSON.stringify(input);const p=project(input);
 assert.equal(p.availableCents,264);assert.equal(p.awaitingReviewCents,1800);assert.equal(p.lifetimeCents,264);
 assert.equal(p.payoutPendingCents,0);assert.equal(p.activity[1].amountCents,1800);assert.equal(JSON.stringify(input),before);
});
test('posted payment and repeated ledger identity clear review only once',()=>{
 const f=fixture();f.wallet.availableBalance=20.64;
 const posted={id:'earning_v3_v1',type:'scaler_earnings',zoneId:'v3',transferOperationId:'one',amountCents:1800,status:'available'};
 f.ledger.push(posted,{...posted,id:'duplicate_projection'});
 const p=project(f);assert.equal(p.availableCents,2064);assert.equal(p.lifetimeCents,2064);assert.equal(p.awaitingReviewCents,0);
 assert.equal(p.activity.filter(a=>a.kind==='approved').length,2);
});
test('actual pending withdrawal alone contributes to Payout Pending; failed/finished and expected compensation do not',()=>{
 const f=fixture();f.ledger.push({id:'request',type:'withdrawal',amountCents:500,status:'pending'},
 {id:'failed',type:'withdrawal',amountCents:600,status:'failed'},{id:'done',type:'withdrawal',amountCents:700,status:'completed'});
 const p=project(f);assert.equal(p.payoutPendingCents,500);assert.equal(p.lifetimeCents,264);
});
test('unknown review amount remains unknown, never fake zero or policy recalculation',()=>{
 const f=fixture();f.zones[0].reviewMode='technical_review';const p=project(f);
 assert.equal(p.reviewAmountUnknown,true);assert.equal(p.activity.find(a=>a.kind==='awaiting_review').amountCents,null);
});
test('production excludes TEST ledger entries; pending/failed earnings and business credits never become lifetime',()=>{
 const f=fixture();f.staging=false;f.ledger.push(...[
 {type:'scaler_earnings',mode:'test'},{type:'scaler_earnings',status:'pending'},
 {type:'scaler_earnings',status:'failed'},{type:'scaler_earnings',walletSide:'business'},
 {type:'deposit'},].map((r,i)=>({...r,id:'x'+i,amountCents:9900})));
 assert.equal(project(f).lifetimeCents,264);assert.equal(project(f).environment,'production');
});
test('corrupt money fails visibly instead of invented balances',()=>{
 const f=fixture();f.wallet.availableBalance=NaN;assert.throws(()=>project(f));
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertNewPaidWork}=require('./paid_work_launch_gate');
test('production new funding fails closed until explicit LIVE certification activation',()=>{
 for(const enabled of [undefined,'',false,true,'false','TRUE'])assert.throws(()=>assertNewPaidWork({project:'scaled-circle',enabled}),{code:'failed-precondition',reason:'LIVE_PAYOUT_READINESS_REQUIRED'});
 assert.doesNotThrow(()=>assertNewPaidWork({project:'scaled-circle',enabled:'true'}));
 for(const project of ['scaledcircle-staging','demo-scaledcircle'])assert.doesNotThrow(()=>assertNewPaidWork({project,enabled:'false'}));
 assert.throws(()=>assertNewPaidWork({project:'unknown',enabled:'true'}));
});

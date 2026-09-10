'use strict';
function invoiceFixture(){return {invoice:{id:'in_fixture',livemode:false,customer:'cus_fixture',subscription:'sub_fixture',
  currency:'usd',status:'paid',amount_remaining:0,amount_paid:31700,total_excluding_tax:29900,
  total_taxes:[{amount:1800}],status_transitions:{paid_at:100},created:90,billing_reason:'subscription_cycle',
  lines:{data:[{price:'price_fixture',amount:29900}],has_more:false}},
  subscription:{id:'sub_fixture',livemode:false,customer:'cus_fixture'},
  payments:[{livemode:false,status:'paid',invoice:'in_fixture',amount_paid:31700,chargeVerified:true}],
  refunds:[],creditNotes:[],disputes:[],certifiedPriceIds:['price_fixture']};}
module.exports={invoiceFixture};

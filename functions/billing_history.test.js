'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {history}=require('./billing_history');
test('history shows only reconciled actual paid invoices for the authorized workspace',async()=>{
 const invoices=[{id:'in_paid',customer:'cus_owner',status:'paid',livemode:true,currency:'usd',amount_paid:100,created:10,hosted_invoice_url:'https://invoice.stripe.com/i/owner'}, {id:'in_unreconciled',status:'paid'}, {id:'in_other',status:'paid'}];
 const records={in_paid:{businessId:'owner',amountCents:100,stripeMode:'live'},in_other:{businessId:'other',amountCents:100,stripeMode:'live'}};
 const db={doc:path=>({get:async()=>({data:()=>records[path.split('/')[1]]})})};
 const stripe={invoices:{list:async args=>{assert.deepEqual(args,{customer:'cus_owner',status:'paid',limit:25});return {data:invoices};}}};
 const rows=await history({db,stripe,businessId:'owner',customerId:'cus_owner'});
 assert.equal(rows.length,1);assert.equal(rows[0].amountCents,100);assert.equal(rows[0].status,'Paid');
 invoices[0].customer='cus_wrong';await assert.rejects(history({db,stripe,businessId:'owner',customerId:'cus_owner'}),/mismatch/);
});

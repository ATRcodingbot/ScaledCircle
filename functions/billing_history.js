'use strict';
const {invoiceUrl}=require('./billing_communications');
const id=value=>typeof value==='string'?value:value?.id;
// The caller must first establish maintained workspace Billing permission.
async function history({db,stripe,businessId,customerId}) {
  const page=await stripe.invoices.list({customer:customerId,status:'paid',limit:25});
  const rows=await Promise.all(page.data.map(async invoice=>{
    const receipt=(await db.doc(`subscriptionPaymentReceipts/${invoice.id}`).get()).data();
    if(!receipt || receipt.businessId!==businessId)return null;
    if(id(invoice.customer)!==customerId || invoice.status!=='paid' || invoice.amount_paid!==receipt.amountCents || invoice.currency!=='usd' || invoice.livemode!==(receipt.stripeMode==='live'))throw Error('billing_history_receipt_mismatch');
    return {dateMs:(invoice.status_transitions?.paid_at || invoice.created)*1000,description:'Membership payment',amountCents:receipt.amountCents,status:'Paid',reference:invoice.number || null,
      invoiceUrl:invoiceUrl(invoice.hosted_invoice_url),pdfUrl:invoiceUrl(invoice.invoice_pdf)};
  }));
  return rows.filter(Boolean);
}
module.exports={history};

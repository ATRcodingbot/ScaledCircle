'use strict';
const {fail}=require('./scaler_cashout_shared');
// Read-only evidence adapter. Never creates a top-up, charge, transfer or payout.
async function verifyReplacement({stripe,platformId,topupId,amountCents,requireAvailableBalance=true,now=Date.now}) {
 if(!/^tu_[A-Za-z0-9]+$/.test(topupId||''))fail('cashout_replacement_invalid');
 const account=await stripe.accounts.retrieve();if(account.id!==platformId)fail('cashout_platform_mismatch');
 const topup=await stripe.topups.retrieve(topupId);
 const balanceId=typeof topup.balance_transaction==='string'?topup.balance_transaction:topup.balance_transaction?.id;
 if(topup.id!==topupId||topup.livemode!==true||topup.status!=='succeeded'||topup.currency!=='usd'||!/^txn_/.test(balanceId||''))fail('cashout_replacement_unverified');
 const tx=await stripe.balanceTransactions.retrieve(balanceId),balance=await stripe.balance.retrieve();
 const source=typeof tx.source==='string'?tx.source:tx.source?.id;
 const usd=balance.available?.filter(v=>v.currency==='usd');
 if(tx.id!==balanceId||tx.type!=='topup'||source!==topupId||tx.status!=='available'||tx.currency!=='usd'||!Number.isSafeInteger(topup.amount)||tx.amount!==topup.amount||!Number.isSafeInteger(tx.available_on)||tx.available_on<=0||!Number.isSafeInteger(tx.net)||tx.net>tx.amount||tx.net<amountCents||tx.available_on*1000>now()||balance.livemode!==true||usd?.length!==1||!Number.isSafeInteger(usd[0].amount)||(requireAvailableBalance&&usd[0].amount<amountCents))fail('cashout_replacement_funds_unavailable');
 return {topupId,balanceTransactionId:balanceId,netCents:tx.net,availableCents:usd[0].amount,verifiedAt:now(),platformId};
}
module.exports={verifyReplacement};

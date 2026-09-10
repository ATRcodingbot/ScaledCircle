'use strict';

// Called only after the signed subscription webhook has validated provider and
// workspace bindings. Queueing mail never replays entitlement or payment writes.
const crypto = require('node:crypto');
const contract = require('./subscription_contract');
const {escapeHtml, validEmail, SUPPORT_EMAIL} = require('./transactional_email');
const NAMES = {starter:'Starter', growth:'Growth', scale:'Scale', managed_growth:'Managed Growth',
  growth_department:'Growth Department', business_assistant:'Business Assistant Beta',
  lead_generation_research:'Lead Generation Research Beta'};
const TYPES = ['welcome','receipt','plan_changed','addons_changed','cancellation','reactivation','payment_failed','payment_action_required','ended'];
const TEMPLATES = new Set(TYPES.map(type => `billing_${type}_v1`));
const id = value => typeof value === 'string' ? value : value?.id;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents / 100);
const date = seconds => seconds ? new Date(seconds * 1000).toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'}) : 'Not scheduled';
function links(environment) {
  if (!['production','staging','local'].includes(environment)) throw Error('billing_email_environment_required');
  const origin = environment === 'production' ? 'https://scaledcircle.com' : 'https://scaledcircle-staging.web.app';
  return Object.fromEntries(Object.entries({home:'/business',billing:'/billing',upgrade:'/billing/upgrade',addons:'/billing/addons',cancel:'/billing/cancel',history:'/billing/history',reactivate:'/billing'}).map(([key,path]) => [key,`${origin}/#${path}`]));
}
function invoiceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['invoice.stripe.com','pay.stripe.com'].includes(url.hostname) && !url.username && !url.password ? url.href : null; } catch (_) { return null; }
}
function snapshot(subscription, config) {
  const terms = contract.providerTerms(subscription,config);
  return {plan:terms.bundle || terms.plan,addons:terms.bundle ? Object.keys(contract.ADDONS) : terms.addons || [],monthlyCents:terms.monthlyCents,seats:terms.seats,
    end:terms.end / 1000,cancel:subscription.cancel_at_period_end === true,status:subscription.status};
}
function changes(previous, current) {
  if (!previous) return [];
  const result=[];
  if (previous.plan !== current.plan) result.push('plan_changed');
  if (JSON.stringify([...previous.addons].sort()) !== JSON.stringify([...current.addons].sort())) result.push('addons_changed');
  if (!previous.cancel && current.cancel) result.push('cancellation');
  if (previous.cancel && !current.cancel && current.status === 'active') result.push('reactivation');
  if (previous.status !== 'canceled' && current.status === 'canceled') result.push('ended');
  return result;
}
function render({type,businessName,current,previous,invoice,environment,effectiveAt,changeFinancials}) {
  if (!TYPES.includes(type)) throw Error('billing_email_type_invalid');
  const plan=NAMES[current.plan] || 'ScaledCircle membership', actions=links(environment);
  const subjects={welcome:`Welcome to ScaledCircle ${plan}`,receipt:'Your ScaledCircle payment receipt',plan_changed:'Your ScaledCircle plan has changed',addons_changed:'Your ScaledCircle add-ons have changed',cancellation:'Your ScaledCircle membership is scheduled to cancel',reactivation:'Your ScaledCircle membership is active again',payment_failed:"We couldn't process your ScaledCircle payment",payment_action_required:'Your ScaledCircle payment needs attention',ended:'Your ScaledCircle membership has ended'};
  const rows=[['Business',businessName],['Plan',plan],['Recurring monthly total',money(current.monthlyCents)],['Seats',`${current.seats} total`],['Active add-ons',current.addons.map(a=>NAMES[a]).join(', ') || 'None']];
  if (['welcome','receipt'].includes(type)) {
    if (invoice?.status !== 'paid' || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid < 0) throw Error('billing_email_paid_invoice_required');
    rows.push(['Payment received',money(invoice.amount_paid)],['Billing date',date(invoice.status_transitions?.paid_at || invoice.created)],['Invoice reference',invoice.number || 'See Billing History']);
    const tax=(invoice.total_taxes || invoice.total_tax_amounts || []).reduce((n,t)=>n+t.amount,0);
    if (tax) rows.push(['Tax',money(tax)]);
  }
  if (type==='plan_changed') {
    rows.push(['Previous plan',`${NAMES[previous.plan] || 'Previous membership'} — ${money(previous.monthlyCents)}/month`],['New plan',`${plan} — ${money(current.monthlyCents)}/month`]);
    if(changeFinancials?.verified===true && changeFinancials.chargedCents===0) rows.push(['Charged today',money(0)]);
    else rows.push(['Charge or credit for this change','See reconciled invoices in Billing History']);
  }
  if (['plan_changed','addons_changed'].includes(type)) rows.push(['Effective date',date(effectiveAt)]);
  if (type==='addons_changed') {
    for(const addon of current.addons) rows.push([NAMES[addon],current.plan==='growth_department'?'Included in Growth Department':`${money(contract.ADDONS[addon].cents)}/month`]);
    for(const addon of previous.addons.filter(a=>!current.addons.includes(a))) rows.push([NAMES[addon],'Removed']);
  }
  if (['payment_failed','payment_action_required'].includes(type)) rows.push(['Amount due',money(invoice.amount_remaining ?? invoice.amount_due)],['Next payment attempt',date(invoice.next_payment_attempt)]);
  if (current.cancel) rows.push(['Access remains through',date(current.end)],['Next renewal','$0.00 — renewal canceled']);
  else if (current.status==='canceled') rows.push(['Membership status','Ended']);
  else rows.push(['Next renewal',`${money(current.monthlyCents)} on ${date(current.end)}`],['Membership status',current.status==='active'?'Active':'Payment or membership needs attention']);
  const footer=type==='cancellation' ? 'Existing funded campaigns and accepted Scaler obligations are not canceled by subscription cancellation.' : '';
  const labels={home:'Open ScaledCircle',billing:['payment_failed','payment_action_required'].includes(type)?'Update Payment Method / Manage Billing':'Manage Billing',upgrade:'Change or Upgrade Plan',addons:'Manage Add-ons',cancel:'Cancel Membership',history:'View Invoice / Billing History',...(current.cancel?{reactivate:'Reactivate Membership'}:{})};
  const actionText=Object.entries(labels).map(([key,label])=>`${label}: ${actions[key]}`).join('\n');
  const text=`${subjects[type]}\n\n${rows.map(([key,value])=>`${key}: ${value}`).join('\n')}\n\n${footer}\n\n${actionText}\n\nSupport: ${SUPPORT_EMAIL}`;
  const html=`<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#17212b"><main style="max-width:600px;margin:auto;padding:24px;background:white"><h2>ScaledCircle</h2><h1 style="font-size:24px">${escapeHtml(subjects[type])}</h1>${rows.map(([key,value])=>`<p><strong>${escapeHtml(key)}</strong><br>${escapeHtml(String(value))}</p>`).join('')}<p>${escapeHtml(footer)}</p>${Object.entries(labels).map(([key,label])=>`<p><a href="${actions[key]}">${escapeHtml(label)}</a></p>`).join('')}<p>Questions? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p></main></body></html>`;
  return {subject:subjects[type],text,html,trustedHtml:true,template:`billing_${type}_v1`};
}
async function reconcile({db,FieldValue,auth,event,subscription,invoice,environment,planForPrice}) {
  const businessId=subscription.metadata?.firebaseUid, customer=id(subscription.customer);
  if (!businessId || !auth) throw Error('billing_email_owner_required');
  const owner=await auth.getUser(businessId);
  if (owner.disabled || !owner.emailVerified || !validEmail(owner.email)) throw Error('billing_email_owner_unavailable');
  const current=snapshot(subscription,{environment,planForPrice});
  const stateRef=db.doc(`subscriptionCommunicationStates/${subscription.id}`);
  return db.runTransaction(async tx=>{
    const [state,user,wallet]=await Promise.all([tx.get(stateRef),tx.get(db.doc(`users/${businessId}`)),tx.get(db.doc(`wallets/${businessId}`))]);
    if (String(user.data()?.role).toLowerCase()!=='business' || wallet.data()?.stripeCustomerId!==customer || wallet.data()?.stripeSubscriptionId!==subscription.id) throw Error('billing_email_binding_mismatch');
    const old=state.data(), messages=[];
    let changeFinancials;
    const operation=subscription.metadata?.founderUpgradeCertification;
    if(event.type==='customer.subscription.updated' && /^[a-f0-9]{64}$/.test(operation||'') && event.request?.idempotency_key==='founder_upgrade_'+operation) {
      const proof=(await tx.get(db.doc('subscriptionChangeCertificationAudits/'+operation))).data();
      if(proof?.version==='no_proration_upgrade_v1' && proof.businessId===businessId && proof.subscriptionId===subscription.id && proof.customerId===customer && proof.sourcePlan===old?.snapshot?.plan && proof.targetPlan===current.plan && proof.previousMonthlyCents===old?.snapshot?.monthlyCents && proof.monthlyCents===current.monthlyCents && proof.periodEnd===current.end && proof.dueNowCents===0 && proof.proration==='none' && proof.latestInvoiceId===id(subscription.latest_invoice) && proof.latestInvoiceId===id(event.data?.object?.latest_invoice) && proof.createdAtSeconds<=event.created && proof.expiresAtSeconds>=event.created && subscription.items.data.length===1 && subscription.items.data[0].price.id===proof.targetPrice && id(event.data?.object?.customer)===customer && event.data?.object?.metadata?.founderUpgradeCertification===operation) changeFinancials={verified:true,chargedCents:0};
    }
    const newer=!old || event.created >= old.eventCreated;
    if (newer) for (const type of changes(old?.snapshot,current)) messages.push({type,key:`${subscription.id}_${(old?.revision||0)+1}_${type}`});
    if (event.type==='invoice.paid' && invoice?.status==='paid') {
      messages.push({type:'receipt',key:`receipt_${invoice.id}`});
      if (invoice.billing_reason==='subscription_create') messages.push({type:'welcome',key:`welcome_${subscription.id}`});
    }
    if (['invoice.payment_failed','invoice.payment_action_required'].includes(event.type) && invoice?.status!=='paid') messages.push({type:event.type.slice(8),key:`${event.type}_${invoice.id}_${invoice.attempt_count||0}`});
    const refs=messages.map(m=>db.doc(`outboundEmailJobs/billing_${hash(m.key)}`));
    const existing=await Promise.all(refs.map(ref=>tx.get(ref)));
    messages.forEach((message,index)=>{
      if (existing[index].exists) return;
      tx.create(refs[index],{...render({...message,current,previous:old?.snapshot,invoice,changeFinancials,environment,effectiveAt:event.created,businessName:user.data()?.companyName || user.data()?.businessName || user.data()?.displayName || 'Your Business'}),
        to:owner.email,fromAddress:SUPPORT_EMAIL,fromName:'ScaledCircle',replyTo:SUPPORT_EMAIL,businessId,subscriptionId:subscription.id,sourceEventId:event.id,
        status:'queued',attempts:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    });
    if(newer) tx.set(stateRef,{businessId,snapshot:current,eventCreated:event.created,revision:(old?.revision||0)+(changes(old?.snapshot,current).length?1:0),updatedAt:FieldValue.serverTimestamp()});
    return {queued:existing.filter(s=>!s.exists).length};
  });
}
module.exports={TEMPLATES,links,invoiceUrl,snapshot,changes,render,reconcile};

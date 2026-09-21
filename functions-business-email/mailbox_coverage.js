'use strict';
// Coverage is explicitly owner-authorized. Legacy policies remain label-only.
function mode(p){return p?.mailboxMode||(p?.newInquiriesEnabled?'labels':'conversations');}
function validate(p){
 const m=mode(p);if(!['inbox','labels','conversations'].includes(m))return 'mailbox_coverage_required';
 if(p?.historyMode&&p.historyMode!=='future')return 'historical_review_not_supported';
 if(m==='labels'&&p.newInquiriesEnabled&&(!/^[A-Za-z0-9_-]{1,60}$/.test(p.inquiryLabel||'')||p.inquiryRoutingConfirmed!==true||!p.inquiryFilterDescription?.trim()))return 'automatic_inquiry_filter_confirmation_required';
 return null;
}
function query(p,from,to){const source=mode(p)==='inbox'?'in:inbox':`label:${p.inquiryLabel}`;return `${source} after:${Math.floor(from/1000)} before:${Math.ceil(to/1000)} -in:spam -in:trash -in:sent -in:drafts`;}
function screen({subject='',body='',from='',classification},services=[]){
 if(classification!=='substantive')return classification;
 if(/\b(verification|security|one.time|password|sign.in|login)\s*(code|alert|attempt|link|reset)|\b(receipt|invoice paid|payment confirmation|order confirmation|shipping update)\b/i.test(subject)||/^(no.?reply|notifications|security)@/i.test(from))return 'automated_notice';
 const text=subject+'\n'+body;
 if(/\b(estimate|quote|consultation|appointment|availability|inquiry|enquiry|interested in|request for|can (you|we)|could (you|we)|would like|looking for|need help|schedule a|book a)\b/i.test(text))return 'inquiry';
 if(services.some(s=>s.length>3&&text.toLowerCase().includes(s.toLowerCase()))&&/\?|\b(help|need|contact|call|discuss)\b/i.test(text))return 'inquiry';
 return 'unclassified';
}
module.exports={mode,validate,query,screen};

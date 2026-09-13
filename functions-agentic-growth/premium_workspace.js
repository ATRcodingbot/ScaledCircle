'use strict';
const entitlements=require('./shared/subscription_entitlements');
const person=p=>p.kind==='scaler'||p.opportunityType==='workforce_candidate';
const workforce=p=>person(p)||p.kind==='referral_partner'||p.opportunityType==='recruitment_channel';
function project({businessId,prospects,operations,outcomes,customers=[],entitlement,now=Date.now()}) {
 const ops=operations.filter(o=>o.businessId===businessId&&!o.certification),valid=ops.filter(o=>o.state==='sent');
 const events=outcomes.filter(e=>e.businessId===businessId&&valid.some(o=>o.id===e.operationId));
 const count=(records,...stages)=>new Set(events.filter(e=>stages.includes(e.outcome)&&records.some(o=>o.id===e.operationId)).map(e=>e.operationId)).size;
 const pipeline=(rows,all=false)=>{const records=valid.filter(o=>all||rows.some(p=>p.id===o.prospectId));return {
   found:rows.length,qualified:rows.filter(p=>p.qualified===true).length,
   contacted:new Set(records.map(o=>o.prospectId||o.recipient)).size,replied:new Set(records.filter(o=>o.replyCount>0).map(o=>o.prospectId||o.recipient)).size,
   appointment:count(records,'appointment','meeting'),estimate:count(records,'estimate'),won:count(records,'won'),revenue:null,
   available:rows.filter(p=>p.availability?.confirmed===true||p.lifecycleStage==='available').length,
   signup:count(records,'signup'),activated:count(records,'activated'),hired:null,
 };};
 const access={growth_strategist:'Managed Growth · coordination',workforce_recruiter:'Managed Growth · workforce research',
   marketing_manager:'Scale / Managed Growth · invited Social',ad_manager:'Managed Growth · planning only'};
 for(const [agent,product,label] of [['lead_generation','lead_generation_research','Lead Generation Add-on'],['business_assistant','business_assistant','Business Assistant Add-on']]) {
   access[agent]=entitlements.hasActiveProductEntitlement(entitlement,product,{nowMillis:now})
     ? (entitlement.bundle==='growth_department'?'Included with Growth Department':label)
     : agent==='lead_generation'?'Invited opportunity review · paid research not included':'Recommendations only · paid Assistant not included';
 }
 const enriched=prospects.map(p=>{
   const records=valid.filter(o=>o.prospectId===p.id),matches=customers.filter(c=>c.email&&c.email.toLowerCase()===p.email?.toLowerCase());
   const crm=matches.length===1?matches[0]:null;
   const stage=crm?.stage||(records.some(o=>o.replyCount>0)?'replied':records.length?'contacted':p.qualified?'qualified':'discovered');
   return {...p,lifecycleStage:stage,lifecycleLabel:stage.replaceAll('_',' '),crmCustomerId:crm?.id||null};
 });
 return {prospects:enriched,premium:{access,overall:pipeline(prospects,true),leads:pipeline(prospects.filter(p=>!workforce(p))),
   workforce:pipeline(prospects.filter(person)),ads:{approvedBudget:null,spend:null,activeCampaigns:null,leads:null,conversions:null}}};
}
module.exports={project,person,workforce};

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
   const normalize=v=>typeof v==='string'?v.trim().toLowerCase():'';
   const records=valid.filter(o=>o.prospectId===p.id||(normalize(p.email)&&normalize(o.recipient)===normalize(p.email)))
     .sort((a,b)=>(b.providerAcceptedAt||b.requestedAt||0)-(a.providerAcceptedAt||a.requestedAt||0));
   const matches=customers.filter(c=>normalize(c.email)&&normalize(c.email)===normalize(p.email)),crm=matches.length===1?matches[0]:null;
   const latest=records[0],replied=records.some(o=>o.replyCount>0),early=['new_lead','discovered','qualified','drafted','contacted','replied'];
   const stage=crm?.stage&&!early.includes(crm.stage)?crm.stage:replied?'replied':latest?'contacted':crm?.stage||(p.qualified?'qualified':'discovered');
   const nextEligibleContactAt=latest?(latest.providerAcceptedAt||latest.requestedAt)+5*86400000:null;
   const blocked=p.doNotContact===true||crm?.doNotContact===true;
   const pipelineType=person(p)?'workforce':workforce(p)?'recruitment_channel':['property_management','property_facility','partner_channel','commercial','public_bid','business_account'].includes(p.opportunityType)?'vendor':'direct';
   return {...p,lifecycleStage:stage,lifecycleLabel:stage.replaceAll('_',' '),crmCustomerId:crm?.id||null,
     pipelineType,pipelineStages:pipelineType==='workforce'?['Discovered','Qualified','Contacted','Replied','Available','Invited','Signed Up','Active / Used']:pipelineType==='vendor'||pipelineType==='recruitment_channel'?['Discovered','Qualified','Contacted','Replied','Vendor / Application Review','Approved / Onboarded','Active Opportunity']:['Discovered','Qualified','Contacted','Replied','Estimate Scheduled','Estimate Given','Won / Lost','Past Customer'],relationshipLabel:p.opportunityType==='property_management'?'Property Manager / Vendor Opportunity':pipelineType==='workforce'?'Recruitment Candidate':pipelineType==='recruitment_channel'?'Recruitment Channel':pipelineType==='vendor'?'Vendor / Partner Opportunity':'Direct Customer',
     awaitingReply:!!latest&&!replied,lastOutboundAt:latest?.providerAcceptedAt||latest?.requestedAt||null,
     sendOperationId:latest?.id||null,nextEligibleContactAt,
     freshOutreachEligible:!blocked&&!latest&&['new_lead','discovered','qualified','drafted'].includes(stage),
     followupEligible:!blocked&&!!latest&&!replied&&now>=nextEligibleContactAt,
     nextContactAction:blocked?'Do not contact':replied?'Review reply':latest?(now>=nextEligibleContactAt?'Review follow-up eligibility':'Wait for reply'):'Review new outreach'};
 });
 return {prospects:enriched,premium:{access,overall:pipeline(prospects,true),leads:pipeline(prospects.filter(p=>!workforce(p))),
   workforce:pipeline(prospects.filter(person)),ads:{approvedBudget:null,spend:null,activeCampaigns:null,leads:null,conversions:null}}};
}
module.exports={project,person,workforce};

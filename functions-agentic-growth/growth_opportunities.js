'use strict';
// Evidence labels, not claims of purchase intent or an offer of employment.
const TYPES={direct_project:'Direct project opportunity',commercial:'Commercial / organizational opportunity',residential_signal:'Residential opportunity signal',property_facility:'Property / facility prospect',business_account:'Business / account prospect',property_management:'HOA / property management prospect',public_bid:'Public bid / procurement opportunity',partner_channel:'Partner / referral channel',recruitment_channel:'Recruitment / partner channel',workforce_candidate:'Construction / labor candidate',paid_lead_source:'Paid lead source',information:'Information source'};
function classification(p){
 if(TYPES[p.opportunityType])return p.opportunityType;
 if(p.kind==='scaler')return 'workforce_candidate';
 if(p.kind==='referral_partner')return 'recruitment_channel';
 if(/contractor|construction opportunities/i.test(p.category||''))return 'partner_channel';
 return 'business_account';
}
function project(p,now=Date.now()){
 const type=classification(p),expired=!!p.deadline&&Date.parse(p.deadline)<=now;
 const current=p.sourceAvailable===true&&p.qualified===true&&!expired;
 const direct=current&&['direct_project','public_bid'].includes(type)&&p.explicitNeed===true;
 const group=type==='paid_lead_source'?'Excluded paid sources':type==='workforce_candidate'?'Workforce candidates':['partner_channel','recruitment_channel','information'].includes(type)?'Partner / recruitment channels':direct?'Direct opportunities':'High-fit prospects';
 const factors=[
  {label:'Directness',points:direct?25:type==='workforce_candidate'?20:group==='High-fit prospects'?15:5,reason:direct?'A specific public requirement is recorded.':type==='workforce_candidate'?'Public work-seeking evidence; current availability needs confirmation.':group==='High-fit prospects'?'A relevant account; buying intent is unknown.':'Organization channel, not a direct buyer or individual candidate.'},
  {label:'Recency',points:expired?0:now-(p.lastCheckedAt||0)<7*86400000?10:0,reason:expired?'Published deadline has passed.':'Source check is not proof that an undated opportunity is still available.'},
  {label:'Service fit',points:current?15:0,reason:p.reason||'Not yet verified.'},
  {label:'Geographic fit',points:p.serviceArea?10:0,reason:p.geography||'Unknown'},
  {label:'Contactability',points:p.email||p.phone?10:p.contactPath?5:0,reason:p.email||p.phone?'Source-published contact; outreach still requires approval.':'Public source/form only; no private contact is inferred.'},
  {label:'Source quality',points:current?10:0,reason:current?'Public source matched the required evidence signals.':'Source unavailable or evidence incomplete.'},
  {label:'Project / work intent',points:direct?15:type==='workforce_candidate'&&current?10:0,reason:direct?'Published requirement; contract eligibility and award are unknown.':type==='workforce_candidate'?'Self-reported work interest, not verified availability.':'No active project or buying intent established.'},
  {label:'Confidence',points:current?5:0,reason:current?'Initial fit only; qualification must be reviewed.':'Hold for source review.'},
 ];
 return {...p,opportunityType:type,opportunityLabel:TYPES[type],opportunityGroup:group,ranking:{score:type==='paid_lead_source'?0:factors.reduce((n,f)=>n+f.points,0),factors},currentOpportunity:direct,deadlineExpired:expired,unknowns:p.unknowns||'Current need, budget, eligibility and willingness to engage are unknown.',needsApproval:true};
}
function summarize(rows){return ['Direct opportunities','High-fit prospects','Workforce candidates','Partner / recruitment channels','Excluded paid sources'].map(label=>({label,count:rows.filter(p=>p.opportunityGroup===label).length}));}
module.exports={TYPES,classification,project,summarize};

'use strict';
const clean=value=>String(value??'').replace(/[\r\n]+/g,' ').trim();
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
function renderGrowthReport({report,reportId,prospects=[],kind,customer=false,opportunityPreferences}) {
 const active=require('./growth_opportunity_preferences').active(prospects,opportunityPreferences);
 const s=opportunityPreferences===undefined?report.summary||{}:{...(report.summary||{}),awaitingApproval:active.filter(p=>p.approvalState==='awaiting_approval').length,businessesFound:active.filter(p=>p.kind==='business').length,partnersFound:active.filter(p=>p.kind==='referral_partner').length,individualScalersFound:active.filter(p=>p.kind==='scaler').length,discoveryByServiceArea:[],next:'Review enabled opportunities in Growth. Your current preferences control recommendations.'};
 const base=customer?'https://scaledcircle.com/#/business/growth-agents':'https://scaledcircle-staging.web.app/#/growth-agents';
 const link=base+'?report='+encodeURIComponent(reportId);
 const subject=kind==='weekly'?'Your Growth Weekly Report':kind==='daily'?'Your Growth Daily Brief':'Your Growth team needs your review';
 const lines=[clean(report.businessName||'ScaledCircle'),'', 'Needs your attention',`${count(s.awaitingApproval)} research drafts await review.`,
  'Nothing in this report approves outreach, Social publishing or ad spend.','',
  'What the team found',`${count(s.businessesFound)} Business prospects · ${count(s.partnersFound)} organization partners · ${count(s.individualScalersFound)} individual candidates.`];
 if(!count(s.individualScalersFound))lines.push('No verified individual candidates yet. Organization partners are listed separately.');
 if(kind!=='important'){
  const areas=Array.isArray(s.discoveryByServiceArea)?s.discoveryByServiceArea:[];
  if(areas.length)lines.push('','By service area',...areas.map(a=>`${clean(a.serviceArea)}: ${count(a.businesses)} Business prospects · ${count(a.partners)} organization partners · ${count(a.individualScalers)} individual candidates.`));
  const selected=active.slice(0,kind==='weekly'?5:3);
  if(selected.length)lines.push('','Selected findings',...selected.flatMap(p=>[clean(p.displayName),clean(p.reason),base+'?prospect='+encodeURIComponent(p.id),'']));
  if(kind==='weekly')lines.push('What we learned',clean(s.learned)||'Verified performance outcomes are not available yet.','');
  if(s.outreach){const o=s.outreach;
   lines.push('Confirmed correspondence',`${count(o.sent)} sends accepted by the provider · ${count(o.replied)} conversations with matched replies.`,
    'Provider acceptance does not prove delivery. Meetings, estimates and won work are owner-recorded; revenue requires linked evidence.',
    clean(o.evidenceWindow));
   for(const pattern of (o.patterns||[]).slice(0,5))lines.push(`${clean(pattern.value)}: ${count(pattern.sent)} sent, ${count(pattern.replied)} replies. ${clean(pattern.recommendation)}`);
  }
 }
 lines.push('Next step',clean(s.next)||'Review the evidence and decide what needs approval.','', 'Review this report',link,'',
  'Research is not proof of customer interest, a hire or a won job. Review evidence and drafts in the workspace.',
  'Manage important alerts and daily/weekly emails in Growth.');
 return {subject,text:lines.join('\n')};
}
module.exports={renderGrowthReport};

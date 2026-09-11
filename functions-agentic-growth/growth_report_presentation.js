'use strict';
const clean=value=>String(value??'').replace(/[\r\n]+/g,' ').trim();
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
function renderGrowthReport({report,reportId,prospects=[],kind,customer=false}) {
 const s=report.summary||{},base=customer?'https://scaledcircle.com/#/business/growth-agents':'https://scaledcircle-staging.web.app/#/growth-agents';
 const link=base+'?report='+encodeURIComponent(reportId);
 const subject=kind==='weekly'?'Your Growth Weekly Report':kind==='daily'?'Your Growth Daily Brief':'Your Growth team needs your review';
 const lines=[clean(report.businessName||'ScaledCircle'),'', 'Needs your attention',`${count(s.awaitingApproval)} research drafts await review.`,
  'Nothing in this report approves outreach, Social publishing or ad spend.','',
  'What the team found',`${count(s.businessesFound)} Business prospects · ${count(s.partnersFound)} organization partners · ${count(s.individualScalersFound)} individual candidates.`];
 if(!count(s.individualScalersFound))lines.push('No verified individual candidates yet. Organization partners are listed separately.');
 if(kind!=='important'){
  const areas=Array.isArray(s.discoveryByServiceArea)?s.discoveryByServiceArea:[];
  if(areas.length)lines.push('','By service area',...areas.map(a=>`${clean(a.serviceArea)}: ${count(a.businesses)} Business prospects · ${count(a.partners)} organization partners · ${count(a.individualScalers)} individual candidates.`));
  const selected=prospects.slice(0,kind==='weekly'?5:3);
  if(selected.length)lines.push('','Selected findings',...selected.flatMap(p=>[clean(p.displayName),clean(p.reason),base+'?prospect='+encodeURIComponent(p.id),'']));
  if(kind==='weekly')lines.push('What we learned',clean(s.learned)||'Verified performance outcomes are not available yet.','');
 }
 lines.push('Next step',clean(s.next)||'Review the evidence and decide what needs approval.','', 'Review this report',link,'',
  'Research is not proof of customer interest, a hire or a won job. Review evidence and drafts in the workspace.',
  'Manage important alerts and daily/weekly emails in Growth.');
 return {subject,text:lines.join('\n')};
}
module.exports={renderGrowthReport};

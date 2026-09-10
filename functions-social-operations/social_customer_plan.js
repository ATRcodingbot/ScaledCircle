"use strict";
const social = require('./social_operations');
const VERSION = 'CustomerSocialDraftStrategyV1';
function prepare({uid, planId, profile, scope, connections, now = Date.now()}) {
  if(profile?.businessUid!==uid||!profile.businessName||scope?.status!=='AVAILABLE'||!scope.areas.length)throw Error('customer_social_context_required');
  const services=(profile.priorityServices?.length?profile.priorityServices:profile.servicesOffered||[]).filter(s=>typeof s==='string').slice(0,5);
  if(!services.length)throw Error('customer_social_services_required');
  const providers=connections.filter(c=>['facebook','instagram'].includes(c.provider)&&social.connectionHealth(c).healthy).map(c=>c.provider);
  if(!providers.length)throw Error('customer_social_connection_required');
  let destination=null;
  try{const u=new URL(/^https?:\/\//i.test(profile.website)?profile.website:'https://'+profile.website);if(u.protocol==='https:'&&u.hostname.includes('.')&&!u.username&&!u.password)destination=u.href;}catch(_){}
  const areas=scope.areas.map(a=>a.label).join('; '),name=profile.businessName;
  const cta=profile.primaryCta||profile.primaryCTA||'Request an estimate';
  const start=new Date(new Date(now).toISOString().slice(0,10)+'T16:00:00Z');start.setUTCDate(start.getUTCDate()+1);
  const topics=[
    ['Plan your next project','Introduce the maintained service range',`${name} works on ${services.join(', ')}. Planning a project? Share the work you have in mind so we can discuss whether it fits our services.`, 'A branded typography card listing the saved services. No invented project photographs.'],
    ['What shapes an estimate?','Educate before an inquiry',`The scope, materials, site conditions and local requirements can all affect a project estimate. Tell ${name} what you want to achieve so the next conversation can start with the right questions.`, 'A simple scope/materials/site checklist using licensed icons.'],
    ['Prepare for an estimate','Improve inquiry quality',`Before contacting ${name}, write down your project goal, approximate dimensions and preferred timing. An estimate discussion can clarify options; it is not a promise of price or availability.`, 'A clean three-step preparation checklist.'],
    ['Our service area','Set clear local expectations',`${name} has saved these service areas: ${areas}. Ask us to confirm whether your project location and scope can be served.`, 'A coarse area graphic using county/city names only; no private addresses.'],
    ['Explore a service','Make the offer concrete',`Considering ${services[0]}? ${name} can discuss your goals and the questions that need answering before an estimate.`, 'Owner-provided, rights-cleared material detail, or a text card until approved media exists.'],
    ['Questions before work begins','Build informed expectations',`Before work begins, clarify scope, materials, permissions, timing and the written estimate. ${name} welcomes a clear project brief.`, 'A short carousel of questions; no fabricated testimonial or completed project.'],
    ['Your project priorities','Invite a useful conversation',`Which matters most for your next project: function, maintenance, appearance or timing? Share your priorities with ${name} when requesting an estimate.`, 'A four-choice typography card; no claims about engagement or demand.'],
    ['Next step','Invite a qualified estimate inquiry',`Ready to discuss ${services.join(', ')}? Contact ${name} with your project goal and location. We will review fit and next steps together.`, 'A branded estimate-request card with the verified Business website after owner review.'],
  ];
  const items=topics.map(([pillar,goal,copy,creative],i)=>({itemKey:'customer_week_'+(Math.floor(i/2)+1)+'_'+(i%2+1),
    scheduledFor:new Date(start.getTime()+[0,3,7,10,14,17,21,24][i]*86400000).toISOString(),pillar,goal,
    variants:providers.map(provider=>({provider,format:provider==='instagram'?'carousel':'feed',copy,callToAction:cta,destinationUrl:destination,
      mediaRequirement:creative+' Owner must provide/approve final creative before publication.',
      responseAssetRequirement:'Measure real provider reach and engagement after approved publication; record attributed inquiry only when response evidence exists.'}))}));
  const plan=social.createContentPlan({businessUid:uid,planId,businessName:name,goal:'Build local service understanding and qualified estimate inquiries over 30 days.',
    pillars:topics.map(t=>t[0]),items,startsOn:start.toISOString(),automationMode:'manual',now});
  plan.record.strategy={version:VERSION,approvalMode:'approval_required',cadence:'Two proposed posts per week on each connected account.',
    timingBasis:'Initial experiment at noon Eastern for this draft window; not claimed to be a proven best time. Owner reviews all proposed times.',
    geography:scope.areas.map(a=>a.label),services,objective:'Measure qualified estimate inquiries, not assumed revenue.',
    measurement:'Capture the current provider baseline. After separately approved publication, measure at 24 hours and 7 days; attribute traffic/leads only with actual response evidence.',
    creativeState:'Briefs prepared; final media requires owner approval.',historyAttribution:'Existing provider posts are not ScaledCircle publications.',
    nextAction:'Review copy, proposed dates, service claims, destination and creative. Nothing is scheduled for publication.'};
  return plan;
}
module.exports={VERSION,prepare};

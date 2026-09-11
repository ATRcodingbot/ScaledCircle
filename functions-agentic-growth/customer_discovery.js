'use strict';
const crypto=require('node:crypto');
const geography=require('./growth_geography');
const VERSION='CustomerOpportunityDiscoveryV2';
const city={type:'city',locality:'Baltimore',state:'Maryland'};
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
const hubs=[{key:'baltimore_city_bids',url:'https://cityservices.baltimorecity.gov/suppliers/bid-opportunities',serviceArea:city}];
function parseBids(html,hub,profile,now){
 const services=[...(profile.servicesOffered||[]),...(profile.priorityServices||[])].join(' ');
 if(!/contract|construction|remodel|repair|fence|deck/i.test(services))return [];
 const rows=[];
 for(const part of html.split(/<div class="fw-bold text-body d-none d-lg-block">/).slice(1,101)){
  const title=clean(part.split('</div>')[0]);
  if(!/renovation|contractor|repair|fenc|deck|rehabilitation|healthy homes/i.test(title))continue;
  const id=part.match(/RFQ Number:<\/strong>\s*(RFQ-[\w-]+)/)?.[1];
  const d=part.match(/Deadline:<\/strong>\s*(\d{2})\/(\d{2})\/(\d{4})/);
  // Treat the deadline day as needing manual review rather than inventing its exact closing time.
  const deadline=d?`${d[3]}-${d[1]}-${d[2]}T00:00:00-04:00`:null;
  if(!id||!deadline||Date.parse(deadline)<=now||!part.includes('status-open-pill'))continue;
  const email=part.match(/[\w.+-]+@baltimorecity\.gov/i)?.[0];
  rows.push({key:hub.key+'_'+id,kind:'business',name:`${title} — ${id}`,region:'Baltimore City, Maryland',serviceArea:hub.serviceArea,industry:'public procurement',opportunityType:'public_bid',explicitNeed:true,deadline,url:hub.url,sourceRecordId:id,signals:[title,id],email,
   reason:'The City lists this requirement as open. Its title may fit contracting services; detailed specifications and Business eligibility have not been validated.',useCase:'Review the exact solicitation and any required licenses, insurance, experience or specialist qualifications before deciding whether to bid.',unknowns:'Full scope, eligibility, budget, mandatory qualifications, exact closing time and award outcome require official document review.',cta:`Review ${id} in the official supplier portal before its published deadline`,evidenceHtml:part});
 }
 return rows.slice(0,6);
}
async function discover({profile,scope,readSource,now,opportunityPreferences}){
 const sources=[],checks=[];
 if(!require('./growth_opportunity_preferences').normalize(opportunityPreferences).government)return {sources,checks};
 for(const hub of hubs.filter(h=>geography.matchArea(h,scope))){
  try{const html=await readSource(hub),found=parseBids(html,hub,profile,now);sources.push(...found);checks.push({sourceUrl:hub.url,status:'checked',discovered:found.length,sourceHash:crypto.createHash('sha256').update(html).digest('hex')});}
  catch(_){checks.push({sourceUrl:hub.url,status:'unavailable',discovered:0});}
 }
 return {sources,checks};
}
module.exports={VERSION,hubs,parseBids,discover};

'use strict';
const {WORKSPACES}=require('./inference_budget');
const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).slice(0,40):[];
function proposal({businessId,business={},profile={},brand={},social={},campaigns=[]}){
 const owned=x=>!x.businessUid||x.businessUid===businessId;
 if(!owned(profile))profile={};if(!owned(brand))brand={};if(!owned(social))social={};
 const values={},sources={};const put=(k,v,source)=>{if(v&&(typeof v!=='object'||v.length)){values[k]=v;sources[k]=source;}};
 put('businessName',profile.businessName||business.businessName||business.companyName,'Business Profile');
 put('services',list(profile.servicesOffered).length?list(profile.servicesOffered):list(brand.approvedServiceCategories),'Business Profile / approved Brand services');
 put('voice',profile.brandVoice||profile.tone,'Business Profile');
 // These are saved owner facts, not newly verified licensing or outcome claims.
 put('claims',list(profile.differentiators),'Business Profile — owner-supplied facts; review before use');
 put('timeZone',profile.timeZone||profile.timezone,'Business Profile');
 if(social.approvedByUid===businessId)put('destinations',list(social.destinations).filter(x=>x.startsWith('https://')),'Owner-approved destinations (review for Email)');
 const footers=[...new Set(campaigns.filter(c=>c.businessId===businessId&&c.footerIdentitySource==='owner_supplied'&&c.approved===true).map(c=>c.mailingAddress).filter(Boolean))];
 if(footers.length===1)put('mailingAddress',footers[0],'Previously approved public Email footer');
 const controlled=businessId===WORKSPACES[1]?{recipient:'skotiatrades@gmail.com',subject:'Attractive Remodel — controlled Email assistance test',body:"This is a Founder-controlled test of Attractive Remodel's Email assistance and appointment workflow. No estimate, customer project or sales commitment is being created. Please reply to confirm you would like to arrange a 15-minute workflow check. We will send a proposed time for you to accept.",label:'SC-Pilot-Inquiries',filter:'from:skotiatrades@gmail.com subject:"Attractive Remodel — controlled Email assistance test"'}:null;
 return {values,sources,controlled,goals:list(profile.priorityServices),description:profile.businessDescription||null};
}
module.exports={proposal};

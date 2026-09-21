'use strict';
const {WORKSPACES}=require('./inference_budget');
const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).slice(0,40):[];
function proposal({businessId,business={},profile={},brand={},social={},campaigns=[],availability=null}){
 const owned=x=>!x.businessUid||x.businessUid===businessId;
 if(!owned(profile))profile={};if(!owned(brand))brand={};if(!owned(social))social={};
 const values={},sources={};const put=(k,v,source)=>{if(v&&(typeof v!=='object'||v.length)){values[k]=v;sources[k]=source;}};
 put('businessName',profile.businessName||business.businessName||business.companyName,'Business Profile');
 put('services',list(profile.servicesOffered).length?list(profile.servicesOffered):list(brand.approvedServiceCategories),'Business Profile / approved Brand services');
 put('voice',profile.brandVoice||profile.tone||brand.brandVoice||'Clear, helpful and factual',profile.brandVoice||profile.tone||brand.brandVoice?'Maintained Business voice':'Suggested voice — owner review');
 // These are saved owner facts, not newly verified licensing or outcome claims.
 put('claims',list(profile.differentiators),'Business Profile — owner-supplied facts; review before use');
 put('timeZone',availability?.settings?.timeZone||profile.timeZone||profile.timezone,'Business Profile');
 if(social.approvedByUid===businessId)put('destinations',list(social.destinations).filter(x=>x.startsWith('https://')),'Owner-approved destinations (review for Email)');
 const footers=[...new Set(campaigns.filter(c=>c.businessId===businessId&&c.footerIdentitySource==='owner_supplied'&&c.approved===true).map(c=>c.mailingAddress).filter(Boolean))];
 if(footers.length===1)put('mailingAddress',footers[0],'Previously approved public Email footer');
 if(values.businessName&&values.services?.length){values.templates={introduction:{subject:`A message from ${values.businessName}`,body:`Hello, this is ${values.businessName}. We can discuss ${values.services.slice(0,4).join(', ')}. If you would like help, please reply with what you have in mind. We will review the details with you before confirming any appointment.`},followup:{subject:`Following up — ${values.businessName}`,body:`Hello, we are following up on our previous message. If you would still like to discuss your request with ${values.businessName}, please reply with any questions. If not, no further action is needed.`}};sources.templates='Suggested exact copy from maintained Business name/services — review before authorization';}
 // ScaledCircle's approved planning categories are not a customer pitch.
 if(businessId===WORKSPACES[0]&&values.templates){
  values.templates.introduction={subject:'Keeping your Business work organized with ScaledCircle',body:'Hello from ScaledCircle. We help Businesses organize customer conversations, schedules and day-to-day work. If you would like to discuss whether ScaledCircle fits your Business, reply with the part of your workflow you want to improve. We can explain the currently available options without any commitment.'};
  sources.templates='Suggested customer-readable Core Business OS introduction — owner review, not saved authority';
 }
 if(values.templates){values.adaptiveAlternative={subject:businessId===WORKSPACES[0]?'Which part of running your Business takes the most time?':`A question from ${values.businessName}`,body:businessId===WORKSPACES[0]?'Hello from ScaledCircle. What is the biggest challenge in keeping your customer conversations and schedules organized? Reply with what you would like to improve, and we can discuss whether our currently available Business tools are a fit.':`Hello from ${values.businessName}. If you would like to discuss ${values.services[0]}, what would you like help with first? Reply with your questions or project details so we can discuss an appropriate next step. No appointment or price is confirmed by this message.`};}
 const controlled=businessId===WORKSPACES[1]?{recipient:'skotiatrades@gmail.com',subject:'Attractive Remodel — controlled Email assistance test',body:"This is a Founder-controlled test of Attractive Remodel's Email assistance and appointment workflow. No estimate, customer project or sales commitment is being created. Please reply to confirm you would like to arrange a 15-minute workflow check. We will send a proposed time for you to accept.",label:'SC-Pilot-Inquiries',filter:'from:skotiatrades@gmail.com subject:"Attractive Remodel — controlled Email assistance test"'}:null;
 return {values,sources,controlled,recommendedMailboxMode:businessId===WORKSPACES[0]?'inbox':'conversations',goals:list(profile.priorityServices),description:profile.businessDescription||null};
}
module.exports={proposal};

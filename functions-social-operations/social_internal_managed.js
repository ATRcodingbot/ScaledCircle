'use strict';
// Compatibility for the existing production Meta dogfood owner. This is not
// an Admin-wide entitlement and never authorizes publication without a policy.
const {hash}=require('./social_growth_cycle');
async function authority({db,uid,read=r=>r.get()}) {
 const [u,c]=await Promise.all([read(db.doc('users/'+uid)),read(db.doc('socialProviderConfigs/production_meta'))]);
 // Match maintained internal Social authority: admin role plus exact configured
 // owner. The legacy Business active flag is not an Admin activation grant.
 // Callable verified authentication and worker Auth.disabled checks remain separate.
 if(u.data()?.role!=='admin')return null;
 try{const binding=require('./social_meta_connection').authorize(c.data(),uid);return {binding,user:u.data()};}catch{return null;}
}
async function proposal({db,uid,read=r=>r.get(),now=Date.now()}) {
 const owned=await authority({db,uid,read});if(!owned)throw Error('Internal Social owner authority is required.');
 const found=await read(db.collection('socialContentPlans').where('businessUid','==',uid).limit(11));
 if(found.size>10)throw Error('Review the saved source strategies.');
 const source=found.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.approvedByUid===uid&&p.status==='approved'&&p.approvedVersion===p.planVersion&&!p.internalManagedSource);
 const sources=['facebook','instagram'].map(provider=>source.filter(p=>(p.items||[]).some(i=>(i.variants||[]).some(v=>v.provider===provider))).sort((a,b)=>(b.approvedAt||0)-(a.approvedAt||0))[0]);
 if(sources.some(p=>!p))throw Error('The approved Facebook and Instagram source strategies are required.');
 const accounts=[];for(const provider of ['facebook','instagram']){const c=(await read(db.doc(`socialConnections/${uid}/providers/${provider}`))).data();
 if(c?.environment!=='production'||c.status!=='connected_write'||c.tokenHealth!=='healthy'||c.requiresReconnect===true||c.providerUserId!==(provider==='facebook'?owned.binding.pageId:owned.binding.instagramId)||c.linkedPageId!==owned.binding.pageId||!require('./social_customer_scheduling').hasPublishingScopes(c,provider))throw Error('The ScaledCircle '+provider+' connection needs attention.');
 accounts.push({provider,accountId:c.providerUserId,name:c.accountDisplayName||owned.binding.pageName,handle:c.handle||null,connectionRevision:c.connectionRevision,credentialRotationGeneration:c.credentialRotationGeneration});}
 const destinations=[...new Set(sources.flatMap(p=>p.items.flatMap(i=>i.variants.filter(v=>['facebook','instagram'].includes(v.provider)).map(v=>v.destinationUrl))).filter(Boolean))];
 if(destinations.some(s=>!/^https:\/\/scaledcircle\.com\/(?:businesses|how-it-works|scalers)?$/.test(s)))throw Error('Review the changed ScaledCircle destinations.');
 const sourceRefs=sources.map(p=>({id:p.id,version:p.planVersion,hash:p.contentHash}));
 const profile={businessUid:uid,businessName:'ScaledCircle',website:'https://scaledcircle.com/',brandVoice:'Clear, practical Business voice. No invented results, testimonials, completed work or earnings.',servicesOffered:['Product explanation','Business value','Business and Scaler roles'],priorityServices:['Product explanation','Business value','Business and Scaler roles'],timeZone:'America/New_York',internalSocialContext:{source:'owner_reviewed_meta_strategy',sourcePlans:sourceRefs,audience:'Maryland Businesses and prospective Scalers'}};
 const day=Math.floor(now/86400000)*86400000;
 const topics=[
 ['Product explanation','A useful local marketing plan starts with a clear goal, a defined area and a way to review the response. Explore how ScaledCircle brings those planning steps together.','https://scaledcircle.com/how-it-works'],
 ['Business value','More activity is not the same as a better result. Keep campaign planning and response evidence together so your Business can make its next decision from what is actually known.','https://scaledcircle.com/businesses'],
 ['Business and Scaler roles','Businesses plan local campaigns; Scalers are the independent field-work side of the ScaledCircle model. We are starting in Maryland. Paid-work opportunities are not yet generally available. This is not an offer of work or guaranteed earnings.','https://scaledcircle.com/scalers'],
 ['Product explanation','A map estimate helps you plan an area. It is not proof that a delivery or a job took place. ScaledCircle keeps planning and completion evidence distinct.','https://scaledcircle.com/how-it-works'],
 ['Business value','A response you can trace is more useful than an assumed lead. Explore ScaledCircle’s approach to organizing campaign activity and reviewing the evidence behind the next Business decision.','https://scaledcircle.com/businesses'],
 ['Business and Scaler roles','Local campaign planning and field work have different responsibilities. Learn about the Business and Scaler sides of ScaledCircle before deciding whether the workflow fits you. Paid-work opportunities are not yet generally available.','https://scaledcircle.com/scalers']
 ];
 const prepared=require('./social_operations').createContentPlan({businessUid:uid,planId:'managed_growth',businessName:profile.businessName,goal:'Explain ScaledCircle and its value for Maryland Businesses and prospective Scalers without promising results or available paid work.',pillars:profile.servicesOffered,startsOn:new Date(day+86400000).toISOString(),automationMode:'manual',now:day,items:topics.map(([pillar,copy,destinationUrl],i)=>({itemKey:'managed_meta_'+i,pillar,goal:pillar,scheduledFor:new Date(day+(i+1)*86400000+16*3600000).toISOString(),variants:['facebook','instagram'].map(provider=>({provider,format:provider==='instagram'?'feed':'feed',copy,callToAction:'Learn more',destinationUrl,mediaRequirement:'Use a relevant approved ScaledCircle branded creative; no invented customer project or result.'}))}))});
 const plan={...prepared.record,internalManagedSource:{sourcePlans:sourceRefs},strategy:{version:'InternalMetaManagedStrategyV1',services:profile.servicesOffered,geography:[],audience:profile.internalSocialContext.audience,voice:profile.brandVoice,claims:'Do not imply general paid-work activation, Coming Soon products, guaranteed results or invented personal/customer experiences.',cadence:'Start at five per platform; adapt only from comparable meaningful evidence.'}};
 const id='internal_meta_'+hash({uid,sourceRefs,strategy:plan.strategy,items:plan.items}).slice(0,40);
 return {profile,plan:{...plan,id},accounts,destinations,sourceRefs,spending:'No additional spend or paid upgrades authorized. Existing creative-generation allowances and provider/resource limits remain enforced.'};
}
module.exports={authority,proposal};

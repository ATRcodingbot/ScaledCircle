'use strict';
const bounded=require('./social_bounded_authority');
const {hash}=require('./social_growth_cycle');
const {hasPublishingScopes,connectionFromOwnedPath}=require('./social_customer_scheduling');
const cadence=require('./social_cadence_policy');
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,220}$/.test(v);
function createSettings({db,environment,now=Date.now}) {
 async function proposal(uid,input,read=ref=>ref.get()) {
  if(!safeId(uid)||!safeId(input.planId))throw Error('Choose your approved strategy.');
  const [p,b,s,c,h,existing]=await Promise.all(['socialContentPlans/'+input.planId,'businessGrowthProfiles/'+uid,
   'businessSubscriptions/'+uid,'socialProviderConfigs/'+environment+'_meta','agentHealth/'+uid,'socialManagedPolicies/'+uid].map(path=>read(db.doc(path))));
  const plan=p.data(),profile=b.data();
  if(plan?.businessUid!==uid||plan.status!=='approved'||plan.approvedVersion!==plan.planVersion)throw Error('Approve the current strategy first.');
  if(!profile?.businessName||profile.businessUid&&profile.businessUid!==uid)throw Error('Complete your Business brand context first.');
  if(!require('./social_customer_enrollment').eligible(s.data(),now()))throw Error('An active Managed Growth entitlement is required.');
  if(c.data()?.enabled!==true||c.data()?.writeScopesEnabled!==true||c.data()?.environment!==environment)throw Error('Provider publishing is unavailable.');
  if(h.data()?.killSwitchActive===true)throw Error('Publishing is paused by a separate safety restriction.');
  const services=(plan.strategy?.services||[]).filter(x=>typeof x==='string'&&x.trim());
  if(!services.length)throw Error('Save the services in your strategy before enabling automatic publishing.');
  const providers=[];
  for(const provider of ['facebook','instagram']){
   const record=connectionFromOwnedPath((await read(db.doc(`socialConnections/${uid}/providers/${provider}`))).data(),uid);
   if(record?.environment===environment&&record.status==='connected_write'&&record.tokenHealth==='healthy'&&
     record.requiresReconnect!==true&&hasPublishingScopes(record,provider))providers.push(provider);
  }
  if(!providers.length)throw Error('Connect a supported account with publishing permission.');
  const destinations=[...new Set((plan.items||[]).flatMap(item=>item.variants||[]).map(v=>v.destinationUrl).filter(Boolean))];
  const maxPerWeek=input.maxPerWeek??5;
  if(!Number.isSafeInteger(maxPerWeek)||maxPerWeek<1)throw Error('Choose a positive weekly target per channel.');
  const cadenceSettings=cadence.setting(input.cadenceSettings,maxPerWeek);
  const cycles=await read(db.collection('socialGrowthCycles').where('businessUid','==',uid).limit(101));
  if(cycles.size>100)throw Error('Review the saved workspace timezone.');
  const zones=[...new Set(cycles.docs.map(d=>d.data().timeZone).filter(cadence.validZone))];
  const timeZone=profile.timeZone||profile.timezone||plan.timeZone||(zones.length===1?zones[0]:'UTC');
  if(!cadence.validZone(timeZone))throw Error('Save the workspace timezone before changing publishing cadence.');
  const prior=existing.data();
  const preserveEnd=prior?.businessUid===uid&&prior.planId===input.planId&&prior.strategyDigest===bounded.strategyDigest(plan)&&['active','paused'].includes(prior.status)&&prior.endsAt>now();
  const endsAt=preserveEnd?prior.endsAt:Math.floor(now()/86400000)*86400000+30*86400000;
  const scope={businessUid:uid,planId:input.planId,planVersion:plan.planVersion,strategyDigest:bounded.strategyDigest(plan),
   businessName:profile.businessName,voice:typeof profile.brandVoice==='string'&&profile.brandVoice.trim()?profile.brandVoice:
     typeof profile.tone==='string'&&profile.tone.trim()?profile.tone:'Helpful, professional Business voice; no unsupported personal or completed-work claims.',
   services,providers,destinations,maxPerWeek,cadenceSettings,timeZone,
   endsAt};
  return {...scope,reviewDigest:hash(scope),plan};
 }
 return {
  async preview(uid,input){const {plan,...view}=await proposal(uid,input);return {...view,endsAtLabel:new Intl.DateTimeFormat('en-US',{timeZone:view.timeZone,dateStyle:'medium',timeStyle:'short'}).format(view.endsAt)+' '+view.timeZone};},
  async change(uid,actorUid,input){
   if(actorUid!==uid)throw Error('Only the Business owner can change automatic publishing authority.');
   if(!['enable','cadence','pause','resume'].includes(input.action))throw Error('Choose a publishing action.');
   return db.runTransaction(async tx=>{
    const ref=db.doc('socialManagedPolicies/'+uid),old=(await tx.get(ref)).data();
    if(input.action==='pause'){
     if(!old||old.businessUid!==uid)throw Error('No managed publishing authorization exists.');
     if(old.status==='paused')return {status:'paused',reused:true};
     tx.update(ref,{status:'paused',pausedAt:now(),pausedByUid:actorUid});
     tx.create(db.collection('socialManagedPolicyAudit').doc(),{businessUid:uid,actorUid,action:'pause',policyId:old.id,at:now()});
     return {status:'paused'};
    }
    if(input.action==='resume'){
     const plan=old?.planId?(await tx.get(db.doc('socialContentPlans/'+old.planId))).data():null;
     bounded.assertRuntimePolicy({uid,policy:{...old,status:'active'},plan,approval:{businessUid:uid,planId:old?.planId,
       managedPolicyId:old?.id,managedStrategyDigest:old?.strategyDigest},now:now()});
     await proposal(uid,{planId:old.planId,maxPerWeek:old.maxPerWeek},r=>tx.get(r));
     if(old.status==='active')return {status:'active',reused:true};
     tx.update(ref,{status:'active',resumedAt:now(),resumedByUid:actorUid});
     tx.create(db.collection('socialManagedPolicyAudit').doc(),{businessUid:uid,actorUid,action:'resume',policyId:old.id,at:now()});
     return {status:'active'};
    }
    const scope=await proposal(uid,input,r=>tx.get(r));
    if(input.confirmAutomaticPublishing!==true||scope.reviewDigest!==input.reviewDigest)throw Error('Review the current automatic publishing boundaries again.');
    if(old?.status==='active'&&old.reviewDigest===scope.reviewDigest)return {status:'active',reused:true};
    if(input.action==='cadence'){
     bounded.assertRuntimePolicy({uid,policy:{...old,status:'active'},plan:scope.plan,approval:{businessUid:uid,planId:old?.planId,managedPolicyId:old?.id,managedStrategyDigest:old?.strategyDigest},now:now()});
     if(old.planId!==scope.planId||old.strategyDigest!==scope.strategyDigest||JSON.stringify(old.providers)!==JSON.stringify(scope.providers))throw Error('Strategy or channels changed; review the complete authorization.');
     if(old?.cadenceReviewDigest===scope.reviewDigest)return {status:old.status,policyId:old.id,reused:true};
     const next=cadence.initialize({scope,now:now()});
     tx.update(ref,{maxPerWeek:scope.maxPerWeek,cadence:next,cadenceReviewDigest:scope.reviewDigest});
     tx.create(db.collection('socialManagedPolicyAudit').doc(),{businessUid:uid,actorUid,action:'cadence',policyId:old.id,at:now(),
      previous:{maxPerWeek:old.maxPerWeek,cadence:old.cadence||null},next:{maxPerWeek:scope.maxPerWeek,cadence:next},reviewedScope:((({plan,...rest})=>rest)(scope))});
     return {status:old.status,policyId:old.id,cadence:next};
    }
    const policy=bounded.createPolicy({...scope,uid,actorUid,startsAt:now(),now:now()});
    const {plan,...reviewedScope}=scope;
    tx.set(ref,{...policy,cadence:cadence.initialize({scope,now:now()}),reviewDigest:scope.reviewDigest,reviewedScope});
    tx.create(db.collection('socialManagedPolicyAudit').doc(),{businessUid:uid,actorUid,action:'enable',policyId:policy.id,at:now(),reviewedScope});
    return {status:'active',policyId:policy.id};
   });
  }
 };
}
module.exports={createSettings};

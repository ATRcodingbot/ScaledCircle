'use strict';
// A scoped extension of the maintained lead-generator permission record. It
// does not grant a product, release the send hold, or write mailbox credentials.
const p=require('./lead_assistance_policy');
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
const keys=['autonomyMode','replyMode','timeZone','expiresAt','termMode','ownerStopLocal','audiences','services','voice','claims','destinations','limits',
 'sendingDays','opensMinute','closesMinute','modelAssistance','modelDataConsent','bookingEnabled','availabilityRevision',
 'schedulingRules','introductionsEnabled','followupsEnabled','notifications','businessName','templates','mailingAddress','newInquiriesEnabled','inquiryLabel','inquiryRoutingConfirmed','inquiryFilterDescription','mailboxMode','historyMode'];
function cleanPolicy(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||JSON.stringify(value).length>12000)
  fail('invalid-argument','Review the supported assistance settings.');
 for(const k of ['services','claims','destinations','audiences'])if(!Array.isArray(value[k])||value[k].length>40||
   value[k].some(s=>typeof s!=='string'||!s.trim()||s.length>500))fail('invalid-argument','Enter the Business content boundaries.');
 if(typeof value.voice!=='string'||!value.voice.trim()||value.voice.length>500)fail('invalid-argument','Enter the Business voice.');
 if(value.destinations.some(s=>{try{return new URL(s).protocol!=='https:';}catch(_){return true;}}))fail('invalid-argument','Use valid secure destinations.');
 for(const k of ['modelAssistance','modelDataConsent','bookingEnabled','introductionsEnabled','followupsEnabled'])
  if(typeof value[k]!=='boolean')fail('invalid-argument','Review each assistance capability.');
 if(value.termMode!=null&&value.termMode!=='shared_pilot')fail('invalid-argument','Choose the approved shared pilot term.');
 if(value.termMode==='shared_pilot'){
  if(value.expiresAt!=null)fail('invalid-argument','The shared pilot expiry is resolved by the server.');
  try{require('./assistance_term').localStop(value.ownerStopLocal,value.timeZone);}catch(e){fail('invalid-argument',e.message);}
 }
 return JSON.parse(JSON.stringify(value));
}
function createAssistanceAuthority({db,now=Date.now,providerReady=false}){
 const ref=a=>db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`);
 const owner=a=>{if(a.beta.canManageConnection!==true||a.actorUid!==a.businessId)fail('permission-denied','The Business owner must manage email assistance.');};
 async function state(a,tx,policy){
  const read=r=>tx?tx.get(r):r.get();
  const [mail,privateCredential,saved]=await Promise.all([read(db.doc('businessMailboxes/'+a.businessId)),
   read(db.doc(`businessMailboxes/${a.businessId}/private/credential`)),read(ref(a))]);
  const mailbox=mail.data(),grant=a.beta.leadAssistanceGrant;
  const selected=policy||saved.data()?.policy;
  const grantDoc=grant?.inferenceGrantId?await read(db.doc('emailAssistanceOperatingGrants/'+grant.inferenceGrantId)):null;
  const shared=grantDoc?.data(),review=(await read(db.doc('emailAssistanceProviderReviews/openai_gmail_v1'))).data();
  const usage=grantDoc? (await read(grantDoc.ref.collection('usage').doc('shared'))).data():null;
  const reviewed=require('./provider_review').validReview(review);
  const pending=shared?.status==='prepared',expiry=pending?now()+7*86400000:shared?.expiresAt;
  const budget=shared?{...shared,expiresAt:expiry,availableMicros:Math.max(0,(shared.maximumCostMicros||0)-(usage?.actualCostMicros||0)-(usage?.outstandingCostMicros||0)),providerDataReviewComplete:reviewed}:null;
  const effectiveGrant=grant?.status==='prepared'?{...grant,expiresAt:now()+7*86400000}:grant;
  const blockers=p.policyPreflight({businessId:a.businessId,actorUid:a.actorUid,isOwner:a.beta.canManageConnection===true,
   mailbox,grant:effectiveGrant,policy:require('./assistance_term').resolveTerm(selected,grant?.status==='active'?{...shared,status:'active',expiresAt:grant.expiresAt}:shared,now()),budget,now:now()});
  if(selected?.modelAssistance&&!reviewed)blockers.push('model_data_review_required');
  if(selected?.modelAssistance&&!providerReady)blockers.push('model_provider_binding_required');
  if(!shared||!['prepared','active'].includes(shared.status))blockers.push('shared_pilot_enrollment_required');
  if((usage?.requests||0)>=100&&selected?.modelAssistance)blockers.push('model_request_allowance_exhausted');
  const schedule=(await read(db.doc('businessOperations/'+a.businessId+'/settings/scheduling'))).data();
  if(selected?.bookingEnabled&&(schedule?.version!==selected.availabilityRevision||p.digest(schedule?.settings||null)!==p.digest(selected.schedulingRules||null)))blockers.push('maintained_schedule_availability_required');
  if(!privateCredential.exists||privateCredential.data().generation!==mailbox?.generation)blockers.push('mailbox_credentials_unavailable');
  // A valid scoped pilot may execute without changing the ordinary send hold.
  if(!grant)blockers.push('audited_pilot_access_required');
  const validTemplate=t=>typeof t?.subject==='string'&&!!t.subject.trim()&&t.subject.length<=200&&!/[\r\n\0]/.test(t.subject)&&typeof t.body==='string'&&!!t.body.trim()&&t.body.length<=6500&&!t.body.includes('\0');
  if(selected?.introductionsEnabled&&!validTemplate(selected?.templates?.introduction)||selected?.followupsEnabled&&!validTemplate(selected?.templates?.followup))blockers.push('approved_message_templates_required');
  if(selected?.notifications&&(typeof selected.notifications.email!=='boolean'||typeof selected.notifications.push!=='boolean'))blockers.push('notification_preferences_required');
  if(selected?.notifications?.quietStartMinute!=null||selected?.notifications?.quietEndMinute!=null){try{require('./shared/lead_reply_alert').quietUntil(selected.notifications,selected.timeZone,now());}catch(_){blockers.push('valid_notification_quiet_hours_required');}}
  if((selected?.introductionsEnabled||selected?.followupsEnabled)&&!selected?.mailingAddress)blockers.push('public_mailing_address_required');
  const coverageError=require('./mailbox_coverage').validate(selected);if(coverageError)blockers.push(coverageError);
  return {saved:saved.data()||null,mailbox,grant,shared, budgetState:shared?.status||'not_prepared',blockers:[...new Set(blockers)]};
 }
 async function load(a){
  const s=await state(a,null);
  const [business,profile,availability,brand,social,campaigns,devices]=await Promise.all([
   db.doc('users/'+a.businessId).get(),db.doc('businessGrowthProfiles/'+a.businessId).get(),db.doc('businessOperations/'+a.businessId+'/settings/scheduling').get(),
   db.doc('businessBrandProfiles/'+a.businessId).get(),db.doc('socialManagedPolicies/'+a.businessId).get(),
   db.collection('businessMailboxes/'+a.businessId+'/campaigns').limit(26).get(),
   db.collection('mobilePushDevices').where('uid','==',a.actorUid).limit(20).get()]);
  const proposal=require('./assistance_proposal').proposal({businessId:a.businessId,business:business.data(),profile:profile.data(),brand:brand.data(),social:social.data(),campaigns:campaigns.docs.map(d=>d.data()),availability:availability.data()});
  const intake=(await db.doc(`businessMailboxes/${a.businessId}/private/inquirySync`).get()).data();
  const contacts=a.beta.canManageConnection&&a.actorUid===a.businessId?(await db.collection(`businessOperations/${a.businessId}/customers`).limit(50).get()).docs.map(d=>({id:d.id,name:d.data().name,email:d.data().email,version:d.data().version,permissionStatus:d.data().emailPermission?.status||'not_recorded'})):[];
  return {intakeStatus:intake?{state:intake.state,lastVisitedAt:intake.lastVisitedAt,considered:intake.considered||0,unclassified:intake.unclassified||0,coverage:intake.coverage||'labels'}:null,proposal,ownerEmail:business.data()?.email||null,pushReady:devices.docs.some(d=>d.data().enabled===true&&d.data().environment==='production'&&d.data().expiresAtMs>now()),accessTerm:{startsAt:s.grant?.startsAt||null,expiresAt:s.grant?.expiresAt||null},pilotTerm:{status:s.budgetState,startsAt:s.shared?.startsAt||null,expiresAt:s.shared?.expiresAt||null,termDays:7},contacts,businessId:a.businessId,policy:s.saved||null,canPreparePilot:a.businessId===require('./inference_budget').WORKSPACES[0]&&a.actorUid===a.businessId&&a.beta.kind==='internal'&&a.beta.canManageConnection===true,pilotStatus:s.budgetState,canManage:a.beta.canManageConnection===true&&a.actorUid===a.businessId,
   sender:s.mailbox?.email||null,workspaceName:business.data()?.businessName||business.data()?.companyName||profile.data()?.businessName||'Current Business',timeZone:profile.data()?.timeZone||null,schedulingAvailability:availability.data()||null,
   grantExpiresAt:s.grant?.expiresAt||null,capabilities:{modelSuggestions:{ready:require('./provider_review').validReview((await db.doc('emailAssistanceProviderReviews/openai_gmail_v1').get()).data())&&providerReady,selected:s.saved?.policy?.modelAssistance===true},mailboxCoverage:require('./mailbox_coverage').mode(s.saved?.policy),historicalReview:false},blockers:s.blockers,blockerMessages:{model_data_review_required:'AI suggestions are gated by the model-data review. Turn suggestions off to authorize independently eligible non-model capabilities.',model_provider_binding_required:'The verified provider binding has not been enabled for this Email runtime.',shared_pilot_enrollment_required:'The approved shared pilot must be prepared without starting its clock.',audited_pilot_access_required:'The bounded pilot enrollment has not been activated.',model_consent_and_separate_budget_required:'Model-data review, your explicit consent and the separate shared allowance must be ready.',workspace_timezone_required:'Choose the actual Business timezone.',valid_policy_term_required:'Choose a policy expiry within the approved pilot term.',maintained_schedule_availability_required:'Save Business availability, duration and buffers in Schedule. Staff is optional.',approved_message_templates_required:'Review the exact introduction/follow-up copy.',public_mailing_address_required:'Provide the authorized public Business mailing address.'},automaticSending:s.saved?.status==='active'&&s.saved.policy.expiresAt>now()&&s.blockers.length===0&&(s.saved.policy.introductionsEnabled===true||s.saved.policy.followupsEnabled===true)};
 }
 async function mutate(a,input){
  owner(a);
  if(!input||Object.keys(input).some(k=>!['action','expectedVersion','requestId','policy','confirm'].includes(k))||
    !['prepare','activate','pause','revoke','resume'].includes(input.action)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))fail('invalid-argument','Review the assistance action.');
  const action=input.action;
  if(action!=='prepare'&&input.confirm!==true)fail('failed-precondition','Confirm the exact assistance action.');
  if(!['prepare','activate'].includes(action)&&input.policy)fail('invalid-argument','Change preferences before confirming a new policy.');
  const policy=['prepare','activate'].includes(action)?cleanPolicy(input.policy):null;
  return db.runTransaction(async tx=>{
   const s=await state(a,tx,policy),old=s.saved;
   const event=ref(a).collection('audit').doc(input.requestId),prior=await tx.get(event);
   const fingerprint=p.digest({actor:a.actorUid,business:a.businessId,input});
   if(prior.exists){if(prior.data().fingerprint!==fingerprint)fail('already-exists','This action identifier was already used.');return {...prior.data().result,reused:true};}
   if((old?.version||0)!==input.expectedVersion)fail('aborted','Email settings changed. Reload the saved assistance policy.');
   if(['activate','resume'].includes(action)&&s.blockers.length)fail('failed-precondition','Email assistance cannot activate: '+s.blockers.join(', '));
   if(['pause','revoke','resume'].includes(action)&&!old)fail('failed-precondition','No saved email assistance policy exists.');
   if(action==='resume'&&old.status==='revoked')fail('failed-precondition','Review and authorize a new policy after revocation.');
   const version=(old?.version||0)+1;let status=action==='prepare'?'prepared':action==='pause'?'paused':action==='revoke'?'revoked':'awaiting_pilot_activation';
   const newCoverage=require('./mailbox_coverage').mode(policy||old?.policy);
   const priorIntake=old?.authorizedIntake||(['active','paused'].includes(old?.status)&&Number.isSafeInteger(old?.intakeStartsAt||old?.approvedAt)?{mode:require('./mailbox_coverage').mode(old.policy),label:old.policy?.inquiryLabel||null,generation:old.connectionGeneration,startsAt:old.intakeStartsAt||old.approvedAt}:null);
   const intakeMatch=priorIntake&&priorIntake.mode===newCoverage&&priorIntake.label===((policy||old?.policy)?.inquiryLabel||null)&&priorIntake.generation===s.mailbox?.generation;
   const intakeStartsAt=['activate','resume'].includes(action)?(intakeMatch?priorIntake.startsAt:now()):(old?.intakeStartsAt||null);
   const authorizedIntake=['activate','resume'].includes(action)?{mode:newCoverage,label:(policy||old?.policy)?.inquiryLabel||null,generation:s.mailbox?.generation||null,startsAt:intakeStartsAt}:(priorIntake||null);
   const saved={intakeStartsAt,authorizedIntake,businessId:a.businessId,agentType:'lead_generator',capability:'business_email',version,status,
    policy:policy||old.policy,updatedBy:a.actorUid,updatedAt:now(),sender:s.mailbox?.email||null,
    connectionGeneration:s.mailbox?.generation||null,grantId:s.grant?.id||null,
    ...(old?.approvedBy?{approvedBy:old.approvedBy,approvedAt:old.approvedAt}:{}),
    ...(['activate','resume'].includes(action)?{approvedBy:a.actorUid,approvedAt:now()}:{}),
    ...(status==='revoked'?{revokedAt:now()}: {})};
   saved.digest=p.digest(saved);
   let activation=null;
   if(['activate','resume'].includes(action)){activation=await require('./pilot_enrollment').createEnrollment({db,now}).activation(tx,a,saved,s.blockers);if(activation.activate){status='active';saved.status=status;saved.activatedAt=activation.startsAt;saved.policy={...saved.policy,expiresAt:Math.min(require('./assistance_term').resolveTerm(saved.policy,{status:'active',termMs:7*86400000,expiresAt:activation.expiresAt},now()).expiresAt,activation.expiresAt)};saved.digest=p.digest(saved);}}
   const result={saved:true,version,status,automaticSending:status==='active'&&(saved.policy.introductionsEnabled||saved.policy.followupsEnabled),blockers:s.blockers};
   if(activation?.activate)activation.apply();
   tx.set(ref(a),saved);
   tx.create(event,{businessId:a.businessId,actorUid:a.actorUid,action,at:now(),fingerprint,policySnapshot:saved,result});
   return result;
  });
 }
 return {load,mutate};
}
module.exports={createAssistanceAuthority,cleanPolicy};

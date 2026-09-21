'use strict';
// Pure preflight for the existing Business Email authority. This does not grant
// access, dispatch mail, interpret instructions in messages, or reserve money.
const {createHash}=require('node:crypto');
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const validZone=z=>{try{return typeof z==='string'&&z.includes('/')&&!!new Intl.DateTimeFormat('en-US',{timeZone:z}).format(0);}catch(_){return false;}};
function recipientEligibility({businessId,recipient,consent,restriction,contact,purpose,now}){
 if(restriction?.active||contact?.suppressed||contact?.doNotContact)return 'do_not_contact';
 if(!recipient||recipient!==recipient.toLowerCase()||!/^\S+@\S+\.\S+$/.test(recipient))return 'no_verified_email';
 if(!consent||consent.businessId!==businessId||consent.recipient!==recipient||
   !['consented','requested'].includes(consent.status)||!consent.evidenceRef||!consent.recordedBy||
   !Number.isSafeInteger(consent.recordedAt)||consent.recordedAt>now||
   (consent.expiresAt!=null&&consent.expiresAt<=now)||!consent.purposes?.includes(purpose))return 'recipient_permission_required';
 if(contact?.pendingOperationId)return 'existing_operation_pending';
 if(purpose==='followup'&&(contact?.lastInboundAt||contact?.awaitingReply===false))return 'reply_received';
 if(contact?.cooldownUntil>now)return 'contact_cooldown';
 return null;
}
function policyPreflight({businessId,actorUid,isOwner,mailbox,grant,policy,budget,now}){
 const blockers=[];
 if(!isOwner||actorUid!==businessId)blockers.push('workspace_owner_required');
 if(!grant||grant.businessId!==businessId||grant.product!=='lead_email_assistance_pilot'||
    !grant.grantedBy||!grant.reason||!grant.grantedAt||grant.expiresAt<=now)blockers.push('audited_pilot_access_required');
 if(mailbox?.status!=='connected'||mailbox.permissions?.read!==true||((policy?.introductionsEnabled||policy?.followupsEnabled)&&mailbox.permissions?.send!==true)||
    !mailbox.generation||mailbox.email!==grant?.mailbox)blockers.push('healthy_owned_mailbox_required');
 if(!validZone(policy?.timeZone))blockers.push('workspace_timezone_required');
 if(policy?.autonomyMode!=='bounded_managed'||policy?.replyMode!=='approval_required')blockers.push('bounded_authority_required');
 if(!Number.isSafeInteger(policy?.expiresAt)||policy.expiresAt<=now||policy.expiresAt>grant?.expiresAt)blockers.push('valid_policy_term_required');
 if(!Array.isArray(policy?.audiences)||!policy.audiences.length||policy.audiences.some(x=>!['consented','requested'].includes(x)))blockers.push('permitted_audience_required');
 if(policy?.introductionsEnabled||policy?.followupsEnabled||policy?.modelAssistance){
  if(!policy?.services?.length)blockers.push('business_services_required');
  if(!policy?.voice)blockers.push('business_voice_required');
  if(!policy?.destinations?.length)blockers.push('business_destinations_required');
 }
 const limits=policy?.limits;
 if(!Number.isInteger(limits?.initialPerDay)||limits.initialPerDay<0||limits.initialPerDay>20||
    !Number.isInteger(limits?.followupsPerContact)||limits.followupsPerContact<0||limits.followupsPerContact>3||
    !Number.isInteger(limits?.followupIntervalHours)||limits.followupIntervalHours<120)blockers.push('contact_limits_required');
 if(!policy?.sendingDays?.length||policy.sendingDays.some(d=>!Number.isInteger(d)||d<1||d>7)||
    !Number.isInteger(policy?.opensMinute)||!Number.isInteger(policy?.closesMinute)||
    policy.opensMinute<0||policy.closesMinute>1440||policy.closesMinute<=policy.opensMinute)blockers.push('sending_window_required');
 if(policy?.modelAssistance===true&&(!budget||budget.purpose!=='lead_email_assistance'||
    !budget.businessIds?.includes(businessId)||budget.expiresAt<=now||budget.availableMicros<=0||
    policy.modelDataConsent!==true||budget.providerDataReviewComplete!==true))blockers.push('model_consent_and_separate_budget_required');
 if(policy?.bookingEnabled===true&&(!policy?.availabilityRevision||!policy?.schedulingRules?.durationMinutes||
    !Number.isInteger(policy?.schedulingRules?.bufferMinutes)||!Array.isArray(policy?.schedulingRules?.assignedPeople)))blockers.push('maintained_schedule_availability_required');
 return [...new Set(blockers)];
}
function dispatchEligibility({policy,expectedPolicyDigest,mailbox,operation,now,...rest}){
 if(!policy||policy.status!=='active'||policy.paused===true||policy.revokedAt||policy.expiresAt<=now)return 'policy_inactive';
 if(policy.digest!==expectedPolicyDigest||operation.policyDigest!==policy.digest)return 'policy_changed';
 if(mailbox?.status!=='connected'||mailbox.permissions?.send!==true||mailbox.generation!==operation.connectionGeneration||mailbox.email!==operation.from)return 'mailbox_changed';
 if(operation.businessId!==rest.businessId||policy.businessId!==rest.businessId)return 'workspace_mismatch';
 if(operation.certification===true)return 'certification_permit_not_reusable';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:policy.timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday)+1,minute=Number(parts.hour)*60+Number(parts.minute);
 if(!policy.sendingDays.includes(day)||minute<policy.opensMinute||minute>=policy.closesMinute)return 'outside_sending_window';
 return recipientEligibility({...rest,recipient:operation.recipient,purpose:operation.purpose,now});
}
function classifyInbound({headers={},from,subject='',body=''}){
 const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).toLowerCase()]));
 if(h['content-type']?.includes('delivery-status')||/mailer-daemon|postmaster/i.test(from||'')||/^(undeliverable|delivery status notification)/i.test(subject))return 'bounce';
 if(h['list-id']||h['list-unsubscribe']||h.precedence==='bulk'||h.precedence==='list')return 'newsletter';
 if(h['x-scaled-circle-notification']||h['x-scaledcircle-notification'])return 'platform_notification';
 if((h['auto-submitted']&&h['auto-submitted']!=='no')||h['x-autoreply']||h['x-autorespond']||/^(automatic reply|out of office|auto.?reply)\b/i.test(subject))return 'automated_reply';
 if(/^\s*(please\s+)?(unsubscribe|remove me|do not (email|contact)|stop (emailing|contacting))/i.test(body))return 'opt_out';
 return 'substantive';
}
function replyApprovalCurrent({approval,operation,inbound,draft}){
 return approval?.actorUid&&approval.operationId===operation.id&&approval.businessId===operation.businessId&&
   approval.recipient===operation.recipient&&approval.inboundDigest===digest(inbound)&&
   approval.draftDigest===digest(draft)&&approval.draftRevision===draft.version;
}
module.exports={digest,validZone,recipientEligibility,policyPreflight,dispatchEligibility,classifyInbound,replyApprovalCurrent};

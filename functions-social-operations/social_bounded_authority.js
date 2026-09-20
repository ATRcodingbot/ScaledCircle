'use strict';

// Strategy authority is distinct from a per-post human approval. This module
// performs no provider calls and cannot activate a workspace on its own.
const {hash} = require('./social_growth_cycle');
const POLICY = 'BoundedManagedSocialV1';
const PROVIDERS = ['facebook', 'instagram'];
const {internalCopy} = require('./social_public_caption');
const unsupportedClaim = /\b(?:we (?:just )?(?:completed|built|installed|finished)|our (?:latest|recent|completed) (?:project|work)|happy customer|testimonial|guaranteed results|award[- ]winning)\b/i;
const normalized = value => String(value || '').trim().toLowerCase();
const list = values => [...new Set((Array.isArray(values) ? values : []).map(normalized).filter(Boolean))].sort();
const millis = value => value?.toMillis ? value.toMillis() : typeof value === 'number' ? value : Date.parse(value);
function destination(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Choose a secure Business destination.');
  return url.href;
}
function validPolicy(policy, uid, now) {
  return policy?.schemaVersion === POLICY && policy.businessUid === uid &&
    policy.approvedByUid === uid && policy.mode === 'bounded_managed' &&
    policy.status === 'active' && policy.revokedAt == null &&
    Number.isFinite(policy.startsAt) && Number.isFinite(policy.endsAt) &&
    policy.startsAt <= now && policy.endsAt > now &&
    policy.endsAt > policy.startsAt && policy.endsAt - policy.startsAt <= 31 * 86400000 &&
    Number.isSafeInteger(policy.maxPerWeek) && policy.maxPerWeek >= 1 &&
    Array.isArray(policy.services) && policy.services.length > 0 &&
    policy.services.every(s => typeof s === 'string' && s.trim()) &&
    Array.isArray(policy.providers) && policy.providers.length > 0 &&
    policy.providers.every(p => PROVIDERS.includes(p)) &&
    require('./social_cadence_policy').valid(policy.cadence,policy.providers) &&
    Array.isArray(policy.destinations) && policy.destinations.length > 0 &&
    typeof policy.id === 'string' && policy.id.startsWith('managed_social_');
}
function strategyDigest(plan) {
  return hash({businessUid: plan.businessUid, planVersion: plan.planVersion, strategy: plan.strategy});
}
function createPolicy({uid, actorUid, planId, plan, services, destinations, providers,
  maxPerWeek = 5, startsAt, endsAt, now = Date.now()}) {
  if (!uid || actorUid !== uid || plan?.businessUid !== uid || !planId ||
      plan.status !== 'approved' || plan.approvedVersion !== plan.planVersion) {
    throw Error('Approve the current Business strategy before enabling managed publishing.');
  }
  const scope = list(services), channels = list(providers);
  if (!scope.length || scope.length > 30 || scope.some(s => s.length > 120) ||
      !channels.length || channels.some(p => !PROVIDERS.includes(p)) ||
      !Number.isSafeInteger(maxPerWeek) || maxPerWeek < 1) {
    throw Error('Choose the services, supported channels and bounded weekly cadence.');
  }
  // URL paths and query values are case-sensitive; never normalize them as labels.
  const urls = [...new Set((Array.isArray(destinations) ? destinations : []).map(destination))].sort();
  if (!urls.length || urls.length > 20) throw Error('Choose the approved Business destinations.');
  const start = millis(startsAt), end = millis(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < now - 60000 ||
      end <= start || end - start > 31 * 86400000) throw Error('Choose the current strategy publishing window.');
  const binding = {schemaVersion: POLICY, businessUid: uid, mode: 'bounded_managed',
    planId, planVersion: plan.planVersion, strategyDigest: strategyDigest(plan),
    services: scope, destinations: urls, providers: channels, maxPerWeek,
    startsAt: start, endsAt: end};
  return {...binding, id: 'managed_social_' + hash(binding), approvedByUid: actorUid,
    approvedAt: now, status: 'active', revokedAt: null};
}
function assess({uid, policy, planId, plan, version, provider, quality,
  history = [], now = Date.now()}) {
  const reasons = [];
  const add = (code, message) => reasons.push({code, message});
  if (!validPolicy(policy, uid, now)) {
    return {ready: false, reasons: [{code: 'strategy_authority', message: 'Managed publishing needs current Business strategy authorization.'}]};
  }
  if (plan?.businessUid !== uid || plan.status !== 'approved' ||
      plan.approvedVersion !== plan.planVersion || policy.planId !== planId ||
      policy.planVersion !== plan.planVersion || policy.strategyDigest !== strategyDigest(plan)) {
    add('strategy_changed', 'Review the changed strategy before managed publishing resumes.');
  }
  const variant = version?.variants?.find(v => v.provider === provider);
  if (version?.businessUid !== uid || !policy.providers.includes(provider) || !variant) {
    add('scope', 'This post is outside the authorized Business or channel scope.');
  }
  const copy = String(variant?.copy || '');
  if (internalCopy.test(copy)) add('internal_copy', 'Remove internal workflow language from the public caption.');
  // Such claims require human evidence review, not a generated confidence score.
  if (unsupportedClaim.test(copy)) add('claim_review', 'This factual or completed-work claim needs evidence review.');
  const context = normalized([version?.goal, version?.pillar, copy].join(' '));
  if (!policy.services.some(service => context.includes(service))) add('service_scope', 'The post does not establish an authorized service context.');
  if (variant?.destinationUrl) {
    try { if (!policy.destinations.includes(destination(variant.destinationUrl))) throw Error(); }
    catch { add('destination_scope', 'This destination is outside the approved strategy.'); }
  } else if (variant?.callToAction) add('destination_scope', 'This call to action needs an approved destination.');
  if (quality?.businessUid !== uid || quality.immutableSourceHash !== version?.contentHash ||
      quality.readyToPublish !== true || quality.advisoryReady !== true || quality.reviewChecks?.passed !== true) {
    add('quality', 'This post needs a current passing truth and quality assessment.');
  }
  const scheduled = millis(version?.scheduledFor);
  if (!Number.isFinite(scheduled) || scheduled < now + 5 * 60000 ||
      scheduled < policy.startsAt || scheduled >= policy.endsAt) add('time', 'Choose a future time inside the authorized strategy window.');
  const week = Math.floor((scheduled - policy.startsAt) / (7 * 86400000));
  const scheduledHistory = history.filter(job => job.businessUid === uid && job.provider === provider &&
    job.status !== 'canceled' && Math.floor((millis(job.scheduledFor) - policy.startsAt) / (7 * 86400000)) === week);
  if (scheduledHistory.length >= require('./social_cadence_policy').current(policy,provider)) add('cadence', 'The approved weekly cadence is already scheduled.');
  if(policy.cadence&&history.some(job=>job.businessUid===uid&&job.provider===provider&&job.status!=='canceled'&&Math.abs(millis(job.scheduledFor)-scheduled)<Math.max(6*3600000,604800000/require('./social_cadence_policy').current(policy,provider)*0.8)))add('cadence_spacing','Spread posts across the week; this time is too close to another post.');
  if (history.some(job => job.businessUid === uid && job.provider === provider && job.status !== 'canceled' &&
      job.binding?.variants?.some(v => normalized(v.copy) === normalized(copy)))) add('duplicate', 'This caption is already in the publication history or upcoming queue.');
  return {ready: reasons.length === 0, reasons, policyId: policy.id};
}
function assertRuntimePolicy({uid,policy,approval,plan,now=Date.now()}) {
  if (!validPolicy(policy,uid,now) || approval?.businessUid!==uid || policy.planId!==approval.planId ||
      policy.id!==approval.managedPolicyId ||
      policy.strategyDigest!==approval.managedStrategyDigest || plan?.businessUid!==uid ||
      plan.status!=='approved' || plan.approvedVersion!==plan.planVersion ||
      policy.planVersion!==plan.planVersion || policy.strategyDigest!==strategyDigest(plan)) {
    throw Error('meta_managed_strategy_authority_changed');
  }
}
function nextSlot({policy,history,provider,now=Date.now(),preferred}) {
  const target=require('./social_cadence_policy').current(policy,provider);
  const gap=policy.cadence?Math.max(6*3600000,604800000/target*0.8):6*3600000;
  const jobs=history.filter(j=>j.businessUid===policy.businessUid&&j.provider===provider&&j.status!=='canceled');
  const fits=t=>Number.isFinite(t)&&t>=now+3600000&&t>=policy.startsAt&&t<policy.endsAt&&
    jobs.filter(j=>Math.floor((millis(j.scheduledFor)-policy.startsAt)/604800000)===Math.floor((t-policy.startsAt)/604800000)).length<target&&
    jobs.every(j=>Math.abs(millis(j.scheduledFor)-t)>=gap);
  const proposed=millis(preferred);
  if(!policy.cadence&&fits(proposed))return new Date(proposed).toISOString();
  const spacing=policy.cadence||target>7?3600000:604800000/target;
  for(let t=policy.cadence?Math.max(policy.startsAt,Math.ceil(now/3600000)*3600000)+3600000:policy.startsAt+3600000;t<policy.endsAt;t+=spacing)if(fits(t))return new Date(t).toISOString();
  return null;
}
module.exports = {POLICY, createPolicy, assess, assertRuntimePolicy, strategyDigest, internalCopy, unsupportedClaim,nextSlot};

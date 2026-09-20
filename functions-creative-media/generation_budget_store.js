"use strict";

// Transactional storage for the maintained visual-generation reservations and
// usage projections. Provider calls must happen after reserve() returns.
const {periodKeys, evaluateGenerationBudget, reservationTransition} = require('./generation_budget');
const amount = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('invalid_generation_accounting');
  return value;
};
const outstanding = value => amount(value.outstandingUnits ?? value.reservedUnits ?? 0);
const cost = value => amount(value.actualCostMicros || 0) + amount(value.outstandingCostMicros ?? value.reservedCostMicros ?? 0);

function createStore({db, resolveBusiness, now = Date.now}) {
  const reservationRef = id => db.doc('visualGenerationReservations/' + id);
  const usageRef = id => db.doc('visualGenerationUsage/' + id);
  const assertOwner = (record, uid) => { if (record.businessUid !== uid) throw Error('generation_access_denied'); };
  async function reserve({actor, jobId, operation = 'generation', maximumCostMicros}) {
    if (!actor?.uid || !/^[\w-]{1,160}$/.test(jobId || '') || !['generation','review'].includes(operation)) throw Error('invalid_generation_attempt');
    return db.runTransaction(async tx => {
      const ref = reservationRef(jobId), old = await tx.get(ref);
      if (old.exists) { assertOwner(old.data(), actor.uid); return {...old.data(), idempotentReplay:true}; }
      const at = now(), keys = periodKeys(at);
      const [configSnap, entitlementSnap, grantSnap, policySnap] = await Promise.all([
        tx.get(db.doc('providerConfigurations/generated-service-visuals')),
        tx.get(db.doc('businessSubscriptions/' + actor.uid)),
        tx.get(db.doc('visualGenerationGrants/' + actor.uid)),
        tx.get(db.doc('socialManagedPolicies/' + actor.uid)),
      ]);
      const config = configSnap.data() || {}, grant = grantSnap.data(), policy = policySnap.data();
      if(config.paidPreparationHolds?.[actor.uid])throw Error('paid_preparation_held');
      if(!grant && config.paidPreparationAccountingVersion!=='combined_v1')throw Error('historical_preparation_accounting_required');
      const business = resolveBusiness(entitlementSnap.data() || {}, at);
      const cohort = [...(config.authorizedBusinessUids || []), ...(config.betaCohortBusinessUids || [])];
      const ordinaryAccess = require('./generation_foundation').generationAuthorizationPolicy(config,actor.uid,business);
      if (grant ? !cohort.includes(actor.uid) : !ordinaryAccess.authorized) throw Error('generation_cohort_required');
      if (grant) {
        assertOwner(grant, actor.uid);
        if (grant.status !== 'active' || grant.revokedAt != null || !Number.isFinite(grant.startsAt) ||
            !Number.isFinite(grant.expiresAt) || grant.startsAt > at || grant.expiresAt <= at ||
            grant.policyId !== policy?.id || policy.businessUid !== actor.uid || policy.status !== 'active' ||
            policy.revokedAt != null || policy.endsAt !== grant.expiresAt || policy.startsAt > at ||
            !/^[\w-]{1,160}$/.test(grant.id || '')) throw Error('generation_grant_inactive');
        // An internal operating grant is not a paid plan. Product/cohort enrollment
        // must be explicitly present, never inherited from another comped account.
        if (grant.product !== 'social_creative_generation' || grant.source !== 'internal_operating_grant') throw Error('generation_grant_invalid');
        business.eligible = true;
        business.monthlyAllowance = amount(grant.maximumConcepts);
      }
      const units = operation === 'generation' ? 1 : 0;
      const reserveCost = amount(maximumCostMicros ?? config.maximumCostMicros);
      if (!reserveCost) throw Error('generation_cost_bound_required');
      const ids = [`business_${actor.uid}_${keys.month}`, `global_day_${keys.day}`, `global_month_${keys.month}`, `business_day_${actor.uid}_${keys.day}`];
      if (grant) ids.push(`grant_${actor.uid}_${grant.id}`);
      const snaps = await Promise.all(ids.map(id => tx.get(usageRef(id))));
      const data = snaps.map(s => s.data() || {}), [month, globalDay, globalMonth, day] = data;
      const decision = evaluateGenerationBudget({config:{...config, maximumCostMicros:reserveCost},business,
        usage:{businessRollingDay:amount(day.actualUnits || 0)+outstanding(day),
          businessMonth:amount(month.customerConsumedUnits || 0)+outstanding(month),
          globalDay:amount(globalDay.actualUnits || 0)+outstanding(globalDay),
          globalMonth:amount(globalMonth.actualUnits || 0)+outstanding(globalMonth),
          globalDayCostMicros:cost(globalDay),globalMonthCostMicros:cost(globalMonth)},now:at});
      // Reviews still consume money when concept capacity has been reached.
      if (!decision.allowed && !(operation === 'review' && ['monthly_limit_reached','generation_rate_limited'].includes(decision.reason))) throw Error(decision.reason);
      if (operation === 'review' && (config.providerGenerationEnabled !== true || business.eligible !== true ||
          cost(globalDay)+reserveCost>amount(config.globalDailyCostMicros) ||
          cost(globalMonth)+reserveCost>amount(config.globalMonthlyCostMicros))) throw Error('global_budget_exhausted');
      if (grant) {
        const lifetime = data[4];
        if (cost(lifetime)+reserveCost>amount(grant.maximumCostMicros)) throw Error('generation_grant_budget_exhausted');
        if (amount(lifetime.customerConsumedUnits || 0)+outstanding(lifetime)+units>amount(grant.maximumConcepts)) throw Error('generation_grant_concepts_exhausted');
      }
      const record = {jobId,businessUid:actor.uid,operation,status:'reserved',keys,usageIds:ids,
        grantId:grant?.id || null,policyId:grant?.policyId || null,reservedUnits:units,
        reservedCostMicros:reserveCost,createdAt:at,updatedAt:at};
      tx.create(ref, record);
      ids.forEach((id,i) => tx.set(usageRef(id), {...data[i],schemaVersion:'VisualGenerationUsageV3',
        outstandingUnits:outstanding(data[i])+units,reservedUnits:outstanding(data[i])+units,
        outstandingCostMicros:amount(data[i].outstandingCostMicros ?? data[i].reservedCostMicros ?? 0)+reserveCost,
        reservedCostMicros:amount(data[i].outstandingCostMicros ?? data[i].reservedCostMicros ?? 0)+reserveCost,updatedAt:at}));
      return record;
    });
  }
  async function reconcile({reservation,status,providerAccepted=false,customerConsumed=false,cost:actualCost,usage=null,definitiveNoCharge=false}) {
    return db.runTransaction(async tx => {
      const ref=reservationRef(reservation.jobId), snap=await tx.get(ref);
      if (!snap.exists) throw Error('generation_reservation_missing');
      const current=snap.data(); assertOwner(current,reservation.businessUid);
      if (status==='released' && !definitiveNoCharge) throw Error('generation_outcome_unresolved');
      if (status==='settled' && (!Number.isSafeInteger(actualCost?.actualCostMicros) || actualCost.actualCostMicros<0)) throw Error('generation_cost_unresolved');
      const transition=reservationTransition(current,{status,providerAccepted,customerConsumed,cost:actualCost});
      if (!transition.apply) return {...current,...transition};
      const ids=current.usageIds;
      if (!Array.isArray(ids) || !ids.length) throw Error('generation_usage_binding_missing');
      const snaps=await Promise.all(ids.map(id=>tx.get(usageRef(id))));
      ids.forEach((id,i)=>{const d=snaps[i].data()||{}, units=outstanding(d)+transition.outstandingUnitsDelta,
        held=amount(d.outstandingCostMicros ?? d.reservedCostMicros ?? 0)+transition.outstandingCostMicrosDelta;
        amount(units);amount(held);
        tx.set(usageRef(id),{...d,outstandingUnits:units,reservedUnits:units,outstandingCostMicros:held,reservedCostMicros:held,
          actualUnits:amount(d.actualUnits||0)+transition.actualUnitsDelta,
          actualCostMicros:amount(d.actualCostMicros||0)+transition.actualCostMicrosDelta,
          customerConsumedUnits:amount(d.customerConsumedUnits||0)+transition.customerConsumedUnitsDelta,updatedAt:now()});});
      tx.update(ref,{status,providerAccepted,customerConsumed,cost:actualCost||null,usage,updatedAt:now()});
      return {...current,status};
    });
  }
  async function claim({reservation}) {
    return db.runTransaction(async tx=>{
      const ref=reservationRef(reservation.jobId),snap=await tx.get(ref);
      if(!snap.exists)throw Error('generation_reservation_missing');
      const record=snap.data();assertOwner(record,reservation.businessUid);
      if(record.status!=='reserved'||record.dispatchStartedAt!=null)return false;
      const config=(await tx.get(db.doc('providerConfigurations/generated-service-visuals'))).data();
      if(config?.providerGenerationEnabled!==true)throw Error('generation_disabled');
      if(config.paidPreparationHolds?.[record.businessUid])throw Error('paid_preparation_held');
      if(record.grantId){
        const grant=(await tx.get(db.doc('visualGenerationGrants/'+record.businessUid))).data();
        const policy=(await tx.get(db.doc('socialManagedPolicies/'+record.businessUid))).data();
        if(grant?.id!==record.grantId||grant.status!=='active'||grant.revokedAt!=null||grant.expiresAt<=now()||
           policy?.id!==record.policyId||policy.status!=='active'||policy.revokedAt!=null||policy.endsAt<=now())throw Error('generation_grant_inactive');
      } else {
        const entitlement=(await tx.get(db.doc('businessSubscriptions/'+record.businessUid))).data()||{};
        if(!require('./generation_foundation').generationAuthorizationPolicy(config,record.businessUid,resolveBusiness(entitlement,now())).authorized)throw Error('generation_access_denied');
      }
      tx.update(ref,{dispatchStartedAt:now()});return true;
    });
  }
  return {reserve,reconcile,claim};
}
module.exports={createStore};

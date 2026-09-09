'use strict';
const {projection, ACTIVE_ZONE} = require('./policy');
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k,value[k]]));

function activeAssignment(uid, room, zone, campaign, participant) {
  if (!uid || zone?.campaignId !== room?.campaignId || zone?.businessId !== room?.businessId ||
      campaign?.businessId !== room?.businessId ||
      ['completed','cancelled','canceled','archived'].includes(campaign?.status)) return false;
  if (zone.assignedScalerId === uid) return ACTIVE_ZONE.has(zone.status);
  return (ACTIVE_ZONE.has(zone.status) || zone.status === 'unassigned') && zone.assignedScalerIds?.includes(uid) === true &&
    participant?.scalerUid === uid && participant.zoneId === room.id &&
    participant.campaignId === room.campaignId && participant.businessId === room.businessId &&
    ['accepted','participating','paused'].includes(participant.status);
}

function scalerResponse(response, allowed) {
  const campaign = projection(response.campaign.id, response.campaign).document ||
    pick(response.campaign, ['id','businessId','campaignName','campaignType','status']);
  if (allowed) {
    return {...response, campaign, privateLogisticsAvailable:true,
      room:pick(response.room,['id','campaignId','zoneId','businessId','scalerId','status','materialLogistics','coordination']),
      zone:pick(response.zone,['id','campaignId','businessId','zoneName','status','serviceArea','serviceAreaGeoJson','workWindow','assignedScalerId']),
      groupAssignment:null, groupMaterialStatuses:[],
    };
  }
  return {viewerRole:'scaler', privateLogisticsAvailable:false,
    room:pick(response.room,['id','campaignId','businessId','scalerId','status']), campaign,
    zone:pick(response.zone,['id','campaignId','businessId','zoneName','status']),
    handoff:{required:false,status:'unavailable'},
    compensation:pick(response.compensation,['currency','baseAmountCents','bonusAmountCents','immutable','initialShareCents','finalPayCents']),
    participant:null,groupAssignment:null,groupMaterialStatuses:[],
    participantLabels:{available:response.participantLabels?.available===true,
      participants:(response.participantLabels?.participants||[]).map(p=>pick(p,['uid','displayName']))},
    completions:(response.completions||[]).map(c=>pick(c,['id','campaignId','zoneId','scalerId','status','reviewStatus','proofCount','gpsPointCount','submittedAt','reviewedAt','approvedAt','earning'])),
    messages:[],events:[],
    startEligibility:{allowed:false,reasons:['This assignment is no longer active.']},
  };
}
module.exports = {activeAssignment, scalerResponse};

'use strict';
const {hasActiveManagedGrowthEntitlement}=require('./subscription_entitlements');
const eligible=(entitlement,now=Date.now())=>hasActiveManagedGrowthEntitlement(entitlement,{nowMillis:now});
async function authorized({db,uid,read=ref=>ref.get(),now=Date.now()}) {
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,220}$/.test(uid))return false;
  return eligible((await read(db.doc('businessSubscriptions/'+uid))).data(),now)||!!await require('./social_internal_managed').authority({db,uid,read});
}
// Select due owner-approved work, never empty subscribed workspaces. The
// existing 15-minute execution window and approval records remain authority.
async function inventory({db,now=Date.now()}) {
  // Exact customer approval creates `scheduled` jobs. Keep legacy approved
  // records eligible too; status alone never grants execution authority.
  const base=db.collection('socialGrowthJobs').where('customerApproval','==',true).where('status','in',['approved','scheduled']);
  const page=await base
    .where('scheduledFor','>=',new Date(now-15*60000).toISOString())
    .where('scheduledFor','<=',new Date(now).toISOString()).orderBy('scheduledFor').limit(100).get();
  const expired=await base.where('scheduledFor','<',new Date(now-15*60000).toISOString()).orderBy('scheduledFor').limit(25).get();
  const uids=[],jobIdsByBusiness=Object.create(null);
  const eligibility=new Map();
  for(const doc of [...page.docs,...expired.docs]){
    const job=doc.data(),uid=job.businessUid;
    if(job.id!==doc.id||!['facebook','instagram'].includes(job.provider))continue;
    if(!eligibility.has(uid))eligibility.set(uid,await authorized({db,uid,now}));
    if(!eligibility.get(uid))continue;
    if(!uids.includes(uid))uids.push(uid);
    (jobIdsByBusiness[uid]||=[]).push(doc.id);
  }
  return {uids,jobIdsByBusiness,inspected:page.size+expired.size};
}
module.exports={eligible,authorized,inventory};

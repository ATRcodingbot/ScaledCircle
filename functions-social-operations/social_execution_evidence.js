'use strict';
// Saved evidence only: no provider calls, status writes, retries or scheduling.
async function hydrate(db,job,uid){
 if((job.businessUid||job.owner)!==uid)throw Error('execution_tenant_mismatch');
 const base=job.canonicalKey;
 if(!/^(socialGrowthJobs|socialStoryJobs|socialPublishingJobs)\/[A-Za-z0-9_-]+$/.test(base||''))throw Error('execution_path_invalid');
 const story=base.startsWith('socialStoryJobs/');
 const receipt=(await db.doc(base+(story?'/steps/publish':'/receipts/publication')).get()).data();
 const evidence=story?receipt?.receipt:receipt;
 const verified=story?evidence?.state==='PUBLISHED'&&evidence.jobId===job.id&&evidence.versionId===job.versionId:!!evidence?.providerPostId&&(!evidence.provider||evidence.provider===job.provider)&&(!job.binding?.contentHash||!evidence.contentHash||evidence.contentHash===job.binding.contentHash);
 if(verified){job.providerPostId=evidence.providerPostId||evidence.storyId;job.publishedAt=job.completedAt||evidence.observedAt;job.providerPermalink=evidence.providerPostUrl||evidence.permalink||null;}
 if(story){
  const version=job.versionId?(await db.doc('socialStoryVersions/'+job.versionId).get()).data():null;
  const media=job.mediaRevisionId?(await db.doc('socialStoryMediaRevisions/'+job.mediaRevisionId).get()).data():null;
  if(version?.versionId===job.versionId&&version.mediaRevisionId===job.mediaRevisionId){
   job.binding={pillar:'Story · '+String(version.pillar||'Saved Story').replace(/_/g,' '),variants:[{provider:job.provider,format:'story',copy:version.text||'',callToAction:version.ctaBehavior==='link_in_bio_text'?'Link in bio':null}]};
   if(media?.owner===uid&&media.provider===job.provider&&media.sha256===version.mediaHash)job.historyMediaUrl=media.url;
  }
  job.sendStarted=!!receipt?.sendStarted||['sending','unknown_outcome'].includes(receipt?.state);
 }
 if(job.customerApproval&&job.approvalId){const a=(await db.doc('socialGrowthApprovals/'+job.approvalId).get()).data();if(a?.businessUid===uid&&a.authorizationSource==='approved_strategy')job.managedPolicyId=a.managedPolicyId;}
 return job;
}
module.exports={hydrate};

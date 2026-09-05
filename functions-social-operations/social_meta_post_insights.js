"use strict";
const {binding}=require("./social_meta_measurements");

async function collect({job,receipt,approval,session,fetchImpl=globalThis.fetch}) {
 const attribution=binding(job,receipt,approval),ig=job.provider==="instagram";
 if(session?.businessUid!==job.businessUid||session.providerUserId!==attribution.providerAccountId||!session.accessToken)throw Error("meta_measurement_identity_mismatch");
 async function get(id,edge,params) {
  if(![attribution.providerAccountId,attribution.providerPostId].includes(id)||!["","media","insights"].includes(edge))throw Error("meta_measurement_path_denied");
  const url=new URL(`https://graph.facebook.com/v26.0/${id}${edge?`/${edge}`:""}`);
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  const response=await fetchImpl(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${session.accessToken}`}});
  const body=await response.json();
  if(!response.ok||body.error) {
   if(response.status===400&&body.error?.code===100&&/metric.*(?:invalid|unsupported)|(?:invalid|unsupported).*metric/i.test(body.error.message||""))return {unsupported:true};
   throw Error("meta_post_insights_unavailable");
  }
  return body;
 }
 const metrics=[];
 const metric=(name,value,status)=>({name,value,status,period:"lifetime"});
 const count=(name,value)=>metric(name,Number.isSafeInteger(value)&&value>=0?value:null,
  Number.isSafeInteger(value)&&value>=0?"OBSERVED":"UNAVAILABLE");
 if(ig) {
  const owned=await get(attribution.providerAccountId,"media",{fields:"id",limit:100});
  if(!owned.data?.some(item=>item.id===receipt.providerPostId))throw Error("meta_measurement_post_not_verified");
  for(const name of ["views","reach","total_interactions"]) {
   try {
    const body=await get(receipt.providerPostId,"insights",{metric:name});
    if(body.unsupported){metrics.push(metric(name,null,"UNAVAILABLE"));continue;}
    if(!Array.isArray(body.data))throw Error("meta_post_shape_invalid");
    const row=body.data.find(item=>item.name===name);
    if(!row||(!row.total_value&&(!Array.isArray(row.values)||!row.values.length))){metrics.push(metric(name,null,"NO_DATA"));continue;}
    // This is a lifetime post request; never reinterpret a returned daily bucket.
    if(row.period&&row.period!=="lifetime"){metrics.push(metric(name,null,"UNAVAILABLE"));continue;}
    metrics.push(count(name,row.total_value?.value??row.values.at(-1).value));
   }catch(_){metrics.push(metric(name,null,"ERROR"));}
  }
 }else {
  const post=await get(receipt.providerPostId,"",{fields:"id,from,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares"});
  if(post.id!==receipt.providerPostId||post.from?.id!==attribution.providerAccountId)throw Error("meta_measurement_post_not_verified");
  metrics.push(count("reactions",post.reactions?.summary?.total_count),count("comments",post.comments?.summary?.total_count),count("shares",post.shares?.count));
  for(const name of ["views","reach","impressions"])metrics.push(metric(name,null,"UNAVAILABLE"));
 }
 return {provider:job.provider,providerAccountId:attribution.providerAccountId,providerPostId:receipt.providerPostId,scope:"post",metrics};
}
module.exports={collect};

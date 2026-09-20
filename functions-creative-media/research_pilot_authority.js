'use strict';
const PILOT='founder_research_20260920';
const WORKSPACES=['scaled-circle/IqRjZYHKOzXYuJcSyL68LYNwtDg1','scaledcircle-staging/FF1bfDuvtdNjuuC4mc7NdGtk3LC3'];
const PRINCIPALS={'1010956217112-compute@developer.gserviceaccount.com':WORKSPACES[0],'998249478055-compute@developer.gserviceaccount.com':WORKSPACES[1]};
const discovery=require('./public_web_discovery');
function bind(email,body){const workspace=PRINCIPALS[email];if(!workspace||body.workspace!==workspace||Object.keys(body).some(k=>!['workspace','operation','attemptId','query'].includes(k)))throw Error('research_runtime_denied');if(!['metadata','search'].includes(body.operation))throw Error('research_operation_denied');if(body.operation==='search'&&(!/^[a-f0-9]{64}$/.test(body.attemptId||'')||typeof body.query!=='string'||body.query.length>600||/[\r\n<>@]/.test(body.query)))throw Error('research_request_invalid');return workspace;}
async function activate({db,operator,now=Date.now}){if(!operator)throw Error('admin_required');return db.runTransaction(async tx=>{const ref=db.doc('researchOperatingGrants/'+PILOT),old=await tx.get(ref);if(old.exists)return {...old.data(),reused:true};const at=now(),grant={id:PILOT,product:'public_web_research',status:'active',approvedBy:operator,authorizationReference:'Founder 038330dc-f1e8-4c79-b93c-236da4324258',workspaces:WORKSPACES,startsAt:at,expiresAt:at+7*86400000,maximumCostMicros:5000000,maximumRequests:28,renewal:false,recurringEnabled:false};tx.create(ref,grant);return grant;});}
function createService({db,clientFactory,now=Date.now}){
 const budget=require('./research_pilot_budget').createStore({db,grantId:PILOT,now});
 return {async execute({email,body}){
  const workspace=bind(email,body),[project,businessUid]=workspace.split('/');
  const client=await clientFactory();
  if(body.operation==='metadata')return {...await discovery.accessMetadata(client),workspace,ledgerProject:'scaled-circle',grantId:PILOT};
  const grant=(await db.doc('researchOperatingGrants/'+PILOT).get()).data();
  if(grant?.recurringEnabled!==true)throw Error('research_recurring_not_enabled');
  return paid({project,businessUid,attemptId:body.attemptId,query:body.query,client});
 },async validateAccess({operator,query}){
  if(!operator)throw Error('admin_required');
  const attemptId=require('node:crypto').createHash('sha256').update(PILOT+'/single_access_validation').digest('hex');
  return paid({project:'scaled-circle',businessUid:WORKSPACES[0].split('/')[1],attemptId,query,client:await clientFactory(),purpose:'access_validation_not_scheduled_research'});
 }};
 async function paid({project,businessUid,attemptId,query,client,purpose='scheduled_research'}){
  const reservation=await budget.reserve({project,businessUid,attemptId,maximumCostMicros:100000});
  if(!await budget.claim({reservation}))throw Error('research_attempt_already_dispatched');
  try{const response=await discovery.createSearch(client)(discovery.request(query)),cost=discovery.cost(response);
   if(cost===null)throw Error('research_usage_unknown');
   await budget.reconcile({reservation,status:'settled',providerAccepted:true,cost:{actualCostMicros:cost,basis:'conservative_usage_plus_search_block',providerUsage:response.usage}});
   return {purpose,response,accountedCostMicros:cost};
  }catch(error){await budget.reconcile({reservation,status:'unknown_provider_outcome'});throw Error('research_provider_outcome_requires_reconciliation');}
 }
}
module.exports={PILOT,WORKSPACES,PRINCIPALS,bind,activate,createService};

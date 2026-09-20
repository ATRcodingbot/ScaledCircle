'use strict';
const ENDPOINT='https://us-east1-scaled-circle.cloudfunctions.net/researchPilotAuthorityV1';
const WORKSPACES=new Set(['scaled-circle/IqRjZYHKOzXYuJcSyL68LYNwtDg1','scaledcircle-staging/FF1bfDuvtdNjuuC4mc7NdGtk3LC3']);
function create({db,project,businessUid,auth,publicProfile}){
 const workspace=project+'/'+businessUid;
 if(!WORKSPACES.has(workspace))return null;
 return {publicProfile,readPublicSource:require('./public_research_source').read,async executeRequest(body){
  const config=(await db.doc('providerConfigurations/research-pilot').get()).data();
  if(body.workspace!==workspace||(body.operation!=='metadata'&&(config?.enabled!==true||config.centralEndpoint!==ENDPOINT)))throw Error('research_pilot_not_enabled');
  const client=await auth.getIdTokenClient(ENDPOINT);
  const r=await client.request({url:ENDPOINT,method:'POST',data:body,retry:false,timeout:90000});
  return r.data;
 }};
}
async function preflight({db,project,businessUid,auth,enable=false}){
 const adapter=create({db,project,businessUid,auth});if(!adapter)throw Error('research_runtime_denied');
 const result=await adapter.executeRequest({workspace:project+'/'+businessUid,operation:'metadata'});
 if(result.listed!==true||result.workspace!==project+'/'+businessUid||result.ledgerProject!=='scaled-circle')throw Error('research_runtime_preflight_failed');
 if(enable){if(result.recurringEnabled!==true)throw Error('research_pilot_not_activated');await db.doc('providerConfigurations/research-pilot').set({enabled:true,centralEndpoint:ENDPOINT,grantId:result.grantId,workspace:result.workspace,enabledAt:Date.now(),source:'validated_dedicated_runtime'},{merge:true});}
 return {purpose:'non_billable_runtime_preflight',listed:result.listed,enabled:enable};
}
module.exports={ENDPOINT,WORKSPACES,create,preflight};

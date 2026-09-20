'use strict';
const ENDPOINT='https://us-east1-scaled-circle.cloudfunctions.net/researchPilotAuthorityV1';
const WORKSPACES=new Set(['scaled-circle/IqRjZYHKOzXYuJcSyL68LYNwtDg1','scaledcircle-staging/FF1bfDuvtdNjuuC4mc7NdGtk3LC3']);
function create({db,project,businessUid,auth,publicProfile}){
 const workspace=project+'/'+businessUid;
 if(!WORKSPACES.has(workspace))return null;
 return {publicProfile,readPublicSource:require('./public_research_source').read,async executeRequest(body){
  const config=(await db.doc('providerConfigurations/research-pilot').get()).data();
  if(config?.enabled!==true||config.centralEndpoint!==ENDPOINT||body.workspace!==workspace)throw Error('research_pilot_not_enabled');
  const client=await auth.getIdTokenClient(ENDPOINT);
  const r=await client.request({url:ENDPOINT,method:'POST',data:body,retry:false,timeout:90000});
  return r.data;
 }};
}
module.exports={ENDPOINT,WORKSPACES,create};

"use strict";
// Facebook Login root credentials stay encrypted at rest. Execution tokens are
// derived per request, never persisted, and omitted from JSON/console inspection.
const {isDeepStrictEqual: equal}=require('node:util');
async function resolveMetaPageExecutionCredential({db,decryptJson,encryptionKey,businessUid,expected,fetchImpl=fetch}){
 const path=`socialConnections/${businessUid}/providers/instagram`;
 const same=c=>c&&c.tokenHealth==='healthy'&&c.environment==='production'&&
  ['credentialId','connectionRevision','credentialRotationGeneration','providerUserId','linkedPageId'].every(k=>c[k]===expected[k]);
 const current=(await db.doc(path).get()).data();
 if(!same(current))throw Error('meta_page_root_changed');
 const root=(await db.doc(`socialConnectionCredentials/${current.credentialId}`).get()).data();
 if(root?.businessUid!==businessUid||root.provider!=='meta'||root.rotationGeneration!==current.credentialRotationGeneration||root.connectionRevision!==current.connectionRevision)throw Error('meta_page_root_changed');
 const assertCurrent=async()=>{const c=(await db.doc(path).get()).data();if(!same(c)||!equal(c.grantedScopes,current.grantedScopes))throw Error('meta_page_root_changed');};
 let account,tokens;
 try{const key=await encryptionKey();account=decryptJson(root.accountEnvelope,key,`${businessUid}:meta:${current.credentialId}`);tokens=decryptJson(root.tokenEnvelope,key,`${businessUid}:meta:${account.accountId}`);}catch{throw Error('meta_page_root_unavailable');}
 if(account.accountId!==current.linkedPageId||account.linkedAccountId!==current.providerUserId||!tokens.userAccessToken)throw Error('meta_page_identity_mismatch');
 async function read(path,token){try{const r=await fetchImpl(`https://graph.facebook.com/v26.0/${path}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error();const d=await r.json();if(d.error)throw Error();return d;}catch{throw Error('meta_page_derivation_unavailable');}}
 const page=await read(`${current.linkedPageId}?fields=id,name,access_token,instagram_business_account`,tokens.userAccessToken);
 if(page.id!==current.linkedPageId||page.instagram_business_account?.id!==current.providerUserId||typeof page.access_token!=='string'||!page.access_token)throw Error('meta_page_identity_mismatch');
 const subject=await read('me?fields=id,name',page.access_token);
 if(subject.id!==current.linkedPageId)throw Error('meta_page_subject_mismatch');
 const ig=await read(`${current.providerUserId}?fields=id,username`,page.access_token);
 if(ig.id!==current.providerUserId||ig.username!==current.handle)throw Error('meta_page_instagram_mismatch');
 await assertCurrent();
 const session={businessUid,owner:businessUid,providerUserId:ig.id,accountId:ig.id,linkedPageId:page.id,pageId:page.id,
  tokenType:'PAGE',scopes:[...(current.grantedScopes||[])],connectionRevision:current.connectionRevision,
  credentialRotationGeneration:current.credentialRotationGeneration};
 Object.defineProperties(session,{accessToken:{value:page.access_token,enumerable:false},assertCurrent:{value:assertCurrent,enumerable:false}});
 return Object.freeze(session);
}
function requirePageCredential(c,pageId){if(c?.tokenType!=='PAGE'||c.linkedPageId!==pageId||!c.accessToken)throw Error('meta_page_execution_credential_required');}
module.exports={resolveMetaPageExecutionCredential,requirePageCredential};

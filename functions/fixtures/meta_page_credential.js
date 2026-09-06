"use strict";
const assert=require('node:assert/strict');
const {resolveMetaPageExecutionCredential}=require('../../functions-social-operations/social_meta_page_credential');
const oauth=require('../../functions-social-operations/social_oauth');
module.exports=({businessUid='fixture',pageId='123',igId='456',handle='fixture'}={})=>{
 const key=Buffer.alloc(32,7).toString('base64'),rows=new Map(),calls=[];
 const c={credentialId:'root',connectionRevision:1,credentialRotationGeneration:1,providerUserId:igId,linkedPageId:pageId,handle,tokenHealth:'healthy',environment:'production',grantedScopes:['pages_show_list','instagram_basic','instagram_content_publish','pages_read_engagement']};
 const root={businessUid,provider:'meta',rotationGeneration:1,connectionRevision:1,
  accountEnvelope:oauth.encryptJson({accountId:pageId,linkedAccountId:igId},key,`${businessUid}:meta:root`),
  tokenEnvelope:oauth.encryptJson({userAccessToken:'root-fixture'},key,`${businessUid}:meta:${pageId}`)};
 rows.set(`socialConnections/${businessUid}/providers/instagram`,c);rows.set('socialConnectionCredentials/root',root);
 const control={wrongPage:false,wrongIG:false,wrongSubject:false,missingToken:false,fail:false,rotateDuringRead:false};
 const context={businessUid,expected:{...c},db:{doc:p=>({get:async()=>({data:()=>rows.get(p)})})},decryptJson:oauth.decryptJson,encryptionKey:async()=>key,
  fetchImpl:async(url,options)=>{assert.equal(options.method,'GET');calls.push(url);if(control.fail)throw Error('must-not-leak-page-fixture');
   if(url.includes('access_token,instagram_business_account')){assert.equal(options.headers.Authorization,'Bearer root-fixture');return Response.json({id:control.wrongPage?'999':pageId,name:'Page',access_token:control.missingToken?null:'page-fixture',instagram_business_account:{id:control.wrongIG?'999':igId}});}
   assert.equal(options.headers.Authorization,'Bearer page-fixture');if(url.includes('/me?'))return Response.json({id:control.wrongSubject?'999':pageId,name:'Page'});
   if(control.rotateDuringRead)c.credentialRotationGeneration++;
   return Response.json({id:igId,username:handle});}};
 return {context,c,root,rows,calls,control,resolve:()=>resolveMetaPageExecutionCredential(context),rotate:()=>{c.connectionRevision++;c.credentialRotationGeneration++;root.connectionRevision++;root.rotationGeneration++;context.expected={...c};}};
};

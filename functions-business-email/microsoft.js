'use strict';
const crypto=require('node:crypto');
const {email}=require('./gmail'),{fail,mime,exactSent,normalizeReplies}=require('./mailbox_contract');
const BASE='https://graph.microsoft.com/v1.0';
const SCOPES={read:'Mail.Read',send:'Mail.Send'};
function createProvider({clientId,clientSecret,redirectUri,fetchImpl=fetch}) {
 async function request(url,options={},empty=false) {
  const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)fail([401,403].includes(response.status)?'permission-denied':response.status===429?'resource-exhausted':'unavailable',
    [401,403].includes(response.status)?'Reconnect Business Email to continue.':'Microsoft could not confirm this action. Try again later.');
  if(empty){if(response.status!==202)fail('unavailable','The send needs checking. No automatic retry was made.');return null;}
  let value='';
  for await (const chunk of response.body){value+=Buffer.from(chunk).toString('utf8');if(Buffer.byteLength(value)>2_000_000)fail('resource-exhausted','This conversation is too large to review here.');}
  return JSON.parse(value);
 }
 const token=body=>request('https://login.microsoftonline.com/common/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({...body,client_id:clientId,client_secret:clientSecret}).toString()});
 const headers=access=>({Authorization:'Bearer '+access,Prefer:'IdType="ImmutableId", outlook.body-content-type="text"'});
 async function access(credentials,onRefresh,onPermissions) {
  const result=await token({grant_type:'refresh_token',refresh_token:credentials.refreshToken});
  if(!result.access_token)fail('permission-denied','Reconnect Business Email to continue.');
  if(onPermissions&&typeof result.scope==='string'){const granted=new Set(result.scope.split(' ').map(s=>s.replace('https://graph.microsoft.com/','')));
    onPermissions({read:granted.has(SCOPES.read),send:granted.has(SCOPES.send)});}
  if(result.refresh_token&&result.refresh_token!==credentials.refreshToken){if(!onRefresh)fail('failed-precondition','Reconnect Business Email to continue.');await onRefresh({refreshToken:result.refresh_token});}
  return result.access_token;
 }
 const normalize=m=>({id:m.id,conversationId:m.conversationId,messageId:m.internetMessageId,from:email(m.from?.emailAddress?.address||''),
   to:(m.toRecipients||[]).map(r=>email(r.emailAddress.address)),subject:m.subject,body:m.body?.contentType?.toLowerCase()==='text'?m.body.content:null,
   receivedAt:Date.parse(m.receivedDateTime||m.sentDateTime),sent:!m.isDraft&&!!m.sentDateTime,
   references:(m.internetMessageHeaders||[]).filter(h=>h.name.toLowerCase()==='in-reply-to').flatMap(h=>h.value.match(/<[^<>\s]+>/g)||[])});
 async function messages(accessToken,filter,sentOnly=false) {
  const fields='id,conversationId,internetMessageId,from,toRecipients,subject,body,receivedDateTime,sentDateTime,isDraft,internetMessageHeaders';
  const data=await request(BASE+(sentOnly?'/me/mailFolders/sentitems/messages?':'/me/messages?')+new URLSearchParams({'$filter':filter,'$top':'50','$select':fields}),{headers:headers(accessToken)});
  if(data['@odata.nextLink'])fail('resource-exhausted','This conversation needs a smaller review window.');
  return (data.value||[]).map(normalize);
 }
 const quoted=value=>"'"+String(value).replace(/'/g,"''")+"'";
 return {id:'microsoft',configured:!!clientId&&!!clientSecret&&!!redirectUri,
  authorize({state,verifier,read,send,expectedMailbox}) {
   if(!clientId||!clientSecret||!redirectUri?.startsWith('https://'))fail('failed-precondition','Microsoft setup testing is not configured yet.');
   return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?'+new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',response_mode:'query',
    state,scope:['openid','profile','offline_access','User.Read',...(read?[SCOPES.read]:[]),...(send?[SCOPES.send]:[])].join(' '),prompt:'select_account',
    login_hint:expectedMailbox,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
  },
  async exchange(code,verifier) {
   const result=await token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirectUri});
   const who=await request(BASE+'/me?$select=id,mail,userPrincipalName',{headers:headers(result.access_token)});
   if(!who.id||!result.refresh_token)fail('permission-denied',"We couldn't connect this mailbox.");
   const granted=new Set((result.scope||'').split(' ').map(s=>s.replace('https://graph.microsoft.com/','')));
   return {email:email(who.mail||who.userPrincipalName),subject:who.id,credentials:{refreshToken:result.refresh_token},
     permissions:{read:granted.has(SCOPES.read),send:granted.has(SCOPES.send)},senderVerified:true};
  },
  async checkConnection(credentials,onRefresh) {
   let permissions;const token=await access(credentials,onRefresh,value=>{permissions=value;});
   const who=await request(BASE+'/me?$select=id,mail,userPrincipalName',{headers:headers(token)});
   return {email:email(who.mail||who.userPrincipalName),subject:who.id,...(permissions?{permissions}:{})};
  },
  async send(op) {
   const accessToken=await access(op.credentials,op.onRefresh);
   // Delegated /me, exact verified From, one provider attempt. 202 is accepted,
   // not a delivery receipt; reconcile the saved Sent Item before marking Sent.
   await request(BASE+'/me/sendMail',{method:'POST',headers:{...headers(accessToken),'Content-Type':'text/plain'},body:Buffer.from(mime(op)).toString('base64')},true);
   return {accepted:true,pending:true};
  },
  async reconcileSent(credentials,op,onRefresh) {
   const rows=await messages(await access(credentials,onRefresh),'internetMessageId eq '+quoted('<'+op.messageId+'>'),true);
   if(rows.length>1)fail('failed-precondition','More than one message needs review.');
   if(!rows.length)return null;
   if(!exactSent(rows[0],op))fail('failed-precondition','The original sent message could not be verified.');
   return {id:rows[0].id,threadId:rows[0].conversationId};
  },
  async replies(credentials,op,onRefresh) {
   if(typeof op.providerThreadId!=='string'||op.providerThreadId.length>1024)fail('invalid-argument','Choose a saved conversation.');
   return normalizeReplies(await messages(await access(credentials,onRefresh),'conversationId eq '+quoted(op.providerThreadId)),op);
  }
 };
}
module.exports={createProvider,SCOPES};

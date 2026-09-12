'use strict';
const crypto = require('node:crypto');
const SCOPES = Object.freeze({read:'https://www.googleapis.com/auth/gmail.readonly',send:'https://www.googleapis.com/auth/gmail.send'});
const fail = (code,message) => { const e=Error(message); e.code=code; throw e; };
function email(value) {
  if(typeof value!=='string'||value.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value))
    fail('invalid-argument','A valid email address is required.');
  return value.toLowerCase();
}
function seal(value,key,binding) {
  const bytes=Buffer.from(key||'','base64');
  if(bytes.length!==32)fail('failed-precondition','Business Email is not configured yet.');
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',bytes,iv);
  cipher.setAAD(Buffer.from(binding));
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),body:body.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
function unseal(value,key,binding) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),Buffer.from(value.iv,'base64'));
  decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.body,'base64')),decipher.final()]).toString('utf8'));
}
function createProvider({clientId,clientSecret,redirectUri,fetchImpl=fetch}) {
  async function request(url,options={}) {
    const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)fail(response.status===401||response.status===403?'permission-denied':'unavailable',
      response.status===401||response.status===403?'Reconnect Business Email to continue.':'Google could not confirm this action.');
    let data;
    if(response.body?.getReader) {
      const reader=response.body.getReader(),chunks=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
        if(size>2_000_000){await reader.cancel();fail('resource-exhausted','The message is too large to review here.');}chunks.push(Buffer.from(value));}
      data=Buffer.concat(chunks).toString('utf8');
    }else data=await response.text();
    if(data.length>2_000_000)fail('resource-exhausted','The message is too large to review here.');
    return JSON.parse(data);
  }
  const token=body=>request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({...body,client_id:clientId,client_secret:clientSecret}).toString()});
  const headers=access=>({Authorization:'Bearer '+access});
  return {
    authorize({state,verifier,read,send,expectedMailbox}) {
      if(!clientId||!clientSecret||!redirectUri?.startsWith('https://'))fail('failed-precondition','Business Email is not configured yet.');
      const query=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',state,
        scope:['openid','email',...(read?[SCOPES.read]:[]),...(send?[SCOPES.send]:[])].join(' '),
        access_type:'offline',prompt:'consent select_account',include_granted_scopes:'false',login_hint:expectedMailbox,
        code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
      return 'https://accounts.google.com/o/oauth2/v2/auth?'+query;
    },
    async exchange(code,verifier) {
      const result=await token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirectUri});
      const identity=await request('https://openidconnect.googleapis.com/v1/userinfo',{headers:headers(result.access_token)});
      if(identity.email_verified!==true||!identity.sub||!result.refresh_token)fail('permission-denied','Google did not confirm the mailbox connection. Try again.');
      return {subject:identity.sub,email:email(identity.email),refreshToken:result.refresh_token,
        permissions:{read:(result.scope||'').split(' ').includes(SCOPES.read),send:(result.scope||'').split(' ').includes(SCOPES.send)}};
    },
    async send({refreshToken,from,to,subject,body,messageId,parentMessageId,parentThreadId}) {
      const access=(await token({grant_type:'refresh_token',refresh_token:refreshToken})).access_token;
      const raw=[`From: ${email(from)}`,`To: ${email(to)}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Message-ID: <${messageId}>`,...(parentMessageId?[`In-Reply-To: <${parentMessageId}>`,`References: <${parentMessageId}>`]:[]),
        'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',
        Buffer.from(body).toString('base64').match(/.{1,76}/g).join('\r\n')].join('\r\n');
      // Gmail has no send idempotency key. The service makes one attempt, then
      // holds uncertain results; Message-ID alone is not duplicate protection.
      return request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',
        headers:{...headers(access),'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(raw).toString('base64url'),...(parentThreadId?{threadId:parentThreadId}:{})})});
    },
    async thread(refreshToken,threadId) {
      if(!/^[a-zA-Z0-9_-]{1,160}$/.test(threadId))fail('invalid-argument','Invalid conversation.');
      const access=(await token({grant_type:'refresh_token',refresh_token:refreshToken})).access_token;
      return request('https://gmail.googleapis.com/gmail/v1/users/me/threads/'+threadId+'?format=full',{headers:headers(access)});
    },
    async reconcileSent(refreshToken,operation) {
      const access=(await token({grant_type:'refresh_token',refresh_token:refreshToken})).access_token;
      const result=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({q:'in:sent rfc822msgid:'+operation.messageId,maxResults:'2'}),{headers:headers(access)});
      if(result.nextPageToken||(result.messages||[]).length>1)fail('failed-precondition','More than one provider message needs review.');
      if(!result.messages?.length)return null;
      const message=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(result.messages[0].id)+'?format=full',{headers:headers(access)});
      const header=name=>(message.payload?.headers||[]).find(h=>h.name.toLowerCase()===name)?.value;
      const subject=header('subject'),expectedSubject='=?UTF-8?B?'+Buffer.from(operation.subject).toString('base64')+'?=';
      if(!message.labelIds?.includes('SENT')||header('from')!==operation.from||header('to')!==operation.recipient||
        header('message-id')!=='<'+operation.messageId+'>'||![operation.subject,expectedSubject].includes(subject)||
        message.payload?.mimeType!=='text/plain'||Buffer.from(message.payload?.body?.data||'','base64url').toString('utf8').replace(/\r\n/g,'\n').trim()!==operation.body.replace(/\r\n/g,'\n').trim())
        fail('failed-precondition','The provider message needs review before its send can be confirmed.');
      return {id:message.id,threadId:message.threadId};
    }
  };
}
function replyMessages(thread,operation) {
  const messages=thread.messages||[];
  if(messages.length>50)fail('resource-exhausted','This conversation needs a smaller review window.');
  const header=(m,name)=>(m.payload?.headers||[]).find(h=>h.name.toLowerCase()===name)?.value||'';
  if(!messages.some(m=>m.id===operation.providerMessageId&&header(m,'message-id').includes(operation.messageId)))
    fail('failed-precondition','The provider conversation does not match the sent message.');
  const textBody=p=>p?.mimeType==='text/plain'&&p.body?.data?Buffer.from(p.body.data,'base64url').toString('utf8'):
    (p?.parts||[]).filter(x=>!x.filename).map(textBody).join('\n');
  const repliesTo=m=>{
    const immediate=header(m,'in-reply-to').match(/<([^<>]+)>/g)||[];
    const references=header(m,'references').match(/<([^<>]+)>/g)||[];
    return (immediate.length?immediate.at(-1):references.at(-1))==='<'+operation.messageId+'>';
  };
  return messages.filter(m=>m.id!==operation.providerMessageId&&Number(m.internalDate)>=operation.requestedAt&&
    header(m,'from').toLowerCase().match(/(?:<|^)([^<>\s]+@[^<>\s]+)(?:>|$)/)?.[1]===operation.recipient&&
    repliesTo(m))
    .map(m=>({providerMessageId:m.id,receivedAt:Number(m.internalDate),body:textBody(m.payload).slice(0,8000),
      subject:header(m,'subject').slice(0,250),state:'replied'}));
}
module.exports={SCOPES,email,seal,unseal,createProvider,replyMessages};

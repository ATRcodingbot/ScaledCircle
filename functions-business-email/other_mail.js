'use strict';
const dns=require('node:dns/promises'),net=require('node:net');
const {email}=require('./gmail'),{fail,hash,mime,exactSent,normalizeReplies}=require('./mailbox_contract');
// Private Beta admits reviewed provider endpoints only. Resolve and pin public
// IPv4 on every connection; TLS still verifies the original DNS server name.
// IPv6-only/custom-port hosts wait for review instead of weakening this gate.
function publicAddress(ip) {
 if(net.isIP(ip)!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||
   a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);
}
async function endpoint(host,approved,lookup=dns.lookup) {
 if(typeof host!=='string'||host!==approved||host.length>253||! /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)||net.isIP(host)||!host.includes('.'))
   fail('permission-denied','These mailbox settings need a provider compatibility review.');
 let timer;const records=await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{
   timer=setTimeout(()=>{const error=Error('The mail server could not be reached. Try again later.');error.code='unavailable';reject(error);},10000);
 })]).finally(()=>clearTimeout(timer));
 if(!records.length||records.some(r=>!publicAddress(r.address)))fail('permission-denied','This mail server is not supported for setup testing.');
 return {host:records[0].address,servername:host};
}
function settings(input,policy) {
 if(!policy||email(input.email)!==email(policy.email)||email(input.username)!==email(policy.username)||
  typeof input.password!=='string'||input.password.length<1||input.password.length>1024||/[\r\n\0]/.test(input.password)||
  input.read!==true&&input.send!==true)fail('invalid-argument','Check your mailbox settings and app password.');
 if(input.read&&(input.imapHost!==policy.imapHost||input.imapPort!==993)||input.send&&
   (input.smtpHost!==policy.smtpHost||![465,587].includes(input.smtpPort)||input.smtpPort!==policy.smtpPort))
   fail('permission-denied','Use the reviewed secure settings for this email provider.');
 return {email:email(input.email),username:email(input.username),password:input.password,
   ...(input.read?{imapHost:input.imapHost,imapPort:993}:{}),...(input.send?{smtpHost:input.smtpHost,smtpPort:input.smtpPort}:{})};
}
function createProvider({lookup=dns.lookup,imapFactory,transportFactory,parseMail}={}) {
 const makeImap=imapFactory||(options=>new(require('imapflow').ImapFlow)(options));
 const makeTransport=transportFactory||(options=>require('nodemailer').createTransport(options));
 const parse=parseMail||require('mailparser').simpleParser;
 async function imap(credentials,policy,fn) {
  const e=await endpoint(credentials.imapHost,policy.imapHost,lookup);
  const client=makeImap({host:e.host,port:993,secure:true,tls:{servername:e.servername,rejectUnauthorized:true,minVersion:'TLSv1.2'},
    auth:{user:credentials.username,pass:credentials.password},logger:false,emitLogs:false,disableAutoIdle:true,
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  try{await client.connect();return await fn(client);}finally{client.close();}
 }
 async function transport(credentials,policy) {
  const e=await endpoint(credentials.smtpHost,policy.smtpHost,lookup);
  return makeTransport({host:e.host,port:credentials.smtpPort,secure:credentials.smtpPort===465,requireTLS:true,
   tls:{servername:e.servername,rejectUnauthorized:true,minVersion:'TLSv1.2'},auth:{user:credentials.username,pass:credentials.password},
   logger:false,debug:false,pool:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,
   disableFileAccess:true,disableUrlAccess:true});
 }
 async function folderMessages(client,folder,search,sent) {
  const lock=await client.getMailboxLock(folder,{readOnly:true});
  try {
   const validity=String(client.mailbox.uidValidity),uids=await client.search(search,{uid:true});
   if(uids.length>50)fail('resource-exhausted','This conversation needs a smaller review window.');
   const result=[];let bytes=0;
   for(const uid of uids) {
    const meta=await client.fetchOne(uid,{size:true},{uid:true});
    if(!meta||meta.size>200000||bytes+meta.size>1000000)fail('resource-exhausted','This conversation is too large to review here.');
    bytes+=meta.size;
    const m=await client.fetchOne(uid,{source:true,internalDate:true},{uid:true});
    if(!m?.source||m.source.length>200000)fail('resource-exhausted','This message is too large to review here.');
    const p=await parse(m.source,{skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true});
    if(p.from?.value?.length!==1)continue;
    result.push({id:hash([folder,validity,uid]),locator:{folder,uidValidity:validity,uid},messageId:p.messageId||null,
     from:email(p.from.value[0].address),to:(p.to?.value||[]).map(v=>email(v.address)),subject:p.subject||'',body:p.text||'',sent,
     receivedAt:new Date(m.internalDate).getTime(),references:(p.inReplyTo?[p.inReplyTo]:Array.isArray(p.references)?p.references:[p.references]).filter(Boolean)});
   }return result;
  }finally{lock.release();}
 }
 return {id:'other',configured:true,
  async verify(input,policy) {
   const credentials=settings(input,policy),permissions={read:false,send:false};
   if(input.read)try{await imap(credentials,policy,async client=>{const lock=await client.getMailboxLock('INBOX',{readOnly:true});lock.release();});permissions.read=true;}catch(_){/* safe partial connection */}
   if(input.send)try{const t=await transport(credentials,policy);try{await t.verify();permissions.send=policy.senderVerified===true&&email(policy.email)===credentials.email;}finally{t.close();}}catch(_){/* no raw login diagnostic */}
   if(!permissions.read&&!permissions.send)fail('permission-denied',"Your email provider rejected the connection. Check your mailbox settings or app password.");
   return {email:credentials.email,subject:hash([credentials.username,policy.imapHost||null,policy.smtpHost||null]),credentials,
     permissions,senderVerified:permissions.send};
  },
  async checkConnection(credentials,_onRefresh,policy) {
   return this.verify({...credentials,read:!!credentials.imapHost,send:!!credentials.smtpHost},policy);
  },
  async send(op) {
   if(!op.policy?.senderVerified||email(op.from)!==email(op.policy.email)||email(op.credentials.username)!==email(op.policy.username))
     fail('permission-denied','Sending from this mailbox still needs verification.');
   const t=await transport(op.credentials,op.policy);
   try{const result=await t.sendMail({envelope:{from:email(op.from),to:[email(op.to)]},raw:mime(op)});
     if(result.accepted?.length!==1||email(result.accepted[0])!==email(op.to)||result.rejected?.length)fail('unavailable','The send needs checking. No automatic retry was made.');
     // SMTP acceptance is not delivery. No automatic resend on uncertainty.
     return {id:'smtp_'+hash(op.messageId),threadId:'rfc_'+hash(op.messageId),accepted:true};
   }finally{t.close();}
  },
  async reconcileSent(credentials,op,_onRefresh,policy) {
   return imap(credentials,policy,async client=>{
    const sent=(await client.list()).filter(f=>f.specialUse==='\\Sent');
    if(sent.length!==1)return null;
    const rows=await folderMessages(client,sent[0].path,{header:{'Message-ID':'<'+op.messageId+'>'}},true);
    if(rows.length>1)fail('failed-precondition','More than one sent message needs review.');
    if(!rows.length)return null;
    if(!exactSent(rows[0],{...op,providerMessageId:null}))fail('failed-precondition','The original sent message could not be verified.');
    return {id:'smtp_'+hash(op.messageId),threadId:'rfc_'+hash(op.messageId)};
   });
  },
  async replies(credentials,op,_onRefresh,policy) {
   return imap(credentials,policy,async client=>{
    const sent=(await client.list()).filter(f=>f.specialUse==='\\Sent');
    // SMTP servers need not save a Sent copy. An exact authoritative SMTP
    // acceptance already stored in this operation is sufficient send evidence.
    // Uncertain sends without a Sent copy stay held; they never reach this path.
    const original={id:op.providerMessageId,messageId:'<'+op.messageId+'>',sent:op.state==='sent',from:op.from,to:[op.recipient],subject:op.subject,body:op.body};
    if(sent.length===1){const saved=await folderMessages(client,sent[0].path,{header:{'Message-ID':original.messageId}},true);
      if(saved.length>1)fail('failed-precondition','More than one sent message needs review.');
      if(saved.length===1&&!exactSent(saved[0],{...op,providerMessageId:null}))fail('failed-precondition','This conversation needs review.');}
    const received=await folderMessages(client,'INBOX',{or:[{header:{'In-Reply-To':original.messageId}},{header:{References:original.messageId}}]},false);
    return normalizeReplies([original,...received],op);
   });
  }
 };
}
module.exports={createProvider,publicAddress,endpoint,settings};

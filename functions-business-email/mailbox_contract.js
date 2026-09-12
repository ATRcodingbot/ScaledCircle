'use strict';
const crypto=require('node:crypto');
const {email}=require('./gmail');
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const LABELS=Object.freeze({google:'Google / Gmail / Workspace',microsoft:'Microsoft 365 / Outlook',other:'Other Business Email'});
function providerId(value='google') {if(!Object.hasOwn(LABELS,value))fail('invalid-argument','Choose an email provider.');return value;}
function capabilities(connection={}) {
 const connected=connection.status==='connected'&&!['needs_attention','reconnect_required'].includes(connection.health),canRead=connected&&connection.permissions?.read===true,
 canSend=connected&&connection.permissions?.send===true&&connection.senderVerified!==false;
 return {canRead,canSend,canReconcileReplies:canRead,connectionHealth:connection.status!=='connected'?'not_connected':connection.health||(!canSend?'read_only':!canRead?'read_permission_needed':'connected')};
}
function requireOperationProvider(connection,operation) {
 if(providerId(connection.provider)!==providerId(operation.provider)||connection.email!==operation.from||
   (operation.providerSubject&&operation.providerSubject!==connection.subject))
   fail('permission-denied','Reconnect the original sending mailbox to check this conversation.');
}
const normalizeBody=v=>String(v||'').replace(/\r\n/g,'\n').trim();
function exactSent(message,op) {
 return message?.sent===true&&message.from===op.from&&message.to?.length===1&&message.to[0]===op.recipient&&
   message.subject===op.subject&&normalizeBody(message.body)===normalizeBody(op.body)&&message.messageId&&
   (op.providerMessageId?message.id===op.providerMessageId:message.messageId==='<'+op.messageId+'>');
}
// Graph conversationId, IMAP UIDVALIDITY/UID and RFC Message-ID are distinct.
// Only the adapter interprets them. No Gmail-shaped fake IDs are synthesized.
function normalizeReplies(messages,operation) {
 if(!Array.isArray(messages)||messages.length>50)fail('resource-exhausted','This conversation needs a smaller review window.');
 const originals=messages.filter(m=>exactSent(m,operation));
 if(originals.length!==1)fail('failed-precondition','The original sent message could not be verified.');
 const original=originals[0],seen=new Set();
 return messages.filter(m=>m.id!==original.id&&m.from===email(operation.recipient)&&m.to?.includes(email(operation.from))&&
   Number.isFinite(m.receivedAt)&&m.receivedAt>=operation.requestedAt&&
   (m.references||[]).at(-1)===original.messageId).filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true;})
   .map(m=>({providerMessageId:m.id,providerThreadId:m.conversationId||original.conversationId||original.messageId,
     messageId:m.messageId||null,from:m.from,body:String(m.body||'').slice(0,8000),receivedAt:m.receivedAt}));
}
function validateMessage(op) {
 email(op.from);email(op.to||op.recipient);
 if(typeof op.subject!=='string'||!op.subject.trim()||op.subject.length>200||/[\r\n]/.test(op.subject)||
   typeof op.body!=='string'||op.body.length>8000||!op.body.trim()||! /^[a-zA-Z0-9._-]+@mail\.scaledcircle\.com$/.test(op.messageId||''))
   fail('invalid-argument','Review a complete saved message.');
 for(const h of [op.parentMessageId])if(h&&/[\r\n<>]/.test(h))fail('invalid-argument','Review the saved conversation.');
}
function mime(op) {
 validateMessage(op);
 return [`From: ${email(op.from)}`,`To: ${email(op.to||op.recipient)}`,`Subject: =?UTF-8?B?${Buffer.from(op.subject).toString('base64')}?=`,
 `Message-ID: <${op.messageId}>`,...(op.parentMessageId?[`In-Reply-To: <${op.parentMessageId}>`,`References: <${op.parentMessageId}>`]:[]),
 'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',
 Buffer.from(op.body).toString('base64').match(/.{1,76}/g).join('\r\n')].join('\r\n');
}
module.exports={LABELS,providerId,capabilities,requireOperationProvider,normalizeReplies,exactSent,mime,hash,fail};

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const gmail=require('../functions-business-email/gmail'),learning=require('../functions-business-email/growth_learning');
test('least-privilege requests and encrypted credentials bind to one workspace',()=>{
  const key=crypto.randomBytes(32).toString('base64'),secret=gmail.seal({refreshToken:'private'},key,'owner');
  assert.ok(!JSON.stringify(secret).includes('private'));assert.equal(gmail.unseal(secret,key,'owner').refreshToken,'private');assert.throws(()=>gmail.unseal(secret,key,'other'));
  const provider=gmail.createProvider({clientId:'client',clientSecret:'secret',redirectUri:'https://example.test/callback'});
  for(const input of [{read:true,send:false},{read:false,send:true}]){
    const url=new URL(provider.authorize({...input,state:'nonce',verifier:'proof',expectedMailbox:'owner@example.test'}));
    assert.equal(url.searchParams.get('scope').includes(gmail.SCOPES.read),input.read);assert.equal(url.searchParams.get('scope').includes(gmail.SCOPES.send),input.send);
    assert.equal(url.searchParams.get('include_granted_scopes'),'false');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  }
  assert.throws(()=>gmail.email('recipient@example.test\r\nBcc: injected@example.test'));
});
test('Gmail send has one recipient, bound From and no hidden CC/BCC; response means accepted not delivered',async()=>{
  const calls=[];const provider=gmail.createProvider({clientId:'client',clientSecret:'secret',redirectUri:'https://example.test/callback',fetchImpl:async(url,options)=>{
    calls.push({url,options});return {ok:true,text:async()=>JSON.stringify(url.includes('/token')?{access_token:'transient'}:{id:'message',threadId:'thread'})};}});
  await provider.send({refreshToken:'secret',from:'owner@example.test',to:'recipient@example.test',subject:'Subject',body:'Message',messageId:'op@mail.scaledcircle.com'});
  const raw=Buffer.from(JSON.parse(calls[1].options.body).raw,'base64url').toString();
  assert.match(raw,/From: owner@example.test/);assert.match(raw,/To: recipient@example.test/);assert.ok(!raw.includes('Bcc:'));assert.equal(calls.length,2);
});
test('local outcome learning excludes cross tenant, unsigned product outcomes and DNC followups',()=>{
  const now=10*86400000,operations=Array.from({length:3},(_,i)=>({id:'o'+i,businessId:'owner',state:'sent',requestedAt:0,replyCount:i<2?1:0,prospectId:'p'+i,features:{industry:'property management',channel:'email'}}));
  const outcomes=[0,1].map(i=>({businessId:'owner',operationId:'o'+i,outcome:'meeting',recordedAt:i}));
  const result=learning.project({businessId:'owner',operations:[...operations,{...operations[0],businessId:'other'}],outcomes,prospects:[{id:'p2',businessUid:'owner',doNotContact:true}],now});
  assert.equal(result.sent,3);assert.equal(result.replied,2);assert.equal(result.patterns[0].positive,2);assert.equal(result.followups.length,0);assert.equal(result.networkDataUsed,false);assert.equal(result.automaticSending,false);
  assert.equal(learning.project({businessId:'owner',operations:operations.slice(0,1),outcomes,now}).patterns.length,0);
});
test('shared workspace and consent authority remain byte-identical to maintained source',()=>{
  for(const name of ['business_workspace.js','legal_consent.js','subscription_entitlements.js'])assert.equal(fs.readFileSync(path.join(__dirname,name),'utf8'),fs.readFileSync(path.join(__dirname,'../functions-business-email/shared',name),'utf8'));
});
test('test traffic cannot train real Growth results, and negative samples change priority without claiming causation',()=>{
  const ops=Array.from({length:6},(_,i)=>({id:'o'+i,businessId:'owner',state:'sent',requestedAt:0,replyCount:0,features:{industry:'directories'}}));
  const result=learning.project({businessId:'owner',operations:[...ops,{...ops[0],id:'cert',certification:true,replyCount:1}],now:7*86400000});
  assert.equal(result.sent,6);assert.equal(result.replied,0);assert.equal(result.patterns[0].noReplyAfterFiveDays,6);
  assert.ok(learning.priority({industry:'directories'},result.patterns)<0);assert.equal(learning.priority({industry:'different'},result.patterns),0);
});
test('reconciliation verifies the exact provider message, not only a searchable Message-ID',async()=>{
  const op={messageId:'id@mail.scaledcircle.com',from:'owner@example.test',recipient:'recipient@example.test',subject:'Subject',body:'Message'};
  const message={id:'message',threadId:'thread',labelIds:['SENT'],payload:{mimeType:'text/plain',body:{data:Buffer.from(op.body).toString('base64url')},headers:[{name:'From',value:op.from},{name:'To',value:op.recipient},{name:'Subject',value:op.subject},{name:'Message-ID',value:'<'+op.messageId+'>'}]}};
  const p=gmail.createProvider({clientId:'client',clientSecret:'secret',redirectUri:'https://example.test',fetchImpl:async url=>({ok:true,text:async()=>JSON.stringify(url.includes('/token')?{access_token:'token'}:url.includes('?q=')?{messages:[{id:'message'}]}:message)})});
  assert.equal((await p.reconcileSent('secret',op)).id,'message');message.payload.headers.find(h=>h.name==='To').value='wrong@example.test';
  await assert.rejects(p.reconcileSent('secret',op),/needs review/);
});

function conversation(rewritten=true) {
 const op={messageId:'original@mail.scaledcircle.com',providerMessageId:'sent1',providerThreadId:'thread1',
  from:'owner@example.test',recipient:'recipient@example.test',subject:'Subject',body:'Original message',requestedAt:1};
 const reference='<'+(rewritten?'provider-replacement@mail.gmail.com':op.messageId)+'>';
 const sent={id:op.providerMessageId,threadId:op.providerThreadId,labelIds:['SENT'],payload:{mimeType:'text/plain',
  body:{data:Buffer.from(op.body).toString('base64url')},headers:Object.entries({From:op.from,To:op.recipient,Subject:op.subject,'Message-ID':reference}).map(([name,value])=>({name,value}))}};
 const reply={id:'reply1',threadId:op.providerThreadId,internalDate:'10',payload:{mimeType:'text/plain',body:{data:Buffer.from('Actual reply').toString('base64url')},
  headers:Object.entries({From:'Recipient <'+op.recipient+'>',To:op.from,'In-Reply-To':reference,Subject:'Re: Subject'}).map(([name,value])=>({name,value}))}};
 return {op,reference,sent,reply,thread:{id:op.providerThreadId,messages:[sent,reply]}};
}
const setHeader=(m,name,value)=>m.payload.headers.find(h=>h.name===name).value=value;
test('reply attribution accepts verified Gmail replacement or preserved RFC ID without resending',()=>{
 for(const rewritten of [false,true]){
  const {op,reference,reply,thread}=conversation(rewritten);thread.messages.push(reply);
  const replies=gmail.replyMessages(thread,op);assert.equal(replies.length,1);assert.equal(replies[0].body,'Actual reply');
  assert.equal(replies[0].inReplyTo,reference);assert.equal(replies[0].providerThreadId,op.providerThreadId);
  assert.equal(op.messageId,'original@mail.scaledcircle.com');
 }
});
test('reply attribution selects the immediate provider message, not an earlier ancestor in the thread',()=>{
 const {op,reference,reply,thread}=conversation();
 setHeader(reply,'In-Reply-To','<followup@mail.scaledcircle.com>');reply.payload.headers.push({name:'References',value:reference+' <followup@mail.scaledcircle.com>'});
 assert.equal(gmail.replyMessages(thread,op).length,0);
 setHeader(reply,'In-Reply-To',reference);assert.equal(gmail.replyMessages(thread,op).length,1);
});
test('provider receipt alone cannot authorize a mismatched original message',()=>{
 for(const corrupt of [
  c=>c.thread.id='other',c=>c.sent.id='other',c=>c.sent.threadId='other',c=>c.sent.labelIds=[],
  c=>setHeader(c.sent,'From','other@example.test'),c=>setHeader(c.sent,'To','other@example.test'),
  c=>setHeader(c.sent,'Subject','Changed'),c=>setHeader(c.sent,'Message-ID','invalid'),
  c=>c.sent.payload.body.data=Buffer.from('Changed body').toString('base64url'),
  c=>c.sent.payload.headers.push({name:'To',value:c.op.recipient}),
 ]){const c=conversation();corrupt(c);assert.throws(()=>gmail.replyMessages(c.thread,c.op),/does not match/);}
});
test('wrong sender, recipient, thread, earlier date and reference never count as replies',()=>{
 for(const corrupt of [
  c=>setHeader(c.reply,'From','wrong@example.test'),c=>setHeader(c.reply,'To','wrong@example.test'),
  c=>c.reply.threadId='other',c=>c.reply.internalDate='0',
  c=>setHeader(c.reply,'In-Reply-To','<unrelated@example.test>'),
  c=>setHeader(c.reply,'From',c.op.recipient+', other@example.test'),
 ]){const c=conversation();corrupt(c);assert.equal(gmail.replyMessages(c.thread,c.op).length,0);}
});

test('provider response size is bounded while streaming',async()=>{
 const p=gmail.createProvider({clientId:'client',clientSecret:'secret',redirectUri:'https://example.test',fetchImpl:async()=>new Response('x'.repeat(2_000_001))});
 await assert.rejects(p.thread('secret','thread'),/too large/);
});

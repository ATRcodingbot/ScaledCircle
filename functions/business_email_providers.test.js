'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createProvider,SCOPES}=require('../functions-business-email/microsoft');
const other=require('../functions-business-email/other_mail'),contract=require('../functions-business-email/mailbox_contract');
const {createRegistry}=require('../functions-business-email/providers');
const operation={provider:'microsoft',providerSubject:'subject',from:'office@example.test',to:'client@example.test',recipient:'client@example.test',
 messageId:'a'.repeat(64)+'@mail.scaledcircle.com',subject:'A reviewed question',body:'Hello from your Business.',requestedAt:1000};

test('disabled Microsoft provider does not require an unprovisioned deploy-time secret',()=>{
 const {execFileSync}=require('node:child_process');
 const cwd=require('node:path').resolve(__dirname,'../functions-business-email');
 for(const enabled of [false,true]){
  const raw=execFileSync(process.execPath,['-e',"require('./index');process.stdout.write(JSON.stringify(require('firebase-functions/params').declaredParams.map(p=>p.name)));"],
   {cwd,env:{...process.env,GCLOUD_PROJECT:'demo-business-email',BUSINESS_EMAIL_MICROSOFT_ENABLED:String(enabled)},encoding:'utf8'});
  const names=JSON.parse(raw);
  assert(names.includes('BUSINESS_EMAIL_GOOGLE_CLIENT_SECRET'));assert(names.includes('BUSINESS_EMAIL_ENCRYPTION_KEY'));
  assert.equal(names.includes('BUSINESS_EMAIL_MICROSOFT_CLIENT_SECRET'),enabled);
 }
});
test('provider selection is explicit; a custom domain never selects Google or Microsoft by inference',()=>{
 const registry=createRegistry({google:{},microsoft:{configured:true},other:{configured:true}});
 assert.equal(registry.list({})[0].label,'Google / Gmail / Workspace');
 assert.equal(registry.list({})[1].configured,false);assert.equal(registry.list({})[2].configured,false);
 assert.throws(()=>registry.get('microsoft',{}));assert.throws(()=>registry.get('other',{providers:{other:true}}));
 assert.equal(registry.get('microsoft',{providers:{microsoft:true}}).configured,true);
 assert.throws(()=>contract.providerId('https://attacker.test'));
});
test('Microsoft delegated auth requests independent Read and Send, PKCE, state, custom mailbox hint',()=>{
 const provider=createProvider({clientId:'id',clientSecret:'secret',redirectUri:'https://example.test/callback'});
 for(const [read,send] of [[true,false],[false,true],[true,true]]){
  const url=new URL(provider.authorize({state:'nonce',verifier:'verifier',read,send,expectedMailbox:'office@company.test'}));
  const scopes=url.searchParams.get('scope').split(' ');
  assert.equal(url.hostname,'login.microsoftonline.com');assert.equal(scopes.includes(SCOPES.read),read);assert.equal(scopes.includes(SCOPES.send),send);
  assert(!scopes.includes('Mail.ReadWrite'));assert.equal(url.searchParams.get('state'),'nonce');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('login_hint'),'office@company.test');
 }
});
test('Microsoft sender identity comes from delegated /me and granted scopes, not form email',async()=>{
 const calls=[];
 const p=createProvider({clientId:'id',clientSecret:'secret',redirectUri:'https://example.test/callback',fetchImpl:async(url,options)=>{
  calls.push([url,options]);return new Response(JSON.stringify(url.includes('/token')?{access_token:'access',refresh_token:'refresh',scope:'User.Read Mail.Read'}:
    {id:'stable-subject',mail:'office@company.test',userPrincipalName:'other@tenant.test'}),{status:200});}});
 const result=await p.exchange('code','verifier');assert.equal(result.email,'office@company.test');assert.deepEqual(result.permissions,{read:true,send:false});
 assert.equal(result.subject,'stable-subject');assert(calls[1][0].includes('/me?'));assert(calls.every(c=>c[1].redirect==='error'));
});
test('Microsoft 202 remains pending; rotated refresh credential persists before exactly one delegated send',async()=>{
 const calls=[],rotations=[];const p=createProvider({fetchImpl:async(url,options)=>{calls.push([url,options]);
  return url.includes('/token')?new Response(JSON.stringify({access_token:'access',refresh_token:'rotated'})):
    new Response(null,{status:202});}});
 const result=await p.send({...operation,credentials:{refreshToken:'old'},onRefresh:async value=>rotations.push(value)});
 assert.equal(result.pending,true);assert.equal(result.id,undefined);assert.deepEqual(rotations,[{refreshToken:'rotated'}]);
 const send=calls.filter(c=>c[0].endsWith('/me/sendMail'));assert.equal(send.length,1);
 const body=Buffer.from(send[0][1].body,'base64').toString();assert(body.includes('From: office@example.test'));assert(!body.includes('Cc:'));
});
test('provider errors and throttling never expose raw tokens or diagnostics; sends never retry',async()=>{
 let calls=0;const p=createProvider({fetchImpl:async()=>{calls++;return new Response('secret provider diagnostic 535',{status:429});}});
 await assert.rejects(p.send({...operation,credentials:{refreshToken:'private'}}),e=>e.code==='resource-exhausted'&&!e.message.includes('535')&&!e.message.includes('secret'));
 assert.equal(calls,1);
});
test('normalized replies require exact original, correct workspace provider identity and parent, without Gmail IDs',()=>{
 const op={...operation,providerMessageId:'graph-immutable-id'};
 const original={id:op.providerMessageId,from:op.from,to:[op.recipient],subject:op.subject,body:op.body,sent:true,messageId:'<provider-id@outlook.test>'};
 const reply={id:'different-native-id',from:op.recipient,to:[op.from],receivedAt:2000,references:[original.messageId],body:'Yes, received.'};
 assert.equal(contract.normalizeReplies([original,reply,reply],op).length,1);
 for(const change of [{from:'other@example.test'},{to:['other@example.test']},{receivedAt:0},{references:['<unrelated@test>']}])
  assert.equal(contract.normalizeReplies([original,{...reply,...change}],op).length,0);
 assert.throws(()=>contract.normalizeReplies([{...original,body:'different'},reply],op));
 assert.throws(()=>contract.requireOperationProvider({provider:'google',email:op.from,subject:'subject'},op));
 assert.throws(()=>contract.requireOperationProvider({provider:'microsoft',email:op.from,subject:'other'},op));
});
test('partial connection capabilities never infer send or read from a provider label',()=>{
 assert.deepEqual(contract.capabilities({provider:'microsoft',status:'connected',permissions:{read:true,send:false}}),
  {canRead:true,canSend:false,canReconcileReplies:true,connectionHealth:'read_only'});
 assert.equal(contract.capabilities({status:'connected',permissions:{send:true},senderVerified:false}).canSend,false);
 assert.equal(contract.capabilities({status:'not_connected',permissions:{read:true,send:true}}).canRead,false);
});
test('Other mailbox endpoints reject local, metadata, rebinding, unreviewed and insecure destinations',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','172.16.0.1','192.168.1.2','100.64.0.1','::1','0.0.0.0','255.255.255.255'])assert.equal(other.publicAddress(ip),false);
 assert.equal(other.publicAddress('8.8.8.8'),true);
 await assert.rejects(other.endpoint('wrong.example.test','mail.example.test'));
 await assert.rejects(other.endpoint('mail.example.test','mail.example.test',async()=>[{address:'8.8.8.8'},{address:'127.0.0.1'}]));
 const e=await other.endpoint('mail.example.test','mail.example.test',async()=>[{address:'8.8.8.8'}]);assert.equal(e.host,'8.8.8.8');assert.equal(e.servername,'mail.example.test');
});
test('Other setup independently verifies requested transports, TLS, no logs, and never sends a probe message',async()=>{
 const imaps=[],smtps=[];let probes=0;
 const policy={email:'office@example.test',username:'office@example.test',imapHost:'imap.example.test',smtpHost:'smtp.example.test',smtpPort:587,senderVerified:false};
 const input={...policy,imapPort:993,password:'test-only-value',read:true,send:true};
 const p=other.createProvider({lookup:async()=>[{address:'8.8.8.8'}],imapFactory:options=>{imaps.push(options);return {connect:async()=>{},getMailboxLock:async()=>({release(){}}),close(){}};},
 transportFactory:options=>{smtps.push(options);return {verify:async()=>true,sendMail:async()=>{probes++;},close(){}};}});
 const result=await p.verify(input,policy);assert.deepEqual(result.permissions,{read:true,send:false});assert.equal(probes,0);
 assert.equal(imaps[0].logger,false);assert.equal(imaps[0].tls.rejectUnauthorized,true);assert.equal(smtps[0].requireTLS,true);assert.equal(smtps[0].debug,false);
 assert.equal(smtps[0].host,'8.8.8.8');assert.equal(smtps[0].tls.servername,'smtp.example.test');
 await assert.rejects(p.send({...operation,credentials:result.credentials,policy}),/verification/);assert.equal(probes,0);
 await assert.rejects(p.verify({...input,imapPort:143},policy));await assert.rejects(p.verify({...input,username:'spoof@example.test'},policy));
});
test('Other setup failure surfaces safe login copy and preserves no plaintext log',async()=>{
 const p=other.createProvider({lookup:async()=>[{address:'8.8.8.8'}],imapFactory:()=>({connect:async()=>{throw Error('AUTHENTICATIONFAILED password=private');},close(){}})});
 await assert.rejects(p.verify({email:'owner@example.test',username:'owner@example.test',password:'private',read:true,send:false,imapHost:'imap.example.test',imapPort:993},
 {email:'owner@example.test',username:'owner@example.test',imapHost:'imap.example.test'}),e=>e.code==='permission-denied'&&!e.message.includes('AUTHENTICATIONFAILED')&&!e.message.includes('private'));
});

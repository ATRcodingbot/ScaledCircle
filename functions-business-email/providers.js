'use strict';
const gmail=require('./gmail'),contract=require('./mailbox_contract');
function createRegistry({google,microsoft,other}) {
 const adapters={google:{...google,id:'google',configured:google.configured!==false,
   authorize:input=>google.authorize(input),exchange:(...args)=>google.exchange(...args),
   send:op=>google.send({...op,refreshToken:op.credentials.refreshToken}),
   reconcileSent:(credentials,op)=>google.reconcileSent(credentials.refreshToken,op),
   history:(credentials,input)=>google.history(credentials.refreshToken,input),
   thread:(credentials,threadId)=>google.thread(credentials.refreshToken,threadId),
   replies:async(credentials,op)=>{const thread=await google.thread(credentials.refreshToken,op.providerThreadId);
    if(op.state==='received'){if(thread.id!==op.providerThreadId)throw Error('inquiry_thread_mismatch');return require('./inquiries').messages(thread,op.from,op.requestedAt).filter(m=>m.from===op.recipient);}
    return gmail.replyMessages(thread,op);}},microsoft,other};
 return {
  get(name='google',beta={}) {
   name=contract.providerId(name);const p=adapters[name];
   if(beta.onboardingInvitation&&name!==beta.onboardingInvitation.provider||!p||p.configured===false||name!=='google'&&beta.providers?.[name]!==true||name==='other'&&!beta.otherMailbox)
     contract.fail('failed-precondition','This provider is in setup testing. A reviewed private test connection is required.');
   return p;
  },
  list(beta={},evidence={}) {return Object.entries(contract.LABELS).map(([id,label])=>({id,label,
   status:id==='google'?(beta.connectionAllowed===false?'connection_limited':evidence.googleRoundTripVerified===true?'available':'private_beta'):'setup_testing',
   configured:beta.connectionAllowed!==false&&!!adapters[id]&&adapters[id].configured!==false&&(id==='google'||beta.providers?.[id]===true)&&(id!=='other'||!!beta.otherMailbox),
   // Never return credentials or caller-controlled server destinations.
   ...(id==='other'&&beta.otherMailbox?{settings:{email:beta.mailbox,username:beta.otherMailbox.username,imapHost:beta.otherMailbox.imapHost||'',imapPort:993,
     smtpHost:beta.otherMailbox.smtpHost||'',smtpPort:beta.otherMailbox.smtpPort||465}}:{})}));}
 };
}
module.exports={createRegistry};

'use strict';
const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function productionPermit(config,now=Date.now()) {
 const p=config.productionCertification;
 return config.kind==='customer'&&config.certificationOnly===true&&config.sendEnabled===false&&
   config.certificationSendEnabled===true&&p?.enabled===true&&p.maxSends===1&&
   p.from===config.mailbox&&p.to===config.certificationRecipient&&
   Number.isSafeInteger(p.expiresAt)&&p.expiresAt>now&&
   /^[a-f0-9]{64}$/.test(p.subjectSha256||'')&&/^[a-f0-9]{64}$/.test(p.bodySha256||'');
}
function exactProductionMessage(config,draft,now=Date.now()) {
 const p=config.productionCertification;
 return productionPermit(config,now)&&draft?.certification===true&&draft.prospectId==='founder_certification'&&
   draft.provider==='google'&&draft.from===p.from&&draft.recipient===p.to&&
   digest(draft.subject)===p.subjectSha256&&digest(draft.body)===p.bodySha256;
}
module.exports={productionPermit,exactProductionMessage,digest};

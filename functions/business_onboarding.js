'use strict';
// Owner-only profile preparation. This service grants no workspace, plan or
// marketplace authority and never writes consent or financial records.
const {isProfileReady, PROFILE_SCHEMA_VERSION} = require('./managed_growth_profile');
const {createLegalConsentService} = require('./legal_consent');
const fields = Object.freeze({businessName:160, businessDescription:2000, website:500,
  primaryPhone:80, contactName:120, businessAddress:500, brandVoice:500});
const lists = ['servicesOffered', 'serviceAreas'];
function fail(code, message) {const e=new Error(message);e.code=code;throw e;}
function sanitize(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) ||
    Object.keys(input).some(k=>!Object.hasOwn(fields,k)&&!lists.includes(k)))
    fail('invalid-argument','Choose supported Business profile fields.');
  const p={};
  for(const [k,max] of Object.entries(fields)) {
    const v=input[k]??'';
    if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))
      fail('invalid-argument','Check the Business profile text.');
    p[k]=v.trim();
  }
  for(const k of lists) {
    const v=input[k]??[];
    if(!Array.isArray(v)||v.length>40||v.some(s=>typeof s!=='string'||s.length>240||/[\u0000-\u001f]/.test(s)))
      fail('invalid-argument','Check the services and service areas.');
    p[k]=[...new Set(v.map(s=>s.trim()).filter(Boolean))];
  }
  if(!isProfileReady(p)||!p.contactName)fail('invalid-argument','Add your Business name, contact name, description, services and service area.');
  if(p.website){let u;try{u=new URL(p.website);}catch(_){fail('invalid-argument','Use a complete website address, such as https://example.com.');}
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail('invalid-argument','Use a public website address without credentials.');}
  return p;
}
function createService({db,auth,FieldValue}) {
  const legal=createLegalConsentService({db,FieldValue});
  async function actor(uid) {
    if(typeof uid!=='string'||!uid||uid.includes('/'))fail('unauthenticated','Sign in to complete your Business profile.');
    const u=await auth.getUser(uid);
    if(u.disabled)fail('permission-denied','This account is unavailable.');
    if(!u.emailVerified)fail('failed-precondition','Verify your email to continue.');
    return u;
  }
  function requireOwner(p,w,uid) {
    if(p?.role!=='business'||p.disabled===true||['rejected','revoked','disabled'].includes(p.betaAccess)||
      (p.active!==true&&p.betaAccess!=='approved'&&p.betaAccess!=='pending')||
      (w?.ownerId&&w.ownerId!==uid)||p.signupPurpose==='team_invitation')
      fail('permission-denied','Business owner profile setup is unavailable for this account.');
  }
  return {
    async load({uid}) {
      const u=await actor(uid);
      const [user,workspace,profile,setup]=await Promise.all(['users/','businessWorkspaces/','businessGrowthProfiles/','businessOnboarding/'].map(p=>db.doc(p+uid).get()));
      const p=user.data();requireOwner(p,workspace.data(),uid);
      const stored=profile.data()||{}, view={};
      for(const k of [...Object.keys(fields),...lists])if(stored[k]!==undefined)view[k]=stored[k];
      for(const k of ['contactName','businessAddress'])if(setup.data()?.[k]!==undefined)view[k]=setup.data()[k];
      view.businessName??=p.companyName||p.businessName||'';
      view.contactName??=p.displayName||p.name||u.displayName||'';
      view.primaryPhone??=p.contactNumber||'';
      const consent=await legal.status({uid,agreementTypes:['terms','privacy']});
      return {businessId:uid,email:u.email,emailVerified:true,role:'business',profile:view,
        profileComplete:!!setup.data()?.completedAt||isProfileReady(stored),
        approved:p.active===true||p.betaAccess==='approved',missingAgreements:consent.missing};
    },
    async save({uid,input}) {
      await actor(uid);const p=sanitize(input);
      await db.runTransaction(async tx=>{
        const refs=['users/','businessWorkspaces/','businessGrowthProfiles/','businessOnboarding/'].map(s=>db.doc(s+uid));
        const [user,w,old,setup]=await Promise.all(refs.map(r=>tx.get(r)));
        requireOwner(user.data(),w.data(),uid);
        // Merge only the allowed profile fields; preserve grounding details and
        // all ownership/access/economic fields, including historical grants.
        const {contactName,businessAddress,...growth}=p;
        tx.set(refs[2],{...growth,businessUid:uid,schemaVersion:PROFILE_SCHEMA_VERSION,
          profileVersion:Number(old.data()?.profileVersion||0)+1,updatedBy:uid,
          updatedAt:FieldValue.serverTimestamp(),createdAt:old.data()?.createdAt||FieldValue.serverTimestamp()},{merge:true});
        tx.set(refs[3],{businessId:uid,ownerUid:uid,contactName,businessAddress,version:'BusinessOnboardingV1',
          completedAt:setup.data()?.completedAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
      return this.load({uid});
    },
  };
}
module.exports={createService,sanitize};

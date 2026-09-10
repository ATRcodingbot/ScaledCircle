'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc}=require('firebase/firestore');
const onboarding=require('./business_onboarding'),geography=require('./business_geography');
const {createWorkspaceService}=require('./business_workspace');
let app,db,auth,rules,service,geo,seq=0;
const input={businessName:'Existing Business',contactName:'Owner',businessDescription:'Repairs',servicesOffered:['Repair'],serviceAreas:['Original county text'],businessAddress:'Existing private address'};
const ring=[{latitude:39,longitude:-77},{latitude:39.1,longitude:-77},{latitude:39.1,longitude:-76.9},{latitude:39,longitude:-77}];
const places={base:{id:'node-1',fullAddress:'Private test address, Maryland',latitude:39,longitude:-77,geographyType:'address',geometry:[],resolutionSource:'openstreetmap_nominatim'},
  county:{id:'relation-2',fullAddress:'Test County, Maryland, United States',latitude:39,longitude:-77,geographyType:'county',geographicId:'24003',geometry:ring,geometryParts:[ring,ring],state:'Maryland',country:'United States',resolutionSource:'us_census_tigerweb'},
  city:{id:'relation-3',fullAddress:'Test City, Maryland, United States',latitude:39,longitude:-77,geographyType:'city',geometry:ring,resolutionSource:'openstreetmap_nominatim'},
  zip:{id:'relation-4',fullAddress:'21061, Maryland, United States',latitude:39,longitude:-77,geographyType:'zcta',postalCode:'21061',geometry:ring,resolutionSource:'us_census_tigerweb'}};
before(async()=>{
  for(const k of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[k]||'',/^(127\.0\.0\.1|localhost):\d+$/);
  app=admin.initializeApp({projectId:'demo-business-geography'},'geography');db=app.firestore();auth=app.auth();
  const resolvePlace=async({query})=>{if(query==='failure')throw Error('provider secret must not escape');return {results:places[query]?[places[query]]:[]};};
  service=onboarding.createService({db,auth,FieldValue:admin.firestore.FieldValue,resolvePlace});
  geo=geography.createService({db,FieldValue:admin.firestore.FieldValue,resolvePlace});
  rules=await initializeTestEnvironment({projectId:'demo-business-geography',firestore:{rules:fs.readFileSync('../firestore.production.rules','utf8')}});
});
after(async()=>{await rules?.cleanup();await db?.terminate();await app?.delete();});
async function owner(overrides={},opts={}){const uid='geo_'+(++seq);await auth.createUser({uid,email:uid+'@example.test',emailVerified:true,...opts});await db.doc('users/'+uid).set({role:'business',active:false,betaAccess:'pending',...overrides});return uid;}
async function selected(uid,types=['county','city','zip']){
  const base=(await service.search({uid,query:'base',kind:'base'})).results[0];
  const areas=[];for(const query of types)areas.push((await service.search({uid,query,kind:'service_area'})).results[0]);
  return {baseSelectionId:base.selectionId,serviceAreaSelectionIds:areas.map(p=>p.selectionId)};
}
test('explicit canonical base + multiple areas persist, decode, edit/remove and preserve legacy/profile authority',async()=>{
  const uid=await owner();await service.save({uid,input});
  const originalUser=(await db.doc('users/'+uid).get()).data(),before=(await db.doc('businessOnboarding/'+uid).get()).data();
  assert.equal((await service.load({uid})).geography,null);
  const chosen=await selected(uid);assert.equal((await service.load({uid})).geography,null,'search is not profile confirmation');
  assert.deepEqual((await service.load({uid})).legacyServiceAreas,input.serviceAreas);
  const result=await service.save({uid,input,geography:chosen});
  assert.equal(result.profileComplete,true);assert.equal(result.approved,false);
  assert.equal(result.geography.base.fullAddress,places.base.fullAddress);
  assert.equal(result.geography.serviceAreas.length,3);assert.equal(result.geography.serviceAreas[0].geometryParts.length,2);
  assert.equal(result.geography.serviceAreas[0].countryCode,'US');assert.ok(result.geography.serviceAreas[0].resolutionVersion);
  let persisted=(await db.doc('businessOnboarding/'+uid).get()).data();
  assert.deepEqual(persisted.legacyServiceAreas,input.serviceAreas);assert.deepEqual(persisted.completedAt,before.completedAt);
  assert.equal(persisted.businessAddress,input.businessAddress);
  await service.save({uid,input,geography:{...chosen,serviceAreaSelectionIds:chosen.serviceAreaSelectionIds.slice(1)}});
  assert.equal((await service.load({uid})).geography.serviceAreas.length,2);
  assert.deepEqual((await db.doc('users/'+uid).get()).data(),originalUser);
  for(const col of ['campaigns','campaignZones','businessSubscriptions','wallets','legalConsents'])assert.equal((await db.collection(col).get()).size,0);
});
test('private server selection receipts cannot be forged, cross-owned, duplicated or replaced by free text',async()=>{
  const uid=await owner(),other=await owner(),chosen=await selected(uid);
  const bad=[{...chosen,latitude:39},{...chosen,baseSelectionId:'f'.repeat(64)},
    {...chosen,serviceAreaSelectionIds:[chosen.serviceAreaSelectionIds[0],chosen.serviceAreaSelectionIds[0]]},
    {...chosen,serviceAreaSelectionIds:[]},{...chosen,serviceAreaSelectionIds:Array(9).fill(chosen.serviceAreaSelectionIds[0])},
    {...chosen,serviceAreaSelectionIds:[chosen.baseSelectionId]}];
  for(const g of bad)await assert.rejects(service.save({uid,input,geography:g}));
  await assert.rejects(service.save({uid:other,input,geography:chosen}));
  await service.save({uid,input,geography:chosen});
  await assert.rejects(service.save({uid,input}),{code:'failed-precondition'});
  assert.equal((await service.search({uid,query:'base',kind:'service_area'})).results.length,0);
});
test('search is idempotent and safe failure is recoverable; malformed provider result rejected',async()=>{
  const uid=await owner();const a=await selected(uid),b=await selected(uid);assert.deepEqual(a,b);
  assert.equal((await db.collection(`businessOnboarding/${uid}/placeSelections`).get()).size,4);
  await assert.rejects(service.search({uid,query:'failure',kind:'base'}),{code:'unavailable',message:'Location search is unavailable. Please retry.'});
  for(const p of [{...places.base,id:''},{...places.base,latitude:100},{...places.base,resolutionSource:'browser'}])assert.equal(geography.canonicalPlace(p),null);
});
for(const [label,profile,opts] of [['wrong role',{role:'scaler'},{}],['disabled',{}, {disabled:true}],['unverified',{}, {emailVerified:false}],['removed',{betaAccess:'revoked'},{}],['invited member',{signupPurpose:'team_invitation'},{}]])
  test(label+' cannot resolve or mutate owner geography',async()=>{const uid=await owner(profile,opts);await assert.rejects(service.search({uid,query:'city',kind:'base'}));});
test('Rules deny exact location and canonical selection reads/writes even for approved unrelated users',async()=>{
  const uid=await owner({active:true,betaAccess:'approved'}),other=await owner({active:true,betaAccess:'approved'}),chosen=await selected(uid);
  await service.save({uid,input,geography:chosen});
  for(const actor of [uid,other,null]){
    const client=actor?rules.authenticatedContext(actor,{email_verified:true}).firestore():rules.unauthenticatedContext().firestore();
    for(const path of [`businessOnboarding/${uid}`,`businessOnboarding/${uid}/placeSelections/${chosen.baseSelectionId}`]){
      await assertFails(getDoc(doc(client,path)));await assertFails(setDoc(doc(client,path),{forged:true}));
    }
  }
});
test('campaign suggestions require maintained workspace permission and exclude private base/legacy/selection IDs',async()=>{
  const uid=await owner({active:true,betaAccess:'approved'}),member=await owner({active:true,betaAccess:'approved'}),other=await owner({active:true,betaAccess:'approved'});
  await service.save({uid,input,geography:await selected(uid)});
  const workspace=createWorkspaceService({db,auth,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp});
  await db.doc('businessSubscriptions/'+uid).set({plan:'growth',status:'active',expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+86400000)});
  await db.doc(`businessWorkspaces/${uid}`).set({ownerId:uid});
  await db.doc(`businessWorkspaces/${uid}/members/${member}`).set({uid:member,businessId:uid,status:'active',permissions:['campaigns'],seatIndex:1});
  const suggest=async actor=>{await workspace.actor(actor);const a=await workspace.authority({uid:actor,businessId:uid,permission:'campaigns',allowExpired:true});return geo.suggestions(a.businessId);};
  const result=await suggest(uid);assert.equal(result.areas.length,3);assert.deepEqual(await suggest(member),result);
  const serialized=JSON.stringify(result);for(const privateValue of [places.base.fullAddress,'selectionId',input.businessAddress,input.serviceAreas[0]])assert.equal(serialized.includes(privateValue),false);
  await assert.rejects(suggest(other));
  await db.doc(`businessWorkspaces/${uid}/members/${member}`).update({permissions:['analytics']});await assert.rejects(suggest(member));
  await db.doc(`businessWorkspaces/${uid}/members/${member}`).update({permissions:['campaigns'],status:'removed'});await assert.rejects(suggest(member));
});

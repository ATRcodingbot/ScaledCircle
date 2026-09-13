"use strict";

const {states, stateById} = require("./market_states");
const VERSION = "StateMarketRolloutV1";
const CONFIG = "marketRollout/config";
const PROFILES = "marketProfiles";
const STATUSES = new Set(["ACTIVE", "PRELAUNCH", "PAUSED"]);
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
function statusFor(config, stateId) {
  if (!stateById(stateId)) return "UNKNOWN";
  const status = config?.states?.[stateId];
  return config?.schemaVersion === VERSION && STATUSES.has(status) ? status : "PRELAUNCH";
}
function initialConfig() {
  // The launch decision lives here once, then in the Admin-managed configuration.
  // This is never consulted as an implicit ACTIVE fallback when a read fails.
  return {schemaVersion: VERSION, revision: 1,
    states: Object.fromEntries(states.map(state=>[state.id, state.code === "MD" ? "ACTIVE" : "PRELAUNCH"]))};
}
function profileProjection(profile, config) {
  const state = stateById(profile?.stateId);
  return {state, status: statusFor(config, state?.id),
    launchNotifications: profile?.launchNotifications === true,
    stateConfirmed: !!state && profile?.selectionSource === "explicit_user_selection"};
}
async function requireActiveBusiness(db, businessId, reader = {get:ref=>ref.get()}) {
  const [profile, config] = await Promise.all([
    reader.get(db.doc(`${PROFILES}/${businessId}`)), reader.get(db.doc(CONFIG))]);
  const view = profileProjection(profile.data(), config.data());
  if (!view.stateConfirmed) fail("failed-precondition", "Choose your Business state in Account before creating marketplace work.");
  if (view.status !== "ACTIVE") fail("failed-precondition", "ScaledCircle marketplace campaigns are not active in this state yet.");
  return view;
}
async function requireActiveScaler(db, uid, reader = {get:ref=>ref.get()}) {
  const [profile, config, user] = await Promise.all([
    reader.get(db.doc(`${PROFILES}/${uid}`)), reader.get(db.doc(CONFIG)), reader.get(db.doc(`users/${uid}`))]);
  if(user.data()?.role !== 'scaler' || (user.data()?.active !== true && user.data()?.betaAccess !== 'approved'))
    fail('permission-denied','An approved Scaler account is required for new work.');
  const view = profileProjection(profile.data(), config.data());
  if (!view.stateConfirmed) fail("failed-precondition", "Choose your state in Account before applying for work.");
  if (view.status !== "ACTIVE") fail("failed-precondition", "ScaledCircle isn't active in your state yet.");
  return view;
}
function demand({users, profiles, config}) {
  const rows = states.map(state=>({...state,status:statusFor(config,state.id),businesses:0,scalers:0}));
  const unknown = {name:"Unknown — state not confirmed",businesses:0,scalers:0};
  const byState = new Map(rows.map(row=>[row.id,row]));
  const byUser = new Map(profiles.map(profile=>[profile.id,profile]));
  for (const user of users) {
    if (!["business","scaler"].includes(user.role)) continue;
    // A workspace member is not another Business. The workspace owner is the unit.
    if (user.role === "business" && user.signupPurpose === "team_invitation") continue;
    const profile = byUser.get(user.id);
    const row = profile?.selectionSource === "explicit_user_selection" ? byState.get(profile.stateId) || unknown : unknown;
    row[user.role === "business" ? "businesses" : "scalers"]++;
  }
  return {rows, unknown, countingUnit:"Business owners and Scaler accounts; explicit current state only",
    optionalFunnelMetrics: null, optionalFunnelExplanation:"Not measured here. Historical funnel events have not been inferred."};
}
function createService({db, FieldValue, getUser, requireAdmin}) {
  const stamp = () => FieldValue.serverTimestamp();
  async function actor(uid) {
    if (!uid) fail("unauthenticated", "Sign in to continue.");
    const [auth, profile] = await Promise.all([getUser(uid), db.doc(`users/${uid}`).get()]);
    if (auth.disabled || !["business","scaler"].includes(profile.data()?.role))
      fail("permission-denied", "A Business or Scaler account is required.");
    return profile.data();
  }
  async function catalog() {
    const config = (await db.doc(CONFIG).get()).data();
    return {states:states.map(state=>({...state,status:statusFor(config,state.id)})),
      initialized: config?.schemaVersion === VERSION, revision:config?.revision || 0};
  }
  async function load(uid) {
    await actor(uid);
    const [profile, config] = await Promise.all([db.doc(`${PROFILES}/${uid}`).get(), db.doc(CONFIG).get()]);
    return {...profileProjection(profile.data(),config.data()), ...await catalog()};
  }
  async function save(uid,input) {
    const user = await actor(uid);
    if (!input || Object.keys(input).some(key=>!["stateId","launchNotifications"].includes(key)) ||
      !stateById(input.stateId) || typeof input.launchNotifications !== "boolean")
      fail("invalid-argument", "Choose a listed state and notification preference.");
    const state = stateById(input.stateId), ref=db.doc(`${PROFILES}/${uid}`);
    await db.runTransaction(async tx=>{
      const previous=await tx.get(ref);
      tx.set(ref,{schemaVersion:VERSION,uid,role:user.role,stateId:state.id,
        stateName:state.name,geographicId:state.geographicId,selectionSource:"explicit_user_selection",
        launchNotifications:input.launchNotifications,updatedAt:stamp(),
        createdAt:previous.data()?.createdAt || stamp()});
    });
    return load(uid);
  }
  async function administer(request) {
    await requireAdmin(request);
    const input=request.data || {}, uid=request.auth.uid;
    if(input.action === "initialize") {
      await db.runTransaction(async tx=>{
        const ref=db.doc(CONFIG), existing=await tx.get(ref);
        if(existing.exists) return;
        tx.create(ref,{...initialConfig(),updatedBy:uid,updatedAt:stamp()});
        tx.create(db.doc("marketRolloutAudit/initial"),{action:"initialize",actorUid:uid,revision:1,createdAt:stamp()});
      });
      return catalog();
    }
    if(input.action === "setStatus") {
      if(!stateById(input.stateId) || !STATUSES.has(input.status) || !Number.isInteger(input.expectedRevision))
        fail("invalid-argument","Choose a state and rollout status.");
      await db.runTransaction(async tx=>{
        const ref=db.doc(CONFIG), existing=(await tx.get(ref)).data();
        if(existing?.schemaVersion !== VERSION || existing.revision !== input.expectedRevision)
          fail("failed-precondition","Rollout status changed. Refresh and try again.");
        const previous=statusFor(existing,input.stateId);
        if(previous===input.status) return;
        const revision=existing.revision+1;
        tx.update(ref,{states:{...existing.states,[input.stateId]:input.status},revision,updatedBy:uid,updatedAt:stamp()});
        tx.create(db.doc(`marketRolloutAudit/revision_${revision}`),{action:"setStatus",actorUid:uid,
          stateId:input.stateId,previous,status:input.status,revision,createdAt:stamp(),notificationsSent:0});
      });
      return catalog();
    }
    if(input.action !== "demand") fail("invalid-argument","Choose a supported market action.");
    // Explicit cap: never silently return a partial total as the whole population.
    const [users,profiles,config]=await Promise.all([db.collection("users").select('role','signupPurpose').limit(10001).get(),
      db.collection(PROFILES).select('stateId','selectionSource').limit(10001).get(),db.doc(CONFIG).get()]);
    if(users.size>10000 || profiles.size>10000) fail("resource-exhausted","State reporting needs a larger reporting window. No partial totals are displayed.");
    return {...demand({users:users.docs.map(d=>({...d.data(),id:d.id})),
      profiles:profiles.docs.map(d=>({...d.data(),id:d.id})),config:config.data()}),...await catalog()};
  }
  return {catalog,load,save,administer};
}
module.exports={VERSION,CONFIG,PROFILES,statusFor,initialConfig,profileProjection,demand,
  createService,requireActiveBusiness,requireActiveScaler};

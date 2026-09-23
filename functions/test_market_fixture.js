'use strict';
// Explicit account selections for local authority fixtures, never a runtime fallback.
exports.seed = async function seed(db, users, stateCode = 'MD') {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    throw Error('Market fixtures require a loopback emulator');
  }
  const market = require('./market_rollout');
  const state = require('./market_states').states.find(s => s.code === stateCode);
  const config = market.initialConfig();
  config.states[state.id] = 'ACTIVE';
  await db.doc(market.CONFIG).set(config);
  for (const [uid, role] of users) await db.doc(`${market.PROFILES}/${uid}`).set({
    uid, role, schemaVersion: market.VERSION, stateId: state.id,
    stateName: state.name, selectionSource: 'explicit_user_selection',
  });
};
exports.mockGeography = function mockGeography(stateFips) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local emulator required');
  const previous = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query')) {
      return {ok:true,json:async()=>({features:[{attributes:{STATE:stateFips}}]})};
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(String(url))) return previous(url, options);
    throw Error('External requests denied in market fixture');
  };
  return () => {global.fetch = previous;};
};

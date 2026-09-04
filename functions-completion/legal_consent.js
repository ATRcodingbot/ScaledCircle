"use strict";

const AGREEMENTS = Object.freeze({
  terms: "terms-2026-08-v1",
  privacy: "privacy-2026-08-v1",
  scaler_work: "scaler-work-2026-08-v1",
  location_notice: "location-notice-2026-08-v1",
});

const SOURCES = new Set(["account_creation", "scaler_tracking", "authenticated_legal"]);

const ROLE_REQUIREMENTS = Object.freeze({
  business_funding: Object.freeze(["terms", "privacy"]),
  scaler_work: Object.freeze(["terms", "scaler_work"]),
  scaler_tracking: Object.freeze(["location_notice"]),
});

function clean(value, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateRequest(data, role) {
  const types = Array.isArray(data?.agreementTypes) ? [...new Set(data.agreementTypes.map((v) => clean(v, 40)))] : [];
  const source = clean(data?.source, 40);
  if (!types.length || types.length > 4 || !SOURCES.has(source)) throw new Error("invalid_consent_request");
  for (const type of types) {
    if (!AGREEMENTS[type]) throw new Error("unknown_agreement");
    if (["scaler_work", "location_notice"].includes(type) && role !== "scaler") {
      throw new Error("scaler_agreement_requires_scaler");
    }
  }
  return {types, source};
}

function createLegalConsentService({db, FieldValue}) {
  function references(uid, agreementTypes) {
    return agreementTypes.map((type) => {
      if (!AGREEMENTS[type]) throw new Error("unknown_agreement");
      const version = AGREEMENTS[type];
      return {type, version, ref: db.collection("legalConsents").doc(`${uid}_${type}_${version}`)};
    });
  }

  async function status({uid, agreementTypes, transaction = null}) {
    if (!uid) throw new Error("consent_actor_invalid");
    const required = references(uid, agreementTypes);
    const snapshots = await Promise.all(required.map(({ref}) =>
      transaction ? transaction.get(ref) : ref.get()));
    const accepted = [];
    const missing = [];
    for (let index = 0; index < required.length; index += 1) {
      const item = required[index];
      const value = snapshots[index].data() || {};
      const valid = snapshots[index].exists && value.uid === uid &&
        value.agreementType === item.type && value.agreementVersion === item.version;
      (valid ? accepted : missing).push({type: item.type, version: item.version});
    }
    return {accepted, missing};
  }

  return {
    async accept({uid, role, data}) {
      if (!uid || !["business", "scaler", "admin"].includes(role)) throw new Error("consent_actor_invalid");
      const input = validateRequest(data, role);
      const consentReferences = references(uid, input.types);
      await db.runTransaction(async (transaction) => {
        const snapshots = await Promise.all(consentReferences.map(({ref}) => transaction.get(ref)));
        for (let index = 0; index < consentReferences.length; index += 1) {
          const item = consentReferences[index];
          const existing = snapshots[index];
          if (existing.exists) {
            const value = existing.data() || {};
            if (value.uid !== uid || value.agreementType !== item.type || value.agreementVersion !== item.version) {
              throw new Error("consent_record_conflict");
            }
            continue;
          }
          transaction.create(item.ref, {
            uid,
            userRole: role,
            agreementType: item.type,
            agreementVersion: item.version,
            source: input.source,
            acceptedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      return {accepted: consentReferences.map(({type, version}) => ({type, version}))};
    },
    status,
    async requireCurrent({uid, agreementTypes, transaction = null}) {
      const result = await status({uid, agreementTypes, transaction});
      if (result.missing.length) {
        const error = new Error("legal_consent_required");
        error.missing = result.missing;
        throw error;
      }
      return result;
    },
  };
}

module.exports = {
  AGREEMENTS,
  ROLE_REQUIREMENTS,
  SOURCES,
  validateRequest,
  createLegalConsentService,
};

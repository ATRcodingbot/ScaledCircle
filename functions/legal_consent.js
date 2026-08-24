"use strict";

const AGREEMENTS = Object.freeze({
  terms: "terms-2026-08-v1",
  privacy: "privacy-2026-08-v1",
  scaler_work: "scaler-work-2026-08-v1",
  location_notice: "location-notice-2026-08-v1",
});

const SOURCES = new Set(["account_creation", "scaler_tracking", "authenticated_legal"]);

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
  return {
    async accept({uid, role, data}) {
      if (!uid || !["business", "scaler", "admin"].includes(role)) throw new Error("consent_actor_invalid");
      const input = validateRequest(data, role);
      const references = input.types.map((type) => ({
        type,
        version: AGREEMENTS[type],
        ref: db.collection("legalConsents").doc(`${uid}_${type}_${AGREEMENTS[type]}`),
      }));
      await db.runTransaction(async (transaction) => {
        const snapshots = await Promise.all(references.map(({ref}) => transaction.get(ref)));
        for (let index = 0; index < references.length; index += 1) {
          const item = references[index];
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
      return {accepted: references.map(({type, version}) => ({type, version}))};
    },
  };
}

module.exports = {AGREEMENTS, SOURCES, validateRequest, createLegalConsentService};

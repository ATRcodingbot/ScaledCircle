"use strict";

const MAX_DISPLAY_NAME = 80;
const MAX_BIO = 500;

function plainText(value, maximum, {required = false, multiline = false} = {}) {
  if (typeof value !== "string") throw new Error("profile_text_invalid");
  const withoutControls = value.replace(
    multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g,
    "",
  );
  const normalized = (multiline ? withoutControls : withoutControls.replace(/\s+/g, " ")).trim();
  if (required && !normalized) throw new Error("display_name_required");
  if (normalized.length > maximum) throw new Error("profile_text_too_long");
  return normalized;
}

function sanitizeScalerProfileInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("profile_payload_invalid");
  }
  const allowed = new Set(["displayName", "bio"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("profile_field_not_allowed");
  }
  return {
    displayName: plainText(value.displayName, MAX_DISPLAY_NAME, {required: true}),
    bio: plainText(value.bio ?? "", MAX_BIO, {multiline: true}),
  };
}

function createScalerProfileService({db, FieldValue}) {
  return {
    async update({uid, input}) {
      const sanitized = sanitizeScalerProfileInput(input);
      const profileRef = db.collection("users").doc(uid);
      const snapshot = await profileRef.get();
      const profile = snapshot.data() || {};
      if (String(profile.role || "").toLowerCase() !== "scaler") {
        throw new Error("scaler_role_required");
      }

      await profileRef.set({
        displayName: sanitized.displayName,
        bio: sanitized.bio,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      return {
        displayName: sanitized.displayName,
        bio: sanitized.bio,
        role: "scaler",
        active: profile.active === true,
        betaAccess: String(profile.betaAccess || ""),
      };
    },
  };
}

module.exports = {
  MAX_DISPLAY_NAME,
  MAX_BIO,
  plainText,
  sanitizeScalerProfileInput,
  createScalerProfileService,
};

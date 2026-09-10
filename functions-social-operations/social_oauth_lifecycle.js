"use strict";

const ACTIVE = new Set(["authorizing", "exchanging", "identity_pending"]);
function terminalReason(attempt, now, requested = null) {
  if (!attempt) return "attempt_unavailable";
  if (["connected_read_only", "connected_write"].includes(attempt.status)) return null;
  if (requested) return requested;
  if (attempt.expiresAtMillis <= now) return "attempt_expired";
  return ACTIVE.has(attempt.status) ? null : "connection_failed";
}

// Only the exact pending Meta attempt may clear its own pointer. A late
// callback must not disconnect a completed connection or a newer attempt.
async function recoverMetaPending(db, uid, FieldValue, {now = Date.now(), attemptId = null,
  reason = null} = {}) {
  const connectionRef = db.collection("socialConnections").doc(uid).collection("providers").doc("facebook");
  return db.runTransaction(async tx => {
    const connection = (await tx.get(connectionRef)).data() || {};
    const pending = connection.pendingAttemptId;
    if (!pending || (attemptId && pending !== attemptId)) return false;
    const ref = db.collection("socialOAuthAttempts").doc(pending);
    const attempt = (await tx.get(ref)).data();
    if (attempt && (attempt.businessUid !== uid || attempt.provider !== "meta")) return false;
    const failure = terminalReason(attempt, now, reason);
    if (!failure) return false;
    if (attempt && !["connected_read_only", "connected_write"].includes(attempt.status)) {
      tx.update(ref, {status: failure === "attempt_expired" ? "expired" :
        failure === "canceled" ? "canceled" : "error", safeFailure: failure,
      candidateEnvelope: FieldValue.delete(), verifierEnvelope: FieldValue.delete(),
      authorizationEnvelope: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp()});
    }
    const previousVerified = Boolean(connection.credentialId && connection.providerAccountId);
    tx.set(connectionRef, {status: previousVerified ?
      (connection.writeScopesGranted === true ? "connected_write" : "connected_read_only") : "not_connected",
    tokenHealth: previousVerified ? (connection.tokenHealth || "healthy") : "",
    pendingAttemptId: FieldValue.delete(), pendingManagedPublishing: FieldValue.delete(), lastFailedAttemptId: pending,
    lastAuthorizationFailure: failure, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return true;
  });
}

module.exports = {terminalReason, recoverMetaPending};

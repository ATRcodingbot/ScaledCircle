"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "AdminOperationsV1";
const SUPPORT_EMAIL = "support@scaledcircle.com";
const ACTIONABLE_SEVERITIES = new Set(["high", "critical"]);
const ADMIN_READINESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function text(value, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizedEmail(value) {
  return text(value, 320).toLowerCase();
}

function stableId(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function assertTrustedAdmin(actor) {
  if (!actor?.uid || actor.role !== "admin" || actor.isAdmin !== true ||
      actor.emailVerified !== true) {
    throw new Error("trusted_admin_required");
  }
  return actor;
}

function createAdminOperationsService({db, auth, FieldValue, now = () => Date.now()}) {
  const timestamp = () => FieldValue.serverTimestamp();

  async function resolveTarget(input) {
    const uid = text(input?.uid, 160);
    const email = normalizedEmail(input?.email);
    if ((uid ? 1 : 0) + (email ? 1 : 0) !== 1) {
      throw new Error("exactly_one_admin_target_required");
    }
    let authUser;
    try {
      authUser = uid ? await auth.getUser(uid) : await auth.getUserByEmail(email);
    } catch (_) {
      throw new Error("target_auth_user_not_found");
    }
    const profileRef = db.collection("users").doc(authUser.uid);
    const profile = await profileRef.get();
    if (!profile.exists) throw new Error("target_profile_not_found");
    return {authUser, profileRef};
  }

  async function setAdminRole(input, actor) {
    assertTrustedAdmin(actor);
    const action = text(input?.action, 20).toLowerCase();
    const reason = text(input?.reason, 500);
    if (!["promote", "demote"].includes(action)) throw new Error("invalid_admin_role_action");
    if (!reason) throw new Error("admin_role_reason_required");
    const target = await resolveTarget(input);
    if (target.authUser.emailVerified !== true) throw new Error("target_email_unverified");
    const auditId = stableId(["admin-role", action, target.authUser.uid, actor.uid, reason,
      SCHEMA_VERSION]);
    const auditRef = db.collection("adminAuditEvents").doc(auditId);

    return db.runTransaction(async (transaction) => {
      const [targetProfile, admins, audit] = await Promise.all([
        transaction.get(target.profileRef),
        transaction.get(db.collection("users").where("role", "==", "admin")),
        transaction.get(auditRef),
      ]);
      if (audit.exists) {
        return {changed: false, idempotentReplay: true, uid: target.authUser.uid};
      }
      const before = targetProfile.data() || {};
      const currentRole = text(before.role, 40).toLowerCase();
      if (action === "promote" && currentRole === "admin") {
        return {changed: false, alreadyApplied: true, uid: target.authUser.uid};
      }
      if (action === "demote") {
        if (currentRole !== "admin") {
          return {changed: false, alreadyApplied: true, uid: target.authUser.uid};
        }
        const otherAdmins = admins.docs.filter((doc) => doc.id !== target.authUser.uid);
        if (otherAdmins.length === 0) throw new Error("last_admin_demotion_forbidden");
        const replacementUid = text(input?.replacementAdminUid, 160);
        const replacement = otherAdmins.find((doc) => doc.id === replacementUid);
        const verifiedMillis = replacement?.data()?.lastAdminLoginVerifiedAt?.toMillis?.();
        if (!replacement || !Number.isFinite(verifiedMillis) ||
            now() - verifiedMillis > ADMIN_READINESS_MAX_AGE_MS) {
          throw new Error("verified_replacement_admin_required");
        }
      }

      const nextRole = action === "promote" ? "admin" : "business";
      const at = timestamp();
      transaction.update(target.profileRef, {role: nextRole, updatedAt: at});
      transaction.create(auditRef, {
        schemaVersion: SCHEMA_VERSION,
        eventType: action === "promote" ? "admin_promoted" : "admin_demoted",
        targetUid: target.authUser.uid,
        targetEmail: normalizedEmail(target.authUser.email),
        previousRole: currentRole || null,
        newRole: nextRole,
        reason,
        performedBy: actor.uid,
        occurredAt: at,
      });
      return {changed: true, uid: target.authUser.uid, role: nextRole};
    });
  }

  async function confirmAdminLogin(actor) {
    assertTrustedAdmin(actor);
    const profileRef = db.collection("users").doc(actor.uid);
    const auditId = stableId(["admin-login-ready", actor.uid,
      Math.floor(now() / 86400000), SCHEMA_VERSION]);
    const auditRef = db.collection("adminAuditEvents").doc(auditId);
    await db.runTransaction(async (transaction) => {
      const audit = await transaction.get(auditRef);
      const at = timestamp();
      transaction.update(profileRef, {lastAdminLoginVerifiedAt: at, updatedAt: at});
      if (!audit.exists) {
        transaction.create(auditRef, {schemaVersion: SCHEMA_VERSION,
          eventType: "admin_login_readiness_confirmed", targetUid: actor.uid,
          performedBy: actor.uid, occurredAt: at});
      }
    });
    return {ready: true, uid: actor.uid};
  }

  async function createIssue(input, actor) {
    assertTrustedAdmin(actor);
    const severity = text(input?.severity, 20).toLowerCase();
    const type = text(input?.type, 80);
    const summary = text(input?.summary, 500);
    const dedupeKey = text(input?.dedupeKey, 160);
    if (!type || !summary || !dedupeKey ||
        !["low", "normal", "high", "critical"].includes(severity)) {
      throw new Error("invalid_admin_issue");
    }
    const issueId = stableId([dedupeKey, Math.floor(now() / 3600000), SCHEMA_VERSION]);
    const issueRef = db.collection("adminIssues").doc(issueId);
    const emailRef = db.collection("outboundEmailJobs").doc(`admin_issue_${issueId}`);
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(issueRef);
      if (existing.exists) return;
      const at = timestamp();
      transaction.create(issueRef, {schemaVersion: SCHEMA_VERSION, issueId, type, severity,
        status: "open", entityType: text(input?.entityType, 80) || null,
        entityId: text(input?.entityId, 160) || null, summary,
        dashboardDeepLink: "/#/admin", dedupeKey, createdAt: at, resolvedAt: null});
      if (ACTIONABLE_SEVERITIES.has(severity)) {
        transaction.create(emailRef, {
          to: SUPPORT_EMAIL, fromAddress: SUPPORT_EMAIL, fromName: "Scaled Circle Support",
          replyTo: SUPPORT_EMAIL, subject: "ScaledCircle — Admin action required",
          text: "ScaledCircle requires your attention.\nLog in to the Admin Dashboard to review the issue.\n\nhttps://scaledcircle.com/#/admin",
          template: "support_admin_issue", eventType: "admin.issue.action_required",
          metadata: {issueId, severity, type}, status: "queued", createdAt: at, updatedAt: at,
        });
      }
    });
    return {issueId, emailQueued: ACTIONABLE_SEVERITIES.has(severity)};
  }

  return {resolveTarget, setAdminRole, confirmAdminLogin, createIssue};
}

module.exports = {SCHEMA_VERSION, SUPPORT_EMAIL, ACTIONABLE_SEVERITIES,
  ADMIN_READINESS_MAX_AGE_MS, text, normalizedEmail, stableId,
  assertTrustedAdmin, createAdminOperationsService};

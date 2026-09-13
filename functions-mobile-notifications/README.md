# Mobile push delivery

Push is a transport for the existing recipient-owned `notifications` record.
Source operations never await APNs/FCM delivery. No payment, message send,
approval, schedule or inferred CRM outcome is created by this codebase.

`mobileNotificationsV1` manages authenticated preferences and installation
registration, resolves current authorization at tap, and provides a harmless
user-requested notification check. A random installation revocation secret can
only remove its own registration without authentication. Registration and reads
still require verified, enabled accounts. Tokens are server-only, limited to ten
registrations per account and expire after 30 days without refresh. Sign-out
revokes the registration and deletes the local FCM token. Account switching,
token rotation, environment mismatch and current workspace/assignment authority
are checked independently of the token.

New authoritative events are queued by `queueMobileNotificationV1`. The bounded
minute worker rechecks recipient authority and preferences. Quiet Growth events
are grouped hourly; disabling that digest retains them in-app. Cold-prospect
discovery stays in-app. Required account notices have no category mute.

The original record carries `push.status`, attempts and safe failure category.
Private per-notification/per-device transport receipts prevent repeated sends
from concurrent workers and overlapping digests. Confirmed temporary provider
rejections retry at most three times. Ambiguous transport outcomes remain
`confirmation_unknown` and are not blindly retried. Provider acceptance is not
proof of device delivery. Invalid tokens are removed only if their current
generation still matches. No historical notification backfill is performed.

Additive adapters cover newly persisted Business email replies, ready Social and
email reviews, provider-confirmed Social publication, maintained LIVE cash-out
states, and membership payment attention. Existing authoritative notifications
cover schedule/assignment, marketplace, work submissions/earnings, referrals and
Growth briefs. Certification email traffic is excluded. Marketplace recipient
selection continues to use the maintained saved service-area/travel policy;
this transport does not select a statewide audience.

Lock-screen payloads contain generic copy and only notification identity plus
environment. Details and routes are fetched after authentication. Removed
members or changed assignments get an unavailable destination. Tokens,
preferences and transport receipts remain denied to all client Firestore access
under the existing staging and production Rules.

Deploy this isolated codebase using `firebase.mobile-notifications.json`, with
an explicit project and private `APP_ENV` binding. Do not broadly deploy other
Function codebases. `tools/prepare_mobile_notifications.cjs` copies the exact
maintained workspace/seat/permission dependencies before packaging.

Physical certification requires fresh native artifacts with Firebase Messaging,
Android notification channel/permission and signed iOS APNs entitlements.
Firebase must hold the correct APNs credential. Run the existing production IPA
content/signature gates and `tools/verify_ios_push.py` on macOS before upload.
The APNs private key belongs only in secure storage and Firebase, never in the
app or repository. Existing GPS/background acquisition code is preserved.

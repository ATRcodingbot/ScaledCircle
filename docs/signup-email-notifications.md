# Signup and operational email notifications

Scaled Circle uses `support@scaledcircle.com` as its public support and
operations address. Signup email is initiated only by trusted Firestore
triggers; no client API accepts recipients, sender addresses, subjects, or
message bodies.

## Authoritative events

- `users/{uid}` creation queues account notifications after the corresponding
  Firebase Auth user is confirmed to exist. Supported roles are `business` and
  `scaler` only.
- `waitlist/{hash}` creation queues notification-list messages. The public
  `joinWaitlist` Function validates and writes this document. Client Firestore
  writes are denied.
- An account registration that also opts into updates is recognized by its
  internal `flutter_account_creation` source and does not receive a duplicate
  subscriber welcome pair.

The triggers create deterministic documents in `outboundEmailJobs`:

- `welcome-user_{uid}`
- `admin-new-user_{uid}`
- `welcome-subscriber_{sha256(normalizedEmail)}`
- `admin-new-subscriber_{sha256(normalizedEmail)}`

Creating the same event again finds the existing documents and performs no
additional writes. The sender transactionally changes `queued` to `sending`.
Automatic retries are disabled for SMTP delivery; an uncertain delivery stays
claimed rather than risking a duplicate message. A future trusted support tool
may reconcile failed or uncertain jobs using the same document ID.

## Transport configuration

The signup sender expects the Google Workspace/Gmail SMTP identity
`support@scaledcircle.com` and the Cloud Functions secret
`SUPPORT_EMAIL_SMTP_PASSWORD`. Until that mailbox is authorized to send as the
support address and the secret is configured, delivery fails closed. Never put
the password in Firestore, Flutter, source control, local documentation, or
logs.

The older Attractive Remodel Gmail transport remains only for existing
weather delivery and is not used by the signup queue. Migrating that separate
transport is outside this change.

## Operational alerts

`signup_notifications.queueSupportAlert` is the reusable server-only entry
point. It requires a stable event ID and produces one deterministic support
job. Metadata is limited to primitive values and drops keys suggesting
passwords, tokens, secrets, keys, cards, banks, or payments.

Future low-volume alert types include:

- payout or Connect transfer failure;
- Stripe webhook processing failure;
- campaign funding failure;
- support hold;
- verification or review exception;
- account or admin escalation; and
- material proof failure requiring admin attention.

Routine high-volume logs must remain in structured logging, not email.

## Firebase Authentication branding

The app currently calls Firebase Auth's standard email-verification and
password-reset APIs without custom `ActionCodeSettings`. Repository Firebase
options still use `scaled-circle.firebaseapp.com` as the web auth domain.
Firebase Console configuration is therefore still required to customize the
verification, password-reset, email-change, and related templates, sender
name/address, action URLs, and authorized custom domain. DNS and an authorized
Google Workspace/provider sender for `support@scaledcircle.com` must be in
place. These console-only settings are not changed by this implementation.

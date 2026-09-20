# Integrated Email pilot — source validation and gated deployment

Continues ac4bb0a. No change to OpenAI project/key, Google scopes/clients or existing mailbox connections.

## Source-tested

The existing five-minute Email worker now separates fair cursor-based linked-conversation monitoring from explicitly selected new-inquiry label intake. A one-time owner Gmail filter applies the chosen label automatically; ScaledCircle does not silently scan the entire inbox or configure Gmail filters. Existing conversations remain monitored independently of that label.

Owner setup joins explicit model-data consent, recipient permission, exact introduction/follow-up templates, quiet hours, transactional/push alerts and existing Schedule availability. Suggested substantive replies always require current exact-message owner approval. Customer acceptance binds to an owner-authorized slot; Schedule conflict transactions and idempotency preserve one event. Automatic appointment confirmation email is not implemented or implied; the owner can send an exact reviewed reply.

The shared inference allowance remains USD 1 / 100 requests / seven days from actual activation, two exact workspaces only. Preparation does not start the clock. Both owners must authorize independently after disclosure/provider review and all setup checks. Unknown provider costs remain reserved; no automatic model retry. Neither Social nor research funds are used.

Evidence (local fixtures, no production messages or model calls):
- Existing/new Email suite: 64 passed.
- Focused enrollment/execution/round-trip/authority suite: 14 passed; final enrollment/authority/round-trip rerun: 8 passed.
- Existing Schedule: 32 passed; existing push: 18 passed.
- Owner reply alert / transactional processing: 24 passed.
- Flutter Email/Schedule UI suite: 34 passed; final pilot UI rerun: 2 passed.
- Flutter analysis clean. Production web rebuild is recorded separately after completion.

## Deployment / activation disposition

Production deployment completed September 20, 2026. Server source: `8607f91cb449861b01308935947b40c00623e53a`. Web source including readable setup prerequisites: `e422d9f2d8bbe886a4abfc65a3d5766c5f53c77b`. Production web build, focused UI tests and analysis passed. Hosting released and owner setup/public privacy disclosure were inspected in the real production UI.

Readback at 2026-09-20T20:14:14.607Z found exactly the nine intended Functions changed, all ACTIVE. No unrelated Function metadata updates; Firestore ruleset unchanged. Both existing mailboxes remain connected with identical connection generations and Read/Send permissions.

The authenticated support owner/Admin prepared `founder_email_assistance_20260920` through the maintained UI/server action at 2026-09-20T20:10:19.307Z. Exact two workspace grants are prepared; USD 1 total / 100 requests / seven-day term, no renewal or top-up. Start and expiry remain null. Usage absent, both owner policies absent, model-data review absent: NO activation, NO model processing or sending authorized by this preparation.

Google amendment remains PREPARED/UNSENT. Production Branding confirms developer contact support@scaledcircle.com and user support attractiveremodel@gmail.com; the latter is the human project Owner. Both contact mailboxes searched including Spam/Trash; no genuine review thread located. Existing Google review thread not located; amendment pending verified communication channel. No unspecified mailbox access request remains. Detailed Verification progress now shows a logo identity issue despite the main verified-branding banner; preserved without changes. CASA and applicable provider/data-use requirements remain open. See google-review-amendment-unsent-20260920.md.

Production revisions:
- businessEmailOperationsV1: businessemailoperationsv1-00012-ras
- syncBusinessEmailRepliesV1: syncbusinessemailrepliesv1-00006-das
- businessOperationsV1: businessoperationsv1-00004-duv
- mobileNotificationsV1: mobilenotificationsv1-00005-zuy
- queueMobileNotificationV1: queuemobilenotificationv1-00005-lug
- deliverMobileNotificationsV1: delivermobilenotificationsv1-00005-huc
- notifyBusinessEmailReplyV1: notifybusinessemailreplyv1-00005-xor
- sendTransactionalEmailJob: sendtransactionalemailjob-00007-nis
- retryTransactionalEmailJob: retrytransactionalemailjob-00004-yoq

Disposition: source-tested YES; deployed-but-gated YES; owner-activated NO; live-verified NO. Existing permitted manual replies are not changed into model-processing authorization. No prospect, Google amendment, fixture email or appointment was sent/created by this implementation run.

## Controlled test prerequisites

Before requesting a live test, complete factual Google amendment/required processing assessment, each owner's explicit assistance consent, label/filter coverage, permitted controlled recipient, reviewed exact copy, availability/timezone and alerts. No screenshot prospect may be contacted. The controlled test must distinguish actual provider delivery/reply from fixture results, and actual device delivery from notification-record creation.

Native client delta: assistance setup, conversation/suggestion review, recipient consent, Schedule linkage and privacy disclosure. Existing iOS 29 / Android 27 binaries do not contain these changes. No native rebuild in this batch.


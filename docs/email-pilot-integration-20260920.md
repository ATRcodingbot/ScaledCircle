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

At document creation: changes source-tested; not yet deployed. No owner policy, shared grant, model-data review, pilot activation or model inference has been created in production during this work. Preparation action is available to the exact authenticated internal Admin and explicitly says it does not authorize owners or start the clock.

Google amendment is authorized but unsent: searches in support@scaledcircle.com and attractiveremodel@gmail.com did not locate the existing verification email thread. Founder has been asked to open the actual thread; no recipient guessed and no new email thread created. Existing verification remains under review and CASA open. Sending the amendment alone is not provider approval or activation authority. See email-pilot-data-review-20260920.md for the actual data-handling assessment.

## Controlled test prerequisites

Before requesting a live test, finish gated deployment and readback, factual Google amendment/required processing assessment, each owner's explicit assistance consent, label/filter coverage, permitted controlled recipient, reviewed exact copy, availability/timezone and alerts. No screenshot prospect may be contacted. The controlled test must distinguish actual provider delivery/reply from fixture results, and actual device delivery from notification-record creation.

Native client delta: assistance setup, conversation/suggestion review, recipient consent, Schedule linkage and privacy disclosure. Existing iOS 29 / Android 27 binaries do not contain these changes. No native rebuild in this batch.

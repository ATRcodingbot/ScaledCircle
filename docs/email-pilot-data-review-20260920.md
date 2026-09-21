# Bounded Email pilot: model-data assessment

This assessment concerns the new optional CRM reply-suggestion feature, not Google approval, CASA completion, or general Gmail onboarding. Existing Google verification remains under review. No production Gmail content has been sent to a model during implementation/testing.

## Verified provider binding and retention

The existing production key authenticated against `gpt-4.1-mini` in OpenAI organization `org-RuydJ0TAcN3M520sgx2Vb0yQ`, project `proj_1OMylHegOdhjnZm2TYywupjL` (Scaled Circle), at 2026-09-20T18:44:06.981Z. The request was a model-metadata read, not inference. No key was rotated or printed.

The project/organization data-controls readback showed feedback, evaluation/fine-tuning and input/output sharing disabled. API response logging is enabled per call; this implementation requests `store:false`. Neither disabled sharing, a displayed “None,” nor `store:false` establishes Zero Data Retention. Default abuse-monitoring logs may retain content up to 30 days, with documented security/legal exceptions. No ZDR arrangement was verified.

## Actual proposed data flow

- Coverage extension prepared September 21: the owner may explicitly choose future Inbox messages, selected-label intake, or existing linked conversations only. Existing label policies remain narrow until reauthorized. Whole Inbox excludes archived-only messages, Sent, Spam, Trash and attachments; no historical backfill is implemented. Metadata screening skips clear automated mail; bounded relevant text screening runs without an external model, persists only actionable inquiry context, and reports unclassified counts as limited screening. Durable bounded-window cursors prevent newer traffic starving earlier pages. Label mode retains the one-time owner-confirmed Gmail filter; Inbox mode requires no filter or Gmail settings/modify scope. Deployment and owner activation must be recorded separately. This does not update the Google review or close CASA.
- Relevant plain-text inbound bodies and thread/message identifiers are retained in the Business's existing mailbox/CRM records in production Firestore. Attachments are not provided to the model. Existing account deletion/retention and disconnect controls remain applicable; disconnect removes usable credentials but does not automatically erase retained conversation history.
- The model request contains only a bounded relevant conversation (up to ten substantive inbound messages plus the related sent message) and maintained Business name, services, voice, allowed claims and destinations. OAuth credentials, unrelated mailbox content and other workspaces are excluded. Obvious identity/payment/credential patterns fail closed for owner review; this is a limited safeguard, not a claim of perfect sensitive-data detection.
- Responses use `gpt-4.1-mini`, `store:false`, at most 8,000 total counted input tokens including prompt/schema headroom and 1,000 output tokens. There are no tools, files, search or automatic provider retries. Email content is untrusted text, never execution authority.
- Suggestions and summaries are stored with the exact inbound/policy digest for owner review. Only explicit approval of the exact recipient and current message revision can send a reply. Model output cannot choose recipients or authorize appointments. Appointment acceptance uses the existing Schedule transaction and an exact owner-authorized slot, or explicit owner review of the customer's acceptance.
- Diagnostic errors do not log prompts, email bodies, model bodies or credentials. OpenAI is the processing provider for this user-visible feature; sharing for general training is disabled. Gmail-derived content is not used for advertising, resale or unrelated profiling.
- Human access remains limited by existing authenticated Business permissions and support/security/legal purposes described in the privacy disclosure. OpenAI's default abuse monitoring is not represented as human-access-free or retention-free.

## Policy assessment and remaining review communication

Google's Workspace policy lists CRM and generative email assistance among appropriate Gmail productivity uses and permits transfers needed for prominent user-facing features with consent. It prohibits unsolicited commercial mail and generalized model training with restricted-scope data. This implementation therefore keeps affirmative model-data consent separate, requires actual recipient permission for introductions/follow-ups, honors suppression, and never uses research review/public email availability as consent.

This is an application-level assessment of the bounded feature against published requirements, not an assertion that Google has approved the changed implementation. The existing verification description said no external-model processing. That description must be corrected through the existing verification email thread; do not cancel/resubmit the application or claim CASA completion. The maintained `recordAssistanceDataReview` action records the actual amendment reference and implementation SHA before the pilot can activate. No external Google approval is fabricated by that record. General Gmail onboarding remains gated.

The amendment was sent once in the verified existing case on September 21 at 6:25 AM Eastern; its exact conversation reference and text are recorded in [google-review-amendment-unsent-20260920.md](google-review-amendment-unsent-20260920.md). The separate earlier CASA-cost question is not that amendment. ADA-CASA AL1 remains required by December 19, 2026. No reviewer response permitting the additional processing has been observed. Delivery does not establish Google approval or complete the maintained processing-permission review; that activation gate remains closed.

## Authorities

- [Google Workspace user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Google verification support process](https://support.google.com/cloud/answer/13463817?hl=en)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
- [gpt-4.1-mini model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

## Budget and activation

The approved allowance is USD $1 total shared by the two exact production Email workspaces, 100 requests total and seven days from actual activation, with no renewal/top-up. Preparing enrollment creates no start/expiry. Both owners must independently save authorization against their own connected mailbox, complete all displayed prerequisites and current Schedule settings. Only then can the existing transaction start the shared clock. Reservation accounting includes all attempted model calls; ambiguous usage remains reserved. Social and Research budgets are not touched.


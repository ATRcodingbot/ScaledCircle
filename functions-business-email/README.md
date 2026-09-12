# Business Email — private beta

This isolated Functions codebase supports individual owner-reviewed Gmail/Google Workspace correspondence. It does not enable bulk Email Marketing, autonomous follow-up, Social publication, or financial actions.

## Authority and state

- Invitation binds an existing workspace, its real authenticated owner, and an exact provider-verified mailbox. Normal Business membership, intelligence permission, paid entitlement and current legal consent remain enforced. The maintained staging internal Admin namespace stays separate from customer Businesses.
- Read and Send grants are requested independently. Provider scope, requested permission and stored authority must agree. Every send rechecks the owner, mailbox generation, immutable message version, current source contact, source freshness, preferences and recipient-wide restrictions.
- Tokens are encrypted with AES-256-GCM and workspace-bound additional authenticated data. Secrets remain in Secret Manager. Browser Rules deny mailbox data, credentials, OAuth attempts, replies and operations; owner views use authenticated callables.
- One server transaction claims an operation before one Gmail send attempt. A timeout or uncertain response is held for reconciliation and never retried as a new send. Gmail does not provide a send idempotency key. An RFC Message-ID is correlation evidence, not a provider deduplication guarantee.
- A matched provider receipt establishes Sent, not Delivered. Read permission enables bounded thread reconciliation. Replies bind to the immediate parent message and update private CRM history without inferring interest.
- Optional owner-recorded outcomes remain distinct from financial/product events. Signup, paid, activation and completed-work claims require separately linked authority and cannot be manually manufactured here.
- Local recommendations exclude certification traffic, honor current opportunity preferences and Do Not Contact, and retain service-area priority. Small samples are directional. No cross-workspace messages, identities or financial records enter a network model.

## Deployment configuration

Use only the dedicated `firebase.business-email.json` selectors after configuring a dedicated Google Web application in Testing mode with the exact callback URI.

Required environment configuration:

- `BUSINESS_EMAIL_GOOGLE_CLIENT_ID`
- `BUSINESS_EMAIL_REDIRECT_URI`
- `BUSINESS_EMAIL_PRIVATE_BETA`: private JSON mapping workspace IDs to `ownerUid`, `mailbox`, `kind`, `funnel`, `certificationRecipient`, and `certificationOnly`.

Required Secret Manager entries:

- `BUSINESS_EMAIL_GOOGLE_CLIENT_SECRET`
- `BUSINESS_EMAIL_ENCRYPTION_KEY`: 32 random bytes encoded as base64.

Do not commit identifiers, invitation configuration, credentials or real-message evidence. Do not reuse another integration's OAuth client. Keep certification-only mode enabled until the owner-approved provider round trip passes. Google's consent and restricted-scope review requirements still apply before broader release.

Exports: `businessEmailOperationsV1`, `businessEmailCallbackV1`, `syncBusinessEmailRepliesV1`. The scheduler reads at most three recent confirmed conversations per invited mailbox every five minutes; it never sends.

## Certification and limits

Run `node functions/scripts/prepare_business_email.js` before packaging; it copies maintained authority modules and the shared local-learning projection. The Rules/emulator suite uses demo projects only. Use `APP_ENV=staging` for Flutter verification.

Real certification requires actual mailbox-owner authorization, exact-message review, one controlled send, provider reconciliation, and a controlled reply matched to CRM. Unit/emulator success does not substitute for this evidence.

Initial private beta reads only known approved outreach conversations, not the entire historical inbox. Mailbox-wide old-lead discovery, autonomous nurture, network aggregation and product/revenue attribution remain held. Landing-page inquiries retain their existing records and transactional notifications; selecting a connected sender prepares an owner-reviewed response and does not enable automatic sending.

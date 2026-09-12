# Business Email — private beta

This isolated Functions codebase provides one workspace-owned Business Email authority. Google/Gmail/Workspace retains its certified adapter; delegated Microsoft Graph and reviewed secure IMAP/SMTP providers are setup-testing adapters. Provider selection is explicit, including for custom-domain mailboxes. It does not enable bulk sending, autonomous follow-up, Social publication, or financial actions.

## Authority and state

- Invitation binds an existing workspace, its real authenticated owner, and an exact provider-verified mailbox. Normal Business membership, Communications permission, paid entitlement and current legal consent remain enforced. Internal Admin workspaces stay separate from customer Businesses. Production reuses the existing pinned, verified Admin authority; it never copies the staging workspace or mailbox, creates a customer identity, or changes an entitlement.
- Read and Send grants are requested independently. Provider scope, requested permission and stored authority must agree. Every send rechecks the owner, mailbox generation, immutable message version, current source contact, source freshness, preferences and recipient-wide restrictions.
- Tokens are encrypted with AES-256-GCM and workspace-bound additional authenticated data. Secrets remain in Secret Manager. Browser Rules deny mailbox data, credentials, OAuth attempts, replies and operations; owner views use authenticated callables.
- One server transaction claims an operation before one provider send attempt. A timeout or uncertain response is held for reconciliation and never retried as a new send. An RFC Message-ID is correlation evidence, not a provider deduplication guarantee. Microsoft 202 responses stay pending until the exact Sent Item is read back. SMTP acceptance means accepted, not delivered; uncertain SMTP outcomes without a verified Sent copy remain held.
- A matched provider receipt establishes Sent, not Delivered. Read permission enables bounded thread reconciliation. Replies bind to the immediate parent message and update private CRM history without inferring interest.
- Optional owner-recorded outcomes remain distinct from financial/product events. Signup, paid, activation and completed-work claims require separately linked authority and cannot be manually manufactured here.
- Local recommendations exclude certification traffic, honor current opportunity preferences and Do Not Contact, and retain service-area priority. Small samples are directional. No cross-workspace messages, identities or financial records enter a network model.

## Deployment configuration

Use only the dedicated `firebase.business-email.json` selectors after configuring an environment-specific Google Web application with the exact callback URI. Keep staging and production clients and secrets separate. Review the project's existing Google audience without changing unrelated login or provider integrations; Google's Testing and verification restrictions still apply independently of ScaledCircle's private invitation gate.

Required environment configuration:

- `BUSINESS_EMAIL_GOOGLE_CLIENT_ID`
- `BUSINESS_EMAIL_REDIRECT_URI`
- `BUSINESS_EMAIL_PRIVATE_BETA`: private JSON mapping workspace IDs to `ownerUid`, `mailbox`, `kind`, `funnel`, `certificationRecipient`, and `certificationOnly`.
- `GROWTH_PRODUCTION_ADMIN_UID`: existing production internal Admin binding, required only for the explicitly invited internal workspace. Missing or mismatched bindings fail closed. Disabled or unverified identities and other Admins are denied.

Required Secret Manager entries:

- `BUSINESS_EMAIL_GOOGLE_CLIENT_SECRET`
- `BUSINESS_EMAIL_ENCRYPTION_KEY`: 32 random bytes encoded as base64.

Do not commit identifiers, invitation configuration, credentials or real-message evidence. Do not reuse another integration's OAuth client. Keep certification-only mode enabled until the owner-approved provider round trip passes. Google's consent and restricted-scope review requirements still apply before broader release.

Exports: `businessEmailOperationsV1`, `businessEmailCallbackV1`, `syncBusinessEmailRepliesV1`. The scheduler reads at most three recent confirmed conversations per invited mailbox every five minutes; it never sends.

## Provider setup-testing gates

Both new providers remain **Private Beta — Setup Testing** until a real controlled round trip is recorded. An existing Google connection is not switched by loading the page or selecting a provider. A successful explicitly authorized replacement binds the selected provider, verified mailbox subject, requested/granted permissions, encrypted credential generation and workspace together. Failed attempts preserve the last valid connection. Google callbacks already in flight remain compatible.

Microsoft configuration adds `BUSINESS_EMAIL_MICROSOFT_ENABLED=true`, `BUSINESS_EMAIL_MICROSOFT_CLIENT_ID`, `BUSINESS_EMAIL_MICROSOFT_REDIRECT_URI` and the dedicated **Secret Manager** secret `BUSINESS_EMAIL_MICROSOFT_CLIENT_SECRET`. Register a confidential Web application in the Business-owned Entra tenant for organizational and personal Microsoft accounts. Use the exact staging callback during certification. Delegated User.Read identifies the mailbox; Mail.Read and Mail.Send are requested independently with PKCE/state. No application-wide or Mail.ReadWrite grant is requested. Refresh-token rotation is persisted under the original generation check. No client secret goes in regular environment text or source. A personal Outlook inbox alone does not establish Entra app-registration authority.

Enable `providers.microsoft` or `providers.other` only in the reviewed private invitation. Other Email also requires an `otherMailbox` policy with the exact invited `email`, authenticated `username`, reviewed `imapHost` (993), `smtpHost` and `smtpPort` (465 or 587). `senderVerified` must be supported by the provider's account/sender policy; SMTP login success alone never sets it. Initial compatible hosts are a reviewed allowlist, not arbitrary URLs. App passwords are submitted only over the authenticated callable, immediately encrypted in the existing client-denied private credential document and never included in the connection read model or logs. They are not stored in customer profiles.

IMAP is read-only: no flags, folder contents, deletions or Sent copies are modified. SMTP verification performs no send. TLS certificate validation is mandatory; STARTTLS is mandatory on 587. Reviewed hosts resolve to pinned public IPv4 addresses with the original TLS server name. Local, metadata, reserved, mixed-public/private DNS answers, IPv6-only and unreviewed endpoints fail closed for this beta. Connections and response sizes are bounded. Generic mailboxes can validly be Read Only; the UI reports missing Send permission rather than claiming full compatibility.

Connection health is separate from capability. Explicit Check connection verifies the current provider identity and produces visible feedback. Missing permissions are reduced, never silently granted. A revoked connection blocks sending and asks for reconnection. OAuth attempts expire after ten minutes. Generic setup requests have a single-use request ID and a bounded lease, so duplicated requests cannot create repeated login attempts.

## Shared conversations and delivery limits

Every provider uses the same operations, drafts, outcomes, restrictions, CRM history and learning projection. New conversations have a workspace/operation-derived internal conversation ID. Raw native identifiers stay behind that model: Google message/thread IDs, Graph immutable IDs/conversation IDs and IMAP folder/UIDVALIDITY/UID plus RFC parent references. Reply deduplication includes provider and mailbox subject; changing providers cannot reinterpret an old conversation. Matching requires the exact sent content, sender, recipient, authoritative receipt, timestamp and immediate parent. Reply receipt never implies Interested, Qualified or Converted, and certification messages remain excluded from Growth learning.

Individual private-beta sending is bounded to five attempted messages per hour and twenty per UTC day, transactionally per workspace across adapters. A failed or uncertain attempt consumes its slot. Provider throttling can impose lower limits; no adapter switches provider, splits a campaign or retries around a limit. Campaigns use the same sender authority, but campaign delivery remains a separate held gate. Preparation must cap an initial reviewed audience at 25 and recheck consent/provenance, suppression and provider limits before any future delivery. These adapter changes do not certify a campaign send workflow or open bulk sending.

## Required physical provider certification

1. Use a real Founder-controlled mailbox and an explicitly invited staging owner/workspace. Preserve the production Google connections and existing certification records.
2. Microsoft: complete the Entra application registration and dedicated secret setup, then intentionally grant Read and Send in the normal Microsoft flow. Other Email: use a reviewed provider's secure settings, enable IMAP in that provider if required, and enter the app password directly in the setup form.
3. Read back exact mailbox/provider identity, separate capabilities, current credential generation, Automatic Sending Off and zero send operations.
4. Prepare one immutable controlled message to a Founder-controlled recipient. Review exact From, To, subject and body. Only a separately enabled single-use certification send may execute; no prospect audience is permitted.
5. Founder receives and replies. Reconcile the exact provider conversation into the same workspace CRM. Verify Replies: 1, readable View Conversation, a second check still Replies: 1, one send operation, and no Growth-learning effect.
6. Only recorded provider evidence can change a provider's Setup Testing status. Unit/emulator tests are not that evidence.

Primary adapter references: [Microsoft delegated sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [ImapFlow client](https://imapflow.com/docs/api/imapflow-client/), [Nodemailer SMTP](https://nodemailer.com/smtp).

## Certification and limits

Run `node functions/scripts/prepare_business_email.js` before packaging; it copies maintained authority modules and the shared local-learning projection. The Rules/emulator suite uses demo projects only. Use `APP_ENV=staging` for Flutter verification.

Real certification requires actual mailbox-owner authorization, exact-message review, one controlled send, provider reconciliation, and a controlled reply matched to CRM. Unit/emulator success does not substitute for this evidence.

The separate invited-customer campaign preparation flag permits bounded historical Gmail review and workbook imports. It does not enable campaign sending. Internal ScaledCircle mailboxes cannot substitute for the invited customer's mailbox. Every candidate retains provenance and remains unapproved; explicit inbound opt-outs update the same recipient-wide suppression authority used by individual outreach. Search completion describes only the bounded query, never proof that nobody previously opted out. Ambiguous roles, HTML-only messages, vendor/personal correspondence and incomplete pagination require human review.

Campaign proposals require at most 25 distinct saved contacts, a legitimate owner-supplied mailing address before sending, individual no-login unsubscribe links and exact message/audience review. Draft history uses the existing mailbox contact timeline and never creates fake CRM outcomes. GET unsubscribe links are read-only; recipient POST confirmations are idempotent, audited and immediately suppress future outreach. Automated delivery, scheduling, autonomous nurture, network aggregation and product/revenue attribution remain held. Existing certified conversation reconciliation continues to require the exact provider send receipt; this release does not claim a campaign send/reply round trip.

Microsoft/Other provider setup remains on hold until the Founder supplies the missing provider prerequisites. Do not spend launch time retrying account signup.

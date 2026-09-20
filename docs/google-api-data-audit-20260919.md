# Google API data audit and demo preparation — September 19, 2026

Scope: public privacy disclosure only. No verification submission, new mailbox connection, send, revocation, entitlement or account mutation.

## Production evidence

Read-only Cloud Functions source archives were retrieved for businessEmailOperationsV1 (00008-cuw), syncBusinessEmailRepliesV1 (00005-wug), and businessEmailCallbackV1 (00002-jac). Core deployed gmail.js, service.js, authority.js, campaigns.js, growth_learning.js and contact_relationship.js match the maintained source byte-for-byte. Sanitized runtime evidence is in the ignored `.firebase/launch-close-20260919/google-privacy-runtime-audit.json`. Production default Firestore location is nam5 (United States multi-region). Do not expose private environment snapshots or credentials.

Gmail retrieves verified mailbox identity, bounded thread search results, full selected threads and approved-send receipts. It extracts message IDs, thread IDs, participants, subject, dates, message text and opt-out evidence. Attachment files are excluded from text extraction. Historical campaign evidence stores bounded excerpts (up to 5,000 characters); matched replies store text up to 8,000 characters. This is body persistence, not metadata-only processing.

Workspace-bound `businessMailboxes` subcollections store credentials (application-encrypted), attempts, immutable drafts/versions, send operations, replies, candidates, suppression, CRM relationships, contact history and outcomes. Account/CRM records link exact send operations. Business Operations exposes permission-filtered timeline events, not mailbox bodies; the invited owner accesses readable conversations through the Email callable. Rules do not grant browser access to raw mailbox records. Production privileged IAM/service accounts remain a potential operational access path; code cannot certify every historical staff action or organizational procedure.

Disconnect transaction deletes the stored private credential and clears connection permissions/automatic sending. It does not revoke Google's grant or erase saved conversation history. No fixed content TTL or automatic mailbox-history deletion was found. Account closure protects Business ownership and does not purge a workspace's mailbox when an individual member deletes an account. Saved Gmail deletion therefore requires a workspace-authorized support process and applicable retention review; do not claim immediate self-service purge.

Reviewed Email, Business Operations, Growth projection and notification consumers contain no external AI/model request carrying Gmail content. Local outcome/feature counters support the same Business's visible campaign and follow-up features, excluding certification traffic. Replies alone do not establish conversion or revenue. No Gmail-data advertising export, resale, generalized ad profile or cross-Business learning path was found. This bounded audit is not a provider security assessment or a blanket certification of all future code.

Google Gmail/OAuth APIs and Google Cloud/Firebase process mailbox operations and stored records. Human-facing access is workspace permission/owner scoped. The policy expressly limits privileged staff/service-provider access and transfers to Limited Use purposes; it does not claim technical impossibility of privileged access.

## Demo workspace preparation (not activated)

Prepared name: **ScaledCircle OAuth Demo**. Founder must supply an unused Founder-controlled Gmail address and complete normal Business signup, email verification, real profile and current Terms/Privacy consent. These cannot be synthesized. No duplicate workspace, paid subscription or fake revenue is created.

Current production Email authority requires an exact invited mailbox/owner/workspace binding, current consent, and an active maintained Business entitlement. Invitation configuration alone does not bypass that entitlement gate. A new empty Business is therefore not yet demo-ready. After genuine identity/profile completion, prepare a separately auditable internal demo entitlement through a maintained authority if available; do not fabricate a Stripe plan or weaken the normal paid gate. Keep automatic sending, ordinary sends and campaign sends disabled. The exact controlled message requires separate Founder approval before enabling one bounded send.

Do not modify Attractive Remodel or ScaledCircle's separate internal namespace. A separate Gmail address has not yet been supplied, so no legitimate owner identity can be bound and no workspace activation/grant is represented as complete.

Draft only: subject `ScaledCircle Google connection demonstration`; body `This is a Founder-approved demonstration of ScaledCircle Business Email. Please reply with: Demonstration reply received. No customer campaign or sales outreach is involved.` Intended recipient after approval: skotiatrades@gmail.com.

Recording: production branding/privacy → genuine demo owner → choose Read/Send → Google English consent with client ID and exact scopes → return/Check connection → separately approved controlled send → real controlled reply → Check Conversations/View Conversation → repeated check without duplicate reply. Record actual results only. Upload an unlisted YouTube video and provide its URL. Verification Center still needs that URL, final review of saved justifications/application use case, truthful submission declarations, and Google's review/security-assessment process. No submission yet.

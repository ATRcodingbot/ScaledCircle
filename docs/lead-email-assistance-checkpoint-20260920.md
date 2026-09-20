# Lead Email Assistance — checkpoint and activation preflight

This is an implementation checkpoint, **not** an end-to-end pilot certification or a release candidate. No messages, model calls, appointments, grants, mailbox changes or production mutations were made during this checkpoint. No native rebuild was started.

## Verified current paths

- Production ScaledCircle owner/controller: `p1tigN2XE9ascVN4es3RBncw6nf1`. Browser Business Email visibly opens and shows `support@scaledcircle.com` connected with Read/Send selected, ordinary sending held, automatic sending off. Production `businessEmailOperationsV1` revision `businessemailoperationsv1-00011-cuy`. Its maintained internal enrollment has `sendEnabled:false`, `certificationOnly:true`. This is not absent Gmail consent.
- ScaledCircle internal research remains the separate staging namespace `FF1bfDuvtdNjuuC4mc7NdGtk3LC3`. The production Growth route forwards only bounded discovery operations to it. It does not provide production mailbox authority or credentials.
- Attractive Remodel production workspace: `IqRjZYHKOzXYuJcSyL68LYNwtDg1`; saved `attractiveremodel@gmail.com` connection has Read/Send, ordinary reviewed sends enabled, automatic sending off. Its credentials and records were untouched.
- AI Team links instantiate the internal `GrowthAgentsScreen(customer:false)`. The static “External actions Off / routes 0” described that research implementation, not Email/Social execution globally. Business Email was at the bottom of the long page and silently disappeared when availability returned null or failed.
- `syncBusinessEmailRepliesV1-00005-wug` already has a five-minute scheduled thread reconciliation path. It reads up to three eligible recent sent operations per visit; it does not yet discover arbitrary new inbound inquiries. No new Gmail watch or polling automation is necessary for existing conversation reconciliation.
- `notifyBusinessEmailReplyV1` already projects saved replies into deduplicated in-app/push notifications, using the existing preference and destination authority. It is not an owner-email/suggested-reply implementation. Existing certification traffic is excluded.
- ScaledCircle Growth profile has `America/New_York`; the bridge omitted its maintained timezone presentation. No timezone was found in the initially inspected Attractive Remodel account/workspace/operations/Growth profile fields. Do not infer one from geography or a research Scheduler timezone; inspect remaining maintained scheduling settings before requiring owner configuration.
- CLI principal cannot read private mailbox collections through the Firestore SDK. That diagnostic permission failure is **not** evidence of failed production runtime access; the real owner browser confirms ScaledCircle Email loads. No IAM was widened.

## Source prepared and tested

1. Visible top-level Business Email link from internal Growth; unavailable access opens the maintained Email route instead of disappearing. Backend authority remains unchanged.
2. Responsive Admin operational values and expandable/copyable long audit evidence. Research-only wording no longer claims all external routes are off.
3. Prospect conversation links resolve actual recorded operations. Missing email, missing recipient permission and DNC are explicit. Research review is not send consent. A new pilot recipient-eligibility projection is still required before fresh automatic outreach can be offered.
4. Distinct loaded-evidence counts for researched accounts, qualified fit, verified Email eligibility, provider-accepted messages and replied conversations. Certification operations excluded. Unknown observations remain unknown.
5. Server-rendered research time labels resolve maintained production workspace/Growth timezone without rewriting instants; explicit UTC fallback when absent. No additional Flutter timezone dependency.
6. Gmail response classification retains automatic/OOO/newsletter/opt-out messages without counting them as substantive customer replies or triggering sales-reply push. This handles the existing strictly matched conversation path; broader bounce/new-inquiry discovery is not yet implemented.
7. Reply/follow-up drafts freeze a digest of the persisted inbound context. Both send reservation and immediate dispatch recheck it. Definitive pre-dispatch rejection suppresses the unsent operation and releases its contact claim; uncertain provider attempts remain held for reconciliation.
8. Bounded Email policy preflight/recipient/dispatch/reply-approval checks are prepared with fixture tests. The owner-only `loadAssistance` / `manageAssistance` actions now prepare, pause and revoke a versioned policy under the existing `agentPermissions/{workspace}_lead_generator/authorizations/business_email` record, with immutable audit snapshots, optimistic concurrency and duplicate request protection. The parent research permission is unchanged. Activation/resume fail closed until execution integration is complete; no production policy or grant was created. This is **not yet a recurring automatic-send implementation or complete opt-in UI**.
9. Inbound classification recognizes the actual `X-Scaled-Circle-Notification` header emitted by the maintained transactional email service, as well as the older alternate spelling. These messages cannot become substantive sales replies.

## Remaining execution work (do not claim complete)

- Complete the owner-reviewed pilot setup UI and execution integration using the prepared maintained `bounded_managed` permission extension. Explicit exact-workspace enrollment and production owner opt-in remain outstanding. Keep independent intro/follow-up/reply/booking settings, sender generation, audit and term; do not flip the legacy research external-actions flag.
- Import authorized internal research evidence into the production CRM through the authenticated bridge; never accept arbitrary caller-provided authority, consent or workspace mapping. Public listing alone remains ineligible for Gmail outreach.
- Integrate authoritative recipient consent/request evidence, postal identity and unsubscribe with the existing outbox/contact reservation. Add actual bounded scheduled introduction/follow-up execution and transactional caps. Existing manual `send` remains owner-reviewed; no automatic dispatch was enabled.
- Model preparation with isolated operating budget, reservation/actual-cost/unknown-cost reconciliation, minimized data, prominent owner consent, exact input/output revision binding, content validation and no tool execution from email text.
- Incremental new-inquiry classification and relevant-conversation sync, follow-up cancellation, deduplicated owner transactional email under saved preferences/quiet hours. Reuse existing push path; do not send from the owner's mailbox merely to notify its owner.
- Existing Business Operations Schedule needs maintained working-hours/buffer/availability authority, linked tentative/confirmed proposal lifecycle, atomic conflict recheck, exactly-once booking, reschedule/cancel and honest partial email/event outcomes. Do not create a second calendar or infer a booking from “Are you free Tuesday?”.
- Complete owner UI and fixture end-to-end tests before enabling either workspace or presenting a Founder live test. No exact consenting pilot recipient or test appointment is selected yet.

## Separate proposed model allowance — awaiting Founder decision

Use existing OpenAI provider, `gpt-4.1-mini`, Responses with `store:false`, no tools/web search/files, no cross-workspace context. Proposal: **USD $1 total shared by these two workspaces, seven days from actual activation, at most 100 requests, no automatic retries, renewal or top-up**. At 8,000 input and 1,000 output tokens per request, published $0.40/$1.60 per million rates imply $0.0048/request, $0.48/100 requests. This is an estimate; actual token caps and transactional maximum-cost reservations must enforce the hard cap before calls. Research and Social grants remain separate.

Only relevant message text, subject and approved Business context would leave ScaledCircle; no mailbox tokens, unrelated inbox, financial/identity records or unrestricted tool access. Default API abuse-monitoring logs can retain content up to 30 days (with documented legal/security exceptions). `store:false` is not a zero-retention guarantee. Verify the actual OpenAI account data-sharing/training setting and any retention arrangement before activation. No zero-retention account status was established here.

The current Google review describes no external-model processing of Gmail data. Prepare an accurate amendment/disclosure for this opt-in feature; determine the required update with Google without canceling/resubmitting the existing review speculatively. General Gmail onboarding remains gated; existing connections remain intact. CASA remains open.

Primary sources checked September 20:
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy (CRM/AI productivity use, explicit disclosure, no unsolicited commercial mail)
- https://developers.google.com/terms/api-services-user-data-policy
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/docs/guides/your-data

## Validation and release disposition

- 17 focused Flutter tests passed, including 320-pixel/2x-text evidence and contact presentation; final focused Flutter analyzer passed for all nine changed/tested Dart files.
- 31 focused Email/policy/mobile-notification unit tests, plus two timezone projection tests, passed.
- 39 existing Email emulator backend tests passed; the subsequently added stale-inbound and automatic-reply regression tests both passed separately.
- Three targeted customer Growth backend tests passed for owner/member isolation, initialization and real-source fixture lifecycle after timezone projection changes.
- After adding the owner policy extension, one combined focused run passed 78 tests (Email emulator regressions, policy transactions, provider matching, notification signals and timezone projection). The subsequently added real notification-header extraction regression passed with all 12 provider tests. Emulator permission-denied output was expected from Rules-denial assertions, not a production error. No full launch regression was rerun or claimed.
- No deployment yet. New Flutter bytes are absent from iOS 29 / Android 27. Keep those as baseline candidates, not the candidate for this unfinished batch. Founder installed iOS build remains unconfirmed; an async question is pending.

## Future controlled test (not ready to execute)

Once preflight and implementation pass: each owner reviews the exact sender, consented controlled recipient, content boundaries, limits/timezone/term, model disclosure and scheduling authority → explicitly enables their own policy → normal worker sends one eligible introduction → controlled recipient replies → one owner push/email opens the exact conversation → owner reviews and sends the bound suggestion → customer accepts a specific owner-authorized slot → existing Schedule records exactly one linked test appointment. Stop/inspect partial failures; do not infer delivery, interest or bookings.

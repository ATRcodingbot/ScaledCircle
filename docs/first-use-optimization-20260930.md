# Business first use measurement

September 30, 2026. Investigation only; no deployment or product changes.

The largest customer drop-off cannot yet be established. The retained traffic sample is small, includes controlled visits, and does not connect public visits to authoritative Business outcomes. The most concrete early-path defect is a registration measurement gap: the public Business page sends Get Started to login, and the login screen opens registration without changing the named route. Reaching registration can therefore remain a login page view.

## Scope and source

Isolated branch `codex/first-use-measurement-20260930`, based on current web documentation head `d43e9b1536e7e5825f748b3a11a3babe75662aa0`. Its deployed application baseline is `e72b896237a2a3eb34ec15b978ac85db252eb786` (Hosting `23b9f8dc42266fec`). This pass did not deploy or re-certify that Hosting package.

Native candidate `d60920930c81253f9019c19bed47a3eaf184dd3e` remains clean and unchanged. No native CI, release merge, production account/profile/campaign write, checkout, provider search, email or financial action occurred. Production inspection used GA4 reports, narrow Firestore projections, bounded service logs and read-only website navigation. Emulator billing fixtures use fake Stripe objects and demo projects.

## What the funnel can show

| Stage | Existing evidence | Limit |
| --- | --- | --- |
| Business signup entry | GA4 public page views and an allowlisted `/create-account` path | Static `/businesses` Get Started goes to `/#/login`. Login Create Account and Flutter public registration use unnamed `MaterialPageRoute`; no new URL means no distinct registration page view. Business versus Scaler form choice is not measured. |
| Successful account creation | Auth identity plus `finalizePublicAccountSignup` transaction creates `users/{uid}` with role, `earlyAccessSource` and `createdAt` and reserves deterministic welcome jobs | An Auth identity can exist before finalization succeeds. A click or welcome email is not account completion. No public-session join or external success event. Current inventory cannot recover deleted accounts or prove that all orphaned Auth identities finalized. |
| Required profile completion | `businessOnboarding/{uid}.completedAt` and maintained `completionStatus(businessGrowthProfiles, businessOnboarding)` used by onboarding/workspace projections | Legacy-ready profiles can be complete without a completion timestamp. Missing timestamp is unknown timing, not an incomplete profile. New public Core Business accounts are admitted by `publicSignupAccess`; there is no general manual approval requirement for membership. Profile requirements still apply at campaign entry. |
| First useful Core action | Successful server request receipts in `businessOperations/{businessId}/requests`, CRM records/timeline, committed contact-import receipts, saved campaign plans and planning audit/history | No unified first-action projection. Read-only views, clicks, import previews, automated source imports and lifecycle cleanup must not become manual first-action success. Stored records alone do not establish acquisition origin. |
| Subscription checkout attempt | `createSubscriptionCheckoutSession` and wallet `pendingSubscriptionRequestId`, selection and expiry; billing operation/audit mechanisms already exist | Wallet marker is mutable/idempotency state, not a durable attempt log. It is written before provider session creation; it does not prove checkout opened or payment succeeded. Quote confirmation, session-created, session-opened and paid are distinct stages. |
| Authoritative subscription activation | Certified subscription sync into `businessSubscriptions` and reconciled `subscriptionPaymentReceipts` after `invoice.paid` | Active entitlement can be complimentary, trial or internal access. Paid conversion needs correct Business/provider binding, environment, positive collection and exclusion of internal certification/known controlled cohorts. A success redirect is not payment authority. |

GA4 intentionally maps private routes to `/app` and deduplicates consecutive views of that sanitized path. Keep that privacy behavior. Existing GA4 does not record signup success, completed Core actions or subscription purchases. Its `$0 revenue` is consequently not proof of no revenue.

The existing Sales funnel has a different meaning: `sales_funnel.js` derives `paid` from a paid **campaign**, and `retained` from two paid campaigns. Its activation flags also differ from maintained profile completion. Do not relabel those stages as membership conversions. Extend the existing Admin overview/activity projection if a Business first-use view is needed; do not create a parallel dashboard.

The journey is not one strict sequence. CRM/schedule mutation authority requires active membership; some campaign planning/record utilities have separate access rules. Measure the first useful action by branch, and retain both before-membership planning and after-membership Core use where authorized. Never loosen those rules to fit a funnel diagram.

## Actual retained evidence

GA4 property `548368356`, measurement ID `G-9VY50190LG`, custom report range **September 27–29, 2026**, as displayed in GA4. Read September 30. This is not a rolling realtime conversion sample. Analytics deployment began September 27 at 16:04:33Z, so the first reporting day is partial.

| Page | Views | Active users for that page |
| --- | ---: | ---: |
| All pages | 61 | 5 unique across the report |
| `/` | 18 | 5 |
| `/app` | 16 | 3 |
| `/businesses` | 11 | 3 |
| `/i` | 6 | 1 |
| `/pricing` | 5 | 3 |
| `/login` | 2 | 1 |
| `/how-it-works` | 1 | 1 |
| `/privacy` | 1 | 1 |
| `/scalers` | 1 | 1 |

There is no `/create-account` row. This is **not evidence that nobody opened registration**, because of the route defect. Page-user counts overlap and must not be added. Report key events are zero because the required outcome events are not implemented.

Controlled deployment traffic is explicitly documented under `utm_source=deployment_check`, including the initial installation verification. Other Founder/reviewer visits may be untagged. Therefore the 5 GA users cannot be classified as 5 prospective customers or joined to Business account IDs. No conversion percentages are justified. This pass's public inspection began with `deployment_check / qa / first_use_20260930`; the existing Get Started link drops those URL parameters. It did not change tracking configuration.

The read-only retained inventory at approximately **2026-09-30T10:12:55Z** used projected fields with a 200-record cap per query and fails rather than truncates. See `qa-artifacts/first-use-20260930/retained-aggregate.json` and the local read-only probe.

| Retained Business cohort | Accounts | Currently profile complete | Completion timestamp recorded | Subscription source |
| --- | ---: | ---: | ---: | --- |
| Founder-operated Business | 1 | 1 | 0 | internal QA |
| Explicit controlled test/reviewer Businesses | 2 | 0 | 0 | internal QA / internal beta |
| Unclassified acquisition origin | 1 | 1 | 1 | Stripe |

All four current Business-role records have public-account finalization provenance, and all predate analytics deployment. There are **zero newly retained Business accounts since analytics deployment**, not proof of zero attempted signups. The Admin/internal namespace is separate and is not added to the Business cohort.

Across the subscription collection, five records say active: one Stripe source, three internal QA/beta sources, and one without a recorded source. One retained positive LIVE subscription-payment receipt exists and is not flagged internal certification. That proves a retained payment record, **not an organically acquired customer or a conversion from the measured period**. No provider charge was initiated or re-read.

The four Business workspaces contain nine CRM contacts (all in the Founder-operated cohort), five successful operations receipts (three campaign-list lifecycle operations and two availability saves), no retained contact-import receipts and no schedule items in the selected collections. These are inventory facts, not first-use success counts. The controlled cohort has three own-team campaign records; five Founder campaign records omit `executionMode`, so this report does not silently classify them as marketplace activity or completion. Historical data can be incomplete; absence in these records is not proof a person never used a feature.

One wallet has a pending-checkout marker. Its existence is not an attempt count, current abandonment claim or new sale. Narrow Cloud Run log queries for signup finalization and subscription checkout since analytics deployment returned no HTTP-request entries; signup had six lifecycle/log entries without an HTTP status. This query is not a complete historical attempt ledger.

## Transition and test evidence

Live `/businesses` inspection confirms both Get Started links target `/#/login`. The current retained browser session then showed “We could not verify your session. Please retry.” No sign-out, session deletion or customer write was performed. This is a controlled existing-session observation, not a diagnosis of fresh-user signup failure. The browser exposed no captured error/warning detail to establish its cause.

The new local widget observation executes the actual `LoginScreen` Create Account control inside `AppRouterDelegate`, using mocked Firebase initialization and no form submission. It establishes that the registration form appears while `currentConfiguration` stays `/login` and the pushed route has no name. A second observation uses existing named navigation to `/create-account`; the form appears and Back returns to login. These observations document today's defect and route capability; they do not claim a correction is deployed or complete browser acceptance.

Validation in this pass:

- **49 Node tests passed**, including nine GA4 privacy/page tests, signup transaction/idempotency fixtures, public Core availability, profile completion and subscription authority/contract cases.
- **8 Firestore emulator billing tests passed** with fake Stripe responses: incomplete/active transitions, positive invoice receipts, wrong mode/price/customer denial, duplicate/concurrent event handling and no campaign/Wallet balance mutation. Emulators shut down after the run. These are server-authority tests, not browser checkout tests or Firestore Rules acceptance.
- **20 Flutter tests passed; 1 failed.** The failure is an existing stale assertion in `launch_membership_material_routes_test.dart` expecting `ScaledCircle Printing — Coming Soon`; the current widget uses `Scaled Circle Printing — Coming Soon`. It was recorded and left outside this investigation's product scope. The two new navigation observations passed. Profile save/reload/error tests use local callbacks, not real profiles.
- Analyzer is clean for the new observation test. Dependency lock is unchanged. No production application file was edited.

## The two skipped browser harnesses

Both remain **unverified**, not passing. They use `RUN_FIREBASE_EMULATOR_INTEGRATION` and are skipped when it is false. This pass did not rerun them against production or claim their prior skips were successes.

1. `apps/mobile/test/campaign_zones_permission_emulator_test.dart`: synthetic approved Business, seeded draft and Auth/Firestore emulators; tests a tenant-bound map and permission denial. It does not cover public signup, verified identity, profile completion, membership purchase or first CRM action. Its skip leaves that browser map/Rules boundary unverified, but it does not invalidate the separate local registration observation.
2. `apps/mobile/test/flyer_campaign_zone_end_to_end_emulator_test.dart`: synthetic approved Business, seeded geography, catalog → flyer form → saved campaign/Zone. It still expects legacy controls such as Material Quantity and Create & Define Zones. Current web Flyer rendering delegates to `CampaignPlannerScreen`, and campaign entry includes server workspace/profile checks. The runner only checks Auth/Firestore emulators; the current callable-backed planner requires appropriate local authority/function fixtures too. Enabling the flag alone does not supply current-path acceptance. This is the more relevant gap if the first useful action chosen is campaign planning.

Neither harness is a complete public-account → profile → Core action → membership browser test. Do not gate the route-only recommendation on an unrelated mapping rewrite, but do not use either skipped harness to certify the acquisition journey.

## Ranked corrections

1. **Make Business signup entry explicit using the existing route.** Point public Business Get Started to `/#/create-account`, retain a distinct Log in action for existing members, and use named navigation for web Create Account. Preserve Business role, referral handling, startup/verification authority, return/back behavior and all opt-outs. This removes a demonstrated detour and allows the already-allowlisted page counter to see form entry. It does not prove account success or require a new analytics event/platform.
2. **Add a read-only first-use projection to the existing Admin overview.** Join maintained account-finalization, profile-completion, committed action and subscription/invoice authorities internally. Keep Founder/reviewer/comped/unknown cohorts explicit; retain unknown timestamps instead of inventing dates. Separate own-team plans, marketplace plans, Business-reported completion and reviewed marketplace work. Exclude automated imports/lifecycle cleanup from a user-completed first-action metric unless explicitly defined as its own action. Export only aggregate non-identifying summaries; no identity join with GA4 is necessary.
3. **Retain checkout attempt outcomes using the existing operation/audit mechanism.** Bind the existing logical request ID to request accepted, provider session created, safe failure and authoritative activation, with idempotency. Do not treat wallet pending state, an open Stripe page or a return URL as paid. Preserve all financial/provider behavior. This fills a missing stage; it is not permission to change checkout economics or initiate checkout.

## Smallest first change and review boundary

Recommend correction 1 first: the Business registration route and links. Scope is **web Hosting only**, no new tracking configuration, Functions, financial changes or new native build. Shared Flutter source changes, if needed, belong in the isolated web worktree with web-specific behavior; they must not merge automatically into the frozen native candidate. No implementation or deployment is included in this pass.

Before release, convert the defect observation into a regression requiring Create Account to advance to the named route, and add the actual public Business link test. Verify reload/back, Business role, referral/return-route behavior, and one sanitized `/create-account` page view without duplication. Re-run existing denied-consent/GPC/DNT/private-route tests. Use Auth/Firestore/Functions fixtures and a mocked Stripe adapter for account finalization, profile retry and membership transition; no LIVE signup or checkout is needed. Record browser acceptance separately from widget/server fixtures.

The larger outcome projection can follow within the existing Admin surface. Until a correctly separated real cohort exists, report counts and evidence coverage rather than claiming the route change increased conversion.

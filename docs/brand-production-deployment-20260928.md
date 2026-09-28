# Scaled Circle spelling-only production deployment

Completed September 28, 2026. The approved web branding is live at https://scaledcircle.com. This does not rename installed native apps or external provider/store accounts.

## Source and deployment

- Final reconciled deployment source: `6f99cc628071d0549bd9c9abec0a8501533ae742`.
- Founder-approved artwork/web source: `66f8dfdeb6abe72ad47cb317006b8756803a8bcd`. Web bytes did not change during server reconciliation.
- Hosting: `sites/scaled-circle/versions/94449182c64a1df1`, released `2026-09-28T12:33:00.020Z`.
- Served main bundle SHA-256: `5b2ab3924e7a912c7a7a4d1f3ce3a269df67e8fb3a799db2f089d937d3eed11c`.
- [Hosting readback](qa-artifacts/brand-deployment-20260928/hosting-readback.json): all 15 checked bundle/static/asset files matched; both historical and new versioned images were checked. Hosting configuration stayed unchanged. All 322 compiled source inputs matched the reviewed package.
- [Exact 28 function revisions and source verification](qa-artifacts/brand-deployment-20260928/deployed-functions.json). Each is ACTIVE; generation-pinned deployed source matches its prepared overlay, and configuration/IAM match its own production baseline. Exactly these 28 revisions changed; no neighboring function revision changed.

The function changes are authored brand text, template-version selection and future sender/template pins. Each package began with that function's current deployed archive. This avoids replacing newer application logic with an older worktree snapshot. Dependency locks and untouched source files match the original archive. The Stripe webhook change is confined to `billing_communications.js`; charge/refund/payout logic and provider settings are unchanged. No research function was redeployed.

See [reconciliation](brand-deployment-reconciliation-20260928.md) for archive-specific differences and the additional job-alert sender version pin. Unversioned existing job alerts retain their legacy sender; new jobs snapshot the new sender. Stored subject/body and send authority remain unchanged.

## Live visual and navigation evidence

- [Public desktop](qa-artifacts/brand-deployment-20260928/public-desktop.png) and [390-pixel public view](qa-artifacts/brand-deployment-20260928/public-narrow.png): approved spaced wordmark, clear spacing, no observed clipping. Public menu opened; logo link returned to the app.
- [Business Home](qa-artifacts/brand-deployment-20260928/business-home-narrow.png) and [Campaigns](qa-artifacts/brand-deployment-20260928/campaigns-narrow.png): current production app, existing authorized Attractive Remodel session. Header/menu naming and navigation work. Existing empty campaign state remains truthful.
- Account → Business Profile opened with saved information and service-area guidance. No field was changed and no Save was used. The complete profile correctly has no incomplete-profile banner. Incomplete/member/save-refresh states remain covered by existing tests, not a new production save.
- Production page title, accessibility labels, OG/Twitter site name and image metadata use Scaled Circle and the new versioned 1200×630 social image. The original sales copy/disclosure hierarchy was not rewritten.
- The authenticated session redirects the login URL to Business Home. Logged-out login/signup visuals remain verified by the actual local production-build [login](qa-artifacts/brand-20260928/login-narrow.png) and [signup](qa-artifacts/brand-20260928/signup-narrow.png) renders; no fresh production login/signup acceptance is claimed. No account was signed out or created for branding QA.
- Temporary viewport override was reset and the temporary QA tab closed; the user's original tab/session was preserved.

## Queued and historical content

[Read-only before/after comparison](qa-artifacts/brand-deployment-20260928/queue-preservation.json), 12:30:56–12:55:36 UTC: all twelve canonical Social jobs have identical projected records, approval/content bindings and schedules (six scheduled, two approved, four existing authority-review cases). Other inspected active Email/artifact/push/legacy-Social queues are empty. No send, retry, regeneration, reschedule or reapproval was initiated.

New wordmark/social URLs are versioned. Original URLs still return byte-identical artwork. Legacy landing-page/email/push/weather/artifact/job-alert rendering follows its pinned revision or legacy fallback. Future versions use the new spelling; customer-authored text and immutable approved content are not substituted. No branding-specific renewed approval is required for the twelve retained Social jobs.

## Preserved production repairs and authorities

Fresh production inventory confirms these remain ACTIVE and unchanged:

| Function | Preserved revision |
| --- | --- |
| businessOperationsV1 | businessoperationsv1-00014-ruk |
| searchBusinessProfilePlaces | searchbusinessprofileplaces-00002-sos |
| getBusinessOnboarding | getbusinessonboarding-00003-ziy |
| getBusinessWorkspaceContext | getbusinessworkspacecontext-00005-wax |

The web package retains own-team attribution, onboarding/21061, campaign management, Zone Intelligence and freehand recovery. Own-team live completion/attribution acceptance remains pending; no suitable existing record was manufactured. No people, campaign, completion or profile record was saved. Existing accepted physical freehand evidence was not replayed.

Verified door-hanger geometry, subscriptions, entitlements, prices, financial authority, payout controls, Email/Social operations and research scheduling are unchanged. No Rules, IAM, account, secret-binding or provider-setting change was made.

## Validation and remaining scope

Accepted review coverage: 196 focused tests, affected analyzer clean and production-config web build passed. Reconciliation adds one sender-version test plus three existing job-alert tests: 200 distinct focused tests in the combined evidence. Thirteen focused sender/template tests and seven preservation invariants passed during preparation; nine fixtures against the exact prepared deployment modules passed. Changed JavaScript files passed syntax checks. No production message or material generation was needed.

Technical identifiers intentionally retain their existing spelling: domains/URLs/routes, email addresses/handles, Firebase and database IDs, API/schema fields, package/bundle identifiers, OAuth client/redirect settings and repository/file/class names. Historical sent/published/approved/financial/consent records retain their original content. Legal entity wording remains Scaled Circle LLC where applicable.

Frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. Native strings/assets/display-name patch remain a separate future reconciliation. No native CI/build, build number, upload or store submission occurred. External store/OAuth/provider display names remain pending separately; no rename, reconnection or verification restart was performed.

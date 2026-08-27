# Landing Page + Form V1 architecture

Status: architecture and implementation plan only  
Runtime status: not implemented; keep customer-facing status **Coming Soon**  
Baseline reviewed: production release `c7cdc7ac0a66c4b5247be64488b38f64eddbe9b0`

## Product contract

Landing Page + Form V1 is a focused, mobile-first sales funnel for a local Business. It is not a general website builder. A Business can produce a professional page without a logo, photographs, reviews, or technical knowledge; can edit the result through a small set of safe controls; and remains the final publisher.

The five destination/creation paths converge on one product contract:

1. **Build it for me** uses authoritative Business and campaign facts and a deterministic conversion template. Missing assets do not block creation.
2. **Use my logo and photos** uses approved Business-owned media, including partial asset sets.
3. **Match my website or social presence** proposes a Brand Snapshot from an authorized public source. It cherry-picks legitimate identity and assets; it never clones the source or silently publishes suggestions.
4. **Customize it myself** exposes content, CTA, media, bounded section ordering, visibility, and a small reviewed style set—not CSS, breakpoints, grids, or arbitrary HTML.
5. **Use my existing website** skips page creation. Tracking remains an independent on/off choice.

Assistance has three levels over the same draft model: **I'll customize it**, **Help me improve it**, and **Do it for me**. Suggestions create a reviewable proposal and never overwrite or publish the Business's content silently.

Tracking is explicitly independent of destination:

| Destination | Tracking on | Tracking off |
|---|---|---|
| ScaledCircle page | Attribution Response Asset points to the stable page URL; visits and unique responses can be measured | Direct stable page URL; visit analytics are not collected or shown |
| Existing website | Attribution Response Asset redirects to the validated external URL | Direct external URL; ScaledCircle response analytics are unavailable |

When tracking is off, the UI says “Response analytics are off for this destination.” It omits visit, unique-response, and conversion-rate cards rather than showing misleading zeros. A submitted ScaledCircle form still creates the minimum operational record and lead needed to deliver the inquiry; that fact must be disclosed separately from optional visit analytics.

## Renewal-grade customer journey

The shortest first-use flow is **Destination → Starting point → Content → Contact form → Preview → Publish**. It resumes from the last durable draft after reload, Back/Forward, sign-out, or reopening. The first screen explains the outcome and estimated effort; it does not ask for branding before the Business sees value.

A page uses only the sections supported by real inputs:

- hero: value proposition, primary visual when available, and primary CTA;
- offer/value: services, offer, and customer benefit;
- proof: only legitimate supplied photographs, testimonials, credentials, licensing, guarantees, or claims;
- why this Business: real differentiators and service area;
- project visuals, process, FAQ/objection handling, secondary CTA, and final CTA when useful.

The CTA model is a reviewed enum: request estimate, get quote, call, text, book, visit website, or custom. Each CTA has validated label, action, and destination. Unsupported provider-mediated actions are unavailable rather than simulated. Call/text links use a verified Business number; external links must be public HTTPS URLs.

Form V1 has a fixed identity/contact core and a small field catalogue. Name plus at least one of phone/email is the recommended default, with an optional short request. Additional fields are bounded enums such as service type, ZIP/postcode, preferred contact method, and requested timeframe. No arbitrary form builder, file upload, payment, sensitive identity, or hidden marketing opt-in is included. Required transactional contact disclosure, Privacy link, and optional marketing consent are visibly separate.

Mobile is the primary response experience: compact hero, legible type, stable responsive image crop, 44px-or-larger targets, appropriate input modes/autocomplete, visible focus and field errors, keyboard-safe form controls, no horizontal overflow, and no intrusive sticky CTA. Desktop uses the same content/version and responsive renderer. Preview switches between accurate desktop and 390×844 presentations of the same render contract.

The no-asset template derives quality from type, spacing, iconography, factual services, and CTA hierarchy. It never invents a logo, project image, review, certification, award, tenure, license, guarantee, statistic, or result.

## Canonical data model

### `landingPages/{pageId}`

Mutable owner-scoped control record: `businessUid`, optional `campaignId`, random immutable `publicSlug`, lifecycle (`draft`, `published`, `paused`, `archived`), `draftVersionId`, `publishedVersionId`, tracking mode (`off`, `first_party`), optional `responseAssetId`, created/updated/published timestamps, and last actor. The slug is at least 128 bits of cryptographic entropy and is never a Firestore ID.

### `landingPages/{pageId}/versions/{versionId}`

Immutable bounded creative snapshot: schema version, page ID, Business/campaign references, source mode, sanitized funnel sections, CTA, embedded form schema, approved asset references, Brand Snapshot version, style token, SEO/share fields, content digest, creator, and timestamps. Publishing points the page to a version; later edits create another version. Interactions and leads retain the published version ID, so creative performance remains attributable. Rollback means publishing an earlier valid version, not mutating history.

### `businessBrandProfiles/{businessUid}`

Reusable **Brand Snapshot V1**, separate from page content: display name, approved logo/media references, primary/secondary colors with accessible fallbacks, service categories, tone enum, approved claims, service area summary, CTA/contact preferences, source references and rights affirmation, extraction status/confidence, version, and timestamps. It may be initialized from the existing Business Growth Profile but must not duplicate Business identity or media binaries.

The existing `socialMediaLibraries/{businessId}/items/{mediaId}` and `social_media/...` storage authority should be generalized into a shared Business media library through a reviewed migration. Landing Page V1 stores references, not copied binaries. Existing records remain readable during migration.

There is no `landingPageForms` collection in V1: the bounded form definition belongs to an immutable page version. There is no parallel CRM or general `formSubmissions` collection. Contact data is written to existing `salesLeads`; its audit event goes to `salesActivities`; attribution goes to `responseInteractions` and `attributionConversions`. A privacy-minimized deterministic submission receipt may exist only if required for idempotency and abuse control, with a documented retention period and no duplicate customer profile.

## Server authority and public delivery

A narrow `landing-page-core` codebase is appropriate: Gen 2, Node.js 24, `us-east1`, and zero secrets for the deterministic first batch.

Minimum coherent interfaces:

- `getLandingPageWorkspace`: authenticated Business owner or Admin read; bounded list/detail, draft, versions, Brand Snapshot projection, tracking state, and trustworthy metrics.
- `mutateLandingPageDraft`: command-based create/update/regenerate-proposal/asset selection/content change; owner-scoped, validated, and version-producing. It never publishes.
- `transitionLandingPage`: owner-scoped publish, pause, resume, archive, or reviewed-version rollback with lifecycle preconditions and an audit event.
- `renderLandingPage`: public HTTP renderer for `/p/<opaque-slug>`. It resolves only a published page, emits sanitized server-rendered HTML, and returns safe unavailable states for paused/archived/unknown pages.
- `submitLandingPageForm`: public HTTP endpoint with page/version binding, validation, throttling, idempotency, and the internal lead bridge described below.

Do not create one callable per field. Agents later use the same draft command API with explicit actor identity, proposal status, and approval requirements; they do not mutate Firestore or scrape Flutter UI.

Firebase Hosting adds `/p/**` and the narrow form endpoint before the Flutter SPA fallback. Landing pages must not load the Flutter application bundle. The renderer uses a reviewed component/template catalogue, escaped text, no arbitrary HTML or script, a restrictive CSP, responsive images, minimal form JavaScript, and a stable canonical page URL. Preview uses an owner-authorized, short-lived preview token or authenticated preview endpoint, is `noindex`, and renders the same version contract.

V1 SEO is bounded: title, description, canonical URL, Open Graph/Twitter metadata, and an explicit indexing policy. Campaign pages default to `noindex` until the Business intentionally enables discoverability under a reviewed policy. Social previews use an approved image or neutral brand treatment; they do not generate unsupported claims.

Performance budgets for staging certification: server response p75 under 500ms in-region under normal load; HTML and critical CSS under 120KB uncompressed; initial JS under 35KB compressed; no unoptimized image above 1MB; responsive image dimensions and lazy loading below the fold; no unexpected layout shift. Exact budgets may be tightened after measured staging evidence.

## Attribution and lead boundary

Attribution Foundation V1 remains canonical. Tracking-on publishing creates or selects one permanent Response Asset whose destination is the stable `/p/<slug>` URL. Updating the page changes its published version but not the Response Asset or QR. Tracking-off publishing creates no Response Asset.

A tracked visit follows `/r?code=...` → `resolveTrackedResponse` → stable page URL and creates an immutable interaction. A direct untracked visit creates no visit interaction.

A legitimate form submission binds server-side to the page, published version, Business, campaign, and (when present) Response Asset/interaction. The public client cannot choose those authorities. The current authenticated `bridgeResponseLead` callable must **not** be weakened for anonymous forms. Instead, extract its transaction into a shared internal domain function used by both `bridgeResponseLead` and `submitLandingPageForm`. The form authority creates exactly one form-submit interaction/receipt, one `salesLead`, one `salesActivities` entry, and one lead conversion for an idempotency key. It preserves first/last attribution and clearly records whether the visit was tracked or direct. A visit alone never creates a lead.

Business metrics with tracking on: authoritative visits/interactions, deduplicated unique responses, legitimate leads, and lead conversion rate only when the denominator is valid. Tracking off: lead count can be shown as “form inquiries” with a disclosure, but visit and rate metrics are unavailable. Admin uses the existing bounded Attribution/read-model pattern for pages published, failures, live/test traffic, leads, and feature health. No tenant enumeration or client fan-out is introduced.

Feature health is outcome-based, not deployment-based: render success/error, form acceptance/rejection by safe category, lead-bridge success, page version, last actor certification, and last successful event. It contains no submitted contact data.

## Security, privacy, abuse, and media

All draft, version, Brand Snapshot, lifecycle, and analytics reads/writes are server-authoritative. Business can manage only its own pages; Admin gets the established authoritative Admin role; Scaler, Affiliate, cross-tenant Business, spoofed Admin, and signed-out management calls are denied. Public Firestore reads/writes remain denied; public rendering and submission enter only through bounded HTTP authorities. New collections require explicit deny-by-default Rules tests even when only Admin SDK accesses them.

Public form controls include strict allowlisted fields and lengths, normalized email/phone, payload/body limit, per-page and privacy-preserving per-network throttles, honeypot, minimum-human-time signal, replay/idempotency token, duplicate-contact handling, and escalation to a bot challenge only after measured abuse. Raw IPs are not persisted; any fingerprint is salted, purpose-limited, and rotated. Errors never expose Function names, Firestore paths, provider messages, or stack traces. A duplicate submission returns the original safe success result.

Founder/legal decisions are required before implementation for contact-data retention, deletion/access handling, exact disclosure and consent language, controller/processor responsibilities, and whether any abuse fingerprint is retained. V1 must not claim a self-service deletion/export workflow that does not exist.

Uploads reuse owner-scoped Storage and server registration after the shared-media migration. Enforce MIME signature, JPEG/PNG/WebP initially, size/dimension limits, ownership, safe filenames, orientation stripping, responsive derivatives, compression, crop metadata, alt text, status, and deletion/reference checks. Publishing rejects missing/quarantined assets. No arbitrary remote hotlinking. Website/social imports require an affirmative rights statement and store source URL, retrieval timestamp, candidate/approved status, and content hash. Candidate material is never published until the Business approves it.

The existing bounded website suggestion path already provides useful SSRF defenses (public HTTPS only, DNS/private-address rejection, bounded fetch). It can seed textual suggestions, but it is insufficient for robust image ownership, JavaScript-heavy sites, or social platforms. V1 first implementation needs no new provider. Production-grade website/social extraction or browser rendering requires a separate Founder-approved provider/capability, legal/terms review, rate/caching policy, and secret review. AI generation remains behind a provider-neutral `ContentSuggestionProvider`; deterministic templates work with no AI secret.

## Reuse and retirement audit

| Existing system | Classification | V1 decision |
|---|---|---|
| Attribution Foundation (`responseAssets`, interactions, conversions, overview) | LIVE, canonical | Reuse without reopening its public contract; extract only a shared internal lead transaction if required |
| Sales Funnel (`salesLeads`, `salesActivities`) | LIVE, canonical | Reuse as the only lead/CRM authority |
| Business Growth Profile V1 and website suggestion | PARTIAL, reusable | Seed page facts and Brand Snapshot candidates; retain SSRF protections |
| Social media library/upload and registration | PARTIAL, reusable | Generalize to shared Business media authority; migrate names without copying binaries |
| Business profile/contact/service area | LIVE, canonical inputs | Reference safe projections; do not duplicate identity |
| Admin/Business Attribution screens | LIVE/BETA, reusable | Link page metrics into their read models; Landing Pages remain a separate primary Business surface |
| `campaignTrackingCodes`, `provisionCampaignTracking`, `campaignTracking`, `renderCampaignLandingPage` | LEGACY duplicate authority | Freeze for compatibility, inventory live records, migrate destinations/analytics deliberately, then remove; do not extend for V1 |
| Campaign tracking Flutter screen/service | LEGACY customer path | Replace with the new destination/tracking choice and safe errors; do not rely on Rules failure |
| Managed Growth/social AI workflows | PARTIAL/future assistance | Reuse proposal/approval concepts, not provider state or autonomous publishing |

The legacy path is a launch-blocking duplication if exposed alongside V1 as an equally maintained landing-page/tracking product. Migration must preserve existing links, explicitly map or redirect them, and prove no double-counting before retirement. It must not destructively delete historical events.

## Independently discovered gaps

### P0 before LIVE

- One canonical tracking/page authority; legacy campaign tracking must be isolated and migrated without broken URLs or duplicate analytics.
- Anonymous form-to-lead transaction, idempotency, tenant binding, abuse protection, and suppression handling must be proven end to end.
- Immutable published-version identity and stable opaque URL with pause/rollback/recovery.
- Truthful tracking-off semantics, including the operational distinction between an untracked visit and a submitted inquiry.
- Server-rendered public delivery with XSS/CSP, mobile, accessibility, preview parity, performance, and safe error proof.
- Rights affirmation, no arbitrary hotlinking, asset ownership/reference validation, and graceful no-asset flow.
- Legal decision on form disclosure, consent, retention, access/deletion, and privacy fingerprinting.
- Clear ownership of inbound leads: landing-page inquiries belong to the page Business and cannot enter ScaledCircle corporate Sales prospecting as unrelated acquisition leads.
- Publish must fail closed if campaign/Business, CTA, form destination, asset, or tracking references are invalid.

### P1

- Shared media naming/migration, derivative generation, crop quality, alt-text workflow, and orphan cleanup.
- Accurate preview/reopen history, autosave conflict handling, draft recovery, and support diagnostics.
- Page-level feature health and bounded Admin drill-down.
- Website/source quality scoring with candidate approval and stale-source handling.
- Low-volume notification for a legitimate new inquiry, using existing transactional authority and suppression/rate policy; absence does not block lead creation.
- Clear test/draft/live analytics classes so QA never inflates customer performance.

### P2

- More reviewed templates/styles, assisted section ordering, richer crop controls, page duplication, and historical creative comparison.
- Business-facing analytics drill-down and carefully defined benchmark guidance after sufficient sample size.
- Expanded approved form fields and integrations only after measured demand.

### Future

- Custom domains, A/B testing, dynamic personalization, full SEO site tooling, autonomous publishing, AI-generated imagery, call/email forwarding providers, appointment providers, social-platform ingestion, and autonomous optimization.

## Implementation sequence

The fastest credible path combines the authority and visible funnel rather than postponing the form—the form is the value boundary.

1. **Contract and public core:** schemas, state machine, shared internal lead transaction, stable slug, deterministic renderer, safe form endpoint, Rules/index plan, legacy inventory/migration tests, and emulator security/abuse tests.
2. **First customer-visible candidate:** Business wizard with Build it for me/no-asset path, one excellent responsive template, simple content/CTA/form controls, accurate desktop/mobile preview, durable draft/reopen, publish/pause, optional tracking, and form-to-lead. This is the first staging deployment candidate.
3. **Shared media and Brand Snapshot:** generalize existing uploads, logo/photo selection, derivatives/crop/alt text, approved claims, and reusable brand profile.
4. **Authorized source assistance:** current safe website text analysis first; candidate assets and suggestions with rights affirmation. Social/browser-provider support remains disabled pending approval.
5. **Assistance and analytics:** provider-neutral improvement proposals, Business page metrics, Admin aggregate/feature health, and agent read contracts. No autonomous publish.
6. **Legacy migration and LIVE review:** preserve/redirect existing campaign-tracking URLs, prove no double counting, complete hosted renewal-grade certification, then reassess Coming Soon → Beta/LIVE.

The first implementation batch needs `landing-page-core`, the two Hosting rewrites, the landing page/versions/brand schema (Brand profile may be deferred until batch 3), an explicit Firestore deny block, any narrowly proven indexes, Flutter Business management UI, public renderer/template, and focused tests. It requires zero provider secrets and no financial authority.

## Staging certification contract

Certification must use real staging authorities and cover:

- role matrix: Business owner and Admin allowed as designed; cross-tenant Business, Scaler, Affiliate, spoofed Admin, and signed-out management denied;
- all five creation/destination paths, including no assets and an unavailable source-analysis fallback;
- draft autosave, reload, reopen, Back/Forward, version creation, preview parity, publish, update without URL/QR change, pause, resume, archive, and rollback;
- the four destination/tracking combinations, with no Response Asset when off and no misleading zero analytics;
- tracked visit versus unique response, direct untracked visit, one legitimate form lead, repeated-submit idempotency, visit-not-lead, first/last attribution, Business lead visibility, and Admin aggregate correlation;
- form validation, duplicate contact, suppression/opt-out, honeypot, rate limit, payload limit, malformed input, XSS/HTML, cross-page ID tampering, invalid CTA/destination, missing asset, and safe retry/error copy;
- asset ownership, rights affirmation, MIME/signature/size/dimension limits, crop/derivative quality, deletion/reference behavior, and no remote hotlink;
- desktop and 390×844 mobile, keyboard-only use, screen-reader semantics, contrast, labels/errors/focus, image alt text, keyboard appearance, slow network, empty/loading/error/success states, and no overflow/layout shift;
- measured HTML/JS/image budgets, cache behavior, social metadata, canonical/noindex behavior, feature health, bounded query counts, and test/prelaunch separation;
- full backend, architecture, Flutter, Rules, Storage Rules, package-installability, analyze, build, scan, and `git diff --check` suites with no ignored launch-critical failures.

No real outbound communication, payment, provider connection, or financial mutation is needed for staging certification. Use a non-deliverable internal QA contact and suppress it from real outreach.

## Quality gates

- **Technically Correct architecture ready: YES.** Canonical ownership, state, public delivery, lead transaction, tracking modes, security, and version identity are defined.
- **Customer Ready UX contract ready: YES.** First use, control, preview, resume, no-asset, mobile, failure, and truthful tracking behavior are explicit.
- **Renewal Grade path credible: YES.** The plan delivers a professional page and real lead outcome before adding providers or expansive automation, and defines measurable hosted gates. The feature itself remains Coming Soon until those gates pass.

## Safety record

- Production changes: **ZERO**
- Staging changes: **ZERO**
- Provider actions/secrets: **ZERO**
- Financial or outbound actions: **ZERO**
- Git push: **NO**


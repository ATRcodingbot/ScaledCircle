# Customer Ready audit

Audit started 2026-09-07 at source `bd939dd0d61f91de2ee891ac0c28267fe7e650d9`.
This is an evidence register, not a launch certification. Source presence does not prove deployed or physical behavior.

## Canonical launch gates

1. Complete this bounded Customer Ready pass and regression checks.
2. Complete iOS and Android physical QA independently; resolve actual P0 failures.
3. Separately authorize and perform one small legitimate LIVE Business payment; verify authoritative funding reconciliation.
4. Final signup, login, support and mobile sanity checks.
5. Launch; preserve navigation and core workflows, then improve incrementally.

Printing and postcards are **not launch blockers**. Show Coming Soon, explain intended workflow, and provide no ordering/checkout until fulfillment is certified. Keep Social Manager, Lead Generation, Business Assistant and Ad Manager visible as Beta; approval-controlled and without ROI claims. No print/provider API work belongs in this pass.

## Priority register

| Priority | Finding / contradiction | Evidence | Required disposition |
|---|---|---|---|
| P0 | Device lifecycle proof incomplete | Founder physical QA still pending; brief iOS start/stop is not walking certification | Preserve fixtures/history and report devices separately; do not claim complete |
| P0 | LIVE production funding smoke not yet certified | Current campaign payments were Stripe TEST | Separate Founder-controlled LIVE test after preceding gates; no payment in this pass |
| P0 | Marketing output and execution are conflated | Homepage says “Real people deliver results” and “GPS and proof confirm delivery” | Explain recorded route/evidence and review; do not guarantee distribution, leads or sales |
| P0 review | Pay certainty could be read as unconditional pay | Existing completion authority has qualification/proportional calculation branches | Describe accepted fixed compensation and disclosed completion terms; never change economic authority to match copy |
| P0 review | Pre-assignment logistics privacy requires field-level verification | Exact material addresses occur in campaign and handoff model; document reads cannot redact fields | Verify discovery projection AND client-readable documents before claiming full privacy isolation; do not infer a leak solely from source field names |
| P1 | Five public URLs return identical non-indexable shell | Direct production HTTP read: all 200, 4,411 bytes, same title, canonical `/`, zero HTML H1, Flutter bootstrap | Extend existing static delivery candidate; unique meaningful HTML/metadata, retain authenticated hash routes |
| P1 | Sitemap omits four marketing routes | Production sitemap contains only `/` and `/i` | Include actual crawlable canonical pages when released |
| P1 | Two similarly prominent role CTAs and missing post-proof Business CTA | PublicLandingScreen hero / HowItWorks | Primary Business action three times; secondary Scaler and tertiary explanation; stable navigation |
| P1 | Uncertified Google Business scheduling example | Public homepage sample calendar says Google Business ready to schedule | Replace with supported, explicitly illustrative planning state |
| P1 | Plan feature names imply execution | Local plan includes call tracking, postcard campaign management and payouts | Keep fees/entitlements unchanged; qualify capabilities and reconcile catalog before publishing prices |
| P1 | Managed Growth bootstrap has finally but no error state | `_load` in managed_growth_screen.dart | Visible recoverable error + Retry, no silent unhandled initialization failure |
| P1 | Printing language can imply fulfillment | Physical material creation says platform handles print details | Distinguish downloadable design from provider ordering; Coming Soon print/mail |
| P1 | Optional analytics incorrectly collapsed into results | Established Meta baseline has unavailable metrics and incomplete buckets | Preserve NO_DATA / UNAVAILABLE / ERROR and period provenance; never infer totals |
| P2 | Mutual preferences / reputation V1 not certified | No end-to-end review completed yet | Prepare minimal identity/evidence design; no fabricated scores or extra scoring engine |
| P2 | Restricted access adaptation not certified | Route/coverage authority exists, but exclusion adjudication not established | State access safety plainly; defer denominator/economic changes to separately tested maintained authority |
| P2 | Scaler-to-Scaler referral accounting absent | Existing affiliate service handles Business attribution only | Stage isolated accounting/attribution tests; no production activation or payout |

## Claims truth matrix

LIVE means the named bounded capability is present, not unrestricted availability or certified outcomes. BETA denotes restricted/emerging capability. Unverified rows remain open evidence tasks.

| Surface | Classification | Actual capability / proof | Copy / gate |
|---|---|---|---|
| Smart Mapping | BETA | Source server geometry/workload validation; staging route guidance; real-device walking proof pending | Suggested territory; estimates are estimates, not guaranteed access or delivery |
| Scaler marketplace | BETA | Maintained application and assignment; staging authoritative records verified | Access and job availability vary; show area/work/pay before applying |
| GPS verification | BETA | Authoritative tracking/checkpoints and bounded native recovery implemented; device retest incomplete | Records route evidence; does not by itself prove every home received material |
| Job Room | LIVE, access-gated | Maintained assignment/evidence/review authority, separately certified production completion path | Review evidence and communicate; do not expose internal IDs as product guidance |
| Wallet / payments | BETA pending launch smoke | TEST success/failure paths certified; real production smoke outstanding | Available means authoritative eligible funds; distinguish TEST context and operation/account state |
| Printing | COMING_SOON | Physical material service reports download available, print coming_soon/not_connected | Intended flyers/door-hanger ordering; no ordering or provider promise |
| Postcards / direct mail | COMING_SOON | Draft/design only; mail coming_soon/not_connected | Intended territory → quantity/cost review → approved mailing, unavailable now |
| Social Manager | BETA | Founder-bounded X/Meta schedules armed; proof being collected | Recommendations, approval, status, results, Pause; no general autonomy or ROI promise |
| Lead Generation | BETA | Planning and response foundations; broad production execution not certified in this audit | Emerging premium capability; do not promise delivered leads |
| Business Assistant | BETA | Business context / planning foundations | Recommendations require review; no implied authority to spend or contact others |
| Ad Manager | BETA | Advertising strategy explicitly planning only | No ad launch/spend until separately authorized supported execution |
| Tracking phone | COMING_SOON | No provider certification established in this audit | Do not imply provisioned tracking numbers or call attribution coverage |
| AI / property / weather | BETA | Qualified planning uses Business context and official facts | Separate facts from interpretation; no fabricated confidence or guaranteed results |
| Attribution | BETA by source | Supported QR/link/form foundations; absent evidence is not zero conversions | Show source, period, availability; only supported observed events |
| Affiliate links / codes | BETA | Existing immutable Business referral attribution and self-referral rejection | Attribution exists; accounting explicitly reports unavailable |
| Affiliate commissions | HIDE executable payout actions | `commissionAccountingAvailable: false`; current model rate can differ from new proposed policy | No earnings claim or payout activation; stage new qualifying-revenue policy separately |
| Marketplace reputation | HIDE invented metrics | No verified production sample establishes ratings/performance | Persistent identity + truthful empty state; subjective reviews distinct from evidence |

## Coverage and remaining verification

- Public source reviewed: homepage, Business/Scaler funnels, pricing labels, existing SEO generators.
- Direct deployed public HTTP evidence collected for five routes plus robots and sitemap. Browser rendering/a11y and post-change staging checks still required.
- Printing design/download retained; fulfillment providers must remain disconnected.
- Authenticated async surfaces still need systematic error/Retry audit: signup, profile, campaign creation/funding, application/assignment, Job Room, Wallet, Social approvals, printing.
- Search Console ownership/indexing and field Core Web Vitals are **not verified** by source or a single HTTP request. Do not mark PASS without actual evidence.
- Current source/deployed production publish semantic drift remains deferred. Do not deploy shared Functions as part of a client cleanup.
- Armed Social records, Stripe Connect, production financial authority and QA evidence are out of mutation scope.
- Pre-launch visual consistency does not authorize any major navigation redesign.

## Implementation boundary

First batch: public claims/CTA hierarchy, fulfillment/Beta descriptions and an explicit Managed Growth load-error state with regression coverage. Extend existing SEO machinery rather than replacing the app. Stage-only deployment until compatibility/evidence is complete. No new provider API, no production financial mutation, no affiliate payout activation.

Do not mark **SCALEDCIRCLE — CUSTOMER READY CANDIDATE** until outstanding verification, regression and deployment evidence are recorded.

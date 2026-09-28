# Scaled Circle spelling review — 2026-09-28

Historical text-only checkpoint. The completed artwork and queue-compatibility review is in [brand-package-review-20260928.md](brand-package-review-20260928.md). Findings below describe the earlier candidate, not the final package.

Prepared only. No Hosting/Functions deployment, provider console change, native build, message send, artwork regeneration or production record mutation was performed.

## Source and preservation

The review branch `codex/brand-spelling-review` starts from `01eaaeb`, the current profile-deployment evidence checkpoint over approved profile fix `c2f8c9f`. The source commit containing this document is the review candidate. It retains campaign management, mapping/freehand and profile/onboarding repairs. The separate My Own Team worktree remains untouched at `16dabbf907baf54487ade9c453db278e4c38fa21`.

The frozen native checkout remains untouched at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`.

## Prepared customer-facing changes

- Public homepage/funnels, signup/login/onboarding, profile completion, Business/Scaler/Admin presentation, support/legal prose and billing display copy.
- Campaign planning, mapping, Property Intelligence and Zone recommendation labels; future material/map presentation and print metadata.
- Future transactional, billing, referral, lead-reply, alert and notification template text and sender display names.
- Page titles, SEO/social metadata, structured data, PWA display names and prepared store descriptions/reviewer material.
- Canonical spelling is **Scaled Circle**; legal entity remains **Scaled Circle LLC**. No trademark symbols or new legal claims.

Shared Flutter display strings are identifiable under `apps/mobile/lib/`; web builds consume them now, while installed native applications require later reviewed replacement bytes. `docs/brand-native-display-name-20260928.patch` is an **unapplied** iOS display-name/purpose-copy and Android label proposal. Actual iOS/Android platform files have not changed.

## Assets requiring a decision

Visually inspected PNGs; all assets retain their original bytes:

| Asset | Finding / disposition |
| --- | --- |
| `apps/mobile/assets/brand/scaledcircle-lockup-dark-surface.png` | Joined ScaledCircle primary wordmark. Approved spaced compact artwork needed. |
| `apps/mobile/assets/brand/scaledcircle-lockup-light-surface.png` | Joined ScaledCircle primary wordmark. Approved spaced compact artwork needed. |
| `apps/mobile/web/social/scaled-circle-social-preview.png` | Embedded joined wordmark. Approved social-preview update needed. |
| `apps/mobile/assets/brand/scaledcircle-secondary-marketing-lockup.png` | Existing approved spaced marketing variant retained in its intended uses. Its tall symbol/tagline layout is not substituted into compact headers. |
| `apps/mobile/assets/brand/source/scaledcircle-approved-artwork.png` | Existing spaced source artwork with symbol/tagline retained unchanged. |

No logo was redrawn, stretched, regenerated or reconstructed from typography. Updating semantics/alt labels does not fix embedded pixels. Old primary wordmarks remain visible until approved replacements exist. Historical campaign/social artwork is not rewritten or certified as newly branded.

## Intentional unchanged occurrences

Domains/subdomains, email addresses, URLs/QR destinations, routes, Firebase `scaled-circle`, package `com.scaledcircle.app`, GA4 ID, opt-out keys, API/event/schema fields, paths, class names/imports, provider User-Agent headers, startup markers, OAuth/signing/Stripe identifiers and dependency lock are preserved.

Protected historical/fixed-plan modules include `admin_launch_candidate_evidence`, `attribution_foundation`, `staging_payment_certification`, `scaledcircle_launch_plan`, `x_first_publish`, `social_internal_managed`, `social_internal_topics`, `assistance_proposal` and `internal_growth_workspace`. Technical `dogfoodBrand` / `fulfilledBy` discriminators remain unchanged. Customer-authored business names and records were not traversed or rewritten. Accepted legal-consent code/version records remain intact; current descriptive copy changes do not change legal terms.

## Approval/history caveat for future deployment

Ordinary stored email subject/body payloads are not rewritten. Some landing-page email jobs and mobile notification policy paths render copy at delivery time. Their template source edits are prepared, **not cleared for blanket deployment over existing queued/approved jobs**. Before promotion, inspect only affected queue/version contracts and preserve old approved rendering or create an explicitly reviewed new version for future jobs. Fixed approved social/email plans remain unchanged and need new reviewed versions, not historical edits.

External console proposals are display-only: App Store/Play public title, Google OAuth consent display, and provider sender/product/portal display names where applicable should say Scaled Circle. Existing TestFlight group names, app/account names and IDs stay as-is until separately reviewed. No provider setting, subscription product, verification, connection or store metadata was changed here.

## Validation

145 distinct focused tests passed:

- 90 Node tests: transactional email, billing communications, physical marketing rendering, landing pages and web analytics.
- 38 Flutter tests: brand assets, public Business/Scaler funnels, legal/trust routes, Zone Intelligence summary and profile completion. Includes narrow layouts and 2× text; these are widget checks, not physical-device acceptance.
- 10 Python public metadata/delivery tests.
- 7 new spelling invariants: presentation-only normalization, unchanged URLs, preserved assets/native files, historical identities/locks, static overlay protection/idempotence and technical analytics/startup identifiers.

Affected Flutter analyzer: 70 items, no issues. Production-config Flutter web build passed (63 seconds, maintained lock, no native build). `git diff --check` passed.

`tools/brand_spelling_review_manifest.json` records presentation files and normalized baseline hashes plus preserved native/asset/history/identity/lock hashes. `tools/test_brand_spelling_review.py` verifies those invariants. This checks that maintained source edits are brand spelling only rather than authority/price/permission changes.

Local browser review inspected the actual prepared Business public page and a locally rendered synthetic welcome email, without sending. Public copy/title and future email text use Scaled Circle; primary header image still shows the joined wordmark as documented. Email remote image rendering was not certified; its text rendering was checked. Authenticated component presentation is covered by widget/source validation; no fresh production authenticated rebrand is claimed because nothing is deployed.

Local evidence under `.firebase/brand-review/`: `business-page.png`, `email-preview.png`, `flutter-final.log`, `templates-final.log`, `analyzer-final.log`, `web-build-final.log`, invariant/public-page logs. These are local review evidence, not marketing screenshots or production acceptance.

## Narrow future deployment package

`tools/prepare_brand_spelling_hosting.py` combines the reviewed Flutter web build with the retained current production Hosting package and overlays spelling only on five maintained static public pages. It does not rerun older marketing copy generators, touch customer landing pages or deploy. Local prepared output: `.firebase/brand-review/public`.

Before an approved future deployment, revalidate the current production baseline to avoid overwriting intervening repairs. Deploy Hosting and only affected maintained server/template consumers after resolving the late-rendered queue/version caveat. Do not deploy every Functions codebase merely because mirrored template files are present. No rules, IAM, financial settings, provider identities, data migrations, native reconciliation or store changes belong in that deployment.

The rebrand is **not live**. Existing binaries, primary wordmarks, provider displays and immutable historical content can still use ScaledCircle.

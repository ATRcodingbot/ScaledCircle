# Physical Marketing Creative Quality V1

## Release boundary

This batch separates technical print readiness from customer-facing marketing
readiness. A physical material version becomes `ORDER_READY` only when its
immutable print master passes `PhysicalPrintPreflightV1`, its immutable content
and layout pass `PhysicalMarketingReadinessV1`, and the owning Business approves
that exact version. A printable but weak or incomplete version remains
`READY_FOR_REVIEW`; it is visible for remediation but cannot be approved or
presented as order ready.

The batch is provider-free. It creates no print order, mail piece, Stripe charge,
provider request, API credential, or fulfillment fee.

## Canonical inputs and templates

The server resolves Business name, Growth Profile services, Brand Profile
colors and approved logo, verified Business phone when explicitly selected,
the published Landing Page, the canonical Response Asset, and an exact approved
media revision. Client-supplied authority flags, arbitrary services, raw phone
values, and unapproved media are not accepted.

Door-hanger template behavior is immutable and versioned:

- `door_hanger_service_hero_v1` — visual-first service marketing;
- `door_hanger_offer_action_v1` — available only for the exact Business-authorized offer;
- `door_hanger_professional_services_v1` — bounded service presentation with graceful no-media layout.

Each version snapshots `templateId`, `templateVersion`, approved copy, Business
brand inputs, selected media identity/content hash/origin, layout policy,
Landing Page version, Response Asset, and artifact hash. Historical approved
versions are not changed by future template work.

## Marketing readiness

The server checks canonical Business identity, placeholder-free content,
canonical service membership, a working CTA and destination, template-required
media/offer inputs, immutable media binding, verified contact sourcing, required
regions, CTA safe placement, visual margins, readable type, contrast,
front/back differentiation, and unsupported claims. Obvious fixture patterns
such as `555` phone numbers, example domains, Lorem ipsum, sample/test companies,
and dummy/fixture copy fail closed. Unsupported rankings, guarantees,
credentials, ratings, discounts, and experience claims also fail closed unless
a later explicit authority is designed for them.

Approved `generated_service_concept` media retains its origin and receives a
visible “Conceptual service visual — not completed work” disclosure in the
print master and review proof.

## Print readiness preserved

The existing provider-neutral print contract remains intact: exact 3.5 × 8.5
inch trim, versioned bleed/safe/die exclusion, front/back order, PDF/X-4,
embedded fonts, CMYK output intent, effective 300 DPI for placed media, vector
QR with quiet zone and physical scan validation, deterministic content and
artifact hashes, and immutable owner-private downloads.

Three deterministic two-sided QA masters are maintained under `output/pdf`:
Service Hero, Professional Services, and Offer / Action. Each is rendered to
full-resolution proof images and checked by an actual QR decoder. The local
visual review rejected the initial sparse pass and accepted the rebalanced
front/back layouts only after the empty-region, CTA association, and wordmark
handling defects were corrected.

## Customer and Admin experience

The Business workflow is bounded to product, canonical campaign/service,
versioned template, exact approved media, suggested/editable copy, published
Landing Page destination, optional verified phone, review, approval, and
download. The review card shows both exact sides plus separate “Print quality”
and “Marketing content” states. Print and mail fulfillment remain clearly
unavailable until provider integration is separately certified.

Admin diagnostics expose bounded template/version, print and marketing status,
marketing failure keys, selected media revision/origin, Response Asset,
Landing Page identity, and artifact hash. They do not expose private imagery,
provider credentials, or recipient data.

## Local certification

- Physical marketing focused authority/renderer/QR suite: 17/17 pass.
- Focused physical, attribution, creative-media, OpenAI-mocked, and Landing Page suite: 111/111 pass.
- Curated backend full suite: 368/368 pass.
- Firestore Rules emulator: 23/23 pass.
- Storage Rules emulator: 10/10 pass.
- Flutter physical marketing UI: 4/4 pass, including desktop and 390 × 844.
- Flutter full with explicit local environment: 390 pass, 1 intentionally skipped.
- Flutter analyzer: no issues.
- Generated Function packages: 18/18 clean-installable; deployment preparation and module-load architecture pass.
- Production dependency audit: no high/critical advisory; existing Firebase/Google `uuid` chain remains moderate maintenance debt.
- Changed-source credential scan and `git diff --check`: pass.
- Production-regression bundle SHA-256: `9811A081EDD7367C252EA5B509CD0A6AC03D7A9CA669A1287C6936E0398C0BD3`.
- Staging bundle SHA-256: `CF98BA5321470132A10A38F9B47D4F706F7EBAB2EE79D5755A1347C564E0A899`.

## Staging promotion and hosted evidence

The five existing `physical-marketing-core` authorities were promoted to
staging and are ACTIVE on Gen 2 / Node.js 24 in `us-east1` under the existing
staging runtime identity. Hosting was deployed last:

- Hosting version: `b1fa90430720a5dd`;
- Hosting release: `1788208789101000`;
- live staging bundle SHA-256: `BEDD91331302AD960DB8A583F30AEFEFE2F982033A8D2E274DECC0E784FFDBA3`;
- production-regression bundle SHA-256: `7ED82836EB548151178FFC3423FF4D5FF6F8C93F5BFC173A150D226B580FBF5C`.

Desktop and 390 × 844 hosted checks prove the release is truthful and
fail-closed. The current Attractive Remodel staging QA actor has no canonical
Business name, Growth Profile, approved logo, or approved media revision. The
server therefore rejects creation before material/version/artifact writes. The
UI now explains the exact maintained remedy (`Grow → Growth Plan → Set Up Your
Growth Profile`) and disables Create rather than showing a generic failure.
The existing pre-remediation fixture is projected as `READY_FOR_REVIEW`, with
`Print quality Ready` and `Marketing content Needs attention`; it no longer
shows or exposes a print-ready download even though its historical stored
status predates the marketing-readiness gate.

No canonical Business facts or media were fabricated or directly seeded. As a
result, the requested fresh Attractive Remodel Create → Review → Approve →
Download actor proof remains blocked on customer-owned canonical Business
profile and approved-media setup. Provider traffic, print/mail orders, and
physical Stripe charges remained zero. Production deployment remains out of
scope.

## Tracking Phone V1 integration point

`trackingPhoneAssetId` remains an optional immutable material-version reference.
A later provider-neutral tracking-phone authority should own number inventory,
Business-number verification, forwarding configuration, campaign/material/page
bindings, provider events, call interaction evidence, retention, idempotent
reconciliation, and immediate disablement. The physical renderer should receive
only a server-verified display number snapshot; clients must never supply raw
tracking authority or provider credentials.

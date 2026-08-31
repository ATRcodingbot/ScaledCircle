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

Customer-visible media has an additional fail-closed boundary. Low-fidelity
`deterministic_fixture`, `test_fixture`, and `renderer_fixture` media cannot
pass marketing readiness merely because it is printable. It is eligible only
when it is an exact approved revision intentionally selected by the Business.
This keeps deterministic renderer fixtures useful without presenting them as
customer-quality Service Hero artwork.

Approved `generated_service_concept` media retains its origin and receives a
visible “Conceptual service visual — not completed work” disclosure in the
print master and review proof.

## Area-contextual service visual authority

Generated Service Visuals now accepts an optional server-derived,
campaign-bound `ServiceAreaVisualContextV1` snapshot for an intended material
slot. The client may send only a Business-owned `campaignId` and bounded slot;
it cannot supply or override geography traits. The server derives the snapshot
from the owned campaign or confirmed Growth Profile area and records a stable
digest. Allowed context is limited to non-personal place labels and aggregate
physical traits such as general property style, lot character, terrain,
vegetation, climate/season, and urban/suburban/rural context.

Specific addresses, resident/recipient identity, contact data, and protected
or socioeconomic demographic traits are rejected. The image brief requires
physically plausible professional workmanship, an aspirational but attainable
property, no mansion bias, no people/logos/text/claims, and a crop-aware
portrait composition that preserves both the service and regional property
context in `door_hanger_service_hero`. This authority is locally certified with
mocks only; no staging image request has been dispatched.

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

- Area-context, OpenAI-mocked, and physical-marketing focused suite: 47/47 pass.
- Focused generated-package, media, Growth Profile, and physical suite: 108/108 pass.
- Curated backend full suite: 369/369 pass.
- Firestore Rules emulator: 23/23 pass.
- Storage Rules emulator: 10/10 pass.
- Flutter physical marketing UI: 6/6 pass, including desktop and 390 × 844.
- Flutter full with explicit local environment: 392 pass, 1 intentionally skipped.
- Flutter analyzer: no issues.
- Generated Function packages: 19/19 clean-installable; deployment preparation and module-load architecture pass.
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
fail-closed. Through the maintained Growth Profile customer form, the staging
Business saved only its Founder-confirmed canonical name, `Attractive Remodel`.
No unrelated profile field was changed and no Firestore seed was used. The
Physical Marketing capability refreshed normally after return/reopen.

A fresh material used the canonical `Seasonal cleanup` service, the existing
published Landing Page and Response Asset QR, no phone, no offer, no credential
claim, and the `door_hanger_professional_services_v1` no-image fallback. The
exact two-sided proof passed print readiness, marketing readiness, Business
approval, QR decode, desktop, and 390 × 844 checks and reached `ORDER_READY`.
The hosted output is a professional truthful no-image fallback; it is not used
as evidence that the low-fidelity Service Hero fixture is customer ready.

No clearly attributable Attractive Remodel logo or approved project image was
found in the read-only repository/workspace audit. Provider traffic,
print/mail orders, and physical Stripe charges remained zero. Production
deployment remains out of scope.

## Tracking Phone V1 integration point

`trackingPhoneAssetId` remains an optional immutable material-version reference.
A later provider-neutral tracking-phone authority should own number inventory,
Business-number verification, forwarding configuration, campaign/material/page
bindings, provider events, call interaction evidence, retention, idempotent
reconciliation, and immediate disablement. The physical renderer should receive
only a server-verified display number snapshot; clients must never supply raw
tracking authority or provider credentials.

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

## Final-render copy normalization production closeout

The final Creative Quality V1 blocker was a renderer-boundary defect rather
than a canonical-service-data defect. The bounded `customerServiceLanguage()`
authority already produced natural customer language, but PDF and SVG proof
fallbacks inserted raw canonical service values directly into labels,
supporting copy, service lists, the back headline, and the project-focus block.
That produced the production phrase “Ready to plan your build decks project?”
even though the immutable version correctly remained unapproved.

Release `48b7ca8d98cde62cad970f6d5cb49b838a838bfc` routes every final-render
service insertion through the existing bounded authority. The canonical
Business service remains `build decks`; the exact customer-facing production
render now uses `deck`, `deck project`, and “Ready to plan your deck project?”.
The same final-render assertions cover `Seasonal cleanup`, `Landscaping
improvements`, and `Fences` in the PDF evidence model and the exact SVG source
used to generate WebP/JPG proofs. No AI, provider, offer, credential, or claim
generation was added.

The historical defect evidence remains immutable and unapproved:

- material `material_1400e28a27cede66644e27965bcf7d6d36d5718d`;
- version `version_037cf003a524f3e602a9647c8cc341b451715b7f`;
- artifact `artifact_f9142685acfed15ba55b1f06cd9335d3aed7edd4`;
- status `READY_FOR_REVIEW`; approved version absent.

Staging deployed only
`physical-marketing-core:preparePhysicalMarketingVersion`. A fresh
`Seasonal cleanup` Professional Services material reached `ORDER_READY` through
the normal Attractive Remodel workflow:

- material `material_ccb5f8b0c3cb23ed5b2f31ba5616657846449c32`;
- version `version_c09aac232c88fc1d34d816288e672ecedcdce6a4`;
- artifact `artifact_59a02b7addb3ad96a361d6f1fb03cd8482f70f1e`;
- canonical artifact hash
  `84dac221a4650db66751507ec98f45801f7eef5865d5bc7b106b7e21bf310a5a`;
- exact PDF byte SHA-256
  `f5bc21cb8972093668aa084a6703d85f34031d4ff5ae7a88d4dc3b7d2ee13b72`;
- exact back proof: “Ready to plan your seasonal cleanup?”;
- print readiness, marketing readiness, QR decode, approval, PDF/JPG download,
  desktop, and 390 × 844: pass.

Production then deployed only
`physical-marketing-core:preparePhysicalMarketingVersion` from the same source.
The Gen 2 / Node.js 24 function is ACTIVE as revision
`preparephysicalmarketingversion-00003-yur`. A fresh production material used
only Attractive Remodel's canonical `build decks` service, the Professional
Services no-image layout, its existing Landing Page and Response Asset, and no
phone, offer, generated image, or new claim:

- material `material_a5ee8ad07caf0929b8d9d1c3afb5551e0163f62a`;
- version `version_bcaaace6ee81876287cbedd772cbc166e7cf16c4`;
- artifact `artifact_12af04306886c6f6d979b9d6ccad9ee94c3f9309`;
- canonical artifact hash
  `2b8b4ed5432053736668375a64820a181d3a9f18082b76c6850ab092be1d5241`;
- content hash
  `5faa0f00f11a60fbc59d7fb142e2e929f61284ddc2a99c13138c6554899823cd`;
- exact PDF byte SHA-256
  `0127a3a7d696529d33109402b5f90161eaac9e404de42504e68b63147e201adb`;
- exact digital-front JPG SHA-256
  `64cbead9d7ad7b219aeee841c5db4050e9d8640f74bb0f049b2181294a40404d`;
- Response Asset `response_98573ba46a6c7230939911b53eee34da83181590`;
- Landing Page `V6LVp8VsxADGrMb8g5FN`, immutable version
  `VRtN8Mqn3Mc4uOixcY5q`;
- headline “Build the deck your home deserves”;
- back headline “Ready to plan your deck project?”.

The exact production proof and two-page PDF/X-4 master passed print readiness,
marketing readiness, QR decoding, Business approval, `ORDER_READY`, PDF/JPG
downloads, desktop, and 390 × 844. The QR was decoded locally and its immutable
version linkage was verified without creating a production tracking
interaction.

Local closeout certification passed 22/22 physical-marketing renderer tests,
369/369 backend tests, 6/6 focused Flutter tests, 394 full Flutter tests with
one intentional skip, Flutter analysis, 23/23 Firestore Rules tests, 10/10
Storage Rules tests, generated-codebase verification, production web build,
credential/provider scan, and `git diff --check`.

Generated Visuals remained `providerGenerationEnabled=false` and
`rolloutMode=founder_only`. Its three historical provider-accepted jobs,
125,165 actual cost micros, three settled reservations, and zero outstanding
reservations were unchanged. This closeout created zero OpenAI/PostGrid/4over/
FedEx calls, zero print/mail orders, zero physical Stripe charges, and zero
additional provider spend.

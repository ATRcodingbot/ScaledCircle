# Physical Marketing Execution V1

Status: provider-free foundation hosted and production-certified on 2026-08-31.

Certified implementation candidate: `0e1b57c4235aa72f7d43cc8d333380c8215d49e6`.

## Authority and data model

Physical Marketing is a new server-owned authority. It does not use the legacy
client-writable `marketingAssets` collection as immutable, order, or financial
truth.

The provider-free collections are:

- `marketingMaterials`: mutable Business draft root and status pointer.
- `marketingMaterialVersions`: immutable exact content, campaign, destination,
  Response Asset, approved-media, ProductSpec, and content-hash snapshot.
- `printReadyArtifacts`: immutable PDF/JPG/proof paths, artifact hash, and
  preflight evidence.
- `marketingMaterialApprovals`: immutable Business approval decision.

Rules also reserve server-only authority for future
`fulfillmentPricingPolicies`, `printQuotes`, `printOrders`, `mailCampaigns`,
`mailAudienceSnapshots`, `providerReceipts`, and
`physicalFulfillmentPayments`. No Business or Admin client writes any of these
collections directly.

Five provider-free `physical-marketing-core` callables own the customer and
operational workflow:

1. `getPhysicalMarketingWorkspace`
2. `mutatePhysicalMarketingMaterial`
3. `preparePhysicalMarketingVersion`
4. `approvePhysicalMarketingVersion`
5. `getPhysicalMarketingOperations`

Creation is request-idempotent. Preparing a version snapshots the exact draft,
campaign, Landing Page version, approved media revision, Response Asset, and
optional future tracking-phone reference. Editing the draft cannot mutate an
existing version. Approval advances only the material pointer to
`ORDER_READY`; it does not create a quote, payment, print order, or mail order.

## ProductSpec and artifact contract

`PhysicalProductSpecV1` provides bounded profiles for:

- 3.5 × 8.5 inch door hangers, one or two sides, standard circular-hole die,
  14pt coated target, and quantities 100/250/500/1000/2500.
- 4 × 6 and 6 × 9 postcards, both sides required. A 6 × 11 profile exists but
  remains hidden pending qualification.
- 8.5 × 11 flyers, one or two sides.
- 3.5 × 2 business cards, one or two sides.

The canonical master is a two-page PDF/X-4 document where applicable. The
renderer uses embedded fonts, CMYK operators, an embedded output intent,
deterministic metadata, and a vector QR. It derives the web proof and digital
JPG from that exact master. It does not label a low-resolution raster as 300
DPI; placed media below 300 effective DPI fails preflight.

Door-hanger preflight verifies exact trim plus bleed, safe-area evidence,
standard-hole exclusion geometry, page order, CMYK/output intent, embedded
fonts, effective raster resolution, QR quiet zone/contrast, decoded tracked
destination, content hash, and artifact hash. The die hole is not drawn into
customer artwork; proof evidence carries the exclusion geometry separately.

The local QA master is `output/pdf/physical-marketing-door-hanger-v1.pdf`.
It is two pages, PDF 1.7 / PDF/X-4, 3.625 × 8.625 inches including bleed, and
its rendered QR decodes to the ScaledCircle tracked destination. The exact
file SHA-256 for the current candidate is
`6B4481B9A1ADBBDA528194B32236036713064F27261D3A4C309177660FAD56CE`.

## Download, attribution, and privacy

The owning authenticated Business may fetch only an exact known object under
`physical_marketing_private/{businessUid}/{materialId}/{versionId}/...`.
Anonymous users, other Businesses, and ordinary Admin clients cannot read the
private artifact; no client may list, replace, or delete it.

Each version uses the existing ScaledCircle Response Asset authority with a
request-idempotent QR identity. The attribution envelope records campaign,
material, material type, immutable creative version, Landing Page, and Landing
Page version. Recipient PII is never placed in the QR URL. The future order and
mail models retain integration points for `mailCampaignId` and
`trackingPhoneAssetId` without making either live in this batch.

The Business experience is deliberately bounded: choose a campaign, service,
offer/headline, CTA, contact details, Landing Page, optional approved media,
and a theme; then review, approve, and download the print-ready PDF or digital
JPG. `Ship to Me` and `Pick Up Nearby` remain visibly unavailable/Coming Soon.

## Pricing and provider contracts

`PhysicalFulfillmentPricingV1` is server-authoritative and versioned:

- `fulfillmentFeeRateBps = 1000`
- `fulfillmentFeeMinimumMinor = 499` USD
- percentage base = print subtotal + shipping/delivery + postage
- excluded from percentage base = tax and payment-processing expense
- download fee = zero

The mock provider contract proves deterministic quote expiration and
idempotent order creation without provider traffic. Future adapters expose
capability discovery, artifact validation, quote, preview, create/get/cancel
order, and status reconciliation. Provider IDs remain operational references,
not primary product truth. Unknown provider outcomes never trigger blind
redispatch.

Refund accounting is append-only. Cancellation before dispatch, provider
rejection before production, and provider-caused failure refund the applicable
customer amount and associated fulfillment fee. Partial provider credits reduce
the affected pass-through amount and fee proportionally. Customer-caused
reprints are new orders unless an explicit goodwill credit is recorded.

No merchant payment, Stripe capture, provider credential, recipient upload,
real print, or real mail behavior exists in this candidate.

## Provider qualification evidence

### PostGrid — primary addressed-mail sandbox candidate

Official documentation establishes separate test/live keys; test-mode orders
are isolated and never mailed. The API accepts PDF or HTML, supports 6×4,
9×6, and 11×6 postcards, address verification, previews, status retrieval,
webhooks, cancellation while an order remains `ready`, and order-creation
idempotency. PostGrid must still supply an approved test account/key, current
commercial pricing, production onboarding terms, data-retention terms, and
platform/reseller acceptability before an adapter can be certified.

Sources:

- https://guides.postgrid.com/print-and-mail/api/overview/
- https://guides.postgrid.com/print-and-mail/api/sending-postcards-using-the-api/
- https://guides.postgrid.com/print-and-mail/api/tracking-your-orders-using-the-api/

### 4over — shipped print / door-hanger qualification candidate

Public product evidence confirms 3.5×8.5 door hangers, front/back color,
14pt/16pt and gloss stocks, coatings, standard/arch/star dies, 4- or
7-business-day production, 300 DPI CMYK files, PDF preference, 0.125-inch
total bleed, and a 1.1875-inch standard hole. 4over's API update publishes
door-hanger product code `14PT-DHUCD-3.5X8.5`, and 4over markets automated
order submission to trade-only/reseller customers.

Public evidence does not yet establish the exact private quote schema,
provider proof contract, pickup selection through API, cancellation endpoint,
webhooks, sandbox, or idempotency behavior. It is therefore not classified as
fully integrated. Required next evidence is a qualified reseller account,
private API documentation/test credentials, commercial terms, and written
confirmation of platform/reseller and pickup capabilities.

Sources:

- https://4over.com/standard-door-hangers
- https://4over.com/api-updates-testpage
- https://go.4over.com/resources/4over-api-your-connection-to-next-level-growth

### FedEx Office — integrated local-pickup discovery candidate

FedEx Office publicly confirms a guided Print API program for direct ordering
from third-party applications, REST APIs, documentation plus staging and
production access, and organizational/platform integrations. Its consumer
surface offers pickup or shipping, but the public Print API page does not
confirm the API product catalog, door-hanger/die-cut support, store search,
pickup quote/order fields, payment model, cancellation, status/webhook shapes,
or idempotency. Those items require the official consultation and private API
materials before `Pick Up Nearby` can be called integrated.

Source: https://www.office.fedex.com/default/print-integrations-api

No provider account, API key, contract, paid billing, minimum spend, provider
request, quote, order, print, mail piece, or customer charge was created during
this foundation batch.

## Certification and deployment boundary

Local certification includes deterministic PDF evidence, QR decoding, pricing
math, provider-mock idempotency, authorization, immutable hashes, Rules
emulators, backend regression, full Flutter tests, analyzer, both environment
builds, secret scan, dependency audit, and clean generated-package installs.

The staging manifest is limited to:

1. Firestore Rules (new collections remain client-denied).
2. Storage Rules (exact-path owner read for private artifacts).
3. The five `physical-marketing-core` callables.
4. Hosting last.

No index is required. Production deployment, provider credentials, live print
or mail, and payment capture remain outside this release.

The certified staging deployment is:

- Hosting version `bcdaf502fffc4e2c`, release `1788198842184000`.
- `main.dart.js` SHA-256
  `FE13D287B9F516E9565BD645F77CC602FF79D02B99CB4622071A895A8B545FEB`.
- Five ACTIVE Node.js 24 `physical-marketing-core` Functions in `us-east1`,
  source hash `2d46e27b5599b9b466032f7e68d07b127ed91f0d`, with zero secret binding.
- Firestore and Storage Rules compile and emulator suites pass. The private
  artifact path is owner-readable by exact object only and remains anonymous,
  cross-tenant, list, write, and delete denied.

Attractive Remodel staging completed the normal Business flow for a 3.5 × 8.5
two-sided door hanger: Create draft → prepare exact proof → PDF/X-4 preflight →
approve immutable version → download Print-ready PDF and Digital JPG. The exact
authenticated proof was visible on desktop and at 390 × 844. Both download
controls completed through authenticated byte retrieval and the browser showed
`Download started. Check your downloads.` `Ship to Me`, `Pick Up Nearby`,
`Print`, and `Print + Mail` remained visibly unavailable/Coming Soon.

Hosted certification found and corrected one projection defect before final
approval: customer-visible ProductSpecs omitted their stable server validation
IDs. The canonical workspace now emits a versioned `specId`, and focused tests
prove every visible ProductSpec round-trips through server validation. A safe
category-only operational diagnostic records validation categories without
Business content, recipient data, or credentials.

Provider traffic, provider quotes/orders, mail pieces, print orders, payment
captures, customer charges, new credentials, and additional spend were all
zero during staging certification.

## Production provider-free release

Founder-authorized production promotion completed on 2026-08-31 from exact
implementation candidate `0e1b57c4235aa72f7d43cc8d333380c8215d49e6` and
documentation descendant `4b7d01195179bb3abeb5173ce46cf3d8a091a584`.
Deployment was ordered Firestore Rules, Storage Rules, the isolated
`physical-marketing-core` codebase, then Hosting last. No index, unrelated
Function, secret, provider credential, payment behavior, or manual IAM role
change was included.

The exact production release is:

- Firestore ruleset
  `projects/scaled-circle/rulesets/8dae6adc-b688-4387-aec5-d473ca454c5e`,
  content SHA-256
  `76B3EBE4F564281F61F5C0C0EF42054EAAF4C6564DF37060723C19901D1D83CE`.
- Storage ruleset
  `projects/scaled-circle/rulesets/4344c84b-9c8a-41a3-8de2-53d119f68d6d`,
  content SHA-256
  `A06AB1974FF51DC46D7B91126E7EB22C1F703122FE14A944899C013DFF8AD8A7`.
- Five ACTIVE Node.js 24 Functions in `us-east1`: the exact five callables
  listed under Authority and data model. All use isolated codebase
  `physical-marketing-core`, source hash
  `15c73f4e5f9ea1c808540c7a2865d290a24206a6`, and production runtime identity
  `1010956217112-compute@developer.gserviceaccount.com`.
- Hosting version `47cc0099ce8f21e5`, live release
  `1788203041501000`, and live bundle SHA-256
  `CCAD45C3446BBBFB3C0221FBC2AF6F6F0866F2679C6C49BB79166968F00B87D4`.
  Both `scaledcircle.com` and `scaled-circle.web.app` returned that exact
  bundle.

Attractive Remodel completed the normal production Business flow for a
legitimate 3.5 × 8.5 two-sided `Build decks` door hanger: Create, prepare
proof, review, approve, and download both the Print-ready PDF and Digital JPG.
The authenticated exact proof and downloads passed on desktop and at 390 ×
844. `Ship to Me`, `Pick Up Nearby`, `Print`, and `Print + Mail` remained
disabled and visibly Coming Soon.

The immutable production evidence is:

- Material `material_dcaa15d5569521594af80e6466786d19ee3f09c6`, status
  `ORDER_READY`.
- Version `version_04af1bf207e4c2a817dd42bbf9e1d5c816286c28`, ProductSpec
  `door_hanger_3_5x8_5`, content hash
  `3f928ad1d60d25a02d2673bb6d3d3f65a74ef6a9bb3b5a69366c3c0659a03be8`.
- Artifact `artifact_092b17cc0f567f27820916c624ebe67ed79262d1`, format
  `PDF/X-4`, artifact hash
  `13bcc89f6f863658f28be27455045effb341cabeadecb84c768afec64f4cc2f6`.
- Two exact proof hashes:
  `53aa70c4eede0793186eacbc5f37d6686d4cad285a7bf633c5a1e0707eb871d7`
  and
  `ff52e6facaddd0690abc14000893e061543c48052f4f61b649d930667e9b52b8`.
- Preflight status `pass`: exact trim, 0.0625-inch bleed, safe area,
  die-cut exclusion, two-page order, effective resolution, CMYK/output intent,
  embedded fonts, QR quiet zone and physical size, content bounds, and artifact
  hash all passed. The QR remained vector and the tracked destination completed
  the required matrix round-trip validation.

An unauthenticated request for the exact private PDF returned HTTP 403. The
deployed Storage Rules content exactly matches the cross-tenant-denial ruleset
that passed the 10/10 Storage emulator suite. There is no public download token
or provider URL in the Business model.

Production reconciliation after actor proof records one material, one version,
one artifact, and one approval; `printQuotes`, `printOrders`, `mailCampaigns`,
`providerReceipts`, and `physicalFulfillmentPayments` remain empty. Generated
Service Visuals remains `founder_only` with
`providerGenerationEnabled=false`. Real physical print orders, real mail,
physical Stripe charges, fulfillment-provider requests, and provider spend
remain zero.

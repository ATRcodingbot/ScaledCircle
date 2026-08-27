# Attribution Foundation V1

Status: **LOCAL / STAGING-FIRST CANDIDATE — NOT DEPLOYED**

## Boundary

Attribution V1 extends the maintained `salesLeads` and `salesActivities` CRM rather than creating a second lead system. A zero-secret `attribution-core` owns four narrow authorities:

- `createResponseAsset`: verified Business creates its own asset; Admin may create for an explicitly selected Business.
- `resolveTrackedResponse`: public `/r?code=<opaque>` redirect that records a privacy-minimized immutable interaction before redirecting to an approved HTTPS destination.
- `bridgeResponseLead`: converts an explicit contact request tied to a real interaction into a `campaign_response` Sales lead and immutable lead milestone.
- `getAttributionOverview`: bounded Business-own or Admin aggregate read model.

QR and tracked links share the same opaque tracked URL. Flutter renders that URL as a QR code when the asset type is `qr`; there is no QR-specific analytics silo.

## Canonical data contracts

`responseAssets` stores server-authored ownership, opaque public code, type, status, HTTPS destination, and the `AttributionFoundationV1` envelope. Initial types are `qr` and `tracked_link`; the contract reserves landing page, phone, email, form, and promo-code types without claiming those providers are implemented.

The channel-neutral envelope supports source/source detail, campaign, Zone, material, material type, creative version, response asset, interaction, and lead references. Public URLs expose only random opaque codes, never Business, campaign, Zone, or Firestore IDs.

`responseInteractions` stores one deterministic daily asset/visitor interaction with server time, immutable attribution, and a one-way visitor hash. Raw IP and user-agent values are not stored. IPv4 is truncated to /24-like input and IPv6 to the first four segments before hashing. Refreshes with the same asset/day/prefix/user-agent dedupe to one interaction. This is an anti-noise signal, not asserted real-world identity.

`attributionConversions` stores immutable, versioned milestones. V1 writes `lead` only when an authenticated Business/Admin records an explicit response lead from an existing interaction. Future signup, subscription, first/repeat funded campaign, and external customer-conversion projections must be derived from or linked to their authoritative records; the public endpoint cannot create them.

`featureHealth/attribution` records successful event count and last successful event time. It is operational telemetry, not attribution or financial authority.

## Metrics and money

The V1 read model reports tracked interactions, unique response hashes, leads, and known conversions. It never labels physical material distribution as impressions. Response rate is intentionally unavailable until an authoritative denominator exists.

Future economic links must keep these values separate:

- subscription revenue;
- campaign GMV (gross customer receipt);
- ScaledCircle platform-fee revenue (currently 20% where the reviewed campaign contract applies);
- Scaler earning, bonus, Stripe fee, transfer, payout, and referral reward.

Unknown customer value remains unknown. No client or public request may mark revenue, paid conversion, or economic truth.

## Security and privacy

Firestore client access to `responseAssets`, `responseInteractions`, `attributionConversions`, and `featureHealth` is denied. Business and Admin access is mediated by callables and authoritative profile roles. Campaign and Zone references are validated against Business ownership. Destinations require HTTPS and reject embedded credentials. The public redirect can select attribution only by a server-issued opaque code.

Precise anti-abuse retention remains a Founder/legal decision. V1 deliberately stores no raw IP or user-agent. Production public QR issuance remains out of scope until staging certification and later promotion approval.

## Agent and opportunity hooks

Business Growth, Sales, Lead Operations, Content/Performance, Referral, Customer Success, and Supervisor agents may later consume `getAttributionOverview` or a reviewed successor projection. They must not scrape Flutter or query/mutate these collections arbitrarily. Evidence-backed opportunities can later reference source, creative, interaction, lead, conversion, confidence, and staleness; no AI opportunity generation or outbound communication exists in V1.

## Staging manifest and dogfood plan

Proposed staging deployment, subject to Founder approval:

1. Functions: `attribution-core:createResponseAsset`, `attribution-core:resolveTrackedResponse`, `attribution-core:bridgeResponseLead`, and `attribution-core:getAttributionOverview`.
2. Hosting: exact candidate bundle, including `/r` rewrite and Business/Admin bounded UI.
3. Firestore Rules: server-only rules for the four canonical collections.
4. Firestore indexes: none required by the initial single-field bounded queries.
5. Storage Rules, secrets, external providers, production, and financial authorities: no change.

Dogfood one clearly marked ScaledCircle Internal QA asset: create through Business UI, render its QR, open the first-party URL, verify one interaction and dedupe on refresh, confirm redirect, then bridge only a harmless explicit QA contact request. No outbound message or economic event is needed.

## Next activation recommendation

**Landing Page + Form V1** is the shortest next activation. It turns existing visits/scans into explicit first-party lead events using the response asset and lead bridge already established. Brand Kit/Creative Proof should follow for production-quality materials; Growth Control follows once enough genuine attribution data exists to prioritize opportunities.

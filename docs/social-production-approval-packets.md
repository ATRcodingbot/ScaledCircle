# Social production approval packets

Status: preparation only. No Response Asset, provider upload, scope request, or publication is authorized by this document.

## P0 — one production X Response Asset

The production campaign and immutable import receipt now exist. The maintained `attribution-core:createResponseAsset` callable enforces `https://scaledcircle.com` for `public_publish`, validates campaign ownership, produces an opaque 24-character code, and is deterministic when `requestId` is supplied.

The intended fixed request is:

```json
{
  "businessUid": "FF1bfDuvtdNjuuC4mc7NdGtk3LC3",
  "requestId": "scaledcircle_x_smart_mapping_v3_public_publish_v1",
  "label": "ScaledCircle X Smart Mapping v3",
  "type": "tracked_link",
  "destination": "https://scaledcircle.com/#/businesses",
  "exposure": "public_publish",
  "attribution": {
    "source": "social",
    "sourceDetail": "x",
    "campaignId": "sc_campaign_brand_launch_md_2026_09",
    "creativeVersion": "sc_x_20260903_mapping_v1_v3"
  }
}
```

Expected URL: `https://scaledcircle.com/r?code=<opaque-production-code>`.

Verification: the Response Asset exists exactly once; `businessUid`, campaign, source, source detail, creative version, destination, exposure, and public origin match; unauthenticated `/r` resolves without a staging hostname; the redirect reaches `https://scaledcircle.com/#/businesses`; a certification request is labeled as certification evidence rather than engagement; X/Meta publication counts remain unchanged.

### Actor blocker

The callable's current self-dogfood bridge requires the authenticated Firebase actor UID to equal the legacy canonical Business owner UID. The real human `support@scaledcircle.com` Firebase identity is distinct, and the project deliberately did not merge or mutate either identity. Do not revive custom-token impersonation.

Safest execution design: an authenticated private Gen2 HTTP one-time authority, hard-bound to the fixed request above, invoked by `support@scaledcircle.com` through service-scoped `roles/run.invoker`, then deleted after the immutable Response Asset is verified. It must accept POST with an empty body only; expose no caller-selectable UID, campaign, version, origin, or destination; remain private; and create no provider state. A source/deployment candidate requires separate review.

Fail closed on an existing nonmatching deterministic asset, campaign ownership mismatch, non-production project, resolver failure, or unexpected side effect. Replay of the matching deterministic request is legitimate reuse; never create a second asset.

## Facebook first-publish packet

- Candidate: `sc_fb_20260904_smart_mapping_v1`
- Known reviewed version: `sc_fb_20260904_smart_mapping_v1_v1`; re-read canonical staging authority before approval because later version lineage was discussed but is not present in this clean source anchor.
- Page: Scaled Circle, `1198660363339503`
- Format: image post
- Known media record: `sc_media_facebook_smart_mapping_20260904_v1`
- Expected SHA-256: `2F453997DD7B59C24AA1246A2E197B3BA05B40817DAA678428BEFEB11C1DB28D`
- Schedule proposal: 2026-09-04 09:15 America/New_York, LOW confidence, INITIAL_EXPERIMENT
- Later permission: `pages_manage_posts`; exact Page identity must be reverified after reconsent.

Blockers: the immutable bytes matching that hash are absent from this repository, no production direct-image URL was found, and the prepared Response Asset is not yet production-safe. Before approval, recover the exact certified bytes from canonical private media storage, verify the hash/dimensions/privacy, publish them to an immutable production media path that returns an image MIME type, create a Facebook-version-specific production Response Asset, render the exact tracked URL in the Facebook copy, and rerun quality.

The first adapter must bind Page ID, content version, media hash, Response Asset, copy hash, and one deterministic job. It must reconcile ambiguous outcomes before retry and store the provider post ID/receipt. No general customer readiness claim follows from Founder/app-role dogfood access.

## Instagram first-publish packet

- Candidate: `sc_ig_20260904_smart_mapping_carousel_v1`
- Known reviewed version: `sc_ig_20260904_smart_mapping_carousel_v1_v1`; re-read canonical staging authority before approval.
- Account: `@scaledcircleapp`, professional account `17841441730285620`
- Format: four-card carousel
- Known media record: `sc_media_instagram_smart_mapping_carousel_20260904_v1`
- Expected aggregate SHA-256: `F910338C14F94300EFEA6FC8E6B337A2D8685F9133C042E5C1978D08D6F55FA9`
- Schedule proposal: 2026-09-04 18:30 America/New_York, LOW confidence, INITIAL_EXPERIMENT
- Later permission: `instagram_content_publish`; exact professional identity must be reverified after reconsent.

Blockers: the four immutable carousel files/hashes are absent from this repository and no production direct-image URLs exist. Recover and verify all four canonical files before any container creation. A feed caption URL is not clickable. Use “Visit the link in our bio to explore ScaledCircle for Businesses” only after read-only verification that the public bio still contains a clickable approved Business destination. If the bio links directly to the Business page, measure provider engagement/profile evidence truthfully and do not claim version-specific Response Asset clicks.

The adapter must create every child container, create one carousel container, publish exactly once, retain all container/media IDs, and never treat partial container creation as publication success. Unknown outcome requires provider reconciliation, not a duplicate carousel.

## Safety state

- X/Meta publications performed by this packet: 0
- Response Assets created by this packet: 0
- scopes requested: 0
- media uploaded: 0
- ads/provider spend: 0

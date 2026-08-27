# Attribution Foundation V1 production release record

## Release identity

- Production deployment date: 2026-08-27
- Deployed and remote candidate: `f9a284f528981a9beb2a0b4c1b3e951b5afd0193`
- Promotion method: non-force fast-forward to `origin/real-completion-proof`
- Product status: **Beta**
- Quality gates: Technically Correct **PASS**; Customer Ready **PASS**; Renewal Grade **PASS**

This record closes Attribution Foundation V1 only. It does not promote unfinished response channels or authorize financial, provider, outreach, lead, conversion, or customer-campaign mutations.

## Function release

Only `attribution-core:getAttributionOverview` changed in the remediation:

| Callable | Before generation / hash | After generation / hash | Result |
| --- | --- | --- | --- |
| `getAttributionOverview` | `1787838590754386` / `7692302468b74ecc20b60c44141c0f8b75909bea` | `1787850202460841` / `f1efc003e620bc8f8637aec984d690b4f4ab728f` | ACTIVE |
| `createResponseAsset` | `1787838512392203` / `7692302468b74ecc20b60c44141c0f8b75909bea` | unchanged | ACTIVE |
| `resolveTrackedResponse` | `1787838590804497` / `7692302468b74ecc20b60c44141c0f8b75909bea` | unchanged | ACTIVE |
| `bridgeResponseLead` | `1787838590787235` / `7692302468b74ecc20b60c44141c0f8b75909bea` | unchanged | ACTIVE |

All four callables remain Gen 2, Node.js 24, `us-east1`, owned exactly once by `attribution-core`, with zero secret bindings. No unrelated Function was deployed.

The corrected contract allows a verified canonical Admin (`role=admin`, `isAdmin=true`) even when the Admin profile has `active=false`. Verified Business actors still require an active, non-disabled Business lifecycle and remain tenant-scoped. Signed-out, inactive-Business, spoofed-Admin, and cross-tenant requests fail closed. The production signed-out check returned HTTP 401.

## Hosting release

- Prior safe rollback bundle SHA-256: `EE95E0F9F5EED7194C169FC5D38964E84D3E0CB7E66305905FDC735B93C83686`
- Restored certified bundle SHA-256: `2A41234D73E55713858E3C5314A7B2396ED30A0D888DA4DBC1323884D1AD2E21`
- Live `scaledcircle.com/main.dart.js` SHA-256: exact match to the certified bundle
- Post-release live observation: `2026-08-27T17:37:00Z`
- Firebase Hosting deployment result: version finalized and release completed successfully; the CLI output did not expose the opaque version/release identifiers
- Cache policy observed for `main.dart.js`: `no-store, must-revalidate, no-cache`
- `/r` rewrite: retained before the SPA fallback; an invalid code returned safe HTTP 404 copy

The prior safe Hosting bundle remains the rollback reference. Firestore Attribution protections were retained. Storage Rules and indexes were unchanged.

## Authoritative production evidence

The existing Founder-owned General Testing asset `Internal QA — Attribution Production Certification` was preserved. Its stable identity and production tracked URL remained intact; no duplicate asset was created and the opaque code is intentionally omitted from this record.

The two existing immutable response interactions remain classified as test/prelaunch activity. They preserve distinct interaction-event identities while unique-response identity remains privacy minimized. They produced no live interaction, lead, conversion, or campaign-performance credit.

Founder production Business verification:

- Response Tracking — Beta loaded through the canonical route.
- Live interactions: `0`
- Unique live responses: `0`
- Test/pre-launch visits: `2`
- Leads: `0`
- Conversions: `0`
- Existing QA asset: visible as Testing / Pre-launch
- Production hostname, refresh/reopen, and error handling: PASS

Founder production Admin verification:

- Normal Admin authentication and Command Center navigation: PASS
- Growth attribution loaded; the former generic load error did not recur.
- Tracked interactions: `0`
- Unique responses: `0`
- Test/pre-launch visits: `2`
- Leads: `0`
- Conversions: `0`
- Existing QA asset: visible as Tracked Link / Prelaunch
- Raw backend errors: none

Post-deployment logs contained three authenticated-valid `getAttributionOverview` invocations and no `attribution_actor_denied` or `attribution_overview_failed` event. This confirms that Firebase Auth succeeded, the corrected Admin/Business authority boundary accepted the actors, the bounded query branch completed, and the DTO returned to the hosted clients.

## Query and feature-health contract

The read model remains bounded to at most 100 records per collection/request. It performs no Business enumeration, unbounded tenant fan-out, or large `in` query. Campaign reads are limited to campaign IDs referenced by the bounded Response Asset result. No new index was required.

Successful resolver requests establish response-system feature-health evidence. General Testing and other prelaunch traffic remains excluded from live interactions, live unique responses, leads, conversions, campaign ROI, and customer-performance metrics.

## Certification evidence

- Production-shaped Attribution and authority tests: PASS
- Focused Attribution backend and Rules tests: 20/20 PASS
- Backend full suite: 359/359 PASS
- Architecture/export suite: 39/39 PASS
- Flutter Attribution/Admin focused suite: 9/9 PASS
- Flutter full suite: 341 PASS, 1 intentional skip
- `flutter analyze`: PASS
- Firestore Rules suite: 20/20 PASS
- Storage Rules suite: 6/6 PASS
- Generated-package installability: 15/15 PASS
- Canonical/generated Attribution source SHA-256: `8A04ECB52A2D4E8FECB48788A5CEEF86C72B778452ECFA9AB0A8B7F4B964F2E4`, exact match
- Production web build: `2A41234D73E55713858E3C5314A7B2396ED30A0D888DA4DBC1323884D1AD2E21`
- Staging regression build: `A7A6FFFC29C01DD51AE2BB409BCD0BED52C8D6C98B6808B75C1090AA395CC98F`
- Secret/provider scan: PASS; zero Attribution secrets or external-provider dependencies
- `git diff --check`: PASS

## Product status and safety

Response Tracking, tracked links, QR, General Testing, campaign prelaunch tracking, and Growth Analytics remain **Beta**. Tracking remains optional.

Landing Pages, Lead Forms, Tracked Calls, inbound email, and provider-backed response channels remain **Coming Soon**.

No additional QA traffic, Response Asset, lead, conversion, financial action, customer-campaign mutation, provider/outbound action, Rules/index mutation, or account/profile mutation occurred during closeout.


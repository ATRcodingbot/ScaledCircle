# Scale Area Intelligence production acceptance — September 26, 2026

## Deployment

Reviewed application source: `609055095a104b602323f12a6b3353172ad297b9`.
Promotion tooling: `327423a63233e3f02de22524aa1173b69216d4cd` (four deployment-helper files only; no application changes).

| Component | Active production revision/version |
| --- | --- |
| `applySmartZonePlan` | `applysmartzoneplan-00009-wal` |
| `getSmartZonePlan` | `getsmartzoneplan-00009-gow` |
| `getBusinessWorkspaceContext` | `getbusinessworkspacecontext-00004-xop` |
| Firebase Hosting | `cb0ebe407ef0f3b2` |

All three functions are ACTIVE. Generation-pinned uploaded source archives match their prepared packages exactly: Apply 24/24 files, Get 24/24 files, workspace projection 9/9 files. IAM, identities, environment, secrets and unrelated configuration are unchanged. The only approved configuration adjustment is Get's 180-second timeout. Existing live server dependency-lock records are preserved; the exact reviewed clipping dependency graph is added where required. Workspace projection lock is unchanged.

Hosting released at `2026-09-26T20:59:37.623Z`. Public bundle SHA-256 is `76b47030cddee39cfb45275282e2daf7ab1ff31c6217301c51c8259e3b52e8cb`, matching the reviewed package. Index, bootstrap, service worker and version file match. Four existing rewrites, four cache headers and five static pages remain unchanged.

## Authority evidence

- Actual deployed Get and Apply, signed out: HTTP 401 `UNAUTHENTICATED`.
- Actual deployed Get and Apply, invalid bearer: HTTP 401 `UNAUTHENTICATED`.
- Exact overlaid endpoint tests reject Starter, Growth and expired Scale access before resolver/provider work. Retained reviewed tests additionally cover revoked/spoofed claims, workspace/member/tenant isolation and Apply rechecks. These are executable source tests, not authenticated production Starter/Growth sessions.
- Attractive Remodel's maintained Business identity has active complimentary Managed Growth (inherited Scale authority), bound profile/preferences, services and eligible geography. Its production web capability projection enables the recommendation form.
- Mike has inherited Scale access but lacks the saved authoritative Intelligence profile/preferences. No settings were invented to supply that missing context.
- Founder confirmed no authorized Starter/Growth Business QA identity is available. Physical non-Scale acceptance remains pending; no account was created and no plan was changed.

## Production 21061 acceptance

Existing Attractive Remodel unpaid `test` draft: `czp6YVRr4SNXHGugmKZu`. Residential flyer outreach for deck, fence and remodeling services; requested workload five hours. Browser resolved `21061, Anne Arundel County, Maryland, United States`. The five-hour target is explicitly advisory.

Offline pre-execution readback of this Business's existing service areas intersects the real 31.3124 km² ZIP to an eligible 24.8680 km² portion, partitioned into nine windows (largest 7.5729 km²). Corkran is eligible. These are prepared bounds, **not counts of executed production provider calls**. The full requested ZIP remains context, and only its eligible intersection is analyzed.

Live acceptance is pending. Browser automation populated the correct form but subsequent activation focused neighboring Flutter controls. As of the bounded server read ending `2026-09-26T21:03:42.208487Z`, no Get invocation was recorded; the campaign mapping-run query was empty. Log ingestion delay means this alone does not prove a click never reached the endpoint. Founder was asked to physically click Recommend once, without using or saving the recommendation.

Consequently no live target count, completed-window count, PI ranking signal, advisory workload, selected-territory count, school/barrier result or alternate-cache PASS is claimed yet. No provider absence or zero-property conclusion is inferred.

Before-preview campaign fingerprint: SHA-256 `83f379dac8a08c0d95216e04b20e829c601aec144af760646d8514cde2620fab`; update time `2026-09-19T11:34:54.318751Z`; zero bound campaign zones. Readback at `2026-09-26T21:06:01.915Z` matches exactly, with zero zones. Recheck after the eventual preview/alternate acceptance.

## Validation and disposition

The reviewed candidate retains its 195 server/contract/packaging, seven runtime, eight Property Intelligence backend and 66 client passing tests, clean analyzer and verified web build. Deployment added 12 passing tooling/overlay checks. Uploaded source and public Hosting readback passed independently. No native compilation or CI was used.

**Not yet safe to freeze as fully accepted for web launch.** Deployment is verified; real 21061 recommendation, physical evidence review and a defensible alternate remain pending. The physical non-Scale test also requires an existing authorized eligible account.

The native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. Financial/payment authority, subscription prices, payout schedule, compensation/tracking, Email/Social/research and store builds were outside this deployment and were not changed.

Safe local evidence is retained under `.firebase/scale-area-promotion/`, `.firebase/scale-area-hosting/`, and `.firebase/mapping-qa/scale-intelligence-acceptance/`. Protected source metadata is deliberately not reproduced here.

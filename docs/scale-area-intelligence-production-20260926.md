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

The real 31.3124 km² ZIP remains search context; existing Business service areas restrict eligible analysis to approximately 24.87 km², partitioned into nine windows (largest 7.5729 km²). Corkran is eligible. The subsequent retained production run confirms all nine windows were executed, with zero skipped.

Founder physically clicked Recommend and observed the fail-safe response: Use disabled, Adjust and Draw available. That click/result evidence is accepted; no repeat is needed. The exact request started `2026-09-26T21:29:16.406468Z`, returned HTTP 200 after 86.292 seconds, and retained mapping run `1b2a34f682e6cd7ed0fd604c5ffd8951ff800b56a66f9d6b358987a9ce91a515`.

Seven provider windows were unavailable (three HTTP 504, one HTTP 429, three client timeouts). The two successful windows contained six business and nine unclassified-address observations but no classified residential targets. Corkran's window returned 504 before parsing; it was not excluded by service geography or ranking. No candidate reached Property Intelligence scoring and no live advisory workload or alternate was established. The retained Corkran fixture still yields 19 targets / 22 segments / 739 m / 44 minutes inside that exact window, with school exclusion; this is an offline comparison, not live replacement evidence. See [the full request trace](scale-intelligence-founder-request-trace-20260926.md) for per-window counts, timestamps, bounds, cause and the bounded web explanation correction.

Before-preview campaign fingerprint: SHA-256 `83f379dac8a08c0d95216e04b20e829c601aec144af760646d8514cde2620fab`; update time `2026-09-19T11:34:54.318751Z`; zero bound campaign zones. Post-investigation readback at `2026-09-26T21:42:36.361Z` matches exactly, with zero zones.

## Validation and disposition

The reviewed candidate retains its 195 server/contract/packaging, seven runtime, eight Property Intelligence backend and 66 client passing tests, clean analyzer and verified web build. Deployment added 12 passing tooling/overlay checks. Uploaded source and public Hosting readback passed independently. No native compilation or CI was used.

**Not yet safe to freeze as fully accepted for web launch.** Deployment and the physical fail-safe behavior are verified. A useful real 21061 recommendation remains blocked by provider acquisition, not by an unperformed Founder click. No defensible live alternate was found. The separate physical non-Scale test still requires an existing authorized eligible account.

The native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. Financial/payment authority, subscription prices, payout schedule, compensation/tracking, Email/Social/research and store builds were outside this deployment and were not changed.

Safe local evidence is retained under `.firebase/scale-area-promotion/`, `.firebase/scale-area-hosting/`, and `.firebase/mapping-qa/scale-intelligence-acceptance/`. Protected source metadata is deliberately not reproduced here.

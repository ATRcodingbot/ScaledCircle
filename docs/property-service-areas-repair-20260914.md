# Property Intelligence saved-area repair — 14 September 2026

## Evidence and cause

The production `analyzePropertyIntelligence-00006-faw` helper was byte-identical to the maintained property provider module. The custom-area validator has limited bounding-box area to 200 km² since `9b8368f`. Saved-area selection added in `bbd735273d925e6cc13253f87966bb30684a3f34` reused the custom-area request rather than resolving saved geography on the server. All three enabled Attractive Remodel production areas exceed that limit. The UI also omitted the selected objective from the initial property request and converted failures into redraw instructions.

The bounded/custom analysis path and provider tests are known working. No independently verified earlier whole-saved-area successful deployment was found; this report does not invent a rollback point or invalidate Founder's recollection.

## Repair

`scope: saved_service_areas` resolves the authenticated workspace's own preferences and Business growth profile. Legacy rings, map-parts, Polygon/MultiPolygon and radius areas normalize without rewriting stored geography. Polygon clipping preserves holes and produces bounded sections inside the union. Attractive Remodel's preserved input yields 2,402 contained candidate sections.

Each run samples at most 12 fresh sections, with three provider workers, using the existing Maryland/Census providers. The report labels sampled coverage and separates planning fit from homeowner intent. Explicit service goals select maintained services; exclusions take precedence. Unavailable evidence never receives a favorable fit. Recommendations and proof belong to the workspace; the global cache contains only neutral property evidence.

Own campaign geometry and previously examined sections exclude obvious repeats. Missing history geometry/timing is disclosed. Other Businesses are not queried. Geographic CRM outcome attribution is unavailable and remains unknown. Save Territory changes only recommendation status/audit after rechecking containment. No campaign is created by analysis or saving a territory.

The mobile/web path requires no redraw, renders ranked sections on the map, and uses selected returned geometry for the existing campaign handoff. Custom Area remains separate. Retry identity, transaction leases, cooldown, late-response rejection and source-version checks protect against duplicate analysis and stale results.

## Verification before deployment

- 52 focused backend/unit/actual-callable tests passed.
- Six real Firestore emulator tests passed, including concurrency/replay, failed-request retry, cross-owner rejection, source preservation, overlap/history, containment and bounded queries.
- Targeted Flutter tests and full analyzer passed (exact logs retained privately).
- Generated package verification passed, with pinned polygon-clipping dependency declared for generated packages.

Production acceptance and final deployed identifiers must be appended after actual readback. No production-restored claim is made by this source-preparation record alone.

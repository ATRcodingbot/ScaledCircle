# Property Intelligence first — review candidate, not deployed

2026-09-26. Isolated branch: `codex/maryland-web-operations`. Frozen native source remains `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`.

## Existing path and corrected dependency

The maintained recommendation path is `analyzePropertyIntelligence(scope: saved_service_areas)` in `functions/index.js` → `property_service_area_analysis.createService` → `property_service_area_runtime.createAnalyzer` → `property_intelligence` providers/cache → `rankAnalysis`. The Business profile, offered/prioritized/excluded services, saved service geography and goal are server-owned. Recommendation records/history are workspace scoped.

`analyzeScaleIntelligence` AI Q&A interprets authoritative analyses through `scaled_circle_intelligence`. `property_intelligence.analyzeBusinessOpportunity` likewise interprets supplied facts using an optional transport. Neither independently searches/ranks ZIP geography. No new agent or model call is needed here.

Previously Smart Zone acquisition constructed an OSM serviceable candidate **before** consulting exact-geometry PI cache or `rankMarketingArea`. OSM failure therefore erased property recommendations. At readback, the neutral PI cache had no entry for the full 21061 geometry or these nine exact windows; that does not mean every existing PI cache was empty.

Both saved-area analysis and mapping now share `rankPropertySection`, wrapping the existing `rankAnalysis` formula. Residential-share and service-specific age weights remain unchanged. Matching source/geometry digest is required. Existing completed-marketing overlap logic is reused; unknown history stays unknown.

Get loads the maintained PI analyzer/cache **before** map acquisition, with a 45-second property budget inside the unchanged 150-second search/180-second callable limits. Overlapping public tract requests share request-local promises indexed by a hash; no credential-bearing URL is persisted. Get binds the existing Census secret. Apply only replays an authorized retained run and cannot initiate acquisition. Run-cache V2 prevents old OSM-first results from being reused.

Property candidates, map validation, source dates and supported workload are separate. Map failures retain PI reasons and a bounded review section, but do not enable Apply. Hours combine supported nearby territory in property-rank order and never change the property score. Alternatives are distinct PI sections. Adjust starts from the PI section, preserving the full ZIP/service geography as search context.

The isolated web candidate asks “What kind of work are you looking for?”, uses existing service matching and shows PI evidence even during map failure. It separates planning confidence from map status. Starter/Growth manual mapping and Scale authority remain unchanged. No native build/merge or deployment occurred.

## Actual signals and limits

- Maryland maintained dataset `ed4q-f8tm`: residential classification/share, available year-built thresholds/era, selected geometry and coverage. Owner/contact fields are not requested.
- Existing offered/prioritized/excluded service matching, saved service-area containment, and same-Business completed-marketing overlap. No new taxonomy, customer-demand or ROI model.
- Existing Census ACS 2024 five-year B25034 and TIGERweb block-group boundaries: housing-unit/age **context**, not individual delivery stops. Whole intersecting block-group totals are not counts inside a section and cannot be added across overlapping sections.
- A housing-only ACS universe does not establish 100% residential share of a selected section. The candidate fails closed on that unsupported comparison and removes invented polygon density, spacing and address pace from these aggregate totals. Census remains available to PI/Q&A as context.
- Roofing/HVAC versus remodeling can rank differently using existing 20+/40+ age signals. Decks, fences and landscaping use residential share where component-specific facts are absent; they can honestly tie. The actual Attractive Remodel goal matches its maintained deck/fence services and does not silently create another offered service.
- This parcel scorer cannot rank B2B prospects from housing. The former OSM-count-centered business score is not silently substituted. Commercial ranking needs supported business-category PI facts; manual mapping remains available. This remains a capability limit, not a paid-provider request.

## 21061: newly retrieved public evidence, evaluated locally

**This is not production acceptance or fixture-only proof.** No production recommendation, campaign write or model call was made. The server-read profile/preference versions and all nine window IDs match the retained Founder request. Full ZIP is ~31.31 km²; eligible service intersection ~24.87 km². Each internal window is below 25 km².

A dated [Geofabrik Maryland OSM extract](https://download.geofabrik.de/north-america/us/maryland.html) was downloaded and checksum verified:

- OSM snapshot `2026-09-25T20:24:36Z`; retrieved `2026-09-26T21:55:03.501Z`.
- PBF 214,445,802 bytes; SHA-256 `fca54b6b3d2cf6632e79a6a93413d77c0019743ff1bbef52e93188a28d79fc20`.
- 21061 plus buffer: 19,678 elements, complete referenced ways; no missing member ways, nested-relation gaps or invalid source ways encountered.
- Local JSON 8.51 MB / gzip 1.35 MB; SHA-256 `c213b9fed5f0b53b7b77c500d3b2eb47d67c92f84d945403c0edeca2ba8667d8`.
- Workstation download 13.165 seconds, extraction 146.291 seconds; not a cloud-duration guarantee.

The maintained Maryland provider was queried read-only for all nine windows, and Census context was independently verified using the existing secret. Current local Maryland requests returned records; this does not rewrite the historical HTTP 403 diagnosis or prove deployed runtime access.

| Original window | PI fit | Maintained evidence | Map disposition |
| --- | ---: | --- | --- |
| 9 | 97 | 373 residential / 386 property records | 10 mapped residential features, 403 m streets, **24 advisory minutes** |
| 2, includes Corkran | 92 | 4,348 / 4,742; partial coverage, LOW confidence | Unresolved institutional/school/restricted footprints block automatic geometry |
| 8 | 90 | 47 / 52 | Insufficient connected target/road evidence |
| 3 | 87 | 1,503 / 1,731 | Incomplete exclusion footprints |
| 6 | 87 | 3,180 / 3,651 | Incomplete exclusion footprints |
| 7 | 82 | 1,730 / 2,105 | Incomplete exclusion footprints |

Windows 1 and 5 have Census context only; window 4 has eight Maryland records and no supported residential count. They receive no fictional service-fit score.

Selected: window 9 (`e786b323…`), fit 97. Its one mapped polygon has no mapped school-footprint overlap. Corkran’s known footprint remains excluded; the broader Corkran window has unresolved non-target features, so it does not yield an automatic polygon. The older narrower 19-feature/44-minute Corkran fixture still passes separately and is not substituted for this broader public evidence.

**Six PI candidates; one safe mapped candidate; 24 supported minutes across retained mapped candidates, not five hours.** Multiple reliable mapped territories are not established. No exclusion guard was relaxed to increase this result.

Safe per-window counts/reasons are in `property-primary-21061-public-proof-20260926.json`. Detailed ignored evidence and local evaluation scripts remain under `.firebase/mapping-qa/public-reliability/`.

## Small reliability layer — proposed, not deployed

Retain the existing PI cache/scorer as primary intelligence. Add a snapshot transport to the maintained `smart_zone_geography` normalizer, not another property database, score, source catalog, GIS platform or agent.

1. Store versioned neutral regional extracts and bounded evidence blobs in existing private Cloud Storage, with small Firestore manifests. Start with active Maryland service regions. An 8.5 MB payload must not enter one Firestore document.
2. Record provider, dated source URL, snapshot time, retrieval time, geometry/query/normalizer versions, exact bounds/coverage, element IDs/versions, completeness and SHA-256. Keep complete crossing/containing exclusions and relation members. Never clip away a school footprint.
3. Read compatible fresh snapshots first; allow one bounded live refresh as fallback rather than nine click-time dependencies. Preserve the last complete snapshot on failure. Use a server lease/cooldown, no blind retries, and separate dates for mixed sources.
4. Proposed policy for review: ≤7 days fresh; 7–30 days explicitly stale planning evidence needing review; older/missing/incomplete blocks automatic Apply. Check source and retrieval ages. Re-downloading old data does not make it fresh. These thresholds do not guarantee real-world accuracy.
5. Begin with a manually verified bounded import. Proposed later cadence: weekly active-region refresh, keeping current/previous extracts and proof manifests. No scheduler, recurring job, bucket or IAM change was created.

Fallback: PI + fresh cached map → bounded live refresh → PI/Census context + explicitly dated compatible older map → PI retained with limited map validation/manual adjustment. Demographic context alone never creates streets, stops or workload.

[Geofabrik](https://www.geofabrik.de/data/download.html) offers free regional data, generally updated daily; preserve OSM attribution/ODbL. [Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) is shared load-shed infrastructure; its approximate 10,000 requests/day and 1 GB/day guidance is not an application SLA.

Warm complete snapshots remove live Overpass from click-time map acquisition. No uptime percentage is established. Caching fixes acquisition repeatability, **not missing exclusion footprints or missing property facts**.

No paid data subscription/model call is needed. Pilot storage is small: 1.35 MB derived ZIP evidence and ~205 MiB transient source. Two retained sources plus derivatives fit below 0.5 GiB before object history. Illustrative four monthly refreshes at one vCPU, 2 GiB and 300 seconds each cost ~$0.0264 compute before free allowance using published [Cloud Run rates](https://cloud.google.com/run/pricing). This is a scenario, not measured cloud duration or an authorized job. Add region-specific [storage, operations and transfer](https://cloud.google.com/storage/pricing). Shared free-tier headroom was not verified; guaranteed $0 is not claimed. No recurring spend is activated.

## Validation and narrow deployment boundary

Checks: 119 local Node unit/architecture/authority tests; 15 Firestore-emulator transaction/tenant/Apply tests; 48 Flutter widget/interaction tests (182 total). Analyzer clean. Local production-config web compilation passed in 35.8 seconds; evidence is in `web-build.log`.

Coverage includes PI-before-map ordering, map failure, source/geometry mismatch, distinct alternatives, unchanged hours/fit, honest service ties, Census/B2B non-substitution, dates, school/incomplete-footprint guards, Scale/member/tenant authority, stale run/context rejection, Apply without reacquisition and no finance writes.

After review only, the candidate deployment scope is:

- Get/Apply Smart Zone overlay with exact tested PI/cache modules. Get alone binds existing `CENSUS_API_KEY`; no OpenAI secret/model call or financial/entitlement change.
- `analyzePropertyIntelligence` module overlay to align the shared scorer and aggregate-context correction; preserve unrelated platform exports.
- Web Hosting recommendation entry/review changes. Frozen native checkout, builds and store selections remain unchanged.

The regional snapshot cache adapter/import/refresh is the documented next implementation scope, not silently represented as completed or deployed. Keep recommendations **Limited/Beta** until that layer is reviewed/deployed and production readback passes. The 21061 exclusion limitation still needs supported resolution before claiming five hours. No new Founder click is needed for this review package.

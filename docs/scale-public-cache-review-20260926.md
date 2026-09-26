# Scale public evidence cache — review candidate, not deployed

Parent: `387636b96dac5fdee358b2cc35b7949ad4678068`. Implementation is limited to server modules, deployment mirrors, operator import tools, tests and this evidence package. The frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. No cloud deployment, object upload, scheduled job, model call, financial action, campaign mutation or native build occurred.

**Disposition: keep Limited/Beta.** Acquisition now works from the maintained local cache without Overpass, but production cache reads have not been deployed/accepted. This 21061 source supports one 24-minute area, not five hours or multiple usable areas. The remaining limitation is exclusion-footprint/connected-territory evidence, not a cache transport failure.

## Implemented architecture

1. The existing Business/workspace/campaign/Scale gates run before any PI or mapping work. Starter/Growth remain manual-only. Existing entitlement and actor-scoped run authority are unchanged.
2. `property_service_area_runtime.createAnalyzer` reuses the maintained neutral PI cache and Maryland/Census adapters. `property_service_area_analysis.rankPropertySection` remains the shared scorer. All eligible sections are ranked first. No new scorer, goal taxonomy, agent or model call was added.
3. `smart_zone_public_cache.js` reads a private regional manifest and only intersecting immutable 0.04-degree public geometry tiles. Full ways and relation geometry remain intact. Tiles repeat overlapping evidence; reads deduplicate OSM type/id and reject conflicting copies. Exact geometric intersection rejects bounding-box-only overlap while retaining enclosing, crossing and uncertain exclusion footprints. No feature is clipped into a safer-looking shape.
4. Existing `smart_zone_geography.snapshotFromElements` and `smart_zone_serviceability.shape` still decide map safety: permitted streets, classified targets, institutions/schools, parks/water/restricted land, industrial/parking exclusions, barriers, connectedness and shape. Incomplete exclusion footprints still fail closed. Roads are supporting evidence, never an approved execution route.
5. Only map-validated PI sections enter recommendations or alternatives. Nearby supported areas can combine toward requested hours using the existing rule; no new targets or duration are invented. Unvalidated PI sections stay in retained diagnostics, not clickable alternatives. Existing run replay serves alternatives and Apply without provider/cache reacquisition. Search/run cache versions advance to V3 to reject incompatible older evidence.
6. Source freshness and dates flow through `targetEvidence.sourceSnapshots` and customer-readable limitations already rendered by the web UI. No Flutter/native source was changed. Missing evidence uses the requested safe failure copy; failed refresh on usable cache explains that mapped data may have changed, without showing provider errors.

Deck/fence/landscaping legitimately tie where the maintained facts do not distinguish them. Roofing/remodeling use the existing supported age thresholds. Census housing aggregates remain neighborhood context; they are not individual stops or a fabricated residential fraction. B2B requires commercial PI evidence; residential Census/parcel facts cannot qualify a commercial recommendation.

## Source and import authority

Source: [OpenStreetMap via Geofabrik Maryland](https://download.geofabrik.de/north-america/us/maryland.html), `maryland-260925.osm.pbf`, 214,445,802 bytes. OSM snapshot: **2026-09-25 20:24:36 UTC**. Download retrieval: **2026-09-26 21:55:03.501 UTC**. SHA-256: `fca54b6b3d2cf6632e79a6a93413d77c0019743ff1bbef52e93188a28d79fc20`. The official `.poly` extent is intersected with the requested import bounds; coverage is not inferred from a rectangular state bounding box. OSM attribution/ODbL provenance remains required.

`functions/scripts/extract_smart_zone_public_region.py` is an offline, checksum-verified, two-pass import using separately pinned `osmium==4.3.1`. It retains only maintained public tags/geometry and source IDs, versions and timestamps. It resolves complete member ways, nested outer/inner relations and enclosing multi-way exclusions. Unknown/cyclic nested members remain unresolved and block publication. Names, contact details and OSM contributor identity metadata are not exported. The application dependency lock is unchanged.

The final actual extraction completed in **153.441 seconds**, retaining **19,681 elements**, with zero missing member ways, unsupported nested relations or invalid source ways. The normalized public JSON is 8,727,046 bytes; gzip is 1,389,007 bytes. JSON SHA-256: `9ffeb5c4f20f32b608e599e7083e2744448c654873dd30a4b2a169086cec701f`. Earlier diagnostic extracts are preserved; the final proof uses the complete extraction.

`build_smart_zone_public_cache.js` writes only a new local bundle. It validates source completeness, creates content-addressed compressed tiles, and preserves complete geometry. The pilot bundle covers the buffered 21061 region, **not all of Maryland**: 16 tiles, **1,799,925 compressed bytes**. The full Maryland PBF is retained as the regional source for future bounded imports.

Manifest/object layout for a later approved publication:

- Existing private bucket: `smart-zone-public/v1/maryland/current.json`.
- Immutable data: `smart-zone-public/v1/blobs/{sha256}.json.gz`.
- Manifest: provider, snapshot/retrieval/import timestamps, explicit coverage/bounds, source SHA-256, coverage hash, dataset/parser versions, per-tile hash/count/completeness.
- Window evidence: those source fields plus exact query bounds, geometry digest, geometry version, selected evidence hash, freshness and refresh disposition.
- Exact live window pointers/rate authority: backend-only `smartZonePublicRefreshV1/{geometryDigest|authority}`. No private Business profile enters the shared geometry cache. Existing deny-by-default Firestore/Storage rules cover these paths.

The publication helper validates the complete bundle before uploading objects, then atomically replaces the single manifest with a caller-supplied GCS generation precondition. It refuses source rollback and preserves the prior manifest on failure/concurrent replacement. No publication helper was run against GCP. The discovery package contains exact maintained cache/runtime modules and the existing PI secret binding; no broad codebase regeneration was used.

## Freshness, refresh and operational limits

| Source snapshot age | Label and action |
|---|---|
| 0–7 days | Fresh cached evidence; no live refresh |
| Over 7–14 days | Usable cached evidence; explicitly cached, no live refresh |
| Over 14–30 days | Stale / refresh recommended; bounded refresh, retained data may support review with a warning |
| Over 30 days, missing/future date, incomplete/corrupt/uncovered data | Unavailable for automatic recommendation; bounded refresh or fail safe |

Age uses the actual source snapshot, never import time. A newer retrieval does not make an old snapshot fresh. An older provider response cannot replace newer usable cache data. Live refresh labels retain source age too.

Maximum **one** live Overpass request per recommendation search; unchanged 12-second timeout, under-25-km² query ceiling, element limits and 150-second total search budget. A Firestore transaction enforces a shared 30-second lease, at least 60 seconds between attempts, 15-minute per-window cooldown and 60 attempts/day across this feature. Failed/partial responses retain sanitized diagnostics and never overwrite the last good pointer or become zero features. A lost/expired request leaves a bounded lease; no automatic retry loop exists.

Regional reads are memoized per search: at most 16 tiles/window, 48 blobs/search, 24 MiB compressed and 32 MiB decoded bytes/search. Each object stream has an 8-second ceiling; checksums and decompression bounds are verified before using evidence. Customer clicks never import a regional PBF. Acquisition completeness is distinct from OSM containing complete school/parking/etc footprints: a complete extract may still legitimately fail map validation.

Proposed cadence: a **weekly operator-reviewed local import**, initially for active Maryland coverage; expand coverage using the same regional extract. Retain two reviewed regional snapshots and a bounded live-cache retention policy before enabling unattended refresh. No scheduler or bucket lifecycle rule was created. Full-state derivative size/peak import memory must be measured before scheduling a whole-state job; the tested bounded extraction used about 1.3 GB resident memory and roughly 2.6 minutes locally.

## 21061 maintained-cache result

See `scale-public-cache-21061-proof-20260926.json` for exact timestamps, section IDs, classifications and safe diagnostics. This is a **local replay of retained authoritative Business context and public PI responses through the new maintained cache**, not a production acceptance claim.

The full ZIP remains search context (~31.31 km²). Its eligible portion generates nine bounded sections. Six have rankable Maryland PI evidence; two have only Census context and one has no qualifying residential stock. Six map windows were read successfully using ten memoized tile downloads from the local bundle. **Zero live Overpass calls, zero model calls and zero production writes.**

| Section | PI fit | Raw elements | Classified targets before safety | Road ways | Land footprints / unresolved features | Result |
|---|---:|---:|---:|---:|---:|---|
| W9 | 97 | 259 | 43 | 165 | 4 / 0 | One usable candidate |
| W2, Corkran | 92, LOW confidence/partial PI | 2,626 | 1,078 | 1,453 | 127 / 13 | Incomplete exclusion footprints |
| W8 | 90 | 47 | 3 | 33 | 2 / 0 | Insufficient connected targets/street evidence |
| W3 | 87 | 1,665 | 613 | 875 | 135 / 10 | Incomplete exclusion footprints |
| W6 | 87 | 2,076 | 574 | 1,333 | 171 / 24 | Incomplete exclusion footprints |
| W7 | 82 | 2,239 | 336 | 1,661 | 161 / 37 | Incomplete exclusion footprints |

Rows overlap geographically: raw counts must not be summed as unique households or properties. The one supported candidate has **10 mapped target features, 23 supporting street segments, 403 m of street evidence, and 24 advisory minutes**. Three retained Corkran school-footprint IDs are present in the regional evidence. No selected territory overlaps a known school footprint. The broader Corkran section is still rejected because 13 relevant non-target features lack reliable footprints; its earlier narrow 19-target/44-minute fixture remains a separate passing regression. No footprint rule was weakened to recover that result.

**Multiple usable areas: no. Five-hour support: no (24 of 300 minutes). Try Another: unavailable.** Cache acquisition succeeded for every PI-ranked section; absent automatic territory must no longer be attributed to Overpass failure. Useful expansion requires better exclusion geometry or a separately reviewed finer validation strategy—not invented targets, demographic-only territory or relaxed safety checks.

## Cost and operations estimate

Measured pilot: ~0.20 GiB regional PBF plus ~1.72 MiB tiled cache. Full-state derivatives are **not built/measured**. For planning, extrapolating 16 urban pilot cells across the 5,405-cell source bounding grid suggests ~0.6 GB compressed; use a conservative **0.25–1 GB/retained statewide derivative**, pending measurement. Two PBF/derivative snapshots would be roughly 0.9–2.4 GB. This is an estimate, not a verified allocation.

Illustrative [Cloud Storage pricing](https://cloud.google.com/storage/pricing): Standard single-region storage is about $0.02/GiB-month; US multi-region about $0.026. Two estimated snapshots are cents/month. The proof uses 11 object reads, about $0.0000044 at $0.0004/1,000 Class B operations. Actual network cost depends on bucket/function locations; same-region transfer can be free, other North American transfers can be $0.02/GiB. Verify current bucket class, location, retention and free-tier headroom before deployment. Reads are small, not guaranteed free.

Normal cached reads avoid public-provider quotas and nine customer-click refreshes. Existing PI/Firestore/callable charges remain. Live-cache storage can accumulate: the absolute 60/day × 8-MiB object ceiling is ~14 GiB per 30 days, before retention. Real payloads are smaller, but cleanup/retention must be approved and measured rather than assuming unlimited free storage. Per-search memory/read budgets and global refresh caps limit resource pressure; public Overpass still provides no reliability guarantee.

Proposed weekly imports run locally initially: **no new scheduled GCP compute cost**. If later scheduled, a hypothetical four 300-second jobs/month at 1 vCPU and 2 GiB costs about $0.0264 compute before free allowances, using [Cloud Run rates](https://cloud.google.com/run/pricing); this is not a full-state runtime measurement or authorization. Storage, transfer, scheduling and existing PI costs are additional. No paid SaaS/provider or recurring job was enabled.

## Validation and narrow deployment plan

Focused validation: 136 Node unit/architecture tests; 18 local Firestore emulator tests; 6 Python extractor tests. Covers cached/live-down, stale refresh success/failure/older response, absent/corrupt/incomplete cache, source age/provenance, overlap deduplication, enclosing and nested footprints, schools/highway separation, PI rejection, workload combination, cache/run alternatives, Starter/Growth early denial, B2B segregation, shared refresh leases/cooldowns/daily limits, atomic publication and preservation of the last good snapshot. Local complete PBF extraction/import/replay also succeeded. No app dependency lock or Flutter file changed.

After explicit deployment approval only:

1. Review this source and exact bounded cache manifest. Verify the existing discovery runtime's access to the intended private bucket and the retained CENSUS secret. Do not broaden IAM or deploy unrelated services.
2. Publish the verified pilot bundle with generation-guarded pointer update and read it back using the existing runtime identity. Keep the previous pointer for rollback. Verify source hashes and dates before serving it.
3. Deploy only the reviewed `getSmartZonePlan`/`applySmartZonePlan` closure plus required shared PI modules/binding from the already-reviewed parent. No native/financial/Email/Social/research deployment. Existing web evidence rendering consumes the added server limitations and source records.
4. Run the authorized cache-backed production 21061 read, inspect logs for zero live acquisition on a fresh-cache hit, preserve the draft, and verify truthful 24-minute-or-current-supported results and disabled alternatives when none exist. No Founder repeat click is requested before that deployment.
5. Keep Limited/Beta until live cache readback and truthful physical web acceptance pass; this local test does not remove the label. Do not market five-hour coverage or statewide cached coverage that has not been established. Review retention and measured full-state import resources before any recurring job.

# Scale cached geometry — corrected candidate, not deployed

Reviewed parent: `19a43051b6a2342eec518cc0687bca9ba125bd66`.

**Result:** the same retained Attractive Remodel / deck, fence and remodeling / 21061 / five-hour search now validates **4 of 6 PI-ranked sections**, producing **9 distinct areas, 95 mapped targets, 98 supporting street segments, 1,987 m of street evidence and 186 advisory minutes**. Before: 1 section, 1 area, 10 targets, 23 segments, 403 m and 24 minutes. Five-hour coverage is **not established**.

This is a local replay through the maintained cache and recommendation implementation, using retained authoritative Business context and public source responses. It is not fixture-only evidence, a production deployment, or Founder physical acceptance. Production remains unchanged. Keep Limited/Beta.

## Exact diagnosis

The original four rejected sections contained **84 unresolved source features: 81 nodes and 3 open ways**. No missing multipolygon member, stale/missing cache object, self-crossing ring or invalid outer assembly caused those original rejections. The validator rejected an entire section when *any* unresolved non-target feature was present.

The source trace establishes:

- 11 point markers were already inside complete same-kind mapped footprints. The original parser still classified those points as unresolved land.
- 37 features have explicit gate/entrance classification in the retained original PBF. One of these is also in the preceding covered-point count. The extractor had discarded `barrier` and `entrance`. The three open ways, `790161680`, `790161682`, `790161686`, are `access=permit`, `barrier=gate`; they are not incomplete land polygons.
- The remaining point-only institutions, schools, parking and restricted markers genuinely do not establish complete land extents. They must stay uncertain; their coordinates alone do not become campus boundaries.
- W8 was never blocked by incomplete exclusions in the baseline. It already lacked sufficient connected target evidence.

Exact original source IDs, coordinates, bounds, PI ranks and failure classifications are retained in [the baseline trace](scale-cache-geometry-blockers-before-20260926.json). [Original PBF classifications](scale-cache-geometry-source-classification-20260926.json) document the tags recovered by the maintained re-import. No names, contact details, tokens or private Business records are included.

| Section / ID prefix | Rank / PI fit | Original unresolved | Original actual cause | Corrected result |
|---|---:|---:|---|---|
| W9 `e786b3231a2a` | 1 / 97 | 0 | None; already passed | 1 area, 10 targets, 24 min |
| W2 `957fb5ab2957` | 2 / 92 | 13 | Point-only land; 2 covered markers, 1 gate | 4 areas, 30 targets, 65 min |
| W8 `0ca799bf6ced` | 3 / 90 | 0 | Insufficient connected targets | No area; 0 eligible/road-supported targets after safety |
| W3 `1fef6a2bccfb` | 4 / 87 | 10 | Point-only land; 2 covered markers, 3 gates | 1 area, 30 targets, 46 min |
| W6 `a113f3725c30` | 5 / 87 | 24 | Point-only land; 4 covered markers, 2 gates | 3 areas, 25 targets, 51 min |
| W7 `abcefede9b88` | 6 / 82 | 37 | 34 points, 3 open gates; 3 covered markers | No area; only 3 eligible / 2 road-supported targets after safety |

Full IDs and exact unmodified section bounds are in both trace/proof JSON files. PI scores/order did not change. W2's Maryland PI result remains LOW-confidence/partial because the earlier source query reached its retained limit; this correction does not upgrade that evidence.

## Bounded corrections

1. **Geometry assembly:** new maintained `smart_zone_osm_geometry.js` joins exact endpoints regardless of direction, normalizes consecutive duplicate coordinates, deduplicates repeated members, retains separate outers and inner holes, and supports an island inside a hole. Conflicting members, missing/unsupported roles, open/branching rings, crossing rings, invalid holes and unsupported relation types remain explicit uncertainties. No missing member or closing edge is invented.
2. **Source classification:** the PBF extractor now retains `barrier`, `entrance` and `area` tags. It still uses the maintained public selection/tag allowlist and excludes contributor/contact metadata. No new data source or application dependency was added.
3. **Point/footprint association:** a point marker inside a complete same-kind footprint is associated with that source footprint and keeps its exclusion. Points in inner holes do not qualify for this association. Partial footprints cannot suppress uncertainty.
4. **Local uncertainty:** known coordinate/bounds uncertainty uses explicit conservative planning guards. Affected targets, target footprints, road segments and proposed polygons are excluded; the existing connected-component partitioning then finds unaffected territory. The guards are not rendered/represented as mapped campus boundaries or delivery evidence.
5. **Unbounded uncertainty:** an incomplete relation without a reliable full extent still blocks the affected analysis section. A known member does not narrow away an unknown member: the cache replicates unbounded hazard records into all affected import tiles. Invalid/dropped source ways still block publication. Retained missing member records may be cached for explicit parser handling, but untraceable missing records may not.
6. **Boundary seams:** cached exclusion reads include a 500 m halo. Original selected Business geometry and exact query bounds remain separate and unchanged. The source coverage must include that halo; missing coverage fails closed. Neighboring point guards cannot disappear at a section/tile edge. All cache byte/tile/element budgets remain unchanged.
7. **Alternatives:** use candidate IDs rather than entire section IDs for “already selected.” Taking one nearby area no longer discards other supported, more distant areas in its PI section. The existing PI scorer, 3 km proximity rule, maximum alternatives, workload pace and disconnected polygon handling are unchanged.
8. **Compatibility:** parser `SmartZoneOsmGeometryV2`, search `ScaleMarketingAreaSearchV4`, run cache `SmartZoneIntelligenceCacheV4`. Old normalized snapshots/runs cannot bypass the corrected geometry checks. The dataset storage namespace stays V1; the manifest records parser/geometry versions explicitly.

### Explicit uncertainty policy

`SmartZoneLocalUncertaintyV1` uses these planning avoidance margins:

| Evidence | Conservative treatment |
|---|---|
| Point-only school/institution/park/cemetery/restricted or other non-target land | 500 m around the recorded point |
| Point-only parking | 150 m |
| Explicit recognized gate/entrance point or open gate/barrier way | 30 m around its source geometry |
| Complete closed but invalid ring, or authoritative full source bounds | Entire known coordinate envelope plus 30 m |
| `type=site`, all members present as complete valid closed footprints | Entire member collection envelope plus 500 m; not a synthetic campus footprint |
| Missing member/unbounded extent, invalid coordinates, unresolved highway/rail barrier | No automatic candidate for the affected section |

These distances are conservative product planning rules under the authorized local-uncertainty approach. They are **not** OSM/provider guarantees of maximum campus size, proof of legal access, or authorization to execute work. Known mapped land can extend beyond a guard and remains separately excluded. A point-only feature can still represent a larger real-world site; physical boundary/access review remains required. Limited/Beta stays explicit in customer limitations and planning confidence.

The halo also revealed school **relation `4787471`**, outside W2's original query but close enough to matter. It is a `site`, not a multipolygon: six complete member ways (`338498926`, `338498925`, `338498923`, `286992426`, `338498922`, `338498924`), with one outer role and five empty roles. It now receives a conservative collection guard instead of rejecting all W2 or pretending empty roles define a new campus polygon. A site relation groups objects and need not define a continuous area; see [OSM site documentation](https://wiki.openstreetmap.org/wiki/Relation:site). Ring/role validation follows [OSM multipolygon structure](https://wiki.openstreetmap.org/wiki/Relation:multipolygon).

## Corrected 21061 evidence

Source remains the same Maryland PBF; no newer OSM retrieval was used. Query counts increased because the halo retains nearby hazard geometry, not because new targets were invented. Counts in overlapping windows are not additive households or delivery stops.

| Section | Raw records | Classified features before safety | Road ways | Excluded mapped footprints | Local guards / associated POIs | Eligible / road-supported targets | Selected targets | Street segments / m | Minutes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| W9 | 323 | 54 | 176 | 40 | 2 / 0 | 35 / 35 | 10 | 23 / 403 | 24 |
| W2 | 2,843 | 1,153 | 1,498 | 263 | 27 / 7 | 76 / 56 | 30 | 39 / 800 | 65 |
| W8 | 95 | 9 | 42 | 31 | 1 / 0 | 0 / 0 | 0 | 0 / 0 | 0 |
| W3 | 1,942 | 668 | 992 | 280 | 20 / 3 | 44 / 38 | 30 | 11 / 233 | 46 |
| W6 | 2,233 | 617 | 1,369 | 263 | 26 / 7 | 119 / 110 | 25 | 25 / 551 | 51 |
| W7 | 2,564 | 373 | 1,775 | 332 | 51 / 4 | 3 / 2 | 0 | 0 / 0 | 0 |

All six cache reads succeeded. No unbounded exclusion remains in these six replay sections after the specific source treatments. W7 has fewer than the existing six-target minimum; W8 has no supported targets. Other eligible observations do not automatically qualify for compact, connected, exclusion-free candidate polygons.

Nine areas survive, with durations **24; 17, 18, 15, 15; 46; 21, 15, 15 minutes**. Their source IDs are deduplicated. No candidate overlaps any checked known exclusion, local uncertainty guard or Corkran school footprint. All three retained Corkran school IDs are present. The separate narrow Corkran fixture still passes at 19 targets / 22 segments / 739 m / 44 minutes; it is not substituted for the broader cache result.

The unchanged PI-first/proximity policy exposes three review options:

| Option | Primary PI section | Distinct territories | Mapped targets | Advisory minutes |
|---|---|---:|---:|---:|
| Initial | W9, fit 97 | 2 | 21 | 45 |
| Alternative 1 | W2, fit 92 / partial PI | 5 | 60 | 111 |
| Alternative 2 | W6, fit 87 | 2 | 14 | 30 |

**Two usable alternatives after the initial result.** The first two enable another recommendation; the last does not. The sum across all discovered territories is **186 minutes (3h 06m)**, not a single five-hour recommendation. The strongest-fit option remains first; the work did not redesign scoring to favor workload. Distinct polygons remain distinct. No connecting street, household count, material quantity or execution route is invented.

The [complete corrected proof](scale-cache-geometry-21061-after-20260926.json) includes full section IDs/bounds, diagnostics/source features, each candidate geometry, per-area workload, source/freshness and all options. Runtime evidence serializes to 128,508 bytes, below the maintained 500 KiB run limit. Local replay takes about 3 seconds, using 11 memoized blobs for six windows, **zero live Overpass calls**, zero model calls and zero production writes.

## Provenance and retained local import

- Provider: OpenStreetMap via Geofabrik Maryland.
- Original PBF: `maryland-260925.osm.pbf`, 214,445,802 bytes.
- Source SHA-256: `fca54b6b3d2cf6632e79a6a93413d77c0019743ff1bbef52e93188a28d79fc20`.
- Source snapshot: **2026-09-25T20:24:36Z**.
- Retrieval: **2026-09-26T21:55:03.501020Z**.
- V2 bundle import: **2026-09-26T23:17:16.762Z**.
- Re-import: 151.909 seconds, 19,681 elements, zero missing members/nested unresolved references/invalid source ways. Extract JSON: 8,728,479 bytes; gzip: 1,389,210 bytes; SHA-256 `e15a0a4e3338eca097ebe590ea899184adcad5a11173fdbd90ce09b1b9f54310`.
- Bundle: 16 immutable tiles, **1,800,228 compressed bytes (~1.72 MiB)**. The final importer reproduces every blob and the saved manifest byte-for-byte at the recorded import timestamp.
- Local bundle: `.firebase/mapping-qa/public-reliability/cache-geometry-v2/`. Extract/PBF receipts remain alongside it. This is buffered 21061 coverage from the Maryland source, **not statewide cached coverage**.

Freshness continues to use source age: fresh through 7 days; usable cached through 14; explicitly stale through 30; unavailable after that or on missing/future dates. Failed/older live refresh cannot erase or relabel usable evidence. Cache/parser/import versions, exact query bounds and halo evidence bounds remain distinct. No timestamp was renewed to make old source data appear fresh.

## Validation

**178 tests passed:** 153 Node unit/architecture tests, 18 local Firestore emulator tests, 7 Python extractor tests.

Coverage includes exact/reversed/split multipolygons, duplicate/conflicting members, inner holes and islands, missing members, unsupported roles, self-crossing rings, local uncertainty trimming, school preservation, incomplete site rejection, unrelated marker isolation, tile-seam guards, multi-area alternatives, stale labels, live-down cached recommendations, cache integrity/limits, publication atomicity, PI ordering, tenant/entitlement denial, Apply reauthorization, refresh leases and preservation of the last good pointer. The negative cases do not gain recommendations just to increase workload.

Deployment mirrors match maintained modules; generator retains the new geometry module; dependency locks unchanged. No Flutter file changed in this correction. Frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`.

## Minimal deployment/backfill package — prepared only

No deployment, cloud upload, scheduler, IAM change, production campaign mutation, financial action, native build or CI run was performed.

1. **Scope:** reviewed `getSmartZonePlan` and `applySmartZonePlan` closures in `functions-discovery`, shared PI integration from the accepted parent, new geometry parser and cache reader/runtime. Keep identities, secret bindings, entitlement checks and finance/assignment code unchanged. Do not deploy an entire unrelated codebase.
2. **Web:** this correction adds no Flutter/native source. The already-reviewed parent has two web presentation changes (`campaign_zones_screen.dart`, `smart_zone_recommendation_evidence.dart`); the web-only package must include those if they are not already hosted. Its existing renderer shows server limitations, source dates and alternatives. Deploy/rebuild only that approved web package when authorized; no native merge/build. This report does not claim production currently renders the new response.
3. **One-time cache load:** after deployment approval, validate the original PBF checksum and `.poly`, use the pinned local osmium dependency, run the maintained extractor for buffered active Maryland coverage, build a new local bundle, run this replay, and review all completeness/provenance receipts. The retained 16-tile V2 bundle is ready for a 21061 pilot while its source age remains acceptable. Refresh from an approved public snapshot if aged out; never change snapshot time.
4. **Publication:** verify the existing runtime's narrow private-bucket access without widening IAM; preserve the prior manifest and exact object generation. Use `publish_smart_zone_public_cache.publishBundle` with the verified expected generation (0 only if genuinely absent). Validate all blobs first, upload immutable objects, switch the manifest pointer last, then read back checksums/metadata using the actual runtime. Do not import raw PBF data during a customer request.
5. **Backfill extent/storage/runtime:** measured pilot is ~1.72 MiB tiled storage plus ~0.20 GiB retained PBF; extraction ~2m32s and local search ~3s. Full-state derivative storage/runtime remain **unmeasured**. The earlier 0.25–1 GB statewide derivative estimate is planning-only, not a capacity claim. Expand only the needed Maryland coverage using the same importer and explicit `.poly` coverage. Each cache query requires its 500 m hazard halo to be covered. Do not label the pilot statewide.
6. **Rollback:** retain current production revisions/hosting version and the prior cache pointer/generation. Roll functions/web back together when needed; restore a matching parser-compatible manifest with a fresh generation precondition. V2 readers intentionally reject V1 parser metadata. The ordinary publication helper refuses source timestamp regression; use an explicitly reviewed rollback operation rather than bypassing that check. Preserve immutable blobs/audit receipts. V4 run identity invalidates incompatible older runs; it does not rewrite old campaigns.
7. **Cadence:** no recurring job is required for initial controlled acceptance. A local operator-reviewed weekly refresh is sufficient for the proposed fresh-data window. No scheduler or recurring paid service is created. Existing storage/read/PI costs remain; actual bucket location, storage class and retention must be confirmed before deployment. Failed live refresh still has one request/search and the maintained shared cooldown/day cap.

## Production acceptance disposition

**A controlled, limited production acceptance phase is justified for this candidate; production PASS is not.** The correction measurably improves available evidence and retains exclusions, but does not establish five hours of coverage. No new Founder click is needed until an authorized deployment and server/cache readback succeed.

Keep Limited/Beta until all are demonstrated: production cache load and source/freshness visibility; same 21061 search served from cache with live Overpass unavailable; school/uncertainty/barrier checks; safe Apply through current workspace/campaign authority to an authorized unpaid draft; and Founder physical inspection. No paid campaign or financial transition is part of that acceptance.

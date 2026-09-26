# Mapping QA: work obligation, 225-property provenance, and drawing 404

Audit date: 2026-09-26. This review changes no completion algorithm, accepted compensation, financial state, provider configuration, deployed function, or native source. The added tests execute pure evaluators offline.

## Finding: completion has two materially different paths

It would be incorrect to report that every existing production campaign uses verified target/route completion. The maintained production submission package retains a legacy fallback that counts walking distance inside the polygon. This is a blocker to blanket assurance that old completion obligations are independent of non-target land. No migration or economic-policy change is made by this QA work.

The modern `CanvassingRoute80_95V1` path measures unique assigned-route coverage. It does not require visiting every part of a polygon. It also does not verify individual household delivery: `householdCoverage` is deliberately null. Better target/serviceability evidence is still required before describing its route as a complete list of eligible residential delivery stops.

### Verified production-source lineage

Fresh read-only metadata in `.firebase/mapping-qa/*-before.private.json` matches the preceding promotion readback source generation exactly:

| Callable | Active revision | Source generation |
| --- | --- | --- |
| `startTrackingSession` | `starttrackingsession-00004-rav` | `1790446060482308` |
| `submitZoneCompletion` | `submitzonecompletion-00010-cop` | `1790446216380600` |

The reviewed files in `.firebase/campaign-authority/packages` match their prepared promotion-manifest SHA-256 digests. Selected evidence:

- `submitZoneCompletion/index.js`: `d33141df1b6617617bf701fb8f9f9bf7013721273e2e1a81bb4856f94f6664cf`
- `submitZoneCompletion/canvassing_completion.js`: `ebace6b2ce0044cc764f95bbcec2b603392fb32187bdd1171fe081b69c6abaec`
- `startTrackingSession/index.js`: `93178e08169c32a27a62d9ff458d2ad61b7a60ab7513217b94e7e90db9deecf0`

Production promotion overlays the maintained source, including the production applicability predicate. Reading only `functions/canvassing_completion.js` would be misleading because that working source retains its staging applicability predicate; the live package activates the route evaluator from the campaign's `completionPolicyVersion`.

### Polygon → route → GPS credit

1. A saved zone polygon is a corridor and an immutable geometry binding. It is not itself the modern completion denominator.
2. `canvassing_route_authority.derive` uses observed ordered road linework, clips it to the corridor and known exclusion polygons, and filters restricted/private or unsupported roads. It rejects absent or disconnected route evidence instead of inventing a connector. The currently reviewed filter also excludes uncertain bridge/tunnel/layer connectors. It is only as complete as the provider's exclusions and access tags.
3. The resulting `executionRoute` has a centerline, route hash, corridor hash, and unique route metres. `coverageAuthority` binds the route to the campaign and zone, provider snapshot digest, explicit access review, and denominator. `production_canvassing_contract` binds those values into the offered and accepted contract.
4. `canvassing_completion.coverage` partitions the assigned line into canonical undirected two-metre cells. Only accepted GPS evidence with valid coordinates, timestamps, and bounded reported accuracy enters the estimate. Short plausible evidence segments and nearby fixes cover route cells within bounded accuracy tolerance. Repeated passes do not multiply credit; long gaps do not automatically fill the route.
5. Completion assessment verifies the tracking session, finalization, saved route, point counts, and evidence digest. It compares covered route metres with the unique assigned-route denominator. Property counts and raw polygon area do not enter this calculation. Existing review and compensation thresholds remain unchanged.
6. The current production start authority refuses a new unversioned canvassing start and requires the approved route plus matching immutable assignment terms. The submit authority still retains the legacy branch for records outside the versioned policy; the existence of that branch is not evidence that a specific current customer has an active legacy obligation.

A school field or lake represented only as empty polygon interior adds no modern route cells. A wrongly included campus road can still become part of the obligation when geography/access evidence fails to exclude it. Consequently, route-based evaluation alone does not cure a bad route recommendation. Current coverage is route evidence, not proof that every eligible door received a flyer.

### Legacy path that remains preserved

The production `submitZoneCompletion/index.js` routes non-versioned records to `calculateRouteCompletion`. That function:

- Sums GPS segment distance when the segment midpoint lies inside `zone.serviceArea`.
- Divides by `executionRoute` walking distance if present, otherwise stored estimated walking metres/miles.
- Infers `completedHomes` by multiplying an assigned/estimated home count by that ratio.

It has no required-route proximity test and no verified target inventory. The geometry estimate in `operational_layer.calculateGeometryWalkingEstimate` is `perimeter + area / 30`, so additional empty polygon area can increase a legacy denominator and lower the same worker trace's completion percentage. Calling this raw polygon *area coverage* would also be imprecise: it is polygon-constrained distance estimation with a potentially geometry-derived denominator.

The affected QA draft was reported by the root's read-only inspection as own-team with no saved zones or geometry. It has no Scaler GPS completion obligation. The legacy concern must remain visible for the platform audit, but it should not be presented as an observed payment failure on that draft.

## The 225-property number

The reviewed pre-fix deployed Smart Zone package computes `totalProperties = round(desiredHours * propertiesPerHour)`, with a default pace of 45. Five requested hours therefore produces 225. The subsequent workload calculation divides the same assumed count by the same pace, returning five hours. This is circular planning arithmetic, not a count established by a property source.

### Observed 21061 production readback

The root reproduced the pre-fix recommendation through the production UI using read-only planning for ZIP 21061. The actual recommendation was labeled **`serviceable_geography`**, with **225 estimated properties / approximately five estimated hours**, and an **Excellent** rating. It was not the basic-area fallback described below.

The screenshot at `.firebase/mapping-qa/21061-before-recommendation.png` visibly records “Serviceable geography • mapped roads and property context” and “225 estimated properties • ~5 estimated total hours.” Its blue recommendation hull intrudes into the labeled **Corkran Middle School** campus, including parking/building context. The Excellent rating is part of the root's reproduction report; it is not visible in that screenshot. No recommendation was applied, and this reproduction made no campaign-data write.

This observed provider-shaped recommendation still uses the assumed 225 described above. A `serviceable_geography` label does not establish eligible residential delivery-point inventory or justify a geography-quality rating.

### Separate offline fallback characterization

An offline invocation of the exact prepared prior-production `getSmartZonePlan/smart_zone_planning.js` with five hours and no geographic snapshot returned:

| Field | Result |
| --- | --- |
| Policy | `SmartZonePlanningV4` |
| Estimated properties | `225` |
| Estimated total hours | `5` |
| Serviceability | `basic_area_estimate` |
| Geographic source | `null` |
| Source date | absent |
| Confidence | `low` |
| Workability | `excellent` |
| Rectangle area | approximately `180,000 m²` |

The fallback rectangle's nominal area is `225 × 800 m²`, centered on the supplied anchor and fitted to the selected boundary when possible. Even when an OSM snapshot shapes a hull, the reviewed algorithm distributes the same assumed 225 between zones rather than counting eligible delivery points. The “Excellent” value is based on the 240–360-minute workload band, not evidence that the geography avoids a school, water, major barrier, or inaccessible parcel.

The number has no parcel/unit/address/Census source date because it is none of those measures. Schools do not mathematically add to that count; instead the arithmetic is blind to whether the surrounding land contains schools or inaccessible gaps. The reviewed OSM query requests any `addr:housenumber`, so institutional addresses could affect geometry shaping, and school polygons were not explicitly queried as exclusions. Filtering some points before drawing a convex hull also does not preserve excluded interior land.

The affected campaign has no persisted QA preview polygon. The new screenshot establishes the visually observed Corkran-campus intrusion in the reproduced recommendation; the draft alone still cannot supply its exact vertices, provider response snapshot, or numerical intersection area. This limits exact geometric reconstruction, not the observed defect or demonstrated arithmetic provenance. The 225 figure must not become an asserted flyer quantity or completed household count.

### Geographically grounded candidate verification after repair

The public fixture `functions/fixtures/21061-corkran-osm-public.json` records a narrow query around the actual [Corkran Middle School OSM footprint](https://www.openstreetmap.org/way/286993971), including surrounding streets and mapped features. It contains 341 real provider elements, with an OSM database timestamp of `2026-09-26T18:45:17Z` and retrieval time of `2026-09-26T18:46:46.541Z`. This is a bounded neighborhood sample, not a whole-ZIP inventory or a saved customer recommendation. Contributor identities, changesets, contact information, and unrelated tags were removed. Geometry, relevant public classification/address tags, feature IDs, and edit timestamps remain; no synthetic targets were added. Attribution is OpenStreetMap contributors, ODbL 1.0.

This fixture exposed two issues that synthetic point fixtures missed: Overpass returned residential building geometry without `center`, and 15 real house footprints were smaller than the 100 m² minimum useful campaign Zone. The repaired source parser now derives an interior representative point from valid building geometry and uses a separate positive-area source-footprint check. It preserves all **32 classified residential source buildings**. These are mapped buildings, not 32 verified households or delivery points; terrace buildings can contain several units and the source can omit many buildings.

The repaired local candidate uses **19 mapped building features**, **22 connected planning-road segments** totaling approximately **739 metres**, and a **12-vertex territory of approximately 56,981 m²**. Its **44-minute workload is advisory**. The candidate is north of the actual school footprint and excludes every school polygon in the snapshot. Every planning segment follows retained permitted provider linework and remains inside the candidate territory. The network is explicitly not an approved execution route, verified pedestrian itinerary, or household-delivery obligation. No production recommendation was applied or deployed during this verification.

The [SVG diagnostic](qa-artifacts/21061-corkran-planning-candidate.svg) and [rendered PNG](qa-artifacts/21061-corkran-planning-candidate.png) show the candidate, actual school footprints, source targets, and planning network with source dates and limitations. The PNG was visually inspected. A separate regression removes road evidence from the same real snapshot and requires manual review with no generated Zone, property count, duration, or compensation recommendation.

The independent review also found and verified repairs for partial successful-HTTP provider responses, commercial-building footprint exclusions, incomplete multipolygon components, and self-crossing hazard polygons. These planning checks do not alter accepted tracking, completion, compensation, earnings, or payout contracts.

## Drawing 404 boundary

The exact user-visible message, “The campaign zone does not exist,” is from the `analyzePropertyIntelligence` zone-ID branch. It is also present in the fresh downloaded source at `.firebase/mapping-qa/base/analyzePropertyIntelligence/index.js`.

The pre-fix client sequence is:

1. `CampaignZonesScreen._createZone` allocates a new `.doc()` reference and prepares `pendingZoneData`.
2. It opens `CampaignAreaScreen` before persisting the zone.
3. The Property Intelligence button calls `PropertyIntelligenceService.analyzeZone(widget.campaignReference.id)`.
4. That service invokes **`analyzePropertyIntelligence`** with `{zoneId}`. It does not invoke `analyzeCampaignZone`.
5. The server correctly looks for the persisted `campaignZones/{zoneId}` record, finds none, and returns `not-found`/404.

The maintained `analyzePropertyIntelligence` authority already accepts `{geometry}` for exploratory analysis and labels the response `analysisScope: exploratory`. Draft analysis should use the exact current drawing through that authority. Editing an existing zone should likewise analyze current unsaved geometry when that is what the screen displays, rather than accidentally reanalyzing the old saved polygon. The client/UI agent owns that repair and its persistence/navigation tests. Suppressing the 404 or creating a fake empty zone would not repair the authority mismatch.

## Focused verification

`functions/marketing_work_obligation.test.js`: **5/5 passing**. The tests verify that modern route credit is unchanged by added empty polygon land, rejects off-route walking within the polygon, ignores unverified property counts as denominators, rejects a mutated corridor binding, and explicitly characterizes the preserved legacy distance path. The test extracts only pure functions for the legacy characterization and never loads the server's callable entry points.

`functions/smart_zone_21061_fixture.test.js`: **4/4 passing**, covering the actual public footprint, geometry-only and small residential buildings, campus-free target/network/territory separation, and fail-closed behavior when road evidence is missing. The combined independent run of these tests with planning, geography, and entry-contract suites passed **43/43**, including the final adjacent-building deduplication and oversized-territory regressions.

Synthetic algorithm/serviceability fixtures and UI interaction regressions are owned by the other mapping-QA agents. Marketing History continues to store exact authoritative completed Zone geometry; neither a recommendation nor its advisory network establishes completion. No completion-policy or economic-rule change was made here.

# Smart Zone geographic evidence and review

Status: September 26 mapping-QA candidate, prepared and tested locally. No deployment is authorized by the latest product-direction update; this record supports predeployment review.

## Defect and corrected meaning

The reviewed production V4 planner computed `225` as five requested hours multiplied by an assumed pace of 45 properties/hour. It assigned that number to both provider-shaped and rectangular fallback recommendations. The `excellent` rating depended on the resulting 240–360-minute band. Neither number established residential properties, delivery points or geographic usefulness. In the read-only 21061 reproduction, the actual provider-shaped hull intruded into the Corkran Middle School campus; it was not the no-provider fallback.

V5 no longer invents a recommended rectangle, target count, hours or compensation when evidence is insufficient. It returns `manual_review_required`, an empty Zones list, null recommended territory/count/workload/compensation, and guidance to Adjust Area or Draw My Area. Apply rejects such a result before changing the saved campaign or Zones. Supported candidates always say **Review Recommended Area**, with source and limitations. Requested hours cap the target selection budget; they do not create observed targets.

## Source, campaign intent and geography

The maintained Overpass/OSM endpoint supplies classified building/address features, ordered local-road linework, highway/rail barriers, and mapped land footprints. No new provider, model, paid service or activation is introduced. The query uses the exact server-selected geography, with its existing 25 km²/12-second bounds. An oversized selected area returns `selected_area_exceeds_analysis_limit` and explicitly explains the 25 km² limit while preserving the exact selection; it is never silently replaced by an anchor box. Full ZIP boundaries can therefore require a smaller owner-selected area or manual review. The bounded Corkran fixture below does not establish a successful whole-ZIP recommendation. HTTP-success responses containing provider error/timeout remarks are rejected because their elements may be partial.

Residential flyer, door-hanger and canvassing planning requires residential classification. An unclassified address or road vertex is not a residential target. Business-card/B2B planning admits mapped business features. Event venues, including schools and parks, can be relevant to event intent, but event access and duration require manual review. Unsupported/exact-pin intents retain manual or existing exact-location workflows.

For residential intent, school/education, government/institution, cemetery, park, water, industrial/warehouse, large parking, commercial and restricted land cannot support a target or be filled back into a candidate polygon. Business eligibility differs; there is no universal school/commercial ban. Missing, incomplete, self-crossing or unresolved exclusion footprints fail to manual review. Multipolygon outer components are individually checked; one valid outer cannot conceal a missing/incomplete outer. Source building footprints use a small source-observation minimum independent of the useful-Zone geometry minimum.

When Overpass supplies footprint geometry without a center, the parser derives an interior representative point from that footprint. It checks the centroid and uses a verified interior scanline interval for concave cases. Matching addresses, close duplicate observations and observations within an already observed footprint are conservatively deduplicated. The result remains **mapped target features**, not parcel authority, unique households, housing units or delivery entrances.

## How candidate Zones are constructed

Targets must lie near permitted local-road segments. Restricted/private roads, driveways, parking aisles, unverified service roads and grade-separated connectors are excluded. Highways, ramps and railway lines operate as barriers. Components connect through actual mapped endpoints; the planner does not draw a connector across a disconnected highway gap.

Each candidate combines its selected target locations and connected supporting road segments, with a small visual working margin. A target/road hull is accepted only if it remains inside the selected territory and avoids every known campaign-ineligible footprint and mapped barrier. Failed candidates are subdivided spatially and rechecked; candidates that cannot meet those conditions are omitted. This preserves useful ordinary road space around target blocks while refusing to fill a known campus/park gap simply because surrounding points form a hull.

The bounded review rules require at least six classified features, target proximity within 60 meters of a supported road, at most 6,000 m² of displayed territory and 150 mapped road meters per selected feature, no more than 200 supporting segments per Zone, and the existing six-hour advisory workload ceiling. These are conservative planning bounds, not an AI quality score or verified pedestrian-access certification. Workload uses selected mapped-feature count, the existing assumed activity pace, and a conservative out-and-back allowance over the supporting network. The fixed-price compensation policy and economic authority are unchanged.

## Territory, targets and route are separate

The selected campaign `serviceArea` is the Business territory. A proposed Zone's `geometry` is its displayed candidate territory. `planningTargets` contains classified mapped source IDs and locations. `planningNetwork` contains the actual supporting road segments with `isExecutionRoute: false`, `accessVerified: false` and `suggestedRoute: null`.

The network is not an optimized or reviewed practical itinerary. It cannot create an assignment, execution route, completion denominator or payout obligation. On apply, these remain separate `smartZonePlanningTargets` and `smartZonePlanningNetwork` records. `smartZoneTargetEvidence` includes source, source snapshot date, retrieval time, limitations, feature count and exact saved-geometry digest. Materials uses that digest and never converts the feature count into an automatic flyer quantity. Retrieval time is not substituted for an unknown source vintage.

See [the work-obligation audit](mapping-qa-work-obligation-audit.md) for the modern route-based completion evidence and the preserved legacy walked-distance/geometry-estimate limitation. No completion or financial-policy change is included in this mapping repair.

## 21061 acceptance fixture and verification

The sanitized public fixture records 341 actual OSM elements around Corkran Middle School, including three school footprints, 55 residential road ways and 32 residential building ways. Fifteen of those houses are smaller than 100 m² and all 32 arrive without provider center fields; the regression ensures they remain recognized as mapped features. The repaired planner selects 19 mapped residential candidates in one review-required Zone. Tests verify that its entire polygon avoids the known school footprints, its supporting network follows actual permitted source segments, its source date is retained, and no requested-hours-derived 225 count or Excellent label appears. Removing road evidence produces manual review without a proposed polygon.

Synthetic geographic cases cover dense residential blocks, a school border, park borders and an internal park gap, highway-separated neighborhoods, waterfronts, mixed business/residential land, sparse suburbs, irregular roads and inaccessible/institutional land. They assert exclusion, actual evidence concentration, component separation, limits and honest fallback, not just polygon existence.

Verification evidence:

- **57 passing source tests:** Smart Zone planning, geography, entry contracts/authority, the actual 21061 fixture, route authority and work-obligation audit.
- **68 passing separate authority/funding/settlement regressions:** own-team boundaries, existing funding hardening, reserve settlement, funding bindings and canvassing contract.
- **Three passing prepared-package checks:** the exact current-live get/apply exports against localhost emulators, plus the overlaid Business Operations Materials projection with synthetic current/stale/legacy evidence. No production campaign, payment, assignment, completion or provider call is made by those checks.

`tools/prepare_mapping_qa_promotion.cjs` overlays the separately captured current production archives for `getSmartZonePlan`, `applySmartZonePlan` and `businessOperationsV1`, all in `scaled-circle/us-east1`. The first two change only their planner index fragment and four planner modules; Business Operations changes only `campaign_planning.js`. Dependencies, environment files, workspace authorization and deployed own-team safeguards remain exact. Private manifests record the source generations and full file hashes under `.firebase/mapping-qa/`; they are not publication artifacts. `tools/verify_mapping_qa_promotion.cjs` checks those exact prepared packages. No deployment or commit is performed by this subtask.

OSM can omit houses, access restrictions, sidewalks, gates, entrances and entire exclusion features. This candidate therefore requires human review even when it returns a bounded recommendation. It does not claim complete property coverage, optimal routing, verified delivery points, accessibility or an authoritative work obligation.

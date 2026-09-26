# Mapping production acceptance — 2026-09-26

This record separates source/fixture checks, public-provider local replays, deployment readbacks, and authenticated production-browser observations. The reviewed candidate is `871030a`. The user authorized the reviewed mapping deployment and bounded live acceptance. Verified deployment readbacks are recorded below; authenticated browser acceptance remains separate and ongoing.

The deployment section below records the root's verified readbacks. Authenticated production-browser acceptance remains ongoing and is reserved for the root's direct observations. No application code, provider query, deployment, account access, or campaign write was performed while preparing this record.

## Evidence boundaries

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Accepted offline source/fixture tests | Geometry checks, intent classification, safe fallback, source provenance and authority separation under the tested inputs | Deployed revisions, live provider availability or production-browser behavior |
| Earlier real Corkran snapshot replay | Candidate behavior on a timestamped, geographically grounded public dataset | A fresh successful provider request or a complete 21061 inventory |
| Three bounded public-provider local replays below | Current public-provider outcomes processed by the exact prepared candidate modules | Authenticated production callable success or Business UI acceptance |
| Deployment metadata/readback | Verified revisions, Hosting artifact and configuration preservation recorded below | Not inferred from local tests or provider results |
| Authenticated production-browser observations | To be appended by root | Not inferred from the standalone diagnostic image |

The prepared local replay loaded `smart_zone_planning.js`, `smart_zone_geography.js`, `smart_zone_serviceability.js` and `smart_zone_entry_contract.js` from `.firebase/mapping-qa/packages/getSmartZonePlan`. Their SHA-256 digests matched the preparation manifest and candidate source before and after the replay. The replay did not load the callable entry point, extract credentials or sessions, access Firestore, apply a recommendation, or perform financial actions.

## Bounded public-provider results

Exactly one maintained Overpass request was attempted per case, serially, using the existing 12-second timeout. There were no retries or alternate-provider requests. All times are UTC on 2026-09-26.

| Case | Exact selected context | Provider result | Local planner response |
| --- | --- | --- | --- |
| Corkran / 21061 residential flyers | Same 1.149279 km² boundary as the accepted fixture; anchor 39.1551233, -76.6346431 | Request 19:14:29.278–19:14:41.291; `AbortError` at the maintained timeout. No HTTP status or response body. | Manual review; no Zones, target total, duration or compensation recommendation. Fresh positive campus acceptance was **not established**. |
| Ellicott City residential sample, door hangers | 1.000018 km²; anchor 39.2760, -76.8350 | Request 19:14:41.298–19:14:50.800; HTTP 504. No usable snapshot. | Same safe fallback. Residential-geography usefulness was **not assessed successfully** on this attempt. |
| Ellicott City Main Street B2B | 0.810002 km²; anchor 39.2674, -76.7988 | HTTP 200; 532 elements. OSM database time 19:12:49; retrieval 19:15:00.811. | 65 source business features and 60 eligible features after selection/exclusion/dedup checks. Manual review because two non-target footprints could not be established; no proposed Zones or invented workload. |

The B2B snapshot's unresolved exclusions are the point-only place-of-worship node `10106565427` and Patapsco River relation `1185777`. The river response contains 137 outer members, 22 inner members and 3,070 outer-member geometry points, but the bounded parser returns no established complete water footprint. This is a conservative source/complexity limitation. Existing business features are not permission to ignore the unresolved exclusions.

The same B2B source also contains 141 residential features, 184 unclassified addresses and seven event features; they do not become business work merely because they occupy the selected geography. Source road ways include 73 service, nine tertiary, four unclassified and 26 residential. Those are source observations, not a reviewed itinerary.

All three local unsupported plans were rejected by `assertApplicablePlan`; all retained `manual_review_required`, null target/workload/compensation totals and no Excellent rating or verified-delivery claim. There were no newly returned candidate polygons or networks, so these fresh attempts do **not** provide positive polygon/network exclusion acceptance.

Sanitized local artifacts are retained in `.firebase/mapping-qa/provider-replay-871030a/`: `REPORT.public.md`, `summary.public.json`, and per-case `.source.public.json`, `.plan.public.json` and `.summary.public.json` files. They contain exact queries, boundaries, attempt times, source dates when available, status/errors and module hashes. Contributor identities, changesets, contact fields and unrelated tags were removed. There is no customer campaign or authentication data.

## Earlier real Corkran fixture — separate positive evidence

The accepted public fixture contains 341 actual OSM elements around [Corkran Middle School](https://www.openstreetmap.org/way/286993971), with source database time `2026-09-26T18:45:17Z` and retrieval `2026-09-26T18:46:46.541Z`. It is a bounded school-surroundings sample, not the full ZIP or a persisted customer recommendation.

The repaired parser retains all 32 classified residential building ways, including 15 footprints below 100 m² and buildings returned without provider center fields. An offline replay against the exact prepared candidate still produces one review-required territory with 19 mapped building candidates, 22 planning-network segments, approximately 739 mapped road metres, and an advisory 44-minute workload. The entire candidate avoids all three mapped school polygons, and each network segment follows actual permitted source linework inside that territory. These features are not 19 verified households, entrances or flyer delivery points.

The [diagnostic PNG](qa-artifacts/21061-corkran-planning-candidate.png) and [SVG](qa-artifacts/21061-corkran-planning-candidate.svg) were generated from that public fixture and visually inspected. They explicitly distinguish territory, source targets and planning-road evidence. They are diagnostic artifacts; the current app does not yet render all of those layers, as noted below.

## Follow-up resolver and provider diagnosis — separate from deployed acceptance

The evidence below was collected after the `871030a` deployment. It distinguishes a reproducible resolver defect, current provider observations, and offline comparisons. It does **not** establish the reason the earlier authenticated production request returned unavailable geography, and it is not acceptance of a later deployment. Reviewing these retained artifacts made no provider request or campaign write.

The production readback at `.firebase/mapping-qa/live-21061-diagnostic-20260926T192902Z/summary.safe.json` records the `getsmartzoneplan-00007-muj` HTTP 200 request at `19:25:58.103011Z` with an 11.529-second latency. Those retained logs have no geographic acquisition reason category or provider response status. Latency alone does not prove a timeout; the original null-snapshot cause remains **unproven**.

### Confirmed ZIP resolver defect

Two cache-disabled local reproductions, using `21061` and its full selected address label, both received a Nominatim result followed by a TIGERweb HTTP 200 response containing a provider error. They returned the ZIP center without a boundary. The old selection code then converted that ZIP into an approximately 600 m × 600 m address square (359,999.57 m²). This demonstrates the current resolver/fallback behavior under those reproduced responses, not the provider response to the earlier production request.

The separate public TIGERweb field probe at `19:35:42.850–19:35:43.030Z` identifies the concrete query problem:

| Probe | Actual result |
| --- | --- |
| ZCTA layer metadata | `2020 Census ZIP Code Tabulation Areas`, polygon geometry; fields `STATE` and `COUNTY` are absent |
| Previous `outFields=GEOID,NAME,BASENAME,STATE,COUNTY,ZCTA5` | HTTP 200 containing error code 400, “Failed to execute query.” |
| Same point query with `outFields=GEOID` | HTTP 200, one polygon with `GEOID: 21061`; 97 normalized vertices, 31,312,404.67 m²; contains Corkran |
| Corrected resolver replay against that retained response | Offline, zero provider requests; reproduces the same 97 vertices and geometry digest `895512474f98d2ccbd072868664d0ab88492a98ae8c39650cc5957edb2e247ea` |

The returned ZCTA is approximately 31.31 km², exceeding the maintained 25 km² analysis limit. A truthful corrected result therefore preserves the full ZIP selection and requires the user to explicitly choose a smaller analysis area; successful boundary resolution does not make the full ZIP eligible for automatic analysis. The source vintage is **2020 Census ZCTA**, distinct from the probe time. No smaller area or replacement square should be silently substituted.

The safe evidence is retained in `.firebase/mapping-qa/resolver-reproduction/{query-21061,full-address}/summary.safe.json` and `.firebase/mapping-qa/tiger-21061-field-proof/{summary.public.json,fixed-resolver-offline-replay.safe.json}`. The field proof records the exact query, response metadata and public boundary.

### Current small-area provider result and controlled fixture comparison

Exactly one fresh Overpass request was made for the reproduced 600 m square at `19:37:26.847–19:37:34.894Z`. It returned HTTP 200 in 8.047 seconds, with 148 elements: 14 nodes, 133 ways and one relation. The OSM database timestamp is `19:36:06.000Z`; successful retrieval is `19:37:34.892Z`. These are separate timestamps. The classified inventory contains 13 residential, 30 business, two event and five unclassified-address features, plus 96 road ways and 11 land features. None is a verified household or delivery-point count.

| Input evidence and exact selected geography | Eligible residential observations | Road-supported targets | Planner result |
| --- | --- | --- | --- |
| Fresh 148-element response; reproduced 600 m square (0.35999957 km²) | 13 | 1 | Manual review; no proposed Zone; selected-candidate total, advisory duration and compensation are null |
| Earlier retained 341-element inventory restricted to the **same** 600 m square; offline comparison | 13 | 1 | Same manual-review result; this is not another narrow-area provider response |
| Earlier retained 341-element inventory with its **original larger** 1.149279 km² boundary; offline comparison | 32 | 20 | One review-required candidate containing 19 selected mapped features; advisory 44 minutes |

The matching small-area results show that the prior positive 19-feature candidate and this unsupported selection use materially different boundaries. The new successful response does not establish why the older production acquisition was unavailable. It also does not establish an absence of residential targets: 13 were observed, while only one met the maintained road-support checks. A zero selected candidate count must not be presented as an observed property count.

The exact small-square geometry digest is `76dfd194fd047ca61e07ce38a3ae2ff219c039d5f26941e1f1b6852136418f49`. The source bounds, module hashes, fresh diagnostic and both offline comparison results are retained in `.firebase/mapping-qa/resolver-provider-diagnostics/summary.safe.json`, explicitly marked `current_local_public_provider_replay_not_historical_or_authenticated_production` and `historicalProductionCauseEstablished: false`.

## Accepted negative-case evidence

These are previously accepted automated fixture results, not additional live-provider or production-browser checks. Preparing this document did not rerun the broad suites.

| Negative case | Accepted evidence | Required behavior verified |
| --- | --- | --- |
| Selected territory exceeds 25 km² | `smart_zone_planning.test.js`: oversized resolved territory test using a 6,000 m × 6,000 m selection | Exact selected territory preserved; no replacement anchor rectangle, candidate, target total or workload; explanatory analysis-limit response |
| Real residential targets but no roads | `smart_zone_21061_fixture.test.js`: road ways removed from the actual snapshot | Recognized eligible target evidence retained, but no unsupported candidate or duration; Apply guard rejects |
| Provider failure or partial response | `smart_zone_geography.test.js`: thrown provider failure and HTTP-success timeout-remark fixture; fresh abort/504 replays above | Failed or partial geography cannot establish a recommendation; no invented count or fallback rectangle |
| Incomplete or malformed exclusions | Planner/geography tests for unresolved school points, missing outer-member geometry, one complete outer beside an incomplete outer, and self-crossing school rings | A partial/invalid known footprint cannot be silently dropped or treated as complete; manual review |
| Event intent | Mixed-intent test with a mapped school venue | Venue can be relevant to event intent; event access and duration still require manual review rather than an automatic residential exclusion or fabricated work estimate |
| Sparse/disconnected/obstructed geography | Sparse-suburb, internal-park, restricted-gap and highway fixtures | No convenient rectangle or invented connector makes unsupported geography appear workable |
| Invalid freehand drawing | `campaign_freehand_geometry_test.dart`: explicit and implicit closure crossings, retraced edges, nonadjacent duplicates, tiny areas/loops, excessive points, unsupported coordinates/extent | Readable error; no angular reordering, hull replacement, or silent change to the intended saved area |
| Interrupted drawing | Accepted interaction tests for cancel, multiple pointers and leaving the map | Prior area preserved; no stale drawing state |
| Release endpoint at the sample limit | Separate static review of the repaired `_traceUp` branch; no dedicated widget regression is claimed here | A needed endpoint beyond the 2,048-point limit marks the stroke invalid instead of silently omitting that endpoint |

The source/fixture suites and their wider authority checks are recorded in [the geographic evidence record](smart-zone-geographic-realism.md). The independent focused run was 43/43, including four actual-21061 tests. These totals are overlapping evidence, not numbers to add together. Root may append final release totals below with their exact commands.

## Customer-facing message inspection

This is a static inspection of the candidate source, not a claim that every message was observed in production. The recommendation widget renders `explanation` and quality reasons. Machine fields such as `selected_area_exceeds_analysis_limit`, `insufficient_mapped_evidence` and `manual_review_required` are not rendered directly by that widget.

| Condition | Current customer-facing text |
| --- | --- |
| More than 25 km² | “The selected territory exceeds the 25 km² geographic analysis limit. Your selected area is unchanged. Choose a smaller area with Adjust Area or Draw My Area for review.” |
| Missing provider/road inputs, including timeout | “Reliable classified targets and local-road linework are unavailable. Review or draw the area manually.” |
| Targets exist but connected road evidence is insufficient | “We found insufficient connected target and road evidence to automatically create a practical Zone. Review or draw it manually.” |
| Incomplete non-target geometry | “Some non-target land has incomplete geometry. Review the area manually.” |
| Unresolved exclusion footprint | “A mapped non-target feature has no reliable footprint. Review the surrounding area manually.” |
| Event intent | “Mapped venues can be relevant to this campaign. Event access and work duration require manual review.” |
| Unsupported Apply attempt | “There is not enough reliable geographic evidence to apply practical Zones. Choose Adjust Area or Draw My Area to review it.” |
| Unexpected planner failure | “We could not prepare workable Zones for this area. Keep your selection and try again, or draw a smaller territory.” |
| Crossing/retraced freehand boundary | “The boundary crosses or loops back over itself. Redraw that edge.” |
| Too small | “Draw an area of at least 100 m².” |
| Too wide | “This outline is too wide. Draw a smaller local territory.” |
| Too large | “Freehand drawing supports up to 100 km² per territory.” |
| Excess samples | “This outline has too many points. Draw a shorter, simpler boundary.” |
| Pointer leaves map | “Keep the outline inside the map. Move the map in Browse mode, then draw again.” |
| Multiple pointers | “Draw with one finger at a time. Try the outline again.” |
| Interrupted stroke | “The outline was interrupted. Try drawing it again.” |

No opaque raw reason codes were found in these selected fallback/invalid-drawing presentation paths. Smart Zone callable errors show the server's message and strip bracketed three-digit suffixes. Property Intelligence separately displays `error.message` directly, with “Property Intelligence is temporarily unavailable” as its missing-message fallback; therefore this static review does not establish app-wide sanitization of every possible backend error string. Provider timeouts currently become a general unavailable-data explanation rather than a specific timeout/retry message.

## Confirmed presentation gaps

These are remaining gaps, not accepted claims of a complete target/route map presentation:

1. `SmartZoneGeometryMap` reads each Zone's `geometry`/`serviceArea` and optionally draws `executionRoute.centerline`. It does **not** draw the new `planningTargets.features` or `planningNetwork.segments`, nor their persisted `smartZonePlanningTargets`/`smartZonePlanningNetwork` counterparts. Its markers are Zone identity markers, not target-property markers. The app therefore cannot yet provide the same target/network visual review shown in the standalone diagnostic.
2. The map's internal legend remains **“Dashed: selected territory • Colored: Scaler Zones”**, including when the same map is used for an own-team campaign or a planning candidate. An outer own-team caption says “your team's Zones,” but does not replace this embedded legend.
3. The map accessibility description calls the displayed shapes **“authoritative worker Zones”**, including recommendation previews. That wording overstates candidate authority and is not mode-neutral.
4. The split-information card says the system **“divided the full territory into worker-sized Zones before funding.”** The candidate algorithm can omit unsupported target clusters, so a split recommendation does not establish complete territory coverage. The card is also shown without an own-team-specific version.

Source references: [map renderer](../apps/mobile/lib/widgets/smart_zone_geometry_map.dart), [recommendation dialog](../apps/mobile/lib/screens/business/campaign_zones_screen.dart), [evidence presentation](../apps/mobile/lib/widgets/smart_zone_recommendation_evidence.dart). Any later presentation repair should preserve the distinction between advisory planning-road evidence and an approved execution route; displaying an advisory line must not promote it into completion authority.

## Verified deployment readback

The following results were supplied by the root from verified deployment readbacks, separately from prepared-package tests and public-provider replays. All deployed application source remains exactly candidate `871030a`; deployment-runner and documentation work is separate.

| Surface | Verified deployment/revision/source | Verification time and evidence |
| --- | --- | --- |
| `getSmartZonePlan`, `scaled-circle/us-east1` | `getsmartzoneplan-00007-muj`; ACTIVE | Root verified `configDiff: []` and `iamUnchanged: true` |
| `applySmartZonePlan`, `scaled-circle/us-east1` | `applysmartzoneplan-00007-ced`; ACTIVE | Root verified `configDiff: []` and `iamUnchanged: true` |
| `businessOperationsV1`, `scaled-circle/us-east1` | `businessoperationsv1-00011-von`; ACTIVE | Root verified `configDiff: []` and `iamUnchanged: true` |
| Flutter web Hosting release | `sites/scaled-circle/versions/2b7928b892584cb0` | Released `2026-09-26T19:22:33.701Z`; rewrites and headers unchanged; five extra static pages retained |
| Served JavaScript | `https://scaledcircle.com/main.dart.js`; 6,552,428 bytes | SHA-256 `f2ba15700f847ea594e1ae30a3379e1af875413974090af76fd5bda9ff5b4fe5` matches the reviewed artifact |
| Application source | Exact candidate `871030a` | No application-source changes; deployment runner and documentation remain separate |
| Final release test commands | Pending root entry | Existing accepted evidence is recorded above |

These readbacks verify the deployed revisions, configuration/IAM preservation, Hosting release and served application artifact. They do not complete authenticated browser acceptance. The root's existing browser tab 6 contains an unsaved circle and remains preserved; no browser action was taken for this documentation update.

## Authenticated production browser — root to append

Founder physically selected **21061 / Anne Arundel County** in the existing Test draft, then opened Recommend an Area. The deployed `871030a` review showed **0 mapped target features**, OpenStreetMap, **Source date: Not recorded**, unavailable classified targets/local-road linework, disabled Use Recommended Area, and available Adjust Area. [Actual production screenshot](qa-artifacts/mapping-production-21061-unavailable.png). This is a fail-safe result, not positive Corkran acceptance. The exact campaign and zero-zone records were compared before/after this read-only preview and were unchanged. The older tab's unsaved 48-point circle was preserved.

## Narrow correction validation (not yet deployed at this checkpoint)

- ZCTA fallback queries only the actual GEOID field; unresolved ZIP/place results cannot silently become address-sized squares. A known full ZIP above 25 km² retains its geometry and reports the analysis limit.
- An explicit unsaved drawn `analysisBoundary` can be previewed through the same owner-authorized draft endpoint. Strict numeric coordinates, simple-ring validation and a 1,000-point cap reject malformed/crossing/retraced boundaries. Oversized geometry is not clipped or replaced. Preview writes no campaign or Zone; Apply still regenerates and checks the exact plan before its existing transaction.
- The unsaved area editor exposes **Recommend within this area**. Adjust returns into that editor with Undo. Apply uses the identical request and cannot trigger the separate pending-Zone save branch. This is a web-only deployment from the isolated worktree; the frozen native release checkout is unchanged.
- Provider diagnostics distinguish input rejection, HTTP error, timeout, malformed/partial response, successful empty inventory and successful classified data. Safe bounds/digests, stage counts and source/retrieval timestamps are retained. Missing acquisition counts remain null, not observed zeros; raw provider errors and authentication material are excluded.
- The evidence widget keeps Apply disabled and avoids presenting a candidate total of zero as a measured source inventory. Partial-source timestamps are labeled incomplete; successful source timestamp and retrieval time remain separate.
- **77 focused Node tests passed**: 73 across resolver, entry contract/authority, actual helper execution, geography/diagnostics and planning, plus four real Corkran fixture regressions. **31 Flutter widget tests passed** across evidence presentation and mapping interactions. Changed client files analyze clean; production Flutter web build succeeded (`APP_ENV=production`, `--no-pub`). Dependency locks unchanged. No native build or campaign/financial mutation.

The corrected production readback and Founder physical inspection remain to be recorded after deployment. The original 11.529-second production null-snapshot cause remains unknowable from its retained logs; current public replays and resolver proof are explicitly separate evidence.

Only direct observations belong here. Record the actual mode, visible result, timestamp and screenshot/log evidence, plus whether any authorized draft was saved. Do not infer browser PASS from a local fixture.

| Acceptance case | Observed result | Evidence |
| --- | --- | --- |
| 21061 search preserves Glen Burnie context through drawing/adjustment | Pending | Pending |
| First-attempt freehand mouse/touch, preview, Undo/Clear/Edit and advanced Circle | Pending | Pending |
| Property Intelligence explains the pre-area state and analyzes current draft geometry without nonexistent-Zone 404 | Pending | Pending |
| Recommendation/provider fallback is honest and preserves the selected territory | Pending | Pending |
| Target/network/territory presentation | Known source gaps above; append actual UI observation | Pending |
| Area → Materials consumes exact saved geometry and preserves own-team/marketplace boundaries | Pending | Pending |
| Existing CRM CSV, Download/Print and Marketing History smoke checks | Pending if exercised; otherwise explicitly not rerun | Pending |

The modern accepted completion path uses bound route evidence, with preserved legacy limitations documented in [the work-obligation audit](mapping-qa-work-obligation-audit.md). This release's planning evidence and improved boundaries do not by themselves change an accepted assignment, completed-history record, completion denominator, earnings or payout.

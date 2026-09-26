# Founder-triggered 21061 Scale Intelligence trace — September 26, 2026

The physical click and fail-safe result are accepted. This investigation read the retained production run and Cloud Run logs; it did not trigger another recommendation or query Overpass again. No campaign, service profile, subscription or financial record was changed.

## Exact production execution

- Business/workspace and authenticated actor: Attractive Remodel, `IqRjZYHKOzXYuJcSyL68LYNwtDg1`.
- Existing unpaid campaign: `czp6YVRr4SNXHGugmKZu` (`test`, flyer distribution).
- Mapping run: `1b2a34f682e6cd7ed0fd604c5ffd8951ff800b56a66f9d6b358987a9ce91a515`.
- Retained record: `propertyRecommendationWorkspaces/{businessId}/mappingRuns/{runId}`.
- Callable: `getSmartZonePlan`, production `scaled-circle`, `us-east1`, revision `getsmartzoneplan-00009-gow`.
- HTTP request: `2026-09-26T21:29:16.406468Z` (5:29:16 PM EDT); HTTP 200 after 86.292454390 seconds. This is a successfully returned fail-safe response, not a successful recommendation.
- Execution ID: `iwk39in2jxad`; trace: `a230de117640e8189b85322867f7933e`.
- Search: `21:29:18.645Z` to `21:30:42.416Z`, 83.771 seconds, uncached.
- Goal: Residential flyer outreach for deck, fence and remodeling services; five hours; effective target intent `residential`.

Path: authenticated callable and maintained Business/Scale authority → selected-area and saved Business-context validation → `generateSmartZonePlan` → maintained workspace mapping-run cache → `smart_zone_intelligence.search` → partition → sequential `smart_zone_geography.fetchSnapshot` → source classification → `smart_zone_serviceability.shape` → candidate deduplication/eligibility → Property Intelligence ranking → workload grouping → read-only preview. For this run, no candidate reached ranking or workload grouping.

## Search geometry and partitioning

The request contains the real 97-point `21061, Anne Arundel County, Maryland, United States` boundary, approximately **31.3124 km²**. The retained original boundary matches the live run numerically. Its digest is `895512474f98d2ccbd072868664d0ab88492a98ae8c39650cc5957edb2e247ea`. The resolver's generic `place-unknown` ID did not replace or invalidate the actual polygon.

The full ZIP remains search context. Intersection with the Business's three existing service areas produces approximately **24.87 km²** of eligible search territory. All **nine generated windows were selected and executed**, with **zero skipped**, two successful and seven unavailable. Recomputed window IDs match the retained execution. The largest window is 7.5729 km², below the maintained 25 km² provider ceiling. No saved campaign territory was shrunk or replaced.

| Window | Polygon area km² | Provider result | Elapsed seconds | Parsed evidence |
| --- | ---: | --- | ---: | --- |
| 1 | 0.010468 | Client abort at deadline; no HTTP status | 12.006 | Unavailable |
| 2 — Corkran | 7.572882 | HTTP 504, `text/html` | 9.737 | Unavailable |
| 3 | 4.262739 | HTTP 504, `text/html` | 9.191 | Unavailable |
| 4 | 0.093711 | HTTP 200, `application/json` | 6.496 | 55 raw elements |
| 5 | 0.004026 | HTTP 200, `application/json` | 5.506 | 8 raw elements |
| 6 | 7.504350 | HTTP 429, `text/html` | 8.975 | Unavailable |
| 7 | 4.610282 | HTTP 504, `text/html` | 7.803 | Unavailable |
| 8 | 0.086630 | Client abort at deadline; no HTTP status | 12.002 | Unavailable |
| 9 | 0.724332 | Client abort at deadline; no HTTP status | 12.000 | Unavailable |

Provider: maintained `https://overpass-api.de/api/interpreter`, POST, polygon-tag query with `[out:json][timeout:15]` and `out meta center geom`; 12-second client abort; no automatic retry. Query branches request addressed features, explicitly residential buildings, business features, permitted local-road classes, institutional/restricted/industrial/commercial land, schools, parks, water and major-road/rail barriers. No branch or parser changed during this investigation.

The original error-page bodies were deliberately not retained, so the exact provider backend explanation for each 504 cannot be reconstructed. The official [Overpass resource-management documentation](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) identifies 429 with rate limiting and documents 504 resource/admission failures. The recorded status does not establish that the polygon lacked data. A client abort likewise does not prove that a longer wait would have succeeded. No timeout increase or provider substitution is justified as a proven repair by this evidence alone.

## Where evidence disappeared

Seven windows stopped at acquisition, before JSON parsing or classification. Their target/road/exclusion counts are **unavailable**, not zero. Neither successful response had a partial-response remark or unresolved-land diagnostic.

| Stage | Window 4 | Window 5 |
| --- | --- | --- |
| Raw OSM elements | 55: 2 nodes, 52 ways, 1 relation | 8: 7 ways, 1 relation |
| Parsed target features | 13 | 2 |
| Classification | 0 residential; 4 business; 9 unclassified addresses; 0 event | 0 residential; 2 business; 0 unclassified/event |
| Road ways | 23: 20 service, 2 unclassified, 1 tertiary | 4: 1 service, 3 unclassified |
| Land/exclusion footprints | 21: 14 parking, 5 commercial, 1 industrial, 1 water | 4 commercial |
| Legacy water/park exclusion polygons | 1 | 0 |
| Barrier ways / unresolved land | 0 / 0 | 0 / 0 |
| Eligible residential targets after shaping | 0 | 0 |
| Road-supported residential targets | 0 | 0 |
| Candidate areas | 0 | 0 |

These raw counts are observations from separate responses, **not a deduplicated ZIP-wide property inventory**. Maintained source-ID/address/candidate overlap deduplication remained active; there were no eligible residential identities or candidates to merge. Unclassified addresses were not promoted to residential targets just to satisfy the request.

Both successful responses record the actual OSM snapshot at `2026-09-26T21:28:40Z`. Retrievals were `21:29:56.114Z` and `21:30:01.633Z`. The empty recommendation contains no selected-candidate source timestamp because no candidate survived; the per-window diagnostic retains the real source and retrieval times separately.

## Corkran comparison and five-hour workload

Corkran lies in executed window 2, inside eligible Business geography. Its provider query bounds were south 39.12, north 39.16, west −76.64, east −76.6186845632; the actual query used the clipped 18-vertex polygon. It failed with HTTP 504 **before** target classification, scoring, or exclusions. It was not rejected for low score or being outside a service area.

An offline replay of the retained public fixture through the exact deployed shaping code **inside that actual production window** still produces:

- 32 eligible residential source features → 24 road-supported features;
- one candidate with **19 mapped features, 22 supporting segments, approximately 739 metres and 44 advisory minutes**;
- no school-footprint overlap.

Fixture snapshot: `2026-09-26T18:45:17Z`; retrieved `18:46:46.541Z`. This validates the retained geometry/filter path. It is not a new live provider result, proof of current coverage, or a live five-hour recommendation.

**Live candidates 1, 2, etc.: none. Live supported workload: not established.** The run finished because all nine selected windows had been attempted, not because it found five hours, exceeded the 150-second search budget, or hit the candidate cap. No defensible live alternate exists. The only quantified workload here is the separately labelled 44-minute retained-fixture replay; it must not be inflated or presented as newly acquired evidence.

## Actual Property Intelligence inputs

The production context loaded Attractive Remodel's maintained services/priorities: build decks, fences, contracting MHIC work; no excluded services; the stated residential goal; and the existing eligible service-area intersection. Profile updated `2026-08-16T16:25:13.306194Z`; preferences updated `2026-09-10T18:25:02.992576Z`; context digest `f108f76f16ce5999df6861048ae6dca28f67794e083fc645455c3127b5b0888b`.

Actual acquired geographic signals were target classification, permitted road classes, land/exclusion footprints and service-area fit for the two successful sections. No candidate reached `rankMarketingArea`, so there are **no candidate scores**, no candidate Property Intelligence analysis-cache lookup, and no applied age/roof/density/history ranking result to claim. No new Census, model or paid-provider request was made. Customer intent and lead probability were not inferred.

## Narrow correction and validation

The demonstrated presentation defect was discarding existing search counts in favor of a generic message, plus showing an ambiguous disabled alternate action. The isolated web correction now uses validated server-returned counts and distinguishes partial/unavailable acquisition from a fully analyzed but unsupported search. For this retained result it explains that map evidence was available for **2 of 9 selected sections**, the others could not be assessed, and the requested five hours could not be verified. No raw provider errors are shown. It offers a nearby location, later attempt, or manual drawing without asking the owner to partition the ZIP.

When no defensible alternate exists, the dialog says **“No supported alternative from this search.”** The alternate action remains available only for an applicable plan with a server-indicated alternate. Use remains disabled for insufficient evidence; Adjust and Draw remain available.

- 47 focused widget/presentation tests passed, including the retained partial-acquisition shape, all-unavailable/full-analysis distinction, invalid metadata, partial-budget wording and alternate behavior.
- Focused analyzer: clean.
- Production web build: passed (`APP_ENV=production`, existing lock, no native build).
- Dependency lock: unchanged.
- No server query, timeout, provider, ranking, authority or economic rule was changed.

The web correction is deployed from `d511a43188a7618cd9235ba2554a7226f041e280` to Hosting version `2592bf79c7ba280a`, released `2026-09-26T21:46:22.982Z`. All 317 compiled Dart source inputs matched the committed source. Public bundle SHA-256 `cf706b426ff44b31888809742931b7c302211da8391d14bf3ec64cd629b1e8a0`, index, bootstrap, service worker and version file match the prepared package. Five retained static pages, four rewrites and four cache-header rules are unchanged. Get remains `getsmartzoneplan-00009-gow` with 100% traffic. No new production recommendation was triggered to verify the wording; the retained response shape is covered by the focused widget test.

Production acquisition remains the blocker to a useful 21061 recommendation. Another Founder click is **not required to diagnose this run or validate the wording correction**. A future meaningful acceptance needs fresh successful provider evidence before requesting another physical review; no blind retry was performed.

## Preservation

Post-investigation read at `2026-09-26T21:42:36.361Z` exactly matches the original campaign fingerprint `83f379dac8a08c0d95216e04b20e829c601aec144af760646d8514cde2620fab`, update time `2026-09-19T11:34:54.318751Z`, and zero bound campaign zones.

Safe retained evidence is under `.firebase/mapping-qa/scale-intelligence-acceptance/`: `founder-exact-trace.safe.json`, `founder-request-logs.safe.json`, `founder-physical-fail-safe.png` and `after-founder-traced-result.fingerprints.safe.json`. Private raw logs are excluded from this report and from version control. The frozen native source, finances, entitlements, manual mapping and Email/Social remain outside this correction.

Hosting package and independent public readback evidence are retained under `.firebase/scale-search-readback-hosting/`. The native checkout was independently rechecked clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1` after deployment.

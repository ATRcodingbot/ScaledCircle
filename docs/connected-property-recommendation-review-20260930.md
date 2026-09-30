# Connected territory and service-specific Property Intelligence — review only

Prepared on the isolated `codex/connected-team-territory-20260930` branch. No
deployment, native build, campaign save, assignment or financial operation.
The consolidated native checkout remains `d60920930c81253f9019c19bed47a3eaf184dd3e`.

## Established causes

The retained manual preview was request `388a0650-b074-4970-aaa3-d1fef6e50c30`,
completed September 30 at 11:20:15 AM Eastern. Its 92-vertex digest was
`d83835c14f5f56b7a8eded05315a0788156af940b7e91eb02b35d969f75cb68b`.
See [the retained trace](ferndale-live-preview-20260930.md).

The nine-section result came from an **earlier ZIP search**, not a completed
within-preview search. That run completed after the subsequent request returned
409 busy. Entering the editor did not invalidate the earlier client response.
Own-team selection also aggregated independent regional candidates. No evidence
establishes that the polygon parser dropped the new boundary.

The maintained PI source/scorer connection was incomplete:

* Socrata schema mappings were still present, but the observed bounded request
  returned HTTP 403 / upstream error 1010 before records. This did not establish
  that Maryland property evidence was unavailable everywhere.
* Campaign candidates inherited section-level PI ranking. Candidate-specific
  property facts and raw-goal distinctions were not consistently projected into
  their ranking. The maintained saved-service-area scorer primarily used
  residential share and coarse age rules; deck repair/build and concrete were
  not separate shared intents.
* Manual factual preview only reused PI cache; it did not independently acquire
  neutral property facts when OSM classifications were sparse.
* Construction-year absence could yield a zero age signal and “newer stock.”
  Unknown years, conflicting account records and missing denominators now remain
  explicitly unavailable/ambiguous.

## Actual source acquisition, coverage and matching

The maintained official reference is [MD iMAP Parcel Points](https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0).
Its verified schema supplies `YEARBLT`, `DESCBLDG`, `DESCLU`, `SQFTSTRC`,
`BLDG_UNITS`, account/jurisdiction IDs and edition months. Source coordinates are
3857; the adapter explicitly requests and checks 4326 output.

The retained **Ferndale bounding envelope only** returned 1,106 account-point
records: 1,003 usable construction years and 1,003 recorded building types.
Two sequential OBJECTID keyset pages returned 1,000 and 106 records; final
transfer-limit flag was false. These are **not exact 92-polygon counts**. Without
the original vertices, inside-area/footprint matching and corrected selection
for that physical preview cannot be certified. The bounding rectangle is not
substituted for that polygon.

MDPVDATE was February 2026; SDAT assessment linkage was May 2026. These are
month-precision source editions, not building construction/renovation dates.
The evidence was retrieved September 30. A long multi-area query returned
repeated pages and was excluded from completeness evidence. The adapter instead
uses a short bounded envelope, ordered OBJECTID keyset paging and local exact
polygon filtering. Cap: 5,000 records. Missing schema/nonprogress fails closed;
truncation or unusable spatial rows marks coverage partial.

Acquisition order is existing Maryland adapter → verified official point
fallback → maintained Census context, all through the maintained HTTP/budget
and neutral cache. No owner names, addresses, valuations, condition fields or
paid source are added. Census remains whole-block-group context and cannot
establish individual building ages, selected-area counts or delivery stops.
An 800-KiB projection limit removes individual records rather than overflowing
the maintained cache or claiming that they remain available.

Matching requires exactly one official account point inside exactly one
complete, simple mapped footprint. Relations with incomplete retained geometry
are not matched. Known holes exclude points. Multiple points/footprints remain
ambiguous. There is no nearest-point match or individual age transfer. A unique
residential match can classify an unknown footprint; it does not certify a
household, entrance or delivery stop. Exempt/unknown classifications do not
become commercial prospects merely because they are not residential.

## Shared service scorer and retained comparison

Authoritative Business readback: Attractive Remodel offers `build decks`,
`fences`, `contracting MHIC work`; the same values are saved priorities, with no
excluded services. `discoveryPreferences` is `ServiceAreaPreferencesV1`, with
empty priority override/exclusions/default goal. The raw mixed goal remains
“deck repairs or builds, roofing leads, cement work.”

Shared `PropertyServiceAreaAnalysisV2` / `PropertyServiceFitV2` normalizes that
goal to roofing, deck repair, deck build and concrete. Explicit goals do not
silently acquire unrelated profile priorities. Residential/B2B and explicit
detached/single-family constraints are separate from soft suitability. Excluded
services still fail closed.

The saved “where to market” path and campaign path now use the same neutral
acquisition and versioned service scorer. Campaign candidates point-filter the
facts to their actual polygon and additionally retain the existing mapped
density, compactness and authorized marketing-history components. No new agent
or model call is introduced.

Roofing/deck repair use a disclosed recorded-structure-age (20+ years) and type
proxy. This extends the maintained roofing age heuristic to a repair-oriented
planning comparison; it is **not** a component-replacement interval or a finding
of service need. Deck build/concrete use recorded ground-oriented type proxies;
outdoor space, decks, driveways and their condition are unknown. Mixed supported
components have equal weights. Missing required fields remain unavailable.
Generic residential share alone is not labeled service-personalized.

The unchanged map-ranking weights remain service fit 0.5, density 0.3,
compactness 0.2, plus the maintained disclosed history penalty. The shared
property fit is blended with the mapped service-type proxy; each contribution,
denominator, source, scope and assumption is retained in the comparison.

Using the same retained Corkran polygon and public snapshot:

| Goal | Shared property fit, whole fixture | Final mapped candidate score | Selected territory |
| --- | ---: | ---: | --- |
| Residential roofing | 85 | 75 | Same supported candidate |
| Deck repair | 87 | 85 | Same supported candidate |
| New deck construction | 92 | 84 | Same supported candidate |
| Concrete work | 92 | 84 | Same supported candidate |
| Mixed Founder goal | 89 | 85 | Same supported candidate |

These are relative internal planning scores, **not lead-confidence percentages**.
There is one practical candidate in this retained comparison, so selection does
not change. Deck build/concrete genuinely tie on available facts. Tests with
contrasting facts verify age-sensitive ranking and hard residential/commercial
constraints; synthetic tests are not production acceptance.

The Corkran envelope has 1,025 neutral records, 876 known years and 915 known
types. Inside the actual selected candidate are 91 records, 77 with known years
and types. Independent source-window matching found 24 unique footprint
matches and 15 ambiguous footprints in the larger window; eight unknown
footprints were classified, but **only one additional observation** survives
the selected territory's practical/exclusion checks. The other small source
window has zero unique matches and one ambiguous footprint. Counts are not
added into a household inventory.

The resulting single territory has 20 mapped targets, 739 m supporting streets
and 46 minutes of known-subset work. Corkran School is excluded. The prior
19-target/44-minute fixture result changes because of that one supported
classification, not padding. Full area/team workload remains incomplete.

* [Reproducible score/components/geometry JSON](review-connected-property-20260930/service-comparison.json)
* [Diagnostic map](review-connected-property-20260930/retained-connected-plan.png)
* Reproduce without providers: `node tools/review_connected_property_recommendation.cjs`

## Scope, practical territory and time

`within_preview` requires the current valid polygon. Missing geometry produces
a recoverable error rather than resolving the ZIP. Cache/run authority binds
actor/workspace/campaign, execution mode, normalized boundary digest, goal,
session duration, headcount, coverage pattern and source/model versions.
Changed inputs cannot resume/apply an incompatible run. A busy older request
does not supply a new request's output. Opening a new editor invalidates its
pending client response.

Own-team selection grows one exact connected component from service-ranked
candidates. Full candidate polygons, target footprints and supporting segments
must remain inside authorized/current geography, including holes. Adjacency
requires an observed street endpoint **and** a connected exact polygon union.
No convex hull, nearest-road connector or disconnected aggregation. Shared
interior road length is conservatively retained as an alternative instead of
double-counted. Growth cannot worsen the fit to requested duration. Apply
revalidates containment/connectivity and the accepted plan.

2 × 4 hours Stay together means 8 planned labor hours and 4 hours of unique
shared coverage, with one lane. Split mode allocates complementary, connected
whole sections and uses the busiest lane's supported field time. Headcount
creates no person/assignment. Travel/setup/total elapsed remain unknown. A
single source section is not artificially divided merely to fill worker lanes.

The physical Ferndale display's 154 minutes consisted of 150.7 minutes walking
(2 × 6,027 m / 80 m/min) and 2.7 minutes handling (2 × 60/45). It excluded 1,581
unknown observations and one unsupported classified observation. It cannot
establish full neighborhood workload or a reliable 86-minute full-area shortfall.
The corrected card shows walking and known-target subset separately, with full
area/team time and full-workload shortfall unknown. No conversations, commute,
setup or requested-duration padding are added. The 45/hour, 80 m/min, doubled
street length and existing minimum/single-Scaler limits remain unchanged.

Compact facts show recorded type/year counts with parcel denominators, explicit
partial coverage and separately labeled regional context. Expanded evidence
includes source/version/dates, matching counts/rules and service components.
New private server diagnostics retain bounded polygon coordinates and request
identity so future manual previews can be replayed exactly; no coordinates or
private identifiers are added to external analytics.

## Validation and release disposition

Focused Node tests: 128. Firestore/Auth emulator tests: 32. Flutter widget and
interaction tests: 58. All pass; no skipped tests in these runs. Affected
analyzer is clean. Local Flutter web release build uses `APP_ENV=production`
and `--no-pub`; dependency locks are unchanged.

Coverage includes mixed/raw-goal mapping, age/type ties, hard constraints,
sparse OSM/property independence, schema/partial/nonprogress failures, cache
projection, null years, ambiguous account/footprint matches, complete geometry
containment, holes, shared-street/target dedup, connected growth, stale
goal/boundary/team inputs, same-actor old-search lease denial, actor/tenant/
entitlement denial, 1–4 marketers, together/split, read-only preview and preserved
saved records. Narrow screens/2× text render without overflow. These are local
automated results, not physical touch or corrected live-boundary acceptance.

Prepared narrow production overlays preserve unrelated declarations,
configuration/environment bytes and dependency locks for `getSmartZonePlan`,
`applySmartZonePlan`, `getCampaignZoneIntelligence`,
`confirmCampaignZoneIntelligence`, and `analyzePropertyIntelligence`. The latter
was read back at `analyzepropertyintelligence-00011-wuz`. Existing four mapping
archives match the retained production revisions. No IAM, secrets, Rules,
recurring refresh or Business Operations financial deployment is required.

Future reviewed deployment scope is those five source-only callables plus the
web bundle, reconciled with Hosting `1013b9e77d88b14d` and any newer production
release immediately before deployment. Hosting assets/config/static pages must
be retained; a full old worktree bundle is not a valid deployment package.
The isolated Flutter delta is for web compilation only; native reconciliation
and CI remain separate and unauthorized here.

**Not closed:** exact corrected Ferndale polygon map, inside-polygon parcel
coverage/matching, live personalized recommendation and physical acceptance.
Original polygon coordinates were not retained. The source-backed Corkran proof
is explicitly retained-data evidence, not a replacement for that acceptance.
No blind retry or new Founder click is requested during this review.

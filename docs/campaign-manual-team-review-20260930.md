# Manual entry, manual evidence and team capacity — review package

Prepared on September 30, 2026. **Not deployed.** No production campaign,
person, assignment, compensation, payment or profile was changed. No provider
search, model call or native CI was run. Public geography was read from existing
production cache objects and the retained Maryland PBF; the corrected import
was built locally only.

## Separately identifiable implementation

| Scope | Commit |
| --- | --- |
| Manual map entry / visible map / initialization recovery | `79c9ebbdae42e96de3a477627f489e8ba9974774` |
| Own-team capacity / supported coverage assembly / progress wording | `fbe5f86d3a87bb8a6b44f5523cde919301531c36` |
| Manual factual analysis / cache completeness / independent evidence | `7c32bdad879ba379e19d6ea16cb9ff36076e3d20` |

The combined implementation candidate is the third commit. The isolated branch
is `codex/campaign-manual-team-planning-20260930`, based on the current first-use
web checkpoint `fe383adef3124584b3cf8a60faf79d9862c54a7d`.

Frozen native checkout remains clean at
`d60920930c81253f9019c19bed47a3eaf184dd3e`. Shared Flutter edits are prepared in
this isolated web worktree; they have not been reconciled into that native
candidate. Dependency locks are unchanged. Prepared payout guidance remains
separate and undeployed.

## Manual navigation diagnosis and correction

The old `CampaignZoneAreaEntry._draw` validated duration and called
`onSaveWorkload` **before** opening the editor. A failed workload write could
prevent navigation, and merely opening then cancelling could persist workload.
The parent `_createZone` also checked marketplace required-Zone capacity before
navigation. The editor opened with its map below the current viewport.

The exact historical Founder click instruction was not retained; these causes
are demonstrated in source and the actual widget workflow, not claimed as a
recovered browser trace. Founder identified a new Attractive Remodel own-team
campaign, not the previously deleted QA campaign.

Manual entry now requires a selected location or existing authoritative map
context, opens the map at that context and focuses it into view. It does not
require a recommendation goal, Scale entitlement, hours, headcount or a saved
Service Area, and does not save workload. No stale Baltimore fallback is used
when the first area has no location selection. Explicit acceptance retains the
existing downstream marketplace capacity checks. Drawing remains unsaved;
Cancel abandons it. Loading and map-background errors have reachable recovery.

## Exact original manual-analysis evidence and limits

These remain **two separate Founder observations**:

| Observation | Established | Still unknown |
| --- | --- | --- |
| Screenshot, 208.7 acres near Ferndale/BWI | Manual preview reports incomplete map evidence, unavailable streets and nearby housing | Original/normalized coordinates, digest, exact request and acquired source counts |
| Recording, different 139.1 acres | Analysis state was reached, then zero residential targets and no established field time | Original/normalized coordinates, digest and exact provider/filter outcome |

No coordinates were reconstructed from screen pixels. The nearby fixtures below
are explicitly not those original boundaries, and neither closes their physical
acceptance. No geometry repair/tolerance change was justified or made.

Read-only production evidence:

- Endpoint: `getCampaignZoneIntelligence`, authenticated Firebase callable in
  `us-east1`; revision `getcampaignzoneintelligence-00001-bac`.
- Auth-valid HTTP 200 requests retained on September 30 at approximately
  12:14:26, 12:14:42, 12:15:10, 12:16:39, 12:18:24, 12:18:52, 12:19:36,
  12:20:16, 12:21:36, 12:22:08, 12:22:34 and 12:23:35 UTC.
  HTTP success is not evidence that geographic analysis succeeded.
- Current Attractive Remodel workspace:
  `IqRjZYHKOzXYuJcSyL68LYNwtDg1`.
- Current draft: **Glen Burnie 09/30/26**,
  `plan_ea02715e0a76d5e4bf362353428f6e130aca5d6d61a130e37b348d3adae47fc0`,
  authoritative mode `own_team`, zero saved Zones on readback.
- One retained refresh record,
  `ec84412d852dc4fecfa77ead6d007494161af1fe442d37eb03f18fcd02acadb4`,
  attempted at 12:23:35.770Z and finished 12:23:48.318Z with
  `timeout`, request stage, 12,008 ms, unavailable. It has no saved current
  snapshot, bounds or campaign association. It cannot be assigned conclusively
  to either reported outline.

The old endpoint logged authentication but not request geometry or acquisition
stages. Failed refresh records retain a digest but not the failed boundary.
The current draft has no saved Zone coordinates to recover either unsaved shape.
Consequently the exact per-outline failure cannot responsibly be asserted.

The deployed, generation-pinned source ZIP confirms that **manual analysis
already uses the same maintained regional cache and V2 geometry parser**. The
runtime's current confirm helper was added later, but its preview acquisition
was not an older live-only path. Deployed projection SHA-256:
`555c4f19c30a05921b8e54614c2741649ca51f30f105d8b1713606162a40999e`.

## Demonstrated analysis defects

1. The maintained importer selected specified building types and addressed
   objects. Generic `building=yes` objects without another qualifying tag were
   omitted. Cache acquisition completeness did not mean complete building
   inventory, but an empty classified result could appear as an available zero.
2. The projection used only road components serving classified eligible
   targets. With no such targets it hid otherwise valid permitted street
   evidence. This was reproduced with actual production cache data.
3. The old regional reader rejected the whole request when any required tile or
   coverage was missing. It could not expose safely supported partial facts.
4. Acquisition diagnostics were not connected to the manual projection/logging,
   so provider failure, missing coverage and a genuine empty inventory could not
   be distinguished in retained request evidence.

The corrected manual path uses `ManualBoundaryEvidenceV2` within the compatible
`ZoneIntelligenceV1` envelope. It reports separate available, partial,
unavailable and completed-empty outcomes; the widget retains its analyzing
state. Missing/unknown target totals are null, not zero. Unclassified mapped
buildings/addresses remain separate from residential and business targets.

Permitted roads survive absent property details or classifications. Walking-only
evidence is explicitly not full campaign workload or an execution route.
Target handling, advisory walking and supported person-work have separate
components. Whole-area evidence does not invent an even team split; travel and
total team elapsed time remain unknown.

The manual reader can combine available complete tiles, but facts near missing
coverage are conservatively withheld using the maintained hazard halo. A
partial territory does not acquire a full-boundary workload estimate.
Recommendation acquisition keeps strict complete-coverage behavior. Damaged or
conflicting source objects fail closed. Source age is never reset by import time.

New read diagnostics include request ID, campaign/workspace, normalized digest,
bounds, acquisition/coverage reason, source metadata, parsed classification
counts, boundary/coverage/exclusion/duplicate filter counts, permitted roads and
supported target/network counts. They are private server diagnostics, not
external analytics. No form text, credentials, tokens or raw provider response
is logged. Manual planning remains usable when optional facts are unavailable.

## Production cache coverage and local correction

Verified production manifest: `smart-zone-public/v1/maryland/current.json`.
All 16 indexed immutable objects passed compressed-content hash verification.
Tile copies: 20,451; unique source objects: 19,680. The historical extraction
receipt counted 19,681 before tile indexing; these are distinct measurements.

- Provider: Geofabrik Maryland / OpenStreetMap.
- Snapshot: **2026-09-25T20:24:36Z**.
- Retrieved: **2026-09-26T21:55:03.501020+00:00**.
- Imported in production: **2026-09-26T23:17:16.762Z**.
- Geometry parser: `SmartZoneOsmGeometryV2`; cache: `SmartZonePublicCacheV1`.
- Bounds: `[-76.6945750000126, 39.108224999811924,
  -76.58875599983642, 39.21576000007699]`.
- This is buffered 21061 pilot coverage, not statewide coverage. Exact original
  outline containment cannot be established without those coordinates.

The corrected extractor keeps every tagged building without assigning generic
buildings a residential classification, retains `building:use`, and preserves
full ways, relation members, cross-tile copies, exclusions and access tags.
New imports explicitly declare `OsmPublicObjectsV2` and building-inventory
completeness; old caches remain labeled selected-object inventories.

Local bounded re-extraction used the same checksum-verified retained
`maryland-260925.osm.pbf` and the same pilot bounds. Result: **57,334 objects**,
zero missing way members, zero unresolved nested relations, zero invalid ways;
156.017 seconds. Sixteen local objects total **4,291,225 compressed bytes**.
No network download or Storage publication occurred.

The required future backfill is a one-time reviewed publication of these new
immutable pilot objects and a generation-guarded manifest pointer. No statewide
import or recurring job is needed for these nearby fixtures. Any original area
outside the pilot would require its actual boundary plus hazard halo to define
a separate bounded expansion; it must not be silently cropped.

## Nearby public replays, not original Founder geometries

Full counts, coordinates, digests, source dates, coverage and filters:
[manual-boundary-public-replay-20260930.json](manual-boundary-public-replay-20260930.json).

| Nearby fixture | Existing cache raw / parsed features / roads | Corrected local import raw / parsed features / roads | After exclusion: unclassified observations | Safe streets | Walking-only estimate |
| --- | --- | --- | ---: | ---: | ---: |
| A | 228 / 27 / 142 | 715 / 513 / 142 | 46 | 1,064 m | ~27 min |
| B | 206 / 11 / 154 | 1,016 / 820 / 154 | 195 | 1,425 m | ~36 min |

For A, 32 parsed feature points were outside the boundary and 435 were excluded
by maintained land/uncertainty geometry. For B, 24 were outside and 601 excluded.
Both have zero **classified eligible residential observations** after filtering;
the unknown residential total remains unavailable because unclassified buildings
are present. Neither establishes full field workload or nearby housing era.
Six/five localized uncertainty guards remain in A/B; none has unbounded extent.
Their footprints/access policies were not loosened to obtain larger counts.

Before correction, these production-cache fixtures rendered available zero
targets with no street evidence. The corrected pipeline reports partial evidence,
unclassified observations, valid streets and an explicitly walking-only estimate.
It does not claim residences or delivery stops where the source cannot classify
them. These results are local replay, not production acceptance.

The new bundle also passes the retained PI recommendation replay: six cache
reads, four map-validated PI sections, nine areas, 95 targets, 1,987 m and
186 advisory minutes, no school overlap and zero live calls. The retained
production-anchor variant has 2,084 m / 189 minutes; the section-center local
replay has 1,987 m / 186 minutes. This known anchor difference is preserved.

## Short recommendation / own-team capacity

The current draft's retained request
`07efde1bf54f4d278a1dca0a6c4fe4815ef75305db25cf5a9b5705a2d72f94ad`
was created at **2026-09-30T12:14:18.297Z**, requested five hours, searched nine
windows, successfully acquired six and retained nine candidates. Their
supported minutes are `24, 18, 15, 20, 15, 21, 15, 15, 46`: **189 minutes**.
The search did not stop after one window. Selection limited the plan to one
candidate per required marketplace Zone, incorrectly constraining own-team
coverage and leaving the top 24-minute result.

`OwnTeamCapacityV1` uses explicit per-person session duration, positive integer
marketer count and either split streets or stay together. Four hours with
1/2/3/4 split marketers targets 4/8/12/16 coverage-equivalent person-hours.
Staying together does not multiply unique coverage; this is not a claim of
group efficiency or total staffing effort.

Whole supported sections are deduplicated and allocated without fabricated
connectors. Largest-first allocation preserves uneven loads; busiest-lane field
time is separate from unknown between-section travel and total elapsed time.
Example 5 hours × 2 split marketers: 600 requested coverage minutes,
189 supported minutes across nine separate sections, **411-minute shortfall**.
The plan offers an explicit smaller supported plan, not five-hour fulfillment.
No people, paid seats, marketplace assignments or compensation are created by
headcount. Legacy saved drafts require explicit capacity review; reads do not
rewrite them. Overlapping saved coverage does not display a double-counted total.

Marketplace minimum 0.5 hours and `ceil(hours / 6)` remain unchanged, including
exactly six hours = one Zone. Assembly requires a shared observed network,
nonduplicate targets, same PI section and an exact connected union with no new
land/hole filling. Disconnected candidates remain separate. Required, unsaved
preview and saved-valid counts have different labels and authority. A preview
does not enable Save as though it were persisted.

## Validation and limits

- 147 Node unit/architecture tests passed.
- 49 local Firestore/Auth emulator tests passed.
- 95 affected Flutter tests passed; 8 own-team tests rerun after the final
  summary-copy correction passed.
- 8 Python extractor tests passed.
- 3 affected discovery/transitive/generator checks passed.
- Affected Flutter analyzer clean; production-config local web build passed.
- No dependency-lock changes; checked mirrors match maintained modules.

Coverage includes actual map editor entry, no pre-map writes, initial location,
loading/background retry, freehand recovery/Cancel, narrow 2× layouts,
manual Starter/Growth authority, malformed/missing evidence, cache tile seams,
partial coverage, incomplete relations/local exclusions, unclassified buildings,
street-only evidence, request/geometry/account/team invalidation, duplicate
targets/overlapping areas, headcount/coverage patterns, honest shortfall,
marketplace assembly, explicit versioned writes and tenant denials.

One existing broader packaging assertion still fails: generated
`functions-business-profile/index.js` lacks the already-maintained
`profileCompletion` field in `getBusinessWorkspaceContext`. This discrepancy
predates this branch. It is not counted as passing, not repaired in this scope,
and that function/package is not proposed for deployment. Dedicated parity tests
for the affected recommendation and manual-analysis declarations pass.

Synthetic/widget interaction is not physical browser/touch acceptance. No
Founder retest is requested against unchanged production. Neither original
manual-analysis observation is marked PASS.

## Proposed deployment scope, awaiting review

Only reviewed overlays for `businessOperationsV1` workload context/save,
`getSmartZonePlan`, `applySmartZonePlan`, `getCampaignZoneIntelligence` and
`confirmCampaignZoneIntelligence`, their exact maintained transitive modules,
the reconciled web Hosting package and the one-time pilot cache pointer update.
The importer is operator tooling, not a recurring function.

Before a later approved deployment, reconcile against actual current production
and keep each unrelated endpoint/runtime setting intact. Do not deploy the full
root Functions tree or generated profile package. No IAM, Rules, subscription,
financial, assignment, payout, Email/Social/research or native release change is
included. Physical verification of the two new analysis results remains open
until a corrected client is deployed; no new drawing is needed merely to hide
missing data.

# Larger-area fixed-boundary team comparison — review only

Prepared against deployed application source `3a6e9d6103e91bb2c23c69678745dd2ebf695dca`. No deployment or production operation performed. Native candidate `d60920930c81253f9019c19bed47a3eaf184dd3e` remains clean and unchanged.

## Established cause

The V2 comparison rejects more than 256 raw supplied `from`/`to` street line segments **before** geometric deduplication or allocation. These are consecutive atomic linework edges, not road names, properties or customer stops. The code does not document 256 as a provider limit or a production timing guarantee. Its practical protection is the quadratic contiguous-cut dynamic program plus target-to-edge association and output size: the largest old 256-unit comparison considers approximately 326,405 cuts across repeated 1/2/3/4-person calculations. DP memory is linear in units × crew sizes; association previously sorted all edge choices for every target.

The actual retained input contains 361 unique atomic edges (no duplicates), 366 endpoint nodes, 301 degree-two nodes, 26 junctions and twelve disconnected components containing 146, 79, 57, 28, 11, 11, 9, 8, 5, 4, 2 and 1 edges. Removing duplicates alone cannot repair it. A diagnostic-only in-memory bypass of the limit still leaves the old open-path allocator unable to split branched/disconnected evidence; it returns the 519-minute baseline at all crew sizes. That bypass was never implemented/deployed.

## Bounded correction

`OwnTeamFixedAreaTimeV3` extends the existing comparison DP; there is no new persistence or operational allocator.

- One shared minimax DP computes all four crew sizes. One-person prefixes need no cut search. Nearest-edge association uses a single minimum scan rather than sorting every candidate.
- For branched components, lossless chain compaction removes only intermediate degree-two nodes without target attachments or differing access/source/exclusion metadata. Junctions, target-bearing edge endpoints, lengths and every original atomic edge remain retained.
- A deterministic doubled-edge walk within each connected component realizes the **unchanged** twice-network-length assumption. It introduces no new connector. Each original edge is traversed twice in total, including repeated/shared walking; each target is handled once.
- The retained input becomes 247 computation chains. Twelve components remain twelve local sections, not one connected territory or twelve campaign Zones. Within a section, split-up field time is its longest individual contiguous allocation. The displayed subtotal sums those local critical times for sequential local work. Inter-section access/travel and overall finish remain **unknown**.
- Stay together never divides by crew size. Shared group duration does not establish each group member's person-work.
- Hard bounds: 2,048 raw edges, 5,000 targets, 2,000,000 target/edge checks, 327,680 DP cut checks, 1 MiB detailed response. These input guards are accompanied by the optimized work budget, not a promise every input under 2,048 can be allocated. A complex 500-edge case exhausts the cut budget; it retains positive walking/handling/target scope and reports allocation incomplete. No truncation, polygon replacement, added territory or target omission occurs.

Geography containment and upstream permitted-road/school/barrier/exclusion validation are unchanged. Endpoint connectivity is map evidence, not certified pedestrian connectivity; a line crossing another line does not create a node unless the maintained evidence supplies the common endpoint. No execution route, entrance, delivery-stop or work-start authority is created.

## Exact retained large input

Geometry digest: `6273409e42bd491b1086789be01d293e98fe3b9949d2cad59b72b132876f6b4e`.

The local replay uses the retained full drawn boundary and generation-pinned Maryland cache, not the smaller recommendation and not another Founder drawing. The original timeout, separate Founder retry, and this offline replay remain separate observations. Raw geometry, property IDs and private QA evidence remain in ignored local diagnostic storage.

1,243 official property records do not establish 1,243 stops. Included here: **231 street-supported mapped targets**, **8,409.45 m unique supporting network**, **210.24 walking minutes** and **308 handling minutes**. Model assumptions remain 45 targets/hour, 80 m/min, twice-network traversal and a 15-minute aggregate planning floor. There are 806 unclassified mapped observations and 708 unmatched official records; these are different/overlapping evidence populations, not counts to sum into delivery stops. Missing construction years do not remove valid walking/handling evidence. Full-area inventory, property access, travel, setup and session completion remain unestablished.

All values below are local field subtotals for the SAME boundary and target set. They are not whole-neighborhood completion times or permission to exceed maintained work limits. Walking/handling columns are the critical local allocation components used in the split subtotal; totals across all workers remain 210.24 + 308 = **518.24 modeled person-work minutes**, at every crew size.

| Marketers | Stay together calculated min | Split calculated min | Split with 15-min floor | Split critical walking min | Split critical handling min |
|---:|---:|---:|---:|---:|---:|
| 1 | 519 | 519 | 519 | 210.24 | 308.00 |
| 2 | 519 | 265 | 265 | 115.65 | 149.33 |
| 3 | 519 | 183 | 183 | 57.37 | 125.33 |
| 4 | 519 | 140 | 140 | 64.97 | 74.67 |

Rounding is applied once after summing local critical raw times; the aggregate planning floor does not create another 15-minute job per component/lane. Floor-adjusted lane durations are not person-work. The display leads with “Estimated time for supported targets,” shows the separate local section limitation, allocation components, aggregate person-work and unestablished overall finish.

The exact small input digest is `23dc4a73251597eb63eb96eb7894ca696ace2ff2e90c74208714cf3b5482bdcf`. Its twelve-target results are unchanged: calculated split 21/12/9/7 minutes, floor-adjusted 21/15/15/15; Stay together 21 for all crew sizes. Baseline walking 4.43 min + handling 16 min.

## Measurement

Windows, Node v24.19.0; three warmups then thirty calls per case in separate processes. Results and assertions are retained in `fixed-area-team-time-benchmark-20260930.json`, `fixed-area-team-time-stress-20260930.json`; `tools/measure_fixed_area_time.cjs` repeats them using the local retained input paths without printing their contents.

Large before: median 1.12 ms **rejecting before allocation**. After: median 13.28 ms; range 11.66–15.79 ms, 91,575 cuts, 185500 response bytes. Max observed post-call heap delta 13.10 MiB; process peak RSS 84.21 MiB. This is successful added work, not a claim that computing is faster than rejecting.

The 2,000-edge/1,000-target stress case uses the full two-million association budget, stops at cut-budget exhaustion and returns the retained known subtotal, no crew rows. Median 41.35 ms, maximum 56.46 ms; max observed post-call heap delta 52.26 MiB and process peak RSS 168.73 MiB. A separate local emulator-configured deployment-package module-load check peaked at about 96 MiB RSS for this stress call. These measured Windows processes are not Cloud Run peak-memory/runtime guarantees. Existing 256 MiB service settings and 180/60-second endpoint deadlines remain unchanged; no timeout/resource increase is proposed.

## Consumers and planner compatibility

The comparison enters `zone_intelligence` manual/recommended projections and `smart_zone_intelligence` own-team recommendations. Shared closure is used by getSmartZonePlan/applySmartZonePlan and getCampaignZoneIntelligence/confirmCampaignZoneIntelligence. Unsaved authenticated preview requires neither a campaign save nor a provider refresh when retained evidence is present.

Business Operations `businessoperationsv1-00015-tar` retains its existing allocator. Its actual `campaign_workload_authority.summary → own_team_capacity.summary` call supplies whole saved Zones with complete geometry-bound workload; it does not supply internal comparison lanes or read teamTimeComparison. Tests compare both package copies on that exact path: partial evidence with `workload: null` is not ready and has no elapsed-time authority; changing a comparison cannot change readiness or allocation. Both use the same whole-Zone elapsed semantics. A complete single saved Zone with 21 minutes remains 21 minutes in that planner, even though a hypothetical internal four-person preview may show 7 calculated minutes. The preview explicitly says this does not establish plan readiness.

Therefore no Business Operations deployment is required for this read-only subtotal correction. If internal street allocations are later intended to become an operational team plan, immutable lane/geometry binding and reconciliation with the maintained planner require a separately reviewed shared-contract change; the preview must not silently substitute its lanes. The existing capacity-copy equality failure remains separately recorded and unchanged. No claim of source equality or full operational allocation parity is made.

## Validation and deployment scope

83 focused model/manual tests passed; 25 Auth/Firestore emulator tests passed; 31 Flutter widget tests passed. Three affected packaging tests pass; the existing Business Operations capacity-copy equality assertion still fails (not weakened/skipped). Tests cover old-limit neighbors, 361/460-edge paths, budget exhaustion, maximum association work, duplicated/reversed/fragmented/cyclic linework, target/distance/traversal conservation, metadata/junction retention, separate components, uneven allocation, partial years, malformed/mismatched geometry, permissions, no saved-record mutation, and stale geometry/team/account responses. Narrow 320/390-px and 2× text fixtures pass. Affected analyzer is clean.

Production-config **local web** compilation passed, with all 327 declared application source inputs verified. Four prepared function overlays retain baseline entrypoint, environment, dependency lock, unrelated declarations and all other files. Only `own_team_time_comparison.js` and new `own_team_street_sections.js` differ. No IAM/config changes.

Proposed reviewed deployment scope: those comparison modules in the four maintained endpoint closures plus the compiled web comparison display over the then-current Hosting baseline. No Business Operations allocator, Property Intelligence scorer, data source, cache/backfill, financial/assignment authority, native checkout or store build changes. Package freshness must be reread at any later approved deployment. Exact live comparison-card acceptance remains pending separately; no new Founder drawing has been requested.

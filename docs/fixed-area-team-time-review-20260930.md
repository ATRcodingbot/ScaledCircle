# Fixed-area crew-time comparison — review candidate

Prepared on top of deployed `76a8661f55db96922e5d8472c8c98f91a489c110` in the existing isolated mapping worktree. Not deployed, and not merged into the frozen native candidate. No additional drawing, provider request, campaign save, assignment or financial action was performed.

## Continuation and fixed scope

Existing `own_team_capacity` already validated team inputs and allocated whole sections. It did not provide a fixed-area 1–4-person comparison. The new read-only `own_team_time_comparison` projection adds that missing comparison to the existing manual and recommended Zone previews for own-team campaigns. It does not replace capacity/financial authority, select more territory or generate a new recommendation for each crew size.

The retained checkpoint remains separate:

- Full drawn boundary: **1,243 official property records**.
- Smaller selected recommendation: **19 official property records**, **12 mapped residential targets**, seven unclassified mapped features and seven observed street segments.
- Geometry digest for this fixed smaller territory: `23dc4a73251597eb63eb96eb7894ca696ace2ff2e90c74208714cf3b5482bdcf`.
- Original manual request: HTTP 504 at its 60-second limit. The agent did not retry that request.
- Founder subsequently reported a manual retry and supplied its screenshot. That is a separate observation; this review neither merges its request/geometry with the timeout nor derives a full-neighborhood duration from it.

No acquisition or containment investigation was repeated. The comparison replays retained target/segment evidence locally.

## Actual comparison

Every row includes exactly the SAME 12 targets and approximately 177 m of supporting streets. Total included components remain **16.00 minutes handling** at 45 targets/hour and **4.43 minutes walking** at twice the street length / 80 m per minute.

| Marketers | Stay together | Split up | Raw longest split lane | Split lane target counts |
| --- | --- | --- | --- | --- |
| 1 | ~21 min | ~21 min | 20.43 min | 12 |
| 2 | ~21 min | ~15 min | 11.60 min | 5 + 7 |
| 3 | ~21 min | ~15 min | 8.21 min | 4 + 3 + 5 |
| 4 | ~21 min | ~15 min | 6.78 min | 4 + 1 + 4 + 3 |

These are **advisory finishes for the included known-target subset**, not completion times for all 19 property records or all 1,243 records in the full drawn neighborhood. The unchanged 15-minute planning minimum explains the 2–4-person floor. It is not added walking/handling work. Travel, setup, local access and total elapsed session duration remain unknown.

Split-up assignments use deterministic contiguous cuts of the observed street path. Each target and segment belongs to exactly one lane; finish is the longest individual lane. No connecting road is invented and the boundary is fixed. Target association is a planning grouping to nearby observed segments using the maintained 60 m ceiling, not a certified doorstep route. Stay together retains the whole shared subset at every headcount.

For branched/disconnected networks or unsupported subdivision, the projection conservatively keeps the whole-area subset comparison and explicitly says shorter complementary allocations are not established. It does not substitute simple division. Optional `21 / crew size` figures appear only under an explicit **idealized even-division** label, separate from practical allocation and the planning minimum.

The selected-boundary response is bound to its geometry digest. The web presentation rejects comparisons after geometry edits and shows four crew cards, included target counts, walking/handling components, per-lane details, the floor and incomplete full-area state. It exposes no Save or assignment action. Detailed input coordinates remain in the existing private diagnostic evidence; the [review JSON](review-connected-property-20260930/fixed-area-team-times.json) contains aggregate lane facts only.

## Validation

- **55 backend/model regressions passed**: fixed scope and immutable inputs; conservation/deduplication; uneven allocation; missing/outside/distant evidence; branched/disconnected fallback; partial inventory; geometry identity; existing service scoring, exclusion, capacity and workload behavior.
- **3 affected package checks passed**: reviewed callable declarations, manual projection parity and comparison module/dependency closure in the maintained discovery package.
- **28 Flutter tests passed**, including five new comparison tests: existing Zone integration, no write controls, stale geometry, unsupported subdivision, expansion and 390 px / 2× text.
- Affected analyzer: clean. Dependency locks unchanged. No native or web release build was started.
- One **pre-existing** package-wide test remains failing: `team authority is copied exactly; unchanged locks retain existing polygon dependency`. At the reviewed base, `functions-business-operations/shared/own_team_capacity.js` already differed from the maintained/discovery connected allocator. All three capacity files are unchanged by this continuation. No unrelated Business Operations/financial deployment is included, and this test is not counted as passing.

## Review/deployment boundary

Prepared delta: neutral comparison module, own-team Zone read/recommendation projections, matching discovery copies, existing web Zone-summary presentation, focused tests and packaging support. Existing permission gates and scorer/evidence acquisition stay unchanged. No deployment is authorized here. Any later overlay must preserve current production and include the new transitive module without replacing unrelated functions. Frozen native source remains `d60920930c81253f9019c19bed47a3eaf184dd3e`.

Full-area crew completion remains unestablished for every headcount. No further Founder drawing is needed for this retained-area comparison.

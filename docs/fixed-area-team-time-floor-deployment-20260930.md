# Fixed-area team time: calculated duration and planning minimum

This approved web/server delta follows reviewed `170920da16be2fb4a4cf35e3592681df059f80c9` on the current deployed `76a8661f55db96922e5d8472c8c98f91a489c110` baseline. Frozen native candidate `d60920930c81253f9019c19bed47a3eaf184dd3e` remains separate.

The allocation algorithm and its limits are unchanged. `OwnTeamFixedAreaTimeV2` separates conservative whole-minute calculated field time from the existing 15-minute planning minimum. The 30-minute minimum campaign request remains an independent input rule. No minimum creates targets or compensation.

## Retained small area

The comparison concerns 19 official property records, 12 mapped residential targets and seven unclassified mapped features, not the full 1,243-record drawn boundary. Unmatched-property count for this recommendation was not retained and is explicitly Unknown. Property records are not presumed distinct delivery stops.

| Marketers | Stay together calculated | Split calculated | Split with planning minimum |
| --- | --- | --- | --- |
| 1 | 21 min | 21 min | 21 min |
| 2 | 21 min | 12 min | 15 min |
| 3 | 21 min | 9 min | 15 min |
| 4 | 21 min | 7 min | 15 min |

The one-person baseline is 16 min handling plus 4.43 min walking. All split lanes conserve the same targets and street segments; the simultaneous finish is the longest lane, rounded up. In this retained path the sum of split walking equals the one-person walking, verified per lane rather than assumed. No extra travel/setup, access, conversation or connecting route is invented. Stay together retains shared duration at every headcount. Idealized raw-time division is secondary and explicitly not a practical allocation.

Each pattern/crew result binds geometry, target-set digest, source/evidence digest, source version and workload/comparison versions. The web highlights the current two-person Stay together setting, keeps unknown/unclassified observations visible and labels partial estimates “Estimated time for supported targets.” Existing request-generation guards reject late responses after area/team edits.

## Larger boundary

A read-only check confirmed the retained Maryland cache manifest matches the actual production generation, source snapshot and parser. Local replay of that cache and the retained exact 80-point polygon/official records finds 237 classified mapped residential observations, 806 unclassified observations, 231 street-supported targets and 361 target-serving segments. It retains 708 unmatched official records. The existing factual model provides a 519-minute known-target subtotal; this is not a full-area or team completion time. The comparison cannot allocate this larger graph within the unchanged 256-segment bound, so it returns an explicit unavailable reason and does not borrow the small-area table.

These are retained-evidence replays, not a new provider search or a live authenticated browser response. Whole-area completion remains unestablished. The original timeout and Founder's separate manual retry remain separate historical observations.

## Capacity-copy mismatch

The existing package-wide equality test remains failing and is not weakened or counted as passing. Maintained/discovery capacity uses the connected allocator, while Business Operations uses its older section allocator. This difference predates both candidates. Fresh production capture shows Business Operations `businessoperationsv1-00015-tar` matches its local variant after line-ending normalization. All allocator files are unchanged. Only four named mapping callables are targeted; their deployed index/config/locks and unrelated module bytes are retained. Business Operations, financial authority and its source are excluded from this deployment. The mismatch remains a separately recorded follow-up rather than an alleged all-package PASS.

## Validation and package scope

- 57 focused model/property/Zone tests; 11 manual-boundary evidence tests; 25 local emulator authorization/runtime tests: passed.
- 3 affected package checks pass; 1 pre-existing package-wide equality failure retained separately.
- 28 Flutter tests pass, including selected-area/team stale-response guards, exact 1–4 crew calculations, current-setting presentation and 390-pixel/2× text layouts.
- Affected analyzer clean; production-config Flutter web build passed. Dependency locks unchanged.
- Exact overlays replace only the required comparison/projection modules on freshly downloaded production source. `getSmartZonePlan` / `applySmartZonePlan` share the recommendation projection; `getCampaignZoneIntelligence` / `confirmCampaignZoneIntelligence` share the manual projection. No changed authorization or writes are introduced by comparison, and confirm/apply are not invoked for acceptance.
- Hosting retains the current production static pages/assets/configuration and changes only the compiled web client/bootstrap. No native merge/build or CI.

Deployment revisions and served readback will be recorded in the final deployment report. The prior unsaved browser tab is no longer present; actual authenticated browser presentation must remain separately unverified if that exact preview cannot be legitimately recovered. Widget/emulator evidence is not Founder physical acceptance.

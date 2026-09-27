# Freehand cleanup and recovery — review candidate

Status: implemented in the isolated web/client worktree; **not deployed**. Production remains on `175edc45b1ebd854f07d27b5ceaf94bb9ef80610`. The frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. No campaign, Zone, assignment, payment, provider search or production setting was changed.

## Traced failure and recovery

The previous pointer-up rejection did release `_drawingPointer` and set `_drawingFreehand = false`. Subsequent strokes were therefore browse gestures, not drawing input. Entering Draw mode had already scrolled to the map, leaving the only Draw Area/Edit Boundary action above the viewport. The error offered no adjacent restart action. This is the demonstrated recovery/navigation gap; the source does not show a permanently held pointer in the normal self-crossing rejection branch. Interruption branches additionally left error/invalid-state flags uncleared on some Cancel/Undo transitions, and geometry completion had no exception-safe cleanup.

The exact Founder stroke coordinates were not retained. Synthetic strokes reproduce the relevant rejected-outline state and exercise recovery; they are not claimed as a replay of that physical stroke or proof of an additional browser-specific pointer fault.

Implemented:

- A persistent, wrapping recovery footer displays the error, **Draw Again** and **Cancel**, independent of the scroll position. Invalid drawing keeps Use This Area disabled.
- Draw Again starts a fresh stroke in the same editor without another replacement prompt, reload or sign-in. The original saved boundary stays intact.
- Pointer-up, pointer-cancel and explicit Cancel drawing have separate handling. Shared completion clears pointer ownership, advanced-tap state and invalid flags. Down/move/up exceptions return to the same recovery state.
- Second-touch interruption cannot claim the first pointer's stroke. Mouse/touch browse pan resumes outside explicit Draw mode.
- Undo restores the preceding preview. Clear changes only the local draft and retains a preview for Undo; it cannot delete the saved Zone. Leaving the editor without Use/Save discards the local proposal.
- Use This Area now has a minimum height rather than a fixed height, preventing the acceptance label from clipping at 2× text.

## Bounded automatic cleanup

The maintained `CampaignFreehandGeometry` helper is extended; no GIS dependency, provider, model or server-side geometry system is added.

| Case | Behavior |
| --- | --- |
| Consecutive duplicates / jitter | Existing 0.2 m cleanup, bounded sampling and simplification remain. |
| Small endpoint gap | The preview closes the ring; exact first-pixel reconnection is unnecessary. The closing edge is included in topology validation. |
| Short collinear backtrack | Removes only the local out-and-back excursion. Long retraces remain rejected. |
| Small crossing / closing overshoot / loop | Splits at the actual intersection and removes a lobe only if exactly one is demonstrably local. Returns one simple unsaved preview. |
| Substantial or unequal figure-eight / separated loops | No largest-polygon selection, hull, bridge or extra Zone. Immediate Draw Again. |
| Existing/recommended/advanced polygon validation | Explicit strict mode; it cannot certify an unrepaired historical or advanced boundary just because a repaired version could exist. |

Tolerances and guards:

- Local-repair radius: **three logical map pixels**, clamped to **0.75–5 geographic metres**, using latitude and zoom. Zooming out never permits repairs beyond five metres.
- A removed lobe must lie within that radius of its intersection, have at most eight radii of perimeter and itself be simple (or a degenerate retrace). At most **eight** repairs per stroke.
- Removed simple-lobe areas are accumulated independently. Their area plus the absolute area change from subsequent simple-ring simplification must remain within **2%** of the repaired simple region. The self-crossing raw stroke's signed area is never used as the safety denominator.
- Analytic capsule-interval coverage checks **whole edges in both directions**, not only vertices. Repair is bounded by its scale-aware radius; final simplification stays within the existing five-metre boundary cap. This prevents a new chord from cutting across a meaningful concavity even when endpoint checks would pass.
- Existing **2,048 raw points**, **100 final vertices**, **100 m² minimum**, **100 km² manual maximum**, local extent and dateline protections remain. The separate 25 km² evidence-provider limit is unchanged.
- No rectangle/convex-hull fallback, indiscriminate hole fill, disconnected-region merge or added Scaler assignment.

Successful repair says **“We cleaned up a small overlap. Review your boundary.”** The corrected polygon remains blue. **Compare original outline** temporarily overlays the raw stroke in orange; it changes neither geometry nor evidence. Raw comparison data is local memory, cleared by subsequent edits/Clear/Undo/cancellation and never exported to campaign records.

Ambiguous repair says **“We couldn’t make a clear area from that outline. Draw again.”** No unsupported individual-edge editing is implied.

## Intelligence and authority

A valid corrected preview immediately invalidates the previous geometry's PI state/request generation. The existing factual Zone endpoint receives the corrected geometry; the existing digest/identity checks still reject old responses. The comparison overlay does not change that digest. Cancel/reopen uses the original saved input and matching facts.

Cleanup certifies only a simple supported drawing. Existing school/barrier/access/exclusion analysis, target evidence, advisory workload and provider bounds remain in the unchanged factual/planning path. A synthetic barrier-shaped concavity test verifies repair elsewhere does not erase the notch; it does not claim a new live school-clearance test.

Requested-hours/Zone-count authority, Scale recommendation entitlement, ordinary Starter/Growth manual access, funding/work-start gates and existing accepted work remain unchanged. No intermediate drawing writes occur. Use This Area/Save remains the explicit acceptance action.

## Verification and evidence

**85 focused tests passed** across geometry, the actual editor recovery/navigation, existing mapping interaction, Zone presentation and planning UX suites. Coverage includes:

- Rough/concave valid outlines, endpoint gap/overshoot, small loop/backtrack, strict validation, substantial unequal figure-eight, separated loops, repair-count/relative-area/scale caps, raw/vertex/extent/size limits and concavity preservation.
- Actual mouse and touch widget events: **three rejected strokes → visible Draw Again → successful new stroke**, normal pan, pointer cancellation, second-touch interruption, Undo, Clear and Undo-after-Clear.
- A repaired preview with a different digest, disappearance of old target/time facts, rejection of a late old-geometry response, factual request carrying the corrected geometry, local raw comparison, and Cancel/reopen restoring original geometry/facts.
- Persistence sentinels throw on unexpected reads/writes; drawing/recovery tests recorded **zero** persistence calls. Existing explicit-save tests remain passing.
- **390 px / 2× text**: recovery controls are visible/hit-testable and a successful new stroke remains possible in the same editor.

The 29 affected recovery/mapping widget tests were rerun successfully after the final button-height correction. The final renders were visually inspected for readable recovery and acceptance controls.

Affected analyzer: clean. Local production-mode web build (`--release --dart-define=APP_ENV=production --no-pub`): passed. Dependency lock unchanged.

Review artifacts:

- [Before/after geometry examples](qa-artifacts/freehand-repair-examples.png): output from the actual geometry helper using explicitly synthetic local traces. Small overlap/overshoot repairs remain local; the concavity survives; the figure-eight has no proposed output.
- [Machine-readable synthetic inputs/results](qa-artifacts/freehand-repair-examples.json).
- [Actual editor recovery at 390 px / 2× text](qa-artifacts/freehand-error-recovery-narrow-2x.png).
- [Actual editor after successful retry](qa-artifacts/freehand-success-after-retry-narrow-2x.png).

The last two images are Flutter widget renders with synthetic blank map tiles and loaded system fonts; they are **not** physical browser/device screenshots or store-listing images. No production target counts or customer activity were fabricated.

Browser/device disposition: **no new physical PASS**. The Founder physical valid-redraw/intelligence-invalidation check remains pending. It should be performed against an approved deployed candidate, with an unsaved redraw followed by Cancel/reopen. The template-only report from the earlier turn remains excluded from acceptance evidence.

## Narrow deployment scope, held for review

Only the reviewed web client bundle containing changes to `campaign_freehand_geometry.dart` and `campaign_area_screen.dart`. Tests and example-render tools are development-only. No Cloud Function, rules, index, financial setting, subscription, native build, saved-Zone migration or provider refresh is required. Production deployment is held for Founder review.

Reproduce examples with `dart run tool/freehand_repair_examples.dart ../../docs/qa-artifacts/freehand-repair-examples.json` from `apps/mobile`, then `tools/render_freehand_examples.py` using the existing bundled Pillow runtime. Widget render output is opt-in through `FREEHAND_RENDER_DIR` and `FREEHAND_RENDER_FONTS`; these contain no credentials.

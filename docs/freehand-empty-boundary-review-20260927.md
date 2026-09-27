# Reachable drawing controls after Clear

Status: isolated web-client candidate, **not deployed**. Current Hosting remains
`sites/scaled-circle/versions/9e31249bfac7489c`, application source
`75e49c2065ae5438584dc6b4975f7c3806d36e35`.

## Established cause

`_clearArea` correctly empties the local boundary, clears old intelligence/error
state and keeps an Undo snapshot. The old toolbar correctly renders **Draw Area**
for the empty boundary. However, that toolbar is at the top of the scrollable
body, before advanced tools, instructions and the map. Clear is below the map, so
the Draw action is offscreen. The persistent footer was conditional on an error;
Clear removes that error. There was therefore no reachable replacement-drawing
action next to the visible map. This is a viewport/control-placement defect,
not a missing label or a failure of the cleared state to activate freehand input.

The regression test reproduces the exact failure on the pre-correction code:
after opening an actual saved-Zone fixture and clearing it, `Draw Area` exists
but has zero hit-testable matches. Earlier tests used `ensureVisible` before
tapping it; that helper scrolled to the toolbar and masked the customer defect.

## Narrow correction

One persistent, wrapping footer now contains the state-aware drawing action,
Cancel and the existing explicit acceptance action. Its states are:

| Local state | Drawing action | Acceptance |
| --- | --- | --- |
| Saved/valid boundary | Edit Boundary | Existing Use This Area/Save Zone gate |
| Empty, including Clear | Draw Area | Disabled |
| Rejected/interrupted outline | Draw Again | Disabled |
| Active freehand input | Cancel drawing | Disabled |
| Valid new preview | Edit Boundary | Use This Area |

Draw Area immediately starts freehand input in the same editor; Clear has already
removed the local saved-area flag, so no replacement confirmation is needed.
The separate header/scroll-toolbar drawing controls were consolidated into this
one action. Undo/Clear stay in the existing map-adjacent editing area. The footer
reserves layout space, wraps at large text sizes and uses intrinsic button
heights. Map sizing and scroll positioning include the attribution frame rather
than scrolling only the canvas into view. No overlay is painted over attribution.

Geometry cleanup/repair tolerances, strict rejection rules, PI/evidence logic,
source providers, Zone/workload rules, authorization and save implementations
are unchanged. Freehand remains opt-in; normal browsing continues to pan/zoom.

## Focused verification

**89 tests pass** across freehand geometry, actual editor recovery, mapping
interactions, Zone presentation and planning UX. Affected analyzer is clean.
Local production-mode web build (`--release --dart-define=APP_ENV=production
--no-pub`) passed in 63.0 seconds; dependency lock unchanged. The native primary
checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`.
The new four editor cases cover desktop and 390 px / 2× text, with and without
Clear → Undo → Clear before drawing. They use the actual persisted-Zone read
branch with a read-only fake document and a sentinel that fails unexpected writes.

Each new case verifies:

- Clear removes the local polygon/facts and disables acceptance.
- Draw Area is enabled and hit-testable **without scrolling it into view**.
- A valid replacement appears in the same editor, with reachable Edit Boundary
  and Use This Area; Cancel drawing is reachable during input.
- Attribution is separate, visible and hit-testable when drawing.
- The replacement has a new digest; only matching factual evidence appears.
- A late original-geometry response is ignored after Clear → Undo → Clear.
- Cancel/reopen restores the original saved boundary and matching facts.
- Exactly the two expected saved-document reads occur; no persistence calls or
  changes to the saved fixture occur.

Existing coverage still passes for mouse/touch synthetic repeated rejection →
Draw Again → valid preview, pointer cancellation, second-touch interruption,
Clear → Undo, normal browse pan, strict geometry and explicit-save behavior.
Tests that used the old redundant Edit Boundary action after rejection now use
the intended single Draw Again action.

The failed pre-fix run is retained in `.firebase/freehand-empty-before.log`.
Passing evidence is retained in `.firebase/freehand-empty-final-tests.log`,
`.firebase/freehand-empty-analyzer.log` and `.firebase/freehand-empty-web-build.log`.

## Render evidence

These are actual Flutter widget renders using the app theme, loaded fonts and
synthetic blank map tiles at 390 × 844 / 2× text. They are **not physical browser
acceptance** or production property evidence.

- [After Clear: reachable Draw Area](qa-artifacts/freehand-empty-draw-area-2x-20260927.png).
- [Rejected outline: reachable Draw Again](qa-artifacts/freehand-empty-retry-2x-20260927.png).
- [Valid preview: Edit Boundary and Use This Area](qa-artifacts/freehand-empty-valid-preview-2x-20260927.png).

## Deployment boundary

Only `campaign_area_screen.dart` changes in application code. Tests, renders and
this review record accompany it. No Functions, IAM, rules, dependency/lock change,
financial action, provider search, native checkout/build or CI run is included.

The Founder-observed production result remains **Clear → new drawing: FAIL**.
Web-only deployment requires approval. After the approved package is deployed
and its actual browser client verified, request only **Clear → draw replacement
→ Cancel/reopen**. Do not request a physical retest against the unchanged client.

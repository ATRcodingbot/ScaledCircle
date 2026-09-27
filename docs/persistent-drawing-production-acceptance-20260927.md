# Persistent drawing controls: production deployment

## Package and served client

- Approved application source: `18a64110c098a5105d0cd6db5c2e7f1fe9363fa5`.
- Hosting: `sites/scaled-circle/versions/ab2ca6649cb5fc8e`.
- Release time: `2026-09-27T13:26:33.510Z`.
- Served `main.dart.js` SHA-256: `b1e0bd0a736c0bf295401876a4f810523fa3594af3918e80e6b12b68abac5911`.
- Supersedes Hosting `9e31249bfac7489c` / application `75e49c2065ae5438584dc6b4975f7c3806d36e35`.

Live baseline and public-page hashes were verified before packaging. The new
source descends from that production baseline, with only `campaign_area_screen.dart`
changed in application code. All 319 declared compiled application inputs matched;
the dependency lock and geometry helper are unchanged. All five maintained static
public pages were retained. The 72-file Hosting package preserves the previous
headers/rewrites. Main bundle, bootstrap, service worker, index and five static
pages were fetched from scaledcircle.com and matched the prepared package.

Only Hosting was deployed. No Functions, IAM, rules, financial changes, migrations,
provider/model searches, native/CI builds or store actions were performed. The
native primary checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`.
Predeployment evidence remains 89 tests, clean affected analyzer and successful
local production-mode web build; see [review evidence](freehand-empty-boundary-review-20260927.md).

## Actual browser readback

The existing signed-in QA tab was refreshed normally without clearing session or
local data. It loaded the verified public client script and displayed the new
persistent action footer.

Existing Attractive Remodel draft: `czp6YVRr4SNXHGugmKZu`, name `test`.
Zone 1: `TRt0I00LLk83mZNN0fAJ`, saved name Area 1; digest
`9cfeff0d31a89a350e7067428ceb3d830441309c2ba3667c8b27115b37d2bde3`.
Baseline: 10 mapped residential targets, attached/semi-detached, 403 m supporting
streets, ~24 minutes, nearby 1960–1979 regional context. Two saved Zones, both
unassigned, no campaign-payment or assignment-compensation records.

Observed in the production browser:

1. Open saved Zone 1; bring its Clear button into view.
2. Activate Clear. Without subsequent scrolling, **Draw Area is visible and
   enabled next to the map**. The old polygon/facts disappear; Clear and Use This
   Area are disabled; Undo and Cancel remain available. The button's observed
   CSS bounds were x=660.62, y=765, width=143.16, height=44.
3. Semantic keyboard activation of Draw Area immediately changes the same editor
   to Draw mode with reachable Cancel drawing. A preceding tool coordinate click
   had no observable result, so it is not recorded as successful mouse evidence.
4. Cancel without saving, then reopen Zone 1: original saved boundary and matching
   10-target / 403 m / ~24-minute facts return.

No freehand stroke was attempted in this verification. This confirms availability
and reachable controls, not physical replacement-drawing acceptance. Before/after
read-only document comparisons show the full campaign, both Zones, payments and
compensation records unchanged (excluding transient query read times).

[Actual production Clear state](qa-artifacts/persistent-drawing-production-clear-20260927.png)
and [semantic activation reaches Draw mode](qa-artifacts/persistent-drawing-production-mode-20260927.png).
The screenshots are browser readback, not physical gesture evidence.

## Acceptance remains open

The historical Founder result **Clear → new drawing: FAIL** is retained. Prior
**Clear → Undo: PASS** is separate and does not close that failure.

The corrected client is available, and the saved Zone 1 editor is left ready.
One precise Founder request has been issued:
**Clear → visible Draw Area → valid replacement → inspect UNSAVED preview →
Cancel → reopen the original Zone**. Do not Use/Save/Remove/fund anything.

Only actual observation can close replacement drawing, removal of old intelligence
against a different valid shape, restoration on Cancel/reopen and unchanged Zone
count. Other untested physical cases remain separately pending, including the
earlier overlap/figure-eight/interruption checks. No physical touch PASS is inferred.

Private package manifests and before/after readbacks are retained, ignored, under
`.firebase/persistent-drawing-hosting/`.

# Team preview Hosting release validation — October 1, 2026

Reviewed base: `bf62c380ac9aea76fa410a318601e099f4ec5b7c`. Actual production baseline readback: `sites/scaled-circle/versions/9d004fa2e8b4d879`, released 2026-10-01T00:19:52.125Z from `8cf35b8a8b20c5c525a37c9d567bbf4b0d947658`.

## Final package reconciliation

Final validation found that the reviewed comparison controls kept their choices internally, so the explicit area acceptance path could not receive them. This bounded client correction exposes only the current account/geometry-bound selection to CampaignAreaScreen at explicit Use This Area. The existing Campaign Zones `saveCampaignWorkload` path refreshes authority/version and validates session hours, marketer count and coverage pattern before the Zone save. It receives no calculated time, readiness or assignment authority from the preview. Changes remain local until explicit acceptance; invalid inputs or rejected server validation prevent the area save. Cancel discards them. Read-only comparison cards outside the editable area remain comparisons only.

No calculator, server package, dependency lock, financial authority or frozen native worktree changes. Existing independently versioned campaign-setting and Zone writes remain separate operations; no new claim of atomic combined save is made. A failed later Zone save can leave explicitly accepted campaign settings saved; the existing error instructs checking saved state before retry.

## Focused evidence

- 132 focused client tests pass (previous 129 plus accepted/rejected explicit selection forwarding and invalid-input rejection).
- Actual editor fixtures verify switching without writes/acquisition, Cancel/reopen, current geometry binding, stale-response rejection, larger headcounts, 320 px and 2× text, semantics and keyboard mode changes.
- 77 maintained model/authority tests pass, including actual whole-Zone read-path parity and rejection of partial comparison as readiness.
- 19 local Auth/Firestore emulator planner tests pass, including exact 3 marketers / 4 hours / split-streets request, cross-workspace denial, malformed input, optimistic version rejection, audit and no assignment/financial artifacts.
- The pre-existing capacity-copy equality test remains failing (3 other packaging checks pass). The changed browser passes only raw settings to the same server action; unchanged `requirement` validation and the actual whole-Zone summary path agree. The differing connected-preview allocator is not passed into campaign writes. No failed test was weakened or counted green; this is not a full-suite PASS.
- Affected analyzer and production web build are recorded in local deployment evidence.

## Deployment and acceptance scope

Hosting only; preserve complete current Hosting assets/config and overlay only the newly compiled main.dart.js and flutter_bootstrap.js. Verify compressed object hashes and served bundle. No Functions/Rules/IAM/provider changes or native merge/build.

Live preview switching remains pending until a supported authenticated unsaved boundary exists. The prior cancelled request is reference evidence only; do not inject it. Full-area target inventory, missing transfers and overall team completion remain open, independent of this UI release.

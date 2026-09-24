# Isolated iPad capture — instrumented proposal, not authorized to run

Three actual Core screens at 2064 × 2752 on an installed iPad Pro 13-inch (M4)
simulator. Application source remains `26f29133fcd72edecf5c71497712674293228341`
(iOS36 / Android35), Flutter 3.44.8 revision
`058e0af2c2b57e369d905a03ac9748b0ebf543c6`, application lock SHA-256
`2d929b3279125c2a0732212aee86ebf51607aaff76f315c9a0ff51e0bbf8ea94`.
Adding the disposable driver dependency must preserve every existing package
version. No production app code, signed binary, build number or entitlement changes.

## What the previous attempt proves

Run `6ab58bd5dfe09cbb7e50dd55`, capture overlay
`ac27734b16ee306a2638e8ebb9f35969f8968d3c`, began September 24, 2026 at 4:45 PM
Eastern and timed out after 30m01s. Retained detailed logs show all four inputs
present, SDK/source/plist/lock verification, dependency resolution, installed
runtime selection, simulator creation and boot, then
`flutter-drive-build-and-capture [running]`. Reaching that command after sequential
checked operations establishes boot and preceding prerequisites completed.

The combined step ran 28m44s. Its internal output stayed private and was not
exported. Available evidence does not establish compiler completion, a retained
app, installation, launch, driver connection, login, navigation or capture.
No exported artifact is listed. That does not prove no private image was captured,
or that a recoverable app exists. The exact historical stall remains unknown.

Earlier run `6ab586168ba4d1c8416ef8ad` failed generic input preflight after 1m40s;
its exact missing/empty input was not retained. Both attempts cost $0. All four
temporary entries were removed and verified absent after the latest attempt.
Release Workflow Editor configuration was restored. These changes recreate no
credentials and start no run.

## Bounded diagnostic design

The runner records allowlisted stages, UTC start/end timestamps, elapsed time,
deadline, numeric exit status and fixed failure categories, with live CI progress.
Raw subprocess output remains private and temporary, never an artifact. Compilation,
app validation, installation and prebuilt-app launch/driver are separate stages.
Prebuilt Flutter drive may reinstall the same app but must not compile again.
No artifact from the failed historical attempt is assumed.

The app entrypoint, Firebase authentication, router, permissions and network
protections remain unchanged. The harness verifies protocol, normal startup,
verified expected reviewer identity, maintained route and bounded screen readiness.
It does not approve native permission dialogs, disable enforcement, invent data or
ignore auth failure. Indefinite driver connections, loading animations and native
commands must end at their stage deadline. Native overlays remain a limitation to
inspect, not permission to force a screen.

Each completed screenshot is independently dimension/hash checked and promoted
immediately. A later Schedule failure retains already-completed Home PNGs. Safe
status and partial manifest update during the attempt. Work stops at 24 minutes,
cleanup is bounded, and the provider cap remains 30 minutes. Stage limits are
clipped to the remaining work budget. Hard termination can still prevent provider
artifact publishing; live milestones remain fallback evidence. Do not rely on a
finalizer running after forced termination.

Private files use a restricted temporary directory on the ephemeral CI worker.
Simulator/worktree cleanup is bounded; any remaining private files are left for
worker disposal rather than an unbounded recursive cleanup that could consume
the export reserve. None is included in artifact paths.

Screens remain Business Home, Schedule and Campaigns with isolated reviewer data.
No login screenshot is taken. Each PNG still needs visual inspection for native
overlays, loading/error state, truthful empty content, privacy and attribution
before store upload. Captured does not automatically mean store-ready.

## Next attempt — separate approval required

Propose ONE instrumented diagnostic/capture attempt, not a guaranteed screenshot
fix. Allow roughly 15–25 minutes if normal compile/startup succeeds; 24-minute
work budget, maximum 30-minute provider run. No larger cap or automatic retry.
Compilation is capped at 12 minutes and prebuilt launch/driver at 10 minutes,
both clipped by the same 24-minute work budget; these are not additive grants.

Read-only billing September 24, approximately 5:29 PM Eastern: 381/500 free macOS
minutes consumed, **119 remaining**, no subscription and no billing transactions.
Recheck before a separately approved start. Stop if payment, upgrade or purchase
would be required.

Exactly four temporary encrypted app-level entries in `ipad_capture_reviewer`
on existing Codemagic application `6a9d446e630e3c47918cbb56` would be required:

- `IPAD_REVIEWER_EMAIL`: existing `attractiveremodel+appreview@gmail.com` app login.
- `IPAD_REVIEWER_PASSWORD`: its existing ScaledCircle app password, entered securely.
- `IPAD_REVIEWER_UID`: verified Firebase Auth UID, checked without printing it.
- `IPAD_FIREBASE_PLIST_BASE64`: existing production iOS Firebase plist, securely
  mapped from maintained `IOS_GOOGLE_SERVICE_INFO_PLIST_B64` input.

No Gmail access, new account, password, entitlement, consent, custom token or Admin
access. Never put values into source, YAML vars, CLI arguments, screenshots or logs.
Preflight prints only fixed names with absent/empty/present, no lengths or hashes.
Check exact group/branch import and variable overrides: release Workflow Editor
inputs are not inherited automatically. Remove the temporary capture entries after
the attempt, including failure, preserving unrelated secrets and store credentials.

Retained outputs: completed PNGs, partial source/runtime/hash manifest and safe
stage report. No simulator app, raw log, credential file, VM transcript or environment
dump is exported. A failed attempt may produce zero pictures; safe diagnostics must
still identify its last observed boundary.

## Capture-only CI entrypoint

Codemagic requires repository-root `codemagic.yaml`; the nested file is a template.
Preserve the separate capture worktree and branch
`codex/ipad-capture-notifications-26f2913`. Do not overwrite or merge this overlay
into the release root YAML. After separate approval, update that branch with the
reviewed tools and put the template at its root. Select `ipad-reviewer-capture`
in the existing app and verify cap, exact encrypted group and artifact-only config.
No trigger, signing integration, publishing or store upload is configured.

Tooling checkout and detached application worktree pinned to `26f2913` are separate.
An exact shallow fetch of that commit is allowed if needed; no fallback to HEAD.
Validate production project, bundle and Firebase app identity before writing plist
into the disposable checkout. Use installed simulator inventory; no runtime download.
The release YAML's `ios33_artifact_recovery` group/token is unrelated: do not import
it. Preserve the release Workflow Editor and distinguish tooling from app provenance.

## Evidence limits and local checks

Pinned source has no App Check dependency/App Attest/debug-token startup path.
That does not establish live console enforcement or simulator authentication.
Runtime rejection remains failure; do not relax enforcement. Simulator APNs/FCM
cannot prove physical push. Capture does not enable notifications, send checks or
invoke GPS, financial, campaign mutation, mailbox or publishing actions. Normal
signed-in app reads remain real behavior.

Run focused Python harness/preflight tests plus Dart driver tests/analyzer locally.
They cover bounds, stage safety, partial preservation and input validation, not
macOS compilation, native dialogs, production login or actual pictures. Label future
images same-source iPad simulator captures with a debug harness, not physical-iPad
or signed iOS36 runtime evidence. Public submission remains blocked.

September 24 offline validation: 13 Python tests, six Dart driver tests and 30
actual Dart-serialized synthetic event records accepted by Python. Analyzer had
no issues in an isolated validation package with the existing dependency config.
No simulator, production sign-in or CI run was used for this validation.

- `python tools/ipad_capture/test_capture.py`
- From `apps/mobile`: `flutter test --no-pub ../../tools/ipad_capture/capture_driver_test.dart`
- `capture_driver_test.dart` optionally writes the synthetic protocol fixture to
  `IPAD_TEST_EVENT_FIXTURE`; this is a local test-only input, not a CI credential.

# Isolated iPad screenshot capture (prepared, not run)

This tooling captures real Core screens at 2064 × 2752 from an iPad Pro 13-inch
(M4) simulator. It pins application source
`4834e69e565370b8d54f203ff50ba33e8242196d` and Flutter 3.44.8 revision
`058e0af2c2b57e369d905a03ac9748b0ebf543c6`. The source dependency lock is verified
and every existing package version must remain unchanged after adding the
disposable Flutter driver harness. No production Dart file is changed.

## One operator setup, before any run

1. Verify the actual Codemagic account's available macOS minutes and whether a
   30-minute maximum capture job stays within its allowance. Local records do not
   establish an available allowance or authorize paid overage. Do not run until
   that is resolved. This is an upper bound, not a duration/cost quote.
2. Use the **capture-only CI branch root overlay** described below. The nested
   YAML is a template, not a discoverable Codemagic configuration. Preserve the
   production branch's root YAML and existing Workflow Editor configuration.
3. Use the existing mac_mini_m2 worker/Xcode 26.6 configuration, Flutter 3.44.8,
   CocoaPods and an **installed** available iOS simulator runtime with the
   `iPad Pro 13-inch (M4)` device type. The script discovers the installed runtime
   and fails closed if unavailable; it does not download an Xcode runtime.
4. Create the secured Codemagic group `ipad_capture_reviewer` with encrypted
   `IPAD_REVIEWER_EMAIL`, `IPAD_REVIEWER_PASSWORD`, `IPAD_REVIEWER_UID` for the
   existing isolated Business review account. Enter secrets only in the protected
   provider UI. No new account, custom token, entitlement, consent, or bypass is
   created. The account must already be email verified and permitted to access
   its current Business workspace. No Apple signing/API integration is needed.
5. Reuse the existing Default Workflow's encrypted
   `IOS_GOOGLE_SERVICE_INFO_PLIST_B64` Firebase iOS plist, securely mapped
   as `IPAD_FIREBASE_PLIST_BASE64` in that group (single-line Base64). It is
   intentionally not checked in. The script validates project, bundle and iOS
   app identity, writes it only in the disposable checkout, then deletes it.
   Do not substitute the staging plist. Existing CocoaPods support must be
   available; Flutter creates its normal missing Podfile in the disposable tree.

Parent live account readback on September 24: Free macOS minutes displayed
342/500, no subscription or billing transactions. Reconfirm whether that counter
means consumed minutes before authorizing one manual run of at most 30 minutes;
do not enable a subscription, paid runner, automatic triggers, or overage.

## Exact Codemagic entrypoint

Official [YAML configuration documentation](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/)
requires a committed repository-root `codemagic.yaml`. The
[configuration scan instructions](https://docs.codemagic.io/partials/quickstart/create-yaml-intro/)
explicitly support different configuration files in different branches. The
[Builds API](https://docs.codemagic.io/rest-api/builds/) accepts `workflowId` plus
`branch` or `tag`; its documented parameters do not include a custom YAML path.
Do not attempt a nested-path API override.

After the tooling is committed and the separate preparation is authorized:

1. Create a separate Git worktree/CI-only branch, for example
   `codex/ipad-capture-4834e69`, from the reviewed commit containing these tools.
   Do not switch or overwrite the release worktree. Ensure the pinned application
   commit is reachable in that branch's history; `run.py` checks it exists.
   A normal full clone contains that ancestor. If CI clones shallowly, the script
   fetches only the existing `internal-refresh-4834e69` tag from `origin` and
   verifies it resolves to the exact SHA before checkout. Repository read access
   must permit that fetch; unavailable or changed tags stop capture, never fall
   back to current HEAD.
2. **In that separate capture worktree only**, copy
   `tools/ipad_capture/codemagic.yaml` over its root `codemagic.yaml`. Commit only
   this capture-branch overlay and push that branch. Do not merge it into the
   release branch. The root contains only `ipad-reviewer-capture`, with no
   triggering/publishing sections or signing integration.
3. In the existing Codemagic app, select that capture branch and use **Check for
   configuration file**. The workflow to select is `ipad-reviewer-capture`.
   Confirm the preview has the 30-minute cap and artifact-only configuration.
4. Only after the separate run/secure-group approval, manually start that workflow
   on that branch. Do not select the production/recovery workflow or enable
   webhooks. An API invocation, if later explicitly authorized, uses the existing
   app ID, that branch, and `workflowId: ipad-reviewer-capture`; no request is
   issued by this preparation.

The CI checkout contains the tooling overlay; `run.py` compiles application code
from a second detached worktree pinned to `4834e69`. The CI tooling commit and
application commit are intentionally different and must not be represented as a
new signed release.

### Existing secret names found locally

Both current root YAML and the root YAML at `4834e69` contain only the historical
`recover-ios33-upload-only` workflow. Its group is `ios33_artifact_recovery`, and
its sole nonstandard environment reference is `IOS33_RECOVERY_ARTIFACT_TOKEN`.
Neither YAML defines a production Firebase plist variable/group. Do **not** import
the recovery token for capture. Parent verified the existing Default Workflow's
masked, workflow-local variable name is `IOS_GOOGLE_SERVICE_INFO_PLIST_B64`; no
shared group was shown. A root-YAML capture workflow cannot assume it inherits
that workflow-local value. Securely copy/map it to `IPAD_FIREBASE_PLIST_BASE64` in
the capture group through the protected UI, without logging or copying it into
repository files. No secret values were inspected here.

## App Check and simulator startup disposition

Read-only inspection of the pinned source found no `firebase_app_check`
dependency in pubspec/lock and no Dart/native App Check, App Attest, DeviceCheck
or debug-token setup. `main.dart`'s `_initializeIos` initializes Firebase with
the normal production options, verifies project identity, and initializes Auth.
`AppDelegate.swift` registers normal plugins and the existing tracking bridge;
there is no simulator-specific App Check prerequisite in that startup path.
The capture harness calls that unchanged startup path. It does not install a
debug provider/token or disable any Firebase protection.

This is a source finding, not proof of current Firebase Console enforcement or
successful simulator authentication. If live Auth/Firestore/Functions policy
rejects the simulator, the capture must stop and the actual rejection must be
reviewed separately; do not relax rules/enforcement to obtain images. APNs/FCM
device registration may remain unavailable on a simulator; its maintained
failure handling does not establish physical notification delivery, and this
capture does not enable notification permission or attempt push certification.

## Runtime and authentication

`run.sh` executes `run.py`. It verifies source and toolchain, creates a disposable
worktree and simulator, then runs `flutter drive` in debug simulator mode with
`APP_ENV=production`. This compiles a simulator-compatible app with test-only
driver wiring, **not another signed release pair**. No `--build-number`, IPA/AAB,
store upload, distribution or schedule is configured.

The host driver reads the encrypted environment values and passes them over the
local Dart VM driver connection to Firebase's normal email/password sign-in.
The exact expected UID and verified email are checked. Credentials are not Dart
defines, app assets, source files or manifest fields. Driver command logging is
disabled; worker stdout/stderr goes to a private temporary log deleted at exit.
No login/account-entry screenshot is taken. The session is signed out and its
disposable simulator is deleted on completion/failure.

The handler permits only `/business`, `/business/schedule`, and
`/business/campaigns`. It uses maintained AppNavigation and normal route gates;
it never constructs an ungated product screen. No create, update, analysis,
publish, funding, send, or GPS action is invoked. Normal authenticated app reads
and incidental session behavior remain real production behavior.

## Artifacts and honest evidence

Only three OS-native PNGs and a source/toolchain/runtime/hash manifest are
retained. Screenshots are taken only after authentication, expected screen
presence, and loading-indicator checks. Their dimensions are verified without
resizing. No simulator app, credential files, logs, or VM transcript is uploaded.
Failure removes partial screenshot artifacts.

Review every PNG before store upload for actual loaded state, error/empty-state
accuracy, unrelated personal data, native restrictions and required map
attribution. The automation cannot certify attractive or complete marketing
content from widget presence alone. Preserve attribution; never substitute
fabricated work, stretch phone captures or reuse Android images.

Label these **same-source iPad simulator captures with a debug test harness**.
They are not physical-iPad, physical-push, or signed iOS35 execution evidence.
The existing source-matched iOS35/Android34 distribution artifacts are unchanged.

Local validation: `python tools/ipad_capture/test_capture.py`. Mac compilation,
runtime availability, reviewer sign-in and screenshots remain unexecuted until
the isolated CI job is authorized and run.

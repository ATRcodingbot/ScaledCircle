# Production X certification and Android versionCode 2

Source branch: `real-completion-proof`.
Application source HEAD: `c0c75b669e244d819c7fb2c121adb34739140824`.
Certification date: September 5, 2026. Times below are UTC.

## DONE — production X

Founder confirmed encryption secret version 4 was generated using
RandomNumberGenerator.Create().GetBytes() into 32 bytes, encoded as Base64,
and piped directly to Secret Manager. No secret payload was inspected.

Only the following existing Cloud Functions were refreshed by a configuration
update of `serviceConfig.secretEnvironmentVariables`, resolving the maintained
encryption binding to explicit version `4`. Source and other settings were
preserved. All five became ACTIVE and received 100% traffic on these revisions:

| Function | Revision |
| --- | --- |
| beginSocialOAuthConnectionV1 | beginsocialoauthconnectionv1-00003-wab |
| getSocialOAuthAttemptV1 | getsocialoauthattemptv1-00002-has |
| confirmSocialOAuthConnectionV1 | confirmsocialoauthconnectionv1-00002-kom |
| socialOAuthXCallbackV1 | socialoauthxcallbackv1-00002-vij |
| syncXSocialReadOnlyPerformanceV1 | syncxsocialreadonlyperformancev1-00002-vas |

The other 127 production function metadata records were unchanged. Firebase CLI
preparation attempts were stopped before function updates: the root configuration
ran unrelated local generation hooks; the isolated Social config then required an
unrelated Meta secret during analysis. Generated tracked files were restored and
the temporary config removed. The actual refresh used the Cloud Functions API.

Exactly one post-refresh initiation succeeded, creating attempt
`546dfbbb1ac61f1078633b0392bc0feae032c049c9ae35fc873512525b4851fb`
at 08:53:03.536. The prior encryption error did not recur. Founder completed X
consent; the callback returned an account ready for confirmation.

Confirmed identity: **Scaled Circle / @ScaledCircle**.
Provider user ID: `2090731921177210880`.
Granted scopes exactly: `users.read tweet.read offline.access tweet.write media.write`.
Unexpected scopes: 0. Connection: `connected_write`. Token health: `healthy`.

Two maintained Sync insights operations passed, including provider identity
validation and persisted credential refresh generations **1 → 2 → 3**. The second
cycle used the previously persisted credential, proving refresh continuity without
reading tokens. Last observed sync: 08:56:57.580; metric collection health: healthy.

Provider config remained exact: production client
`SVE2bE9DelpBSU1ZT1I4ejJRNXc6MTpjaQ`, production callback
`https://us-east1-scaled-circle.cloudfunctions.net/socialOAuthXCallbackV1`,
enabled/historicalSyncEnabled/writeScopesEnabled true;
**externalPublishingEnabled false**.

After certification, version 1 was disabled, not destroyed. The historical
08:31:37.839 invalid-key diagnostic predates versions 2–4, identifying the old
version-1 deployment as the malformed historical configuration. All five active
traffic revisions were verified on v4 before disabling v1. Final secret states:
v4 ENABLED; v1/v2/v3 DISABLED. No version 5 was created.

No posts, media uploads, edits/deletes, Facebook/Instagram mutations, or publication
authority changes were performed. No Hosting, Rules, or indexes were deployed.

## DONE — Android preparation

The callback fix already exists in application source:
`AppEnvironmentConfig.socialOAuthCallback` selects the production/staging/local
callback, and the admin Social screen uses it. No additional app-source edit was
needed. Production startup checks the Firebase project and only connects emulators
when APP_ENV is local.

Fresh build command, from apps/mobile:

```text
flutter build appbundle --release --build-name=1.0.0 --build-number=2 --dart-define=APP_ENV=production
```

Artifact: `apps/mobile/build/app/outputs/bundle/release/app-release.aab`.
SHA-256: `cb1c158b1eb02ad8f8ead3325f14b03d8f4a23b1bc50134806230e122890333a`.
Size: 68,407,852 bytes. This is not the rejected prior artifact.

AAB manifest verified directly: package `com.scaledcircle.app`, versionName
`1.0.0`, versionCode `2`, minimum SDK 24, target SDK 36. All three ABIs verified:
arm64-v8a, armeabi-v7a, x86_64. Production Functions origin and X callback symbols
are present in each libapp.so. Canonical production Firebase registration checks
passed. Signature verified with jarsigner; certificate owner is Scaled Circle LLC,
OU Android Release. Certificate SHA-256:
`86:AD:68:6E:F8:EA:62:30:96:89:6F:97:65:79:4D:49:61:22:A2:BA:6A:5C:D7:65:7C:4A:88:51:B2:1F:CA:D7`.
Jarsigner reports the self-signed release certificate, missing timestamp, and
JarInputStream manifest-order warnings; Google Play acceptance remains pending.

The retained scanner `tools/verify_android_production_bundle.py` scans all ZIP
entries including debug symbols and parses the AAB protobuf manifest. Detailed
local report: `tmp/android-production-v2-audit.json`.

Staging identifiers and app emulator endpoint/project markers: **0**. Generic
loopback strings are present and were not reported as raw zero: Flutter's
`lib/ui/hooks.dart` checks localhost in `_isLoopback`; Flutter engine strings
describe VM-service loopback defaults. DEX references were located in gRPC
resolver code, Google Firebase Auth SDK constructors, and reCAPTCHA SDK code.
These are library constants, not ScaledCircle production endpoint configuration.

Checks: 42 OAuth/packaging tests; 9 Flutter release/environment tests; scanner
accepts this bundle and rejects an injected staging-origin regression.

## BLOCKED — Internal Testing upload

Existing developer account: Scaled Circle, ID `6212782302808419275`.
App ID: `4972774213540480356`. Internal track ID: `4700346819472257137`.
Existing available release: versionCode 1. Created a version-2 release draft at
`releases/2/prepare`; no AAB was uploaded.

Automatic approval review rejected the browser file upload, stating explicit
authorization for this artifact/destination was missing. Do not bypass it.
Next Founder action: approve uploading the exact SHA above and releasing it to
**Internal Testing only**. Do not promote to Closed/Open/Production.

## OPEN — physical Android proof

After Internal Testing upload and release acceptance, Founder must install
versionCode 2 and test Apply → Accept → Start Job → background GPS →
checkpoints/photos → background/foreground → offline/reconnect → resume →
Complete → tracking stops → Job Room → earning → Wallet. Physical proof has
not been performed. iOS and Stripe TEST certification remain subsequent work.

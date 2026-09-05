# iOS source audit and one-build handoff

Source-only; no Apple account action, archive, spend, certificate or physical test.
Supersedes the optimistic source-ready wording in ios-testflight-readiness.md.

Verified: Runner bundle ID `com.scaledcircle.app` in all app configurations;
display name ScaledCircle; Flutter version currently `1.0.0+1`, build supplied by
FLUTTER_BUILD_NUMBER. Android code2 is independently released and unchanged.
Firebase Dart options select production `scaled-circle`, iOS app
`1:1010956217112:ios:0c1a12a1424128b9e70c6d`. The environment helper uses the production
`https://us-east1-scaled-circle.cloudfunctions.net/socialOAuthXCallbackV1` callback
with APP_ENV=production. Do not change that callback to a mobile custom scheme.

P1 defect fixed: image_picker camera/gallery callsites existed without iOS camera
and photo-library usage strings. Added strings describing job evidence/brand asset
selection. No microphone permission is added; current audited flows capture photos.
The plugin explicitly requires these descriptions:
[image_picker iOS setup](https://pub.dev/packages/image_picker).

Location descriptions and `UIBackgroundModes=[location]` already exist. No declared
push capability, associated-domains entitlement or signing team was found. No
maintained macOS/cloud iOS pipeline was found in this repository. Windows cannot
produce the final Apple archive. No external paid build service was started.

## Remaining build gates

GoogleService-Info.plist is absent locally and no resource reference was found in
the Xcode project. On the trusted Mac, obtain the existing production Firebase
iOS app config; check PROJECT_ID, BUNDLE_ID and GOOGLE_APP_ID above. Ensure it is
included in Runner Copy Bundle Resources and present in the archived app. Merely
placing it beside source is not proof of packaging. Keep it out of the commit.

Select the real Apple team, app registration and profile. Do not invent IDs or
entitlements. Inspect App Store Connect for the next unused iOS build number;
proposed version1.0.0, build1 only if unused. Record the selected release SHA.

No universal-link registration is certified: verify web OAuth completion on iOS
Safari and returning to the app. Native deep-link handling, Apple Team ID, AASA
hosting and Associated Domains remain a separate approved integration if required.
Do not claim push notifications; adding APNs later needs capability, provisioning,
server configuration and real-device lifecycle testing.

## Exact build/evidence sequence on the trusted Mac

1. Clean checkout of approved SHA; install locked Flutter/CocoaPods dependencies.
   Supply the verified plist and real signing team. Run Flutter tests/analyzer.
2. `flutter build ipa --release --dart-define=APP_ENV=production --build-name=1.0.0 --build-number=<unused-iOS-build>`.
3. `python3 tools/verify_ios_production_bundle.py <ipa> --version 1.0.0 --build <unused-iOS-build>`.
   The guard checks all archive entries for known staging/emulator origins and
   app-binary callback evidence, metadata, Firebase target and permission strings.
   Generic SDK loopbacks require review. Synthetic positive/negative fixtures pass;
   no real IPA was available. This is a content gate, not signing certification.
4. Xcode Validate App and macOS `codesign --verify --deep --strict <Runner.app>`;
   inspect signed entitlements/profile for actual team, bundle and distribution
   purpose. Review SDK privacy manifests and required-reason APIs from the archive.
   Preserve full IPA SHA256, source SHA, signing metadata and validation output.
5. App Store Connect: confirm app identity, version, export-compliance answers,
   privacy inventory, support/privacy URLs, screenshots, beta description/contact,
   login/test notes and internal tester membership. Upload TestFlight only after
   explicit approval; upload acceptance does not establish physical certification.

## Privacy and physical lifecycle evidence

Inventory: account identity/contact; precise foreground/background job location;
timestamps and assignment/compensation records; evidence photos and metadata;
Business brand media; diagnostics; Social OAuth data handled through backend.
Founder must reconcile App Store privacy answers and retention/deletion behavior
with counsel and the actual SDK manifest; do not declare no data collection.

On one iPhone record model/OS/build/account, then sign in, accept assigned work,
start job, grant location with denial/recovery coverage, lock screen, background,
lose/recover network, capture/upload evidence, finish and verify tracking stops.
Confirm Business Job Room review, exactly one earning/Wallet effect on replay,
app restart recovery and no duplicated proof. Verify Safari OAuth return without
publishing. Notifications remain unsupported until independently implemented.

Shortest Founder list: provide a trusted Mac with the existing Apple team and
production Firebase plist; approve one verified TestFlight upload; install and run
the lifecycle above when available. No iPhone interaction is requested now.

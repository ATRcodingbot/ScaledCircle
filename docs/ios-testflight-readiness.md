# iOS / TestFlight source readiness

Status: source-ready where credentials are not required; Apple signing and a physical-device lifecycle remain external gates.

## Repository authority

- Bundle ID: `com.scaledcircle.app`
- Display and bundle name: `ScaledCircle`
- Version/build: sourced from Flutter `1.0.0+1`
- Background mode: `location` only
- Location copy states that collection starts only for an assigned job and continues while the screen is locked or another app is open.
- `GoogleService-Info.plist` is intentionally excluded from Git. Obtain it from the existing Firebase iOS app and place it at `apps/mobile/ios/Runner/GoogleService-Info.plist` only in the trusted build workspace.

## Deliberately not fabricated

- `DEVELOPMENT_TEAM` remains unset until the Founder selects the real Apple team in Xcode.
- No push entitlement is declared. The app has no maintained `firebase_messaging` dependency or certified push lifecycle yet.
- No Associated Domains entitlement is declared. Add it only after the production `apple-app-site-association` file, Apple Team ID, and supported universal-link routes are approved and publicly verified.
- No signing certificate, provisioning profile, Apple credential, or Firebase plist belongs in source control.

## App Store privacy inventory for review

The submission owner must validate the final App Store answers against the shipped binary and policies. Current code uses account identity, campaign/work records, uploaded proof images, and precise location during an actively started assigned job. Background location is operational evidence, not advertising tracking. The app must not claim push notifications, universal links, or unrelated tracking until those paths are certified.

## TestFlight checklist

1. On a trusted macOS/Xcode host, check out the reviewed release SHA with a clean tree.
2. Add the production Firebase iOS configuration locally; verify its bundle ID is `com.scaledcircle.app`.
3. Run `flutter pub get`, CocoaPods install, Flutter tests, and `flutter analyze`.
4. Select the real Apple Development Team and let Xcode create only the required signing profile.
5. Confirm Release configuration, version/build number, ScaledCircle display name, background location mode, and absence of undeclared capabilities.
6. Archive and validate without changing the bundle ID.
7. Upload to TestFlight; do not submit for App Review.
8. On an internal iPhone, certify sign-in, application, job start, foreground/background/locked-screen tracking, evidence upload, offline recovery, completion, tracking stop, Job Room, and exactly-one earning.
9. Record device/OS/build, timestamps, server receipts, and any unavailable evidence truthfully.

## External blockers

- macOS/Xcode archive host
- Apple team selection and signing
- production Firebase iOS plist transfer into the trusted build workspace
- App Store Connect/TestFlight account action
- physical iPhone lifecycle proof

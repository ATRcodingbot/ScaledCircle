# iOS39 unchanged-artifact recovery

Application source remains `d60920930c81253f9019c19bed47a3eaf184dd3e`.
This branch changes release validation/workflow tooling only; no application files,
dependency lock, signing identities, product configuration or IPA bytes change.

## Retained original

- Build run: `6abe5d6c3250e73fa66ee5c9`, tag `internal-native-parity-d609209`.
- Artifact: `Scaled_Circle.ipa`, 35,368,745 bytes, downloaded through Codemagic's
  authenticated artifact action and preserved separately from the Downloads copy.
- SHA-256: `845c80206f166e9aea4ea56dcdf7f79f768d23bdc9697a08d32cb1dd90cda021`.
- Artifact identity: `aac342ad-6408-48ec-91b2-e1b9ca2b1382/8285af97-4793-46ae-9718-46f6857df6a0/Scaled_Circle.ipa`.
- Original run pinned source/lock/Firebase and source-branding guards passed.
  Flutter archived/exported version 1.0.0 (39), `com.scaledcircle.app`, display
  name `Scaled Circle`. External publishing was skipped after the stale guard.
- Original runtime 8m43s, $0. Current billing readback: 8/500 used, 492 remaining.

## Narrow correction and selected path

`verify_ios_production_bundle.py` wrongly required `CFBundleDisplayName` to be
`ScaledCircle`. It now requires the approved exact `Scaled Circle` spelling.
The other maintained branding guards already require the spaced name. Intentional
technical names, symbol manifest version, paths, bundle IDs and Firebase IDs remain.

Selected recovery: validate and upload the original retained IPA, not a rebuild.
The new isolated `recover-ios39-upload-only` workflow replaces the historical
iOS33 YAML **only on this tooling branch**. It uses free Personal Mac mini M2,
Xcode 26.6, a 30-minute cap and the existing `Codemagic ScaledCircle` integration.
There is no automatic trigger or retry, no Flutter/Xcode build, no re-signing and
no App Store/external-beta submission.

The runner records its tooling revision, checks out the exact original application
SHA, overlays only tools from the tooling revision, checks application files and
the original dependency-lock hash, then retrieves the original artifact through its existing expiring download link. Its expected hash is fixed before validation. Token-bearing headers
are never forwarded to redirected download hosts.

All original guards are mandatory: source/lock provenance, production bundle
content/metadata/private-key restrictions, source and compiled branding, signed
and provisioning production APNs, original required/forbidden binary markers,
Apple Distribution signing/team, strict signature verification, and distribution
entitlements. App Store provisioning is also confirmed (no device list or
enterprise provisioning). Only a fully validated, hash-identical IPA is copied
to `validated/recovered-ios39.ipa`, the sole published IPA path. Missing checks,
non-PASS results, failures, changed bytes or stale output block publishing.
Apple processing is handled outside the macOS validation work; only the existing
ScaledCircle Internal group may be used when eligible.

## Preflight checkpoint

- Local corrected content validation on original IPA: PASS, including metadata,
  production Firebase identity, prohibited packaged markers and no `.p8`.
- All maintained required/forbidden application binary markers: PASS.
- Native source branding: PASS (33 images).
- Full artifact validation: **PENDING macOS**. Compiled artwork, strict signing
  and signed/provisioning APNs checks have not yet run against this IPA.
- Apple all-status upload history still ends with build 38. No build 39 upload
  or processing observed. Re-read immediately before recovery starts.
- Existing publishing integration `Codemagic ScaledCircle`, key ID `62PY88NT42`,
  remains configured. No credentials/identities were changed.
- No application/global recovery secret existed. The authenticated artifact URL
  returned HTTP 401 without a token. The existing Builds list separately exposes
  an already-issued expiring artifact-specific download link. An unauthenticated
  GET of that link returned the exact original IPA hash. No new public URL or
  browser/API credentials were created or extracted. The earlier request for a
  manual API-token entry was withdrawn; Founder has no secure-entry task.
- The expiring link is stored only in the encrypted temporary variable
  `IOS39_RECOVERY_ARTIFACT_URL`, group `ios39_artifact_recovery`. Remove that
  temporary entry after the bounded recovery attempt. Never log or commit it.
- The application UI was temporarily switched from Workflow Editor to YAML for
  isolated recovery preparation; original release workflow definitions remain.
  Restore the original configuration method after the recovery attempt.
- Deleted follow-up automation remains deleted. Recovery has not started.

## Focused tests

Five IPA content tests, nine recovery orchestration/workflow tests and three
native-branding tests pass (17 total). Tests cover the exact approved name, wrong
name/bundle/version/build, retained contamination/private-key restrictions, every
required guard failure, missing/non-PASS guards, hash changes, stale artifacts,
all checks before staging, unchanged output bytes, no rebuilding/submission,
and no token forwarded on redirects. These tests do not substitute for macOS
artifact verification or Apple's upload/processing.

## Android38 remains separate and held

One local attempt in `C:/tmp/sc-native-d609209`, October 1 around 09:16–09:18 EDT;
there is no external CI run ID. Retained `android38-build.log` is the attempt record.
Locked dependencies/source setup passed and release asset processing reached font
tree-shaking. `:app:compileReleaseJavaWithJavac` then failed: generated Java
referenced `dev.flutter.plugins.integration_test.IntegrationTestPlugin`, absent
from the release classpath. Duration 120.3 seconds; no AAB output directory,
retained AAB, upload or version-code consumption.

The invocation's `--no-pub` skipped Flutter 3.44.8 release-specific plugin
regeneration after standalone pub get. A separately authorized retry should omit
that option and preserve exact source/lock checks. No Android retry is included
in this recovery; no application defect or shared branding failure is established.

## Operational references

- [Codemagic authenticated artifact access](https://docs.codemagic.io/rest-api/artifacts/)
- [Codemagic API-token secure configuration](https://docs.codemagic.io/rest-api/codemagic-rest-api/)
- [Publishing post-processing](https://blog.codemagic.io/post-processing-of-app-store-distribution/)

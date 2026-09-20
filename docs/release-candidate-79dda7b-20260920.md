# Candidate 79dda7b — regression and matched-build preparation

Pinned candidate source: **79dda7bc5104eaad444b09fa7e2fcee09e61b2fe**. No application/runtime/client changes since accepted d3cef27; only stale architecture-test expectations now include the maintained creative grant/research endpoints and google-auth-library dependency. Production Social remains runmanagedsocialpreparationv1-00012-pol. This document does not claim new binaries or distribution.

## Fresh regression

- Maintained backend full suite: 835 cases, 833 passed, 2 opt-in emulator skips, zero failures. The two skipped Story concurrency/preparation cases were subsequently executed against the local demo Firestore emulator and passed in a 16-test run also covering content/image recovery. No skips in that focused run.
- Flutter full suite: 796 passed, 3 maintained skips, zero failures, APP_ENV=staging. No Flutter bytes changed between the tested checkout and pinned source. Dependency lock SHA256 remains 2d929b3279125c2a0732212aee86ebf51607aaff76f315c9a0ff51e0bbf8ea94.
- Earlier full attempts are retained as failures: stale endpoint/dependency architecture assertions; missing APP_ENV for Flutter; stale local hook cache. The local hook cache was renamed, not deleted, and regenerated. A separate existing SDK path began initialization during diagnosis and was stopped; the passing run used C:/flutter_sdk_link, not that SDK. No app dependency upgrade or source workaround.
- Logs: final-current-backend-pass.log, final-current-flutter-staging.log, final-79dda7b-emulator.log under .firebase/launch-close-20260919. The previous 587737b regression is not used to certify this changed source.

## Native delta and exact pair preparation

Console readback September 20: Apple latest uploaded iOS build is 1.0.0 (28); Play latest uploaded bundle is 1.0.0 (26), active Internal Testing. Proposed next pair: iOS 1.0.0 (29), Android 1.0.0 (27), both pinned to the candidate above. Numbers are observed available, not reserved by a provider until upload. Do not overwrite/reuse an existing number if another upload appears.

Android 26 lacks the four later shared Social Dart files listed in social-execution-release-next-20260920.md. iOS 28 has the larger documented Email/Social/Admin/privacy delta. Zero-balance Earnings is already included in old iOS 28; it is not a newly missing feature. Native candidates remain unmatched.

Before build: use one exact checkout and lock; repoint the existing CI source/build guard from the old iOS source/28 to this SHA/29; use production APP_ENV and scaled-circle Firebase identity. Preserve signing/APNs configuration. Verify IPA/AAB source hash, application ID com.scaledcircle.app, signing, push entitlements and Android versionCode. No final build was started in this checkpoint.

## Reviewer access and final-device checklist

Use the maintained real review account only; do not publish Founder passwords or create fabricated consent/earnings. Store metadata draft remains docs/mobile-store-submission-draft-20260914.md. Its account credentials, final screenshots, actual privacy/Data Safety declarations and store submission remain separate incomplete gates.

Final pair test instructions:
1. Install the exact Internal TestFlight/Internal Testing pair and record visible build numbers.
2. Sign in to the maintained Business/Scaler test accounts; verify navigation and authorized workspace boundaries without creating work or changing billing.
3. Business Email: verify included access and authoritative connection state; do not reconnect, resend the Google demo or bypass general onboarding restrictions.
4. Social: verify Upcoming Posts, exact immutable scheduled preview, actual status/history and workspace timezone. Do not approve/schedule/publish another post for the test.
5. Scaler Earnings: verify Payouts ready, $0 available, Manage payouts, and no permitted withdrawal without authoritative available earnings.
6. For separately approved controlled push tests, verify permission/registration, foreground/background delivery and exact authorized destination on each real device. Do not infer push delivery from a build or APNs configuration.
7. Capture truthful final-binary store screenshots; keep held marketplace work and gated Gmail onboarding out of availability promises. Complete actual Founder declarations only where required.

Google submission/consent, Stripe onboarding, campaign-map and Admin certification were not rerun. No public release.

## Social readback (not new proof)

Read at 16:14:48 UTC: latest preparation results still from 16:07 UTC, before the fresh-topic deployment. A separate exact recovery read at 16:19:51 UTC found zero Attractive Remodel content-recovery records: allowance not consumed, Instagram remains version 5 / repetition exception; next normal preparation worker is responsible. Facebook stays scheduled September 22 at 19:00 UTC / 3 PM EDT. One current-strategy job, no new confirmed publication.

ScaledCircle's existing replacement source remains generated/prepared, provider generation status review_required. Its preparation entry has no new derivative reviewCandidate yet; previous needs_attention state dates to the pre-generation request. No later failed attempt is evidenced. The normal preparation cursor has not yet returned to that platform, so review/attachment remain legitimately pending. Zero current-strategy scheduled jobs. No duplicate request, approval, worker invocation or polling loop.

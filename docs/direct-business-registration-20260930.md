# Direct Business registration — bounded Hosting release

## Scope and baseline

Approved correction 1 from investigation `8b6bf86890a14041d72b7799e320ed772fa0f5e5`. Isolated branch `codex/first-use-measurement-20260930`. Production baseline was independently read as Hosting `23b9f8dc42266fec`, application `e72b896237a2a3eb34ec15b978ac85db252eb786`; the nine checked served assets, retained package inventory and Hosting configuration matched. No newer Hosting release was found.

Frozen native candidate `d60920930c81253f9019c19bed47a3eaf184dd3e` remains in its separate unchanged worktree. No native reconciliation, build, CI, Functions, IAM, Rules, financial or provider-setting changes are included.

## Old and corrected paths

- Static For Businesses: Get Started → `/#/login` → unnamed registration underneath `/login`.
- Flutter homepage/Business pricing: Business CTA → Business funnel → unnamed registration.
- Corrected Business signup: CTA → `/#/create-account?role=business` → existing registration form, with a named route and reachable Log In/Back.
- Static pricing's four Business signup anchors now use that same named entry. No signup plan preselection existed: membership selection remains in the maintained Billing workflow. No automatic checkout or new plan query contract was introduced.
- Generic role chooser and Scaler entry remain distinct. Named `role=scaler` works without requiring a referral. Valid referral values survive app navigation/login switching and the existing static referral forwarding script.
- Trusted constructor return destinations are carried in typed in-app route arguments when switching registration/login. Arbitrary URL return parameters are not accepted. Existing direct Billing/Email protected routes and their return handling remain unchanged.

Registration resolves the existing Firebase identity once on entry. An existing signed-in visitor uses the maintained StartupSessionGate (verification, consent, profile, role/workspace authority). A confirmed signed-out form remains mounted while Firebase account creation precedes server finalization; it does not navigate away halfway through finalization. Existing AuthService/finalizePublicSignup, consent, referral validation and completion-to-startup behavior are unchanged.

## Privacy and interpretation

No analytics implementation, SDK, event, consent choice, Enhanced Measurement or advertising configuration changed. Existing GA4 route sanitization counts `/create-account`, not its role/referral/return/private values. Opt-out, GPC and DNT remain authoritative. A page view is only entry to a public route, not a successful account, profile, useful action or membership. Controlled browser QA must not be reported as a new customer.

## Validation

- 64 Flutter tests passed: eight actual router/form navigation and narrow/2× keyboard regressions; seven initial-identity/startup-gate cases; startup/referral/public/legal/material regressions; fifteen profile/onboarding tests.
- 77 distinct Node tests passed across the focused runs, including fifteen GA4 tests and fifty-three authority fixtures/emulator tests (fourteen overlap between the two runs, counted once).
- Eleven Python public marketing delivery/metadata tests passed, including exact Business signup anchors and role/referral/login separation.
- Affected analyzer clean. Existing stale printing assertion corrected to approved `Scaled Circle Printing — Coming Soon`; disabled option behavior remains asserted. No test was removed to get a pass.
- The first accidental onboarding-backend invocation without local emulators was rejected by its required localhost guard. The proper demo Auth/Firestore emulator rerun passed all twelve onboarding cases; emulators were shut down and ports independently checked. No production fallback was used.
- No real signup, form submission, checkout, payment, profile save, email or referral reward was performed. Provider calls in authority tests used maintained mocks.
- The two previously skipped campaign browser harnesses remain separately unverified; this release does not certify them or the complete acquisition-to-purchase journey.

## Deployment package

Copy the exact verified retained Hosting package and overlay the compiled production `main.dart.js` and `flutter_bootstrap.js`. Change only two For Businesses and four Pricing signup anchors in the retained HTML. Preserve all other package bytes, historical/versioned assets, metadata, analytics and current run rewrites. Do not regenerate unrelated static pages. Reuse the retained Hosting-only configuration with only its package path changed.

Production build: `flutter build web --release --dart-define=APP_ENV=production --no-pub`. Dependency lock must match the baseline. Hosting deployment/readback and controlled GA4 receipt are recorded below after execution.

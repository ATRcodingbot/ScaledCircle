# ScaledCircle GA4 web integration candidate — September 27, 2026

## Scope and evidence

- Production Firebase web options contain measurement ID `G-9VY50190LG`.
- The live `https://scaledcircle.com/` HTML served on September 27 did not load a Google tag. Its `main.dart.js` included the Firebase measurement ID but no `firebase_analytics` or `gtag` calls. The source `pubspec.yaml` also has no `firebase_analytics` dependency.
- This candidate adds production **website** traffic measurement. It does not activate native Android/iOS Firebase Analytics or change campaign/work/earnings attribution.
- The founder requested basic visitor counts and sources without an analytics prompt. This revision replaces the earlier opt-in notice with background measurement and controls linked from the Privacy Policy. It updates the disclosure to match that behavior.

## Behavior

- The code runs only on `https://scaledcircle.com`. Firebase staging, emulators, alternate hosting domains, and native apps do not send events to this production stream.
- Normal visits show no analytics notice, overlay, or floating button. GA4 uses its normal analytics cookies; this is not anonymous or cookie-free measurement. An ordinary visit does not store a fictional consent choice or send an explicit analytics-consent grant.
- Saved opt-outs, Global Privacy Control, and Do Not Track prevent the Google tag from loading. Browser privacy signals take priority over an earlier enabled preference. The Privacy Policy links to `/analytics-settings.html`, where visitors can disable or enable measurement. The settings page itself never loads Google Analytics.
- Turning analytics off uses Google's documented collection-disable flag and clears first-party GA cookies. Preference changes apply to other open tabs without reloading or interrupting work. Existing opt-outs from the earlier implementation remain valid. Clearing site data removes the saved choice. If preference storage fails, the settings page explains that the choice could not be saved.
- The site queues one manual GA4 `page_view` for initial load and one per distinct public Flutter route. Named public pages retain only bounded `utm_*` values. Authenticated/dynamic routes report the generic `/app`, with no IDs or query strings. The first referrer is reduced to its origin; subsequent referrers use the previously sanitized page location.
- Google signals and advertising personalization are disabled. Ad storage, ad user data, and ad personalization consent states are denied. No session replay, camera, microphone, form-content capture, signup, purchase, email, or precise-location events are added. GA4 also produces standard session/engagement metrics and approximate geographic reporting.
- Website analytics preferences remain separate from account agreements, work-location permissions, and marketing email preferences.

## Release checks

1. In the intended ScaledCircle GA4 web data stream, confirm the Measurement ID is `G-9VY50190LG` and the stream URL is `scaledcircle.com`. Do not use the different Windows Firebase options ID `G-RK6CYZKR39`. The existing web ID is the source-backed candidate; this session has not verified the destination property in the signed-in GA4 account.
2. Turn off **Enhanced Measurement** for that web stream to keep this integration limited to basic traffic. In particular, automatic browser-history page views must be off to prevent duplicate or unsanitized page views; automatic form, search, outbound-click, video, scroll, and download measurement are outside the requested scope. `send_page_view: false` alone does not disable Enhanced Measurement history events.
3. Apply the changes to the latest actual working checkout and compare it with the current deployed Hosting release. The GitHub `real-completion-proof` branch may lag unpushed production work. Do not replace newer production work with an older checkout.
4. Build and preview the web app. Check that the Privacy Policy link opens the settings page and that its controls work. On production, verify one `page_view` request with `tid=G-9VY50190LG` for the initial page and each distinct public route, with no private route IDs or arbitrary query strings in event parameters. Verify no tag or requests for saved opt-outs or browser privacy signals, and no tag on the settings page. Verify revocation and staging isolation.
5. Compare a real production visit against GA4 Realtime/DebugView for the intended property. Ordinary GA4 reports can take longer; traffic from before installation cannot be backfilled by this change.

## Verification in this workspace

- `node --test apps/mobile/test/analytics_web_test.cjs`: covers default background measurement, absence of injected UI, sanitized routes/referrers, persistent opt-out, browser privacy signals, preferences, cross-tab changes, storage failures, and origin isolation.
- JavaScript syntax and whitespace checks are run separately.
- Flutter SDK, Firebase Hosting deployment access, and signed-in GA4 property access are unavailable here. The Flutter build, live network check, and GA4 receipt still need verification from the existing authorized project environment.

This document records the source changes and remaining deployment work, not a completed deployment or GA4 receipt.

# ScaledCircle GA4 web integration candidate — September 27, 2026

## Scope and evidence

- Production Firebase web options contain measurement ID `G-9VY50190LG`.
- The live `https://scaledcircle.com/` HTML served on September 27 did not load a Google tag. Its `main.dart.js` included the Firebase measurement ID but no `firebase_analytics` or `gtag` calls. The source `pubspec.yaml` also has no `firebase_analytics` dependency.
- This candidate adds only production **website** page measurement. It does not activate native Android/iOS Firebase Analytics or change campaign/work/earnings attribution.
- The existing legal audit calls for reassessing disclosure and consent before adding analytics. The change therefore requires a separate opt-in and a privacy text update.

## Behavior

- The code runs only on `https://scaledcircle.com`. Firebase staging, emulators, alternate hosting domains, and native apps do not send events to this production stream.
- Before consent, no Google tag loads. The visitor can allow or decline through a compact, nonmodal notice; the choice persists locally, and the small Analytics settings button lets them change it later. Revocation uses Google's documented collection-disable flag and clears first-party GA cookies without reloading the page or interrupting work. The same behavior applies across tabs.
- After opt-in, the site queues one manual GA4 `page_view` for initial load and one per distinct public Flutter route. Named public pages retain only safe `utm_*` values. Authenticated/dynamic routes report the generic `/app`, with no IDs or query strings. The first referrer is reduced to its origin; subsequent referrers use the previously sanitized page location.
- Ad storage and ad personalization are denied. No signup, purchase, email, location, or other conversion events are sent by this change.

## Release checks

1. In the **intended ScaledCircle GA4 web data stream**, confirm the Measurement ID is exactly `G-9VY50190LG` and the stream URL is `scaledcircle.com`. Do not use the different Windows Firebase options ID `G-RK6CYZKR39`. If the GA4 property in the founder's screenshot uses another web stream, update this candidate to that stream only after confirming ownership and project/environment alignment.
2. In that GA4 stream's Enhanced Measurement settings, turn off **Page changes based on browser history events** before enabling manual route page views, or page views can be duplicated. Review other enhanced events for fit with the opt-in disclosure and data minimization.
3. Keep the optional analytics choice separate from the existing account agreement authority. The new disclosure accompanies the explicit visitor choice; prior account acceptance is not used as analytics consent.
4. Rebase on the latest actual working checkout and compare with the current deployed Hosting release. The GitHub `real-completion-proof` branch may lag unpushed production work.
5. Host a preview of the candidate. In a clean browser, confirm no requests to `googletagmanager.com` or `google-analytics.com` and no `_ga` cookies before consent or after declining. After allowing, confirm a `page_view` request with `tid=G-9VY50190LG` for the initial page and each distinct public route. Check that dynamic routes and query strings do not leak in page parameters. Test revocation and staging isolation.
6. Compare the real production visit against GA4 Realtime/DebugView for the intended property. Ordinary GA4 reports can take longer; historical traffic from before installation cannot be backfilled by this change.

This document records the candidate and its prerequisites, not a completed deployment or GA4 receipt.

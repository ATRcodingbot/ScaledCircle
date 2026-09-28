# Root homepage marketplace update — 2026-09-28

## Scope and baseline

Hosting-only root homepage update. Production baseline: `6c14d4cd968f93cc`; completed Business-page source `4794a062dfce041be02404f23e4480c588b29e23`; implementation starts at its documentation checkpoint `ac8fba29d64337d3c7befbd563a040e32916bfc3`.

Exact Founder hero, cost separation and three workflow cards implemented. Existing Business/Scaler destinations and startup authentication gate are unchanged. Root-only workflow copy leaves the separate How It Works route unchanged. Approved wordmarks, links, layout, price definitions and policies are preserved.

## Map provenance and disposition

The exact former homepage map is `AuthenticProductMap`, with a 13-vertex Baltimore boundary centered around 39.295, -76.688 and legacy plan `smart-zone_d6c32ad2cde31cdf49808f31`. This is not Corkran/Glen Burnie. The retained record in `docs/real-world-map-visual-integrity.md` describes SmartZonePlanningV3, 408,585 square metres of geometry, requested five hours, 45 properties/hour, 225 estimated homes and 300 minutes. It contains no mapped-feature inventory or street-distance evidence substantiating those counts/time for this boundary. Geometry validation alone does not substantiate delivery targets or workload.

The homepage now uses this boundary only as an explicitly illustrative Baltimore map. No property count, duration, worker marker, route line or recommendation claim. Its caption and semantic image description remove the former validated/225/five-hour claims. New framing keeps the complete boundary visible; original polygon and other shared map modes remain unchanged. The OSM basemap and visible copyright link are retained. No new image download, synthetic product screenshot, campaign record, evidence search or paid provider was used. Separate Business/Scaler funnel previews were not rewritten in this root-only task.

## Validation

- 40 focused Flutter tests passed: public homepage/funnels, credit behavior, startup and existing role/workspace resolution. Includes 320px/2x text and semantic absence of unsupported map claims.
- Affected analyzer: clean.
- 10 marketing-delivery/metadata tests passed; 9 analytics/privacy tests passed.
- Local production Flutter web build passed with `--release --dart-define=APP_ENV=production --no-pub`; maintained lock unchanged; 322 compiled inputs verified.
- Two stale startup-copy assertions were aligned with the already-deployed Scaled Circle spelling. The unrelated legacy whole-repository map-inventory test was initially attempted and failed against the pre-existing campaign map export screen; left unchanged and excluded from this bounded suite. All actual credit interaction/safe-area cases ran.
- Local real-browser desktop 1440x1000 and narrow 390x844 renders inspected. No horizontal clipping; hero CTAs/cost disclosure, complete illustrative boundary, visible credit and exact workflow cards checked. These are browser checks, not physical-device evidence.
- Actual signed-out local production-build clicks: Get Started for Business -> existing `/#/businesses` funnel -> Create Business Account form; Join as a Scaler -> existing `/#/scalers` funnel -> Create Scaler Account form. No fields entered, terms accepted or account created.
- Existing authenticated Business/Scaler/Admin startup decisions remain covered by maintained tests. Live readback is recorded after deployment below.

## Package preservation

The 80-file package overlays only `index.html`, `main.dart.js`, and `flutter_bootstrap.js` on the current Hosting files. All five static public pages (including `/businesses/` and pricing), analytics, historical assets, approved wordmarks, and social preview remain byte-for-byte unchanged. Unused raw Business template output from the local build is not included. Main bundle increase: 834 bytes; no new raster assets. Hosting configuration is unchanged apart from its local package path. No Functions, IAM, native worktree, CI, store, records, messages or financial changes.

Local proofs: `qa-artifacts/homepage-marketplace-20260928/local-desktop.png`, `local-narrow-hero.png`, `local-narrow-map.png`.

## Production release/readback

- Deployed application source: `e11c3bbade232a2979b7a0a7ff2512415bf84429`.
- Hosting version: `ff3cbe19f89af672`, released 2026-09-28 14:22:17 UTC. Hosting only; original rewrites/headers preserved.
- Firebase uploaded the 78 deployable files in the 80-file local inventory (normal ignored build files excluded). Only the three listed served files differ from the preceding release.
- Eleven live HTTP downloads matched SHA-256 exactly: index, main bundle, bootstrap, analytics, all five public static pages, versioned social preview and approved dark wordmark.
- Final main bundle: 6682020 bytes, +834 bytes (~0.013%). No new raster assets or tracking code.
- Existing authenticated Attractive Remodel session: production `/` resolved to Business Home. No logout or local-data clearing. Authenticated Scaler/Admin routing was covered by tests, not live sessions.
- The deployed public homepage was inspected through the maintained `/#/i` public route so the authenticated session could stay intact. It uses the same `PublicLandingScreen` as the signed-out root.
- Live keyboard traversal: Business CTA -> Tab -> Scaler CTA; Enter opened `/#/scalers`. No account creation or form submission.
- Live Business CTA opened the maintained `/#/businesses` destination. Both live CTA destinations are confirmed; role-specific signup form checks were local production-build checks, not live account creations.
- The visible live copyright link opened `https://www.openstreetmap.org/copyright`; licence page read back successfully. Temporary licence tabs were closed.
- Production desktop and narrow proofs: `qa-artifacts/homepage-marketplace-20260928/live-desktop.png`, `live-narrow-hero.png`, `live-narrow-map.png`. Public-only content, no customer record screenshots.
- Existing own-team, onboarding/profile/21061, campaign, mapping/freehand and financial implementation was preserved by the minimal source delta and unchanged server deployment. Those workflows were not re-exercised or modified for homepage QA. No claim that pending own-team physical acceptance has been completed.

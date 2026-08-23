# P1 — Flutter Web Deployment and Cache Recovery

Recorded: 2026-08-23

Priority: P1 launch quality. This is not a current P0 production-bundle defect and is not part of the P0 Batch 1 implementation scope.

## Finding

A browser that consumed a broken intermediate Flutter Hosting release continued returning stale `index.html` content for `/assets/FontManifest.json` after the corrected release was live. That caused Flutter startup to fail while independently fetched production assets and Firefox loaded correctly.

The affected Codex automation browser does not expose supported site-data or service-worker deletion controls. A newly created automation context still reproduced the retained response, so final production actor QA is being completed manually in Firefox rather than by changing or redeploying healthy production code.

## Current origin evidence

On 2026-08-23, read-only HTTP checks of both the custom domain and Firebase Hosting origin returned HTTP 200, `Content-Type: application/json`, the same 208-byte JSON body, the same ETag, and the same `Last-Modified` timestamp. A cache-busted custom-domain request returned the same valid JSON.

## Required pre-launch audit

- Flutter service-worker update and activation strategy
- cache/version naming and asset invalidation
- Firebase Hosting `Cache-Control` policy for the app shell, service worker, manifests, and hashed assets
- atomic release, rapid replacement, and rollback procedure
- recovery behavior after a partial or broken intermediate release
- automatic recovery without asking customers to clear cookies or browser storage
- cross-browser tests covering an installed old service worker followed by a corrected deployment

## Acceptance criteria

1. A browser controlled by the preceding release discovers and activates the corrected release predictably.
2. App-shell HTML is never treated as a valid response for JSON/font/asset paths.
3. Rapid release replacement and rollback do not strand a client on a mixed asset graph.
4. Recovery succeeds through normal reload/revisit behavior without manual storage deletion.
5. The release runbook documents cache headers, service-worker behavior, verification, rollback, and customer-safe recovery.

## Current release decision

Track this finding as P1. Do not redeploy P0 Batch 1 solely to repair an isolated retained automation-browser cache. Manual Firefox actor QA remains required before marking P0 Batch 1 production verified.

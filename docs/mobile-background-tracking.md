# Mobile background tracking

## Architecture and trust boundary

Scaled Circle remains one Flutter application for web, Android, and iOS. Business, admin, public, authentication, campaign, and completion flows stay in Dart. Active Scaler jobs add a small first-party native bridge built on official platform APIs:

- Android: `FusedLocationProviderClient` in a non-exported location foreground service.
- iOS: `CLLocationManager` with the location background mode.
- Web: the existing foreground-only route workflow; it is not represented as background-capable.

The client records raw measurements and queues them durably. Cloud Functions are authoritative for identity, assignment, session state, ordering, validation flags, aggregate counters, final route creation, and workflow fields. Client values named `accepted`, `rejected`, `suspicious`, or similar are rejected as unknown fields and are never trusted.

## Privacy lifecycle

Tracking starts only after the Scaler presses **Start Job**, reads the active-job disclosure, grants location access, and confirms. Login, app launch, screen load, push messages, background startup, and server notifications cannot start tracking. The server derives identity from Firebase Auth and verifies the active zone assignment.

Tracking stops locally before completion/cancellation network work. It also stops when explicit stop is confirmed or reconciliation finds the authoritative session `finalizing`, `completed`, `cancelled`, missing, or unauthorized. A connectivity failure does not stop a legitimate offline active job. No passive between-job or all-day tracking exists.

## Authoritative state machine

`active -> finalizing -> completed`

`active -> cancelled`

- **active** accepts a valid next chunk or checkpoint.
- **finalizing** accepts neither and cannot be cancelled. Finalization may be retried idempotently.
- **completed** and **cancelled** are immutable terminal states.
- Complete and cancel read the session inside the transaction that changes it, so neither can overwrite the other.
- A second complete/cancel returns the existing terminal result. Late chunks/checkpoints fail after finalization begins.

`activeTrackingSessions/{scalerId}` is a trusted singleton pointer. Starting the same assigned active job returns the existing session. A stale pointer is verified and replaced transactionally. Concurrent starts cannot create two active sessions.

## Chunk sequence protocol

Each session begins with `nextExpectedSequence = 1`. A chunk contains 1-100 points with unique, contiguous positive integer sequences. Its first sequence must equal the session's authoritative next expected sequence. Gaps, overlaps, backward ranges, duplicate sequences, and conflicting retries are rejected.

The server derives the document ID as `seq_<start>_<end>` and calculates a SHA-256 digest of the strict raw payload. Retrying an accepted range with the same digest is harmless. Reusing that range with different evidence fails. `pointCount`, `chunkCount`, `lastUploadedSequence`, and `nextExpectedSequence` advance in the same transaction as chunk creation.

Finalization reads ordered, bounded chunks and independently verifies IDs, ranges, counts, sequence continuity, and digests. It fails closed on conflicting evidence; it never collapses duplicate sequences through a map.

## Resource ceilings

The server enforces:

- 100 points per chunk.
- 21,600 points per session.
- 432 chunks per session.
- 250 checkpoints per session.
- 24 hours maximum active duration.
- 192 KiB application payload per chunk request.
- 16 KiB checkpoint-registration payload.
- 10 MiB per checkpoint image.
- Sequence values no greater than 1,000,000.

At one useful sample every 15-20 seconds, 21,600 points covers 90-120 hours, well beyond an all-day field job while still bounding Firestore reads and function memory. Compatibility `campaignRoutes` are downsampled to at most 3,000 accepted points; full evidence remains in bounded chunk documents.

Tracking callables are 2nd-generation functions with explicit 512 MiB memory, 120-second timeout, 20 max instances, and concurrency 40. Unexpected exceptions are logged server-side and returned as generic controlled errors.

## Server-side GPS validation

The strict point schema accepts only latitude, longitude, timestamp, horizontal accuracy, optional speed/heading, and sequence. The server checks finite values and bounds:

- latitude `[-90, 90]`; longitude `[-180, 180]`.
- accuracy finite and non-negative; samples over 100 m are retained but server-rejected.
- speed finite and non-negative when present.
- heading finite in `[0, 360)` when present.
- sequence positive, safe, bounded, unique, and contiguous.
- timestamp parseable, no more than 2 minutes ahead of receipt, and no more than 5 minutes before session start.

Adjacent measurements are compared with Haversine distance and elapsed time. Movement over 15 m/s is retained with server-calculated `impossible_speed`/`impossible_jump` evidence flags and excluded from compatibility coverage. Suspicious syntactically valid measurements remain in raw evidence.

## Firebase schema and permissions

- `trackingSessions/{sessionId}`: trusted owner/job IDs, state, server times, counters, sequence pointer, sync metadata.
- `trackingSessions/{sessionId}/chunks/{canonicalRange}`: immutable raw evidence plus server validation metadata/digest.
- `trackingSessions/{sessionId}/checkpoints/{checkpointId}`: immutable Storage path/generation, image metadata, raw measurement, server flags, and server `receivedAt`.
- `activeTrackingSessions/{scalerId}`: server-only singleton pointer.
- `campaignRoutes/{sessionId}`: trusted immutable `native_background_v1` compatibility record. Legacy browser/simulation routes use the trusted `saveLegacyTrackingRoute` callable and `legacy_browser_v1`; clients cannot self-declare a source.

Clients cannot write tracking evidence, active pointers, or any campaign route. The owning Scaler, owning campaign business, and trusted admin can read only the evidence allowed by rules; other Scalers/businesses cannot. Businesses cannot alter raw evidence.

`campaignZones` client updates are allowlisted to unassigned draft geometry/configuration fields for the owning business. Assignment, Scaler identity, status, active session, GPS metadata, route IDs/counts, completion, verification, payment, payout, earnings, and settlement fields are server controlled.

## Checkpoint photos

Checkpoint objects use `tracking_checkpoints/{uid}/{sessionId}/{objectId}`. Storage rules require the authenticated owner, matching active session, an allowed private image (`jpeg`, `png`, `webp`, `heic`, or `heif`), and a size from 1 byte through 10 MiB. Objects are immutable and are not public.

Registration accepts a Storage path rather than a download URL. The callable verifies session ownership/state and the actual bucket object's path, existence, generation, content type, and size before creating a checkpoint in a transaction. Measurement time must fit the active session bounds; a receipt delta over ten minutes is retained with a server `stale_checkpoint_time` flag. `receivedAt` is server time.

## Offline persistence, retention, and reconciliation

Android stores JSONL evidence and session metadata only in app-private internal storage. Backup/data-extraction rules exclude the route journal and tracking preferences from cloud backup and device transfer. iOS stores the journal in Application Support with `completeFileProtectionUntilFirstUserAuthentication` and excludes it from backups.

The acknowledgement cursor advances only after an idempotent server response. Unsynchronized evidence is never deleted. After authoritative completion/cancellation and confirmed synchronization, the coordinator asks the native store to purge acknowledged evidence for that same session. OS app-private/file protection is adequate for this phase; no additional encryption dependency was added.

On resume and before normal online sync, the coordinator queries the authoritative session. Active continues; finalizing/completed/cancelled/not-found/unauthorized stops native collection immediately. Network/unavailable errors preserve offline collection and retry reconciliation when connectivity returns.

## Battery strategy

Android requests high-accuracy movement samples around every 20 seconds, no faster than 12 seconds, after about 12 meters, with OS batching up to 60 seconds. iOS uses fitness activity, best accuracy, a 12-meter distance filter, deferred updates where supported, automatic pausing, and background updates. Checkpoint and final capture request a fresh accurate point. Neither platform polls once per second.

## Platform configuration

Android declares fine/coarse location, location foreground service, and notifications. It intentionally does not request `ACCESS_BACKGROUND_LOCATION`: the session starts from a visible Activity and continues through a foreground service with a persistent notification.

iOS includes location usage text and `UIBackgroundModes/location`, but this repository is being developed on Windows. macOS, Xcode capability/signing, Apple build, and physical iPhone behavior are **MANUAL / NOT YET VERIFIED**. The production identifier `com.scaledcircle.app` was not applied; existing package/bundle identifiers and Firebase app registrations are unchanged.

## App Check future rollout (not enabled)

No tracking callable enforces App Check in this remediation. A later controlled rollout should register and observe clients first, use debug tokens only for development, then monitor metrics before enforcement. Intended providers are Play Integrity (Android), App Attest with DeviceCheck fallback (iOS), and a Firebase-supported reCAPTCHA provider (web). Enforce one callable/client cohort at a time so the current web app is not interrupted.

## Build commands

From `apps/mobile` on Windows:

```powershell
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
flutter build apk --release
flutter build web --release
```

An iOS release requires macOS/Xcode and remains manual. Do not ship Android until the permanent ID, matching Firebase app, release signing, production notification icon, disclosures, and physical-device checklist are complete.

See `MANUAL_DEVICE_TESTING.md` for the physical-device release gate.

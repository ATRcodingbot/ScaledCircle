# Physical device background-tracking release checklist

Record device model, OS version, app build, account, campaign, start/end time, and result for every run. Do not approve production based only on emulators.

## Android

- [ ] Fresh install: deny location; Start Job explains the problem and does not crash or create active tracking.
- [ ] Grant approximate-only location; verify the app handles insufficient accuracy clearly.
- [ ] Grant required permissions; Start Job creates exactly one session and a persistent notification.
- [ ] Tap Start twice; verify no second server/native session exists.
- [ ] Start the same job after a UI/process reload; verify the existing server session is recovered.
- [ ] Attempt to start a different job while one session is active; verify it is rejected.
- [ ] Walk at least 30 minutes with screen on, then 60+ minutes locked; verify route continuity.
- [ ] Switch among camera, phone, browser, and another app; verify notification and tracking continue.
- [ ] Force ordinary process reclamation (not Force Stop); reopen and verify active state and queue recover.
- [ ] Test airplane mode for at least 15 minutes; verify points queue locally, then upload once after reconnect.
- [ ] While offline, have an admin/test harness terminate the server session; reconnect and verify native GPS stops before further sync.
- [ ] Verify uploaded chunk IDs and sequences are not duplicated.
- [ ] Disable Location Services mid-job; verify visible degraded state, retained session, and recovery.
- [ ] Test low battery/battery saver and common OEM battery restrictions.
- [ ] Add a checkpoint; verify camera photo, time, and nearby coordinate are associated.
- [ ] Complete Job; verify final fix, queue flush, notification removal, native service stop, and no later points.
- [ ] Cancel Job; verify immediate notification/service removal and no later points.
- [ ] Race Complete against Cancel and a final chunk/checkpoint in staging; verify exactly one terminal state and no late evidence.
- [ ] After successful completion, verify acknowledged local evidence is purged; unsynchronized evidence must remain during failures.
- [ ] Reboot during an active test session; document actual behavior and product decision.
- [ ] Force Stop from Settings; confirm Android stops collection and document that OS-enforced behavior.

## iPhone

All iPhone items are **MANUAL / NOT YET VERIFIED** because development is on Windows without macOS, Xcode, signing, or a physical-iPhone build.

- [ ] Repeat permission denial, start-once, screen-lock, app-switch, offline, reconnect, checkpoint, completion, and cancel cases on a physical iPhone.
- [ ] Confirm the blue background-location indicator appears only during an active job.
- [ ] Walk for multiple hours with the screen locked and inspect gaps, accuracy, and battery usage.
- [ ] Terminate/relaunch normally and verify durable active state and queued evidence recovery.
- [ ] Test Low Power Mode and poor-GPS urban conditions.
- [ ] Confirm completion/cancel stops the iOS location indicator and produces no later points.

## Firebase and privacy

- [ ] A different Scaler cannot read or write the session, chunks, or checkpoints.
- [ ] The assigned Scaler can read but cannot client-edit server evidence.
- [ ] The campaign business can review but cannot modify evidence.
- [ ] Admin/server verification can read evidence.
- [ ] No session starts before explicit Start Job consent.
- [ ] No location is collected after completion, cancellation, or explicit stop.
- [ ] Review privacy policy, retention, support deletion, App Store disclosure, Play Data Safety, and checkpoint-photo handling.
- [ ] Verify checkpoint Storage objects are private, immutable, image-only, at most 10 MiB, and owned by the active session.
- [ ] Verify native and trusted legacy `campaignRoutes` cannot be created, changed, or deleted directly by clients.
- [ ] Verify protected `campaignZones` assignment, GPS, completion, verification, and payment fields reject direct client updates.
- [ ] Confirm App Check remains unenforced until every web/Android/iOS client is registered and monitored.

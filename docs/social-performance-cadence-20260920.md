# Performance-driven Social cadence — September 20, 2026

Implementation source: `4fdca314f511d474b8cc7e143dd30fb10f313689`.

Founder superseded the proposed 3–7 range and one-post adjustment cap. The maintained owner settings now propose five posts/week per authorized channel and offer fixed or adaptive mode. Existing explicit preferences are unchanged until reviewed by their owner. Cadence-only changes preserve the original strategy policy ID, expiry, and immutable scheduled/publication records. ScaledCircle requires its own authorization; Attractive Remodel authority is not inherited.

Adaptive evaluation runs inside the existing recurring preparation worker, independently per Business/platform, with a weekly evaluation and audit record. It compares same-format, equal-age organic post evidence across two 28-day windows, holds with insufficient evidence, and uses a damped proportional change when supported. No seven-post ceiling or one-post adjustment cap remains. Existing six-hour anti-burst spacing, approved strategy expiry, generation allowance, resource/query limits, quality, repetition, pause and provider safeguards remain. Higher cadence does not authorize additional spending. Existing scheduled posts count toward capacity.

## Evidence limitations

Current maintained Meta observations do not establish organic/promotion status. Facebook post measurements do not supply the evaluator's reach metric; current observations also lack the link-response evidence needed for an increase. These are unknowns, not zero performance. Consequently current real evidence requires HOLD. Synthetic regression fixtures prove adjustment mechanics, not real production performance improvement. The weekly worker does not invent metrics or extend the strategy's authorization term. An expiring policy needs maintained owner renewal before later learning/publication continues.

## Focused validation

47 focused backend/emulator tests passed, zero failures/skips. Final affected settings/cadence suite: 14 passed. Three Flutter widget tests passed, including narrow large-text confirmation and target 14 (no seven-post UI limit). Affected widgets analyze cleanly; production web build succeeds. No new full regression or native build is claimed.

Evidence retained in `.firebase/launch-close-20260919/cadence-*`. Private database/Function snapshots remain outside Git and are not public artifacts.

## Native impact

Android 1.0.0 (26) from `587737b200d5dad36e23cfde66b02c15f6010b47` remains an existing Internal Testing candidate. It does not contain the new shared Flutter cadence controls. A refreshed matched pair must use the eventual final freeze; these changes are not represented as part of the older candidate.

## Production deployment readback

Observed 2026-09-20T10:31:23.600Z; Hosting sites/scaled-circle/versions/f5035bd587212520; served main.dart.js SHA-256 08cdd5b823911bee38cea4d7a14bfba835bce81a44230b65d749c7cb23794b37.
246 unrelated Functions unchanged. Application environment and secret bindings unchanged. Rules unchanged: projects/scaled-circle/rulesets/eabb947e-4e2b-41ca-a4e2-ef993e4dd3e8.
Generated FUNCTION_SIGNATURE_TYPE metadata was added as http on runManagedSocialPreparationV1 and omitted on prepareCustomerSocialPostV1; no application flag changed.

- previewCustomerSocialPostV1: `previewcustomersocialpostv1-00026-joc`
- prepareCustomerSocialPostV1: `preparecustomersocialpostv1-00023-pob`
- runCustomerMetaPublisherV1: `runcustomermetapublisherv1-00013-qur`
- prepareCustomerSocialPlanV1: `preparecustomersocialplanv1-00006-kiq`
- runManagedSocialPreparationV1: `runmanagedsocialpreparationv1-00005-fey`
- approveAndScheduleCustomerSocialPostV1: `approveandschedulecustomersocialpostv1-00022-yoz`
- getSocialOperationsWorkspace: `getsocialoperationsworkspace-00032-niv`
- manageAutomaticSocialPublishingV1: `manageautomaticsocialpublishingv1-00002-cew`
## Bounded expiry follow-up

Rendered owner verification found that the cadence preview proposed a fresh 30-day expiry even though the mutation correctly preserves the existing end. The change was left unsaved. Source `cbb30df81803d8b81046d86a702cb9d83c563b39` repairs the reviewed scope to preserve the current matching strategy expiry and returns a server-formatted end time in the reviewed timezone. It removes device-local expiry formatting. A next-day regression proves the preview does not silently extend authorization. Fourteen affected backend tests and three Flutter tests passed; analyzer clean and production web rebuilt.

Only manageAutomaticSocialPublishingV1 and Hosting were redeployed for this correction. Final settings revision: `manageautomaticsocialpublishingv1-00003-jov`. Final Hosting: `sites/scaled-circle/versions/987d6f66f402e6f8`. Served main SHA-256: `1fdff48b5df9be5b9dce9ed993b716676366fb466a2d7a4b7a477071962f85ec`. All other listed revisions remain as above; application environment, secrets, 246 unrelated Functions and Rules preserved.

## Owner-authorized production preference readback

Attractive Remodel changed from 2 to 5 per authorized platform in adaptive mode through the maintained owner UI at 2026-09-20T10:37:19.640Z. Audit: 9LGcprpR4Sad4Op4aieZ; actor is the workspace owner. Original policy ID/start/end/status/strategy preserved; end 2026-10-19T00:00:00.000Z. Reviewed timezone UTC (no saved Business timezone was available; no Eastern timezone was inferred).

All 16 existing jobs retain their schedule, immutable binding and approval: 10 scheduled, 4 published, 2 authority-review exceptions. No current-strategy job/publication is claimed. Next eligible calculated slots at readback: Facebook 2026-09-20T12:00:00.000Z; Instagram 2026-09-20T12:00:00.000Z (8 AM Eastern September 20). These are openings, not reservations or publication promises. Only the recurring worker may consume them after all checks. First evaluation 2026-09-27T10:37:19.640Z; insufficient current metrics require HOLD.

ScaledCircle still has no strategy authorization. Its separate owner review/authorization is outstanding. Other customer policies were not changed. No manual worker invocation, scheduling, publication, generation run, spend increase or financial action occurred. Existing daily research verifier remains unchanged.

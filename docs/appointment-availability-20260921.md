# Appointment availability repair — 2026-09-21

Founder requested optional staff and a real, independently saved availability form.

## Reproduced cause
Production owner UI save failed at 08:46:42.729796Z (HTTP 400, businessoperationsv1-00004-duv). The old Flutter save omitted the outer requestId required by the maintained Schedule mutation. The server rejected it before staff validation. A separate validator also required a nonempty staff list. No second failure is inferred from a warning remaining after selecting Gregory.

## Bounded repair
- Every save includes a secure request ID, reused for an unchanged retry. Saving disables edits and duplicate submits. Success requires the authoritative settings/version/business response.
- Latest Schedule availability is loaded on open. Empty assignment is the existing explicit [] representation, displayed as Assign later. Location-required is a future booking requirement only.
- Schedule-edit permission governs settings; changing staff additionally requires assignment permission and valid current workspace people. Versions prevent stale overwrites.
- Parent summary updates from server state, including staff and location requirement. Errors remain actionable and clear on edits; entries survive failures. Dialog controller lifetime includes its closing transition.
- Unassigned Email offers remain tentative. Confirmation requires actual assignment and existing hours/buffer/availability/conflict/acceptance checks. No fictitious capacity resource or owner fallback.
- Email opt-in, consent, model review, shared operating grant and sending gates are unchanged. Existing prepared owner preferences are not rewritten.

## Validation / release
Focused tests: 8 Schedule emulator tests, 7 policy tests, 7 Flutter tests. Includes missing request envelope, optional/selected staff, location on/off, idempotency, versions, unauthorized member, workspace isolation, parent authoritative summary, retained edits and conflict-safe confirmation. Focused Flutter analyze clean.
Application source: `139dcf1835c2cfe224b703e248225f03bd193617`, pushed. Production deployment/readback completed. Deployment scope: businessOperationsV1, businessEmailOperationsV1, syncBusinessEmailRepliesV1 and Hosting only. No native rebuild. Shared Flutter delta belongs in the next matched pair; old installed binaries do not contain this repair.


## Production evidence
- `businessOperationsV1`: `businessoperationsv1-00005-tag`, updated 2026-09-21 09:00:54 UTC.
- `businessEmailOperationsV1`: `businessemailoperationsv1-00014-peb`, updated 09:02:03 UTC.
- `syncBusinessEmailRepliesV1`: `syncbusinessemailrepliesv1-00007-lom`, updated 09:03:14 UTC.
- Hosting version `96f541dd8a81938b`, release `1789981348110000`, 09:02:28.110 UTC.
- Function inventory comparison: exactly those three changed; runtime identities, environment, secret bindings and Firestore Rules unchanged.
- AR production owner form saved availability version 1 through the maintained callable at 09:04:14.325 UTC: America/New_York, Mon–Fri, 540–1020 local minutes, duration 15, buffers 5, assignedPeople [], locationRequired true. The displayed location switch was on; no address was requested or fabricated.
- Parent renders Staff: Assign later / Location required: Yes and saved hours. Reopening and a full page refresh both retain that same authoritative record. No real appointment or Email was created for validation.
- Latest AR Email preferences remain prepared, not active. The visible owner session separately saved prepared preferences at 09:04:28.435 UTC; this repair did not submit the Email preference/authorization action or revert that save.
- Both mailbox documents retain their pre-repair update times (AR September 13; ScaledCircle September 12), connection generations and permissions. Shared grant and both pilot invitations retain September 20 update times; startsAt/expiresAt null, usage absent, model-data review absent.
- Initial whole-document hash comparison was invalid because Firestore JSON map key order is unstable. Do not interpret it as evidence of mailbox/grant mutation. Corrected helper sorts keys; immutable update times and explicit field readbacks establish preservation.
- Private evidence: `.firebase/launch-close-20260919/availability-repair-final-readback.json`, `availability-hosting-read.json`, `availability-failure-requests.json`. No private credentials are included in this handoff.

Founder retest: Business Email → Email assistance settings → D. Appointment availability → Set appointment availability → leave staff unselected → Save availability → saved summary → reopen. This saves availability only; no pilot activation, send, or booking.

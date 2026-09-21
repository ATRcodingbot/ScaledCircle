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
Production deploy/readback pending; record actual revisions after completion. Deployment scope: businessOperationsV1, businessEmailOperationsV1, syncBusinessEmailRepliesV1 and Hosting only. No native rebuild. Shared Flutter delta belongs in the next matched pair; old installed binaries do not contain this repair.

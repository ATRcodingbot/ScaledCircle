# Social state consistency — 2026-09-19

Read-model and presentation repair only. No strategy, job, approval, scheduler, provider credential, media bytes or publication authority is migrated.

- Saved tenant-scoped execution records feed one bounded lifecycle projection for Calendar, Upcoming Posts, history and summary/Content Health counts. Immutable job copy is retained for historical executions; older jobs are not rebound to the current editable revision.
- Durable publication receipts take precedence over stale job labels. Current preview provider-step readback distinguishes publishing and reconciliation-required attempts from scheduled jobs. Canceled work is not scheduled work.
- Routine authorized preparation is not a Needs Attention exception. Explicit failures remain visible. Missing execution readback stays unavailable.
- Internal experiment terminology is replaced only in customer presentation; stored strategy and audit history remain unchanged.
- Creative ownership is not evidence of a real photo. Generated/graphic/unknown assets use truthful labels.
- Server-rendered dates use saved workspace/cycle IANA timezone and DST. If absent, UTC is shown explicitly rather than inferring geography or using device timezone. Schedule mutation/time-selection authority is unchanged.
- Preview state is prominent. Autonomous-strategy explanatory copy replaces obsolete per-post review wording.

Focused evidence: lifecycle/runtime/scheduling/authority unit tests; local-emulator concurrent approval and editing tests; Flutter queue, preview, plan, runtime and shared-count tests including narrow/large-text layouts. No real post is approved, edited, scheduled or published for verification.

Deployment scope: getSocialOperationsWorkspace, previewCustomerSocialPostV1, and production Hosting. Existing native binaries require the next presentation build to display new Dart UI; the API projection is shared by web/mobile.

# Campaign-list lifecycle — review candidate

Prepared in `codex/maryland-web-operations`, on top of `abb1822cf408c54f50fef408c84d163a07ab1694`.
No deployment or production campaign mutation. The real “YouTube Test” and “Test” drafts were not touched.

## User flow and reused authority

Business → Campaigns → **Campaign actions** on a card. The card still opens the campaign; its overflow opens a separate accessible action dialog. Territory selection and wizard completion are not prerequisites.

The existing `businessOperationsV1` callable now accepts `campaignListActions` (current eligibility) and `changeCampaignListState` (confirmed mutation). These use the maintained Business workspace authority, `campaigns` permission, transaction model, request receipts and workspace activity log. Admin identity alone does not become normal Business authority. Existing obligations can be managed without buying another membership.

The existing `deleteDraftCampaign` callable delegates to the same authority for older clients. Legacy unused direct-write archive/restore helpers now reject bypass calls and direct the caller to the reviewed list flow. No provider API is called by any list action.

| Current state | Action | Server conditions / effect |
| --- | --- | --- |
| Draft, including no territory | Delete draft | No payment/checkout history, funding, accepted assignment or recorded work/obligation. Removes it from working lists; retains its record and linked history. |
| Open/funded/published/active/available, or own-team scheduled | Close campaign | Every Zone, exact location, application, contract, internal-team item and work inventory must be free of assigned/accepted/started/submitted/unresolved work. Financial records remain unchanged. |
| Assigned/accepted/in-progress or otherwise unresolved | Manage work | No ordinary delete, close or archive. Existing assignment, cancellation/support and funding paths remain accessible. |
| Completed | Archive | Sets workspace-wide archive metadata; leaves completed status and outstanding obligations intact. |
| Archived completed/canceled | Restore to list | Removes archive visibility markers; does not reopen work. |
| Historical `status: archived` with unknown original status | Support review | No guessed restoration to draft/open. |

## Deletion and history

Deletion is logical removal, following the maintained retained-record removal pattern. It writes `status: deleted`, `deletedAt`, `deletedBy`, `hiddenFromBusinessHistory`, and a closed-work latch. The audit records the previous state and actor. There is no cascade delete of Zones, locations, assets, contracts, consent, routes, tracking, financial records or shared files.

Any payment operation history, including uncertain/failed attempts, blocks ordinary draft deletion until its maintained reconciliation/support path resolves the case. This feature neither expires checkout sessions nor assumes a failed response proves that money cannot settle. A stale Draft label cannot override these checks.

## Closure and concurrency

One Firestore transaction reauthorizes the actor and reads the parent plus:

- All campaign Zones and exact locations, pending/accepted applications and assigned-Scaler subcollection.
- Business Operations campaign items, direct schedule binding and actual `assignedPeople` state.
- Assignment compensation contracts, completions, tracking, group assignments, participants, handoffs, job rooms, settlements, earnings and payouts.
- Campaign payments, financial operations, wallet transactions and transfers; direct funding binding.

Each inventory is bounded at 250 records. Missing/mismatched bindings or a larger inventory fail closed to support review rather than claiming absence of obligations. Unknown application states are not treated as unaccepted.

Closure atomically writes `status: closed`, `closedFromStatus`, `workEntryClosed`, `acceptingApplications: false` and `marketplaceVisible: false`, plus audit/receipt. The unassigned own-team Schedule projection is marked canceled, preserving its identity and history.

Application, exact-location assignment, Zone assignment, group slot acceptance, tracking/work start and completion initialization read the same campaign inside their transactions. New work rejects the closure latch or terminal state. Therefore a closure commit conflicts with an assignment transaction reading that parent; either assignment becomes visible and closure is refused, or closure wins and assignment is refused. Both cannot commit successfully.

The server returns an eligibility version derived from update timestamps of the parent and inspected records. Confirmation rechecks it; stale dialog data cannot authorize an action. Actor-scoped stable request IDs use the existing `businessOperations/{businessId}/requests` collection. Lost responses/repeated clicks return the same receipt and create one audit effect. The client reports success only for `confirmed: true` and ignores late responses after an account/workspace/authority change. Equivalent periodic permission refreshes retain the dialog.

## Financial preservation

Close means closed to new work, not financially settled. No charge, reserve release, refund, transfer, payout or compensation change is made.

The confirmation explains that existing payment/refund/balance obligations remain and no refund is requested by closing. The list still displays funding state, including pending/review states. Existing funding/cancellation review remains reachable; the closed campaign retains its pre-close status solely for the existing refund-policy check, with every original blocker still applied.

Provider reconciliation keeps updating payment/refund/dispute fields. It cannot reopen a list-closed campaign or replace an archived completed work status. Archive does not alter reconciliation records, settlement authority, operational alert scheduling or access permissions. Archived campaigns remain available through the filter and their normal detail/funding paths.

## Visibility and rules

Current/Archived filtering is per workspace. Live server snapshots remove a successfully deleted/archived card from the current view and restore it after an authorized restore. Back/remount retains the filter via PageStorage; a fresh browser session defaults to Current and reloads authoritative records. Empty lists retain their filter controls.

Production, staging and maintained default rule files add lifecycle markers to the existing server-owned field validator. Direct clients cannot forge archive, closure or deletion markers or reopen closed/deleted campaigns. These are prototype rule amendments for review before deployment; the rule emulator suites pass for all three files. No read permission is broadened.

## Verification

All destructive and financial cases use synthetic fixtures with demo Firestore/Auth emulators. No live transaction, real record deletion/closure/archive, email, notification or provider search was performed.

| Suite | Result |
| --- | --- |
| Lifecycle backend + work-entry + rules + campaign-planner emulator suites | 75 passed |
| Lifecycle policy + execution authority + funding hardening + prepared payment runtime | 58 passed |
| List actions + cancel/refund UX + navigation + compensation cards + refresh workflows | 36 passed |
| Affected Dart analyzer (6 files) | Clean |
| Local production-config Flutter web release build | Passed (`--release --dart-define=APP_ENV=production --no-pub`) |

Specific evidence includes five concurrent races through the actual exact-location assignment handler, both sequential race outcomes, multi-Zone/internal-team blockers, cross-workspace/disabled/Admin/permission-revocation denial, duplicate receipt recovery, stale name/Zone versions, an isolated checkout-parent-lock race, and actual extracted provider transition code executed against the emulator. The checkout race is synthetic and is not a live Stripe test.

Client tests exercise the actual list/confirmation widgets, server-stream filtering, failed/uncertain replies, account switching, equivalent permission refresh, Back/remount, keyboard access at 360 logical pixels with 2× text, and no client database writes. These are automated widget checks, not physical browser or device acceptance.

Two older regression fixtures were aligned with already-maintained behavior: Scale/membership recommendation gates and read-only funding/Zone/workload calls. Product entitlement and refresh behavior were not relaxed.

## Proposed deployment scope — not authorized or executed

1. Firebase Hosting for the tested web client.
2. `businessOperationsV1` lifecycle operations and shared module; retain unrelated operations and existing configuration.
3. The existing `deleteDraftCampaign` callable and work-entry guards in `applyToCampaign`, `assignScalerToCampaignLocations`, `assignScalerToZone`, `configureZoneGroupAssignment`, `acceptZoneGroupSlot`, `startAssignedZone`, `startTrackingSession`, `initializeCampaignCompletion`, and `startCampaignCompletion`.
4. Existing production funding publish/reconciliation/cancellation adapters solely for closure-latch and pre-close-policy compatibility. No economic-rule or provider-setting change.
5. The production Firestore rule amendments. No migration, indexes or Storage rules change.

The payment-runtime preparation now excludes unrelated mapping transforms when extracting its read-only start-eligibility dependency. This fixes stale mapping patch anchors encountered by the existing payment-runtime tests, without changing the mapping algorithm. The future production deployment must overlay only these changes on current deployed function packages; do not run a broad historical engineering rebuild or replace current mapping/financial packages wholesale. Pin and review the exact target package manifest at that approval stage.

The Flutter files are changed only in this isolated web checkout. The frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`; no native compilation, Codemagic run, build number or store selection changed. New list controls would need reconciliation into a later authorized native build; existing installed clients receive only the tightened server behavior after a separately authorized deployment.

Campaign economics, payment/payout controls, Property Intelligence, Zone planning, Email/Social and the completed freehand physical acceptance remain unchanged. Physical acceptance of these new list controls is pending an authorized deployment.

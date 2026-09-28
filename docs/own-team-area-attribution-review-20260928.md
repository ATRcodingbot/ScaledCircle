# My Own Team area attribution — review candidate

Prepared only: no deployment, production completion/person creation, invitation, native build, CI or financial action. The separately prepared onboarding repair `c2f8c9fba9093691b87ae7c13b973fb7b03dd4cc` remains intact and undeployed. This addition is a separate commit atop it; a future production package must explicitly reconcile approved candidates rather than implicitly deploy every ancestor.

## Reused paths and customer behavior

The existing Business campaign planner Area step and Campaign Zones screen now expose an own-team area-work panel. Each area offers **Record who worked this area** and, after completion, attribution correction and notes/history. Existing **Mark Marketing Complete** also accepts optional people and notes, explicitly applying a shared selection to each chosen area. Different crews can be recorded separately per area. People remain optional; historical missing names read **Not recorded**.

The panel reuses workspace People/Crew, the existing `saveResource` internal-person action, and `businessOperationsV1`. A name-only internal person uses `expectedVersion: 0`; it creates no Auth user, invitation, seat, Scaler identity or payment. The roster helper is extracted from the existing service without introducing another people database.

Existing planned assignments remain separate. Per-area assignments are labeled **Assigned to** when present. The maintained linked schedule's assignment is labeled **Assigned to campaign schedule**, with an explanation that it is campaign-level planning, not proof of work in each area. Neither is preselected as actual performance. Actual names appear as **Worked by**, with work date and Business-reported status. Names/date can filter the area-work view. Downloads, scheduling and assignments do not create completion records.

Map exports are unchanged: internal marketer names are not added to public/shared maps. No new assignment editor, workforce or payroll system is introduced.

## Server-authoritative records and operations

- `markMarketingComplete`: adds optional `zoneWork` entries (`zoneId`, `personIds`, `notes`) and `expectedAreaDigests`. It retains existing ownership, role, consent, own-team cleanliness, explicit completion and retry authority. The digest guard rejects a boundary changed since preview.
- Immutable `businessOperations/{businessId}/marketingHistory/{historyId}` gains optional `zoneWork` snapshots (`zoneId`, people `{id,name,personIdentity}`, `workedAtMs`, notes) and `areaSnapshots` (`zoneId`, name, exact geometry parts/digest). Existing campaign/workspace, recorder, recorded timestamp and actual completion date remain authoritative.
- `ownTeamAreaWork`: authorized own-team read projection of current areas, existing assignment labels, eligible workspace roster, completion records and amendments. It denies unrelated workspaces, unauthorized roles and marketplace use. Historical reads remain available after archive.
- `amendOwnTeamAreaWork`: requires the original own-team completion, current authorized actor/consent, stable request ID and expected attribution revision. A transaction appends `marketingHistoryAmendments/{actorRequestHash}` with before/after attribution, recorder/time and geometry identity, and updates `marketingHistoryAttribution/{historyId}` as its current projection. Concurrent stale revisions abort; identical retries return the existing result. It does not create another completion or alter original geometry/date/coverage.

Names and stable identity snapshots survive rename/deactivation. Linked person aliases cannot count the same person twice. Corrections retain previous attribution in the append-only audit. Retaining an already-recorded inactive person is allowed; newly selected people must resolve in the same current workspace. Direct client access to private history/amendment collections remains denied by existing Rules.

The history view uses effective attribution without duplicating area coverage or metrics. New snapshots bind names to exact areas. Legacy records without sufficient per-area geometry evidence are explicitly labeled as historical with an unverified match to today's boundary; they are not presented as certification of the current map.

## Boundaries preserved

Completion is Business-reported, not GPS or household-delivery proof. Existing partial completion means selected fully completed saved Zones. There is no maintained within-Zone partial footprint: the UI requires whole-area confirmation rather than counting a partly worked Zone as complete. Work date is recorded through the existing completion action; attribution amendments correct names/notes while preserving that original date.

No changes to marketplace `assignedScalerId`, `completedBy`, earnings, Wallet, compensation, funding, tracking, archive eligibility, subscription/seat limits or Scale recommendation entitlement. No backfill/migration is required; legacy attribution remains optional.

## Validation

101 distinct automated tests passed:

- 41 existing Business Operations emulator regressions, including the reused roster/person authority.
- 29 marketing-history emulator tests: one/multiple people, optional names, actual schedule assignment versus performance, exact-area identity, stale-boundary rejection, no financial effects, retries, concurrent corrections, cross-workspace/actor denial, linked aliases, name/deactivation retention and archive readability/eligibility.
- 2 Business Operations Rules tests, extended to private history/attribution/amendment paths.
- 12 existing marketing-history geometry unit tests.
- 17 Flutter tests: planner regressions and new optional selection, explicit completion, amendment operation/revision, person creation, filters, keyboard and narrow 390px/2x-text behavior.

Affected Flutter analyzer clean. Production-config local Flutter web build uses `flutter build web --release --dart-define=APP_ENV=production --no-pub`. Local logs are retained under ignored `.firebase/own-team-work-review/`. These are synthetic/emulator/widget results, not physical production acceptance.

## Future deployment and native disposition

Narrow future scope is Hosting plus the existing `businessOperationsV1` function's maintained package. No Rules/indexes/IAM deployment, migration or new endpoint is needed. Review and deployment approval remain outstanding. The frozen native checkout stays at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`; dependency lock is unchanged. Shared Flutter presentation changes exist only in this isolated candidate and need reconciliation into a later approved native candidate, not a new native build for this task.

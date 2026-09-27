# Campaign management repair — September 27, 2026

This extends the reviewed `d59205078b5199ef05152a8e6d9ffac62ead93b7` lifecycle candidate in the isolated web worktree. The Founder authorized the bounded web/server/rules promotion in the consolidated campaign-management request. Deployment results are recorded after verification below; this preparation section alone is not a deployment claim.

## Original deletion and navigation

Founder reports that the deleted draft was probably in Attractive Remodel, disappeared successfully, then navigation led to a white page. The retained production delete logs show HTTP 200 at 2026-09-27 18:39:03.067940Z and 18:39:59.477037Z (2:39 PM Eastern), executions `k5x19y8k54ek` and `k5y8sbm46imh`. Those logs do not identify the exact deleted campaign, so neither call is falsely attributed to a specific record. No deletion was repeated.

The deployed legacy handler hard-deleted a draft and related documents and returned success. Campaign Details then called `Navigator.pop`, while the app router has one declarative page and an empty page-removal callback. That can remove the shell's sole page without establishing a valid replacement destination. The repair replaces the removed route with `/business/campaigns`, retaining the current authorized workspace. Old deep links and missing/tombstoned live documents show “Campaign no longer available” with “Return to Campaigns.” A read error says “Campaign temporarily unavailable.”

Details and list now use the same authoritative lifecycle confirmation/receipt flow. Uncertain replies remain recoverable and retry with the same logical request ID. Confirmation Cancel writes nothing. Responses from a previous account/workspace cannot navigate the next account. The actual Details/router integration is exercised in widget tests, including the sole-page case; these tests are not a destructive production retest.

## Header and list behavior

The maintained `AuthenticatedAppBar` is used once through Campaign → Area → Materials → Review & Schedule / Review & Fund. It retains Back, the real ScaledCircle Home logo, notifications and workspace/account menu. The current step has a separate wrapping title below the toolbar. Leaving unsaved form entries through shared navigation asks to keep editing or discard; no territory is needed to use the header.

List labels are Delete draft, Cancel campaign (existing internal `close`), Archive and Restore to list. Manage work remains accessible. Both marketplace `completed` and `own_team_completed` can be archived/restored without reopening them. Financial history includes the maintained nested legacy Wallet transaction collection. The legacy `zoneScalerParticipations` work projection is also checked. No action grants a refund or alters obligations.

## Columbia — cleanup held, no mutation

- Exact campaign: `Xt7n9vQfabOBCDz1t50h`, Columbia.
- Exact Business/owner: `IqRjZYHKOzXYuJcSyL68LYNwtDg1`, verified as Attractive Remodel.
- Zone: `WL8l4lrY2es55IugYPOq`; completion: `SkRNk1JJS2Qdq5bcs7SA`.
- Funding ledger: a 10,000 development promotional-credit grant explicitly records `developmentOnly: true` and `cashValue: 0`. The three-entry ledger reconciles the 499 subscription debit and 55 campaign debit to 9,446 available credits, plus 50 reserved credits. This is development-credit provenance, not a verified Stripe TEST charge.
- Work evidence: accepted application/assignment, submitted Zone/completion, `routeSimulated: false`, a saved 1,468-point GPS route, and a pending-review payout with `calculationStatus: redo_required`. Current completion fields say `eligibleForPayment: false`; that does not erase the unresolved historical work record or independently prove it is synthetic.
- No campaign-specific modern payment, earnings, financial-operation or transfer records were found in the bounded inventory. There is no authoritative test-only classification for the submitted physical work in the retained records.

The authorized cleanup was conditional on proving no legitimate obligation or genuine work is discarded. Funding provenance alone does not meet that condition here. No archive, cancellation, retirement marker or Admin mutation/audit event was created. The existing operator-only cleanup utility rejects this accepted/submitted case; a focused regression preserves that denial. No generic Admin bypass was added. Further disposition needs authoritative confirmation/classification of this exact historical work obligation, not another GPS walk or a repeated delete.

## Packaging and release boundaries

The source-only overlay targets the 13 existing us-east1 functions listed in `tools/deploy_campaign_management_overlay.py`. Actual generation-pinned production source archives, configuration, IAM and dependency locks are retained privately. Work-entry guards are installed before enabling lifecycle writes. The old delete implementation is in `legacy-commerce-exports.js`; the overlay replaces that actual leaf, not an unused forwarding export. Group configuration is guarded in its actual nested `legacy-group/index.js`.

`startAssignedZone` is not a deployed production service; it is not created. Existing financial transition code retains its allocation/refund-capacity reconciliation and only protects closed/completed work status from being reopened by provider updates. The existing cancellation policy evaluates the preserved pre-close status with every previous blocker intact. No provider settings, money movement, economic rule or IAM changes are part of this deployment.

The actual deployed Firestore ruleset before this change is `700b6412-93f3-4cdf-8838-a83716d5e12d`. Its diff from the candidate contains only the reviewed server-owned lifecycle fields and terminal-state write protections. No read access is broadened.

Hosting packaging preserves the actual GA4/public-page baseline `sites/scaled-circle/versions/f70910ac1cd42499`, current freehand/PI/CRM repairs, production identity and dependency lock. The frozen native checkout stays clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`; no native build, Codemagic, store or financial action is authorized here.

## Validation and remaining acceptance

Automated checks cover current lifecycle eligibility, cross-workspace and permission denial, all work inventory, competing assignment/closure, retry receipts, completed archive/restore, legacy Wallet history, deletion navigation, account changes, canonical headers, unsaved navigation, keyboard/narrow/2× text, and existing refresh/funding UI behavior. Generation-pinned packages receive separate offline overlay/financial-reconciliation verification before promotion.

Production acceptance uses read-only eligibility and canceling dialogs, plus recovery/navigation/header checks. Destructive lifecycle cases remain fixture/emulator evidence; neither “Test” nor “YouTube Test” is deleted. Founder physical post-deployment navigation remains separate from automated browser evidence. The completed freehand physical acceptance is retained and not replayed.

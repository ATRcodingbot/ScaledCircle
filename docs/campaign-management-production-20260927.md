# Campaign management repair — September 27, 2026

This extends the reviewed `d59205078b5199ef05152a8e6d9ffac62ead93b7` lifecycle candidate in the isolated web worktree. The Founder authorized the bounded web/server/rules promotion in the consolidated campaign-management request. Deployment results are recorded after verification below; this preparation section alone is not a deployment claim.

## Original deletion and navigation

Founder reports that the deleted draft was probably in Attractive Remodel, disappeared successfully, then navigation led to a white page. The retained production delete logs show HTTP 200 at 2026-09-27 18:39:03.067940Z and 18:39:59.477037Z (2:39 PM Eastern), executions `k5x19y8k54ek` and `k5y8sbm46imh`. Those logs do not identify the exact deleted campaign, so neither call is falsely attributed to a specific record. No deletion was repeated.

The deployed legacy handler hard-deleted a draft and related documents and returned success. Campaign Details then called `Navigator.pop`, while the app router has one declarative page and an empty page-removal callback. That can remove the shell's sole page without establishing a valid replacement destination. The repair replaces the removed route with `/business/campaigns`, retaining the current authorized workspace. Old deep links and missing/tombstoned live documents show “Campaign no longer available” with “Return to Campaigns.” A read error says “Campaign temporarily unavailable.”

Details and list now use the same authoritative lifecycle confirmation/receipt flow. Uncertain replies remain recoverable and retry with the same logical request ID. Confirmation Cancel writes nothing. Responses from a previous account/workspace cannot navigate the next account. The actual Details/router integration is exercised in widget tests, including the sole-page case; these tests are not a destructive production retest.

## Header and list behavior

The maintained `AuthenticatedAppBar` is used once through Campaign → Area → Materials → Review & Schedule / Review & Fund. It retains Back, the real ScaledCircle Home logo, notifications and workspace/account menu. The current step has a separate wrapping title below the toolbar. Leaving unsaved form entries through shared navigation asks to keep editing or discard; no territory is needed to use the header.

List labels are Delete draft, Cancel campaign (existing internal `close`), Archive and Restore to list. Manage work remains accessible. Both marketplace `completed` and `own_team_completed` can be archived/restored without reopening them. Financial history includes the maintained nested legacy Wallet transaction collection. The legacy `zoneScalerParticipations` work projection is also checked. No action grants a refund or alters obligations.

## Columbia — owner-confirmed test retired

Exact campaign `Xt7n9vQfabOBCDz1t50h`, Columbia, belongs to Attractive Remodel (`IqRjZYHKOzXYuJcSyL68LYNwtDg1`). Zone `WL8l4lrY2es55IugYPOq`, completion `SkRNk1JJS2Qdq5bcs7SA`, and route `eMXS6NLhHru8Drw2nQ3P` were verified individually.

The complete three-entry ledger traces funding to a 10,000 development-credit grant (`developmentOnly: true`, `cashValue: 0`), a 499 subscription debit, and a 55 campaign debit: 9,446 available credits, 50 reserved. This is development-credit provenance, not a verified Stripe TEST charge. The non-simulated 1,468-point route ended August 10 with tracking off. Accepted assignment, submitted completion and pending-review payout (`redo_required`, base 25, bonus 0) were preserved as historical evidence. Neither funding origin nor `eligibleForPayment: false` was taken as proof of no obligation.

Founder was asked about this exact submitted work and answered **“Test only; no genuine worker obligation.”** That resolved the earlier work-disposition hold. The operator-only Admin hygiene extension is restricted to the exact reviewed identities, ledger, ended route and explicit owner confirmation. LIVE/provider bindings, earned/paid or active work, additional/missing relationships, non-Admin execution and concurrent changes fail closed. No generic LIVE-work bypass was introduced.

The Admin transaction archived the campaign/discovery and set the Zone/completion queue state to `test_retired`. The immutable audit retains original operational snapshots and history hashes/versions:

`adminAuditEvents/hygiene_test_retirement_Xt7n9vQfabOBCDz1t50h`

Readback confirmed nine unchanged documents, including Wallet and all three transactions, payout, original application, route, owner and worker. No balance, reserve, payout, refund, earning, identity or assignment-history mutation occurred. The non-simulated route was not relabeled synthetic. Nothing was marked completed or paid. The archived record remains visible in History; normal Restore is denied for this historical accepted campaign.

Business result presentation excludes only the server-owned retired state, never an arbitrary test label. Existing Admin and Scaler earnings projections already exclude this queue state while retaining real posted balances. Captured deployed trigger sources confirmed the change does not meet campaign-open, Zone-submission/pause, progress-projection or draft-audit notification conditions. The maintained discovery trigger retains coarse archived history.

## Packaging and release boundaries

The source-only overlay targets the 13 existing us-east1 functions listed in `tools/deploy_campaign_management_overlay.py`. Actual generation-pinned production source archives, configuration, IAM and dependency locks are retained privately. Work-entry guards are installed before enabling lifecycle writes. The old delete implementation is in `legacy-commerce-exports.js`; the overlay replaces that actual leaf, not an unused forwarding export. Group configuration is guarded in its actual nested `legacy-group/index.js`.

`startAssignedZone` is not a deployed production service; it is not created. Existing financial transition code retains its allocation/refund-capacity reconciliation and only protects closed/completed work status from being reopened by provider updates. The existing cancellation policy evaluates the preserved pre-close status with every previous blocker intact. No provider settings, money movement, economic rule or IAM changes are part of this deployment.

The actual deployed Firestore ruleset before this change is `700b6412-93f3-4cdf-8838-a83716d5e12d`. Its diff from the candidate contains only the reviewed server-owned lifecycle fields and terminal-state write protections. No read access is broadened.

Hosting packaging preserves the actual GA4/public-page baseline `sites/scaled-circle/versions/f70910ac1cd42499`, current freehand/PI/CRM repairs, production identity and dependency lock. The frozen native checkout stays clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`; no native build, Codemagic, store or financial action is authorized here.

## Validation and remaining acceptance

Automated checks cover current lifecycle eligibility, cross-workspace and permission denial, all work inventory, competing assignment/closure, retry receipts, completed archive/restore, legacy Wallet history, deletion navigation, account changes, canonical headers, unsaved navigation, keyboard/narrow/2× text, and existing refresh/funding UI behavior. Generation-pinned packages receive separate offline overlay/financial-reconciliation verification before promotion.

Production acceptance uses read-only eligibility and canceling dialogs, plus recovery/navigation/header checks. Destructive lifecycle cases remain fixture/emulator evidence; neither “Test” nor “YouTube Test” is deleted. Founder physical post-deployment navigation remains separate from automated browser evidence. The completed freehand physical acceptance is retained and not replayed.

## Verified production deployment

- Server overlay source: `b6d7dd6ad6b083cfa3f6c08ad7d40d9a3384a5b0` (application/package bytes from `fbba38712464c1f85e6e3f4200e315aaab70476f`; the follow-up only corrected a CRLF-sensitive package test).
- Final web/Admin retirement source: `6c3fb2a654bd2db7f92009b9dd39b6c3c2308995`.
- Hosting: `sites/scaled-circle/versions/847456b2c6896787`, released `2026-09-27T19:41:55.645Z`.
- Served main bundle SHA-256: `b05742451bb4233600435e701a996d4c68ac9353de7dd71c68eec163065621cb`. Served index, analytics and all five retained public pages match the package; Hosting configuration is unchanged.
- Firestore rules: `projects/scaled-circle/rulesets/fc640617-e9c9-4ab6-9bd1-48226cf235a0`, source readback matched.

| Function | Active revision |
|---|---|
| acceptZoneGroupSlot | `acceptzonegroupslot-00006-rah` |
| applyToCampaign | `applytocampaign-00006-xiz` |
| assignScalerToCampaignLocations | `assignscalertocampaignlocations-00005-cus` |
| assignScalerToZone | `assignscalertozone-00009-kip` |
| businessOperationsV1 | `businessoperationsv1-00013-nus` |
| cancelUnassignedFundedCampaign | `cancelunassignedfundedcampaign-00003-vuj` |
| configureZoneGroupAssignment | `configurezonegroupassignment-00004-vif` |
| deleteDraftCampaign | `deletedraftcampaign-00004-rur` |
| initializeCampaignCompletion | `initializecampaigncompletion-00006-fad` |
| publishFundedCampaign | `publishfundedcampaign-00009-din` |
| startCampaignCompletion | `startcampaigncompletion-00003-dol` |
| startTrackingSession | `starttrackingsession-00005-qoc` |
| stripeWebhook | `stripewebhook-00013-wup` |

All 13 source overlays retain actual prior environment, secrets, configuration, identity, IAM and package locks. No financial provider call/settings change or native build occurred.

Validation: 78 lifecycle/rules/planner/execution emulator tests; 73 core lifecycle/economics/Admin unit tests; 54 affected Flutter regressions; 17 generation-pinned overlay tests; 5 additional test-retirement unit cases and 4 transaction/emulator cases; 10 Business result/work-state tests. The 15 existing Admin unit cases were also rerun with the five new ones. Affected analyzer clean and final production web build passed. An initial test command referenced a nonexistent work-lifecycle test file; the corrected command ran the existing result suite including explicit work-state assertions, all 10 passed.

Browser evidence and any remaining acceptance are recorded after the bounded readback.

### Bounded live acceptance and final recovery wording correction

Current list contains the preserved `test` draft; Columbia appears under Archived. Production `campaignListActions` returned Delete draft for the unfinished draft, with its name in confirmation. Confirmation was canceled, never submitted. Columbia's menu returned only Manage work and the explicit historical-review hold, with no Restore. Business Home shows zero active campaigns and zero Zones awaiting review. Opening an empty Flyer planner displays the canonical shared header and step subtitle. At a settled 390-pixel browser viewport, the logo returned to Business Home without required fields or a saved draft. These are browser-tool observations, not Founder physical-device results. The temporary viewport will be reset.

A read-only nonexistent campaign deep link exposed a precise copy issue: under existing workspace-isolation rules, an absent document can return permission denied rather than an empty snapshot. The initial recovery remained usable but called this temporarily unavailable. The final client classifies `permission-denied`/`not-found` as “Campaign no longer available” without revealing another workspace's record; genuine `unavailable` errors retain the temporary-error wording. Three new negative/positive recovery cases passed, and the combined recovery/refresh suite passed all 11 tests. No rules, permissions, financial services or saved records change in this final correction.

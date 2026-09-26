# Campaign execution authority: deployment appendix

This appendix records the source preservation and synthetic verification for the own-team/marketplace boundary. It accompanies [Web campaign planning and completion history](campaign-area-materials-web-20260926.md). It is an inventory and verification record; final deployment completion and revisions must come from the deployment readbacks.

## Exact production targets

All 23 existing targets are in project `scaled-circle`, region `us-east1`, generation 2, with the captured runtime `nodejs24`. Codebase labels identify the existing source groups; promotion targets each function by its exact name.

| Existing codebase | Function | Narrow source overlay |
| --- | --- | --- |
| campaign-funding | `quoteCampaignFunding` | Callable mode guard; current area/material review and transaction checks in `index.js` |
| campaign-funding | `createCampaignFundingCheckoutSession` | Callable mode guard; current area/material review and transaction checks in `index.js` |
| campaign-funding | `publishFundedCampaign` | Callable mode guard; current area/material review and transaction checks in `index.js` |
| campaign-funding | `getCampaignFundingState` | Callable mode guard in `index.js` |
| default | `fundCampaign` | Callable mode guard in retained `legacy-commerce-exports.js` |
| application-core | `applyToCampaign` | Callable mode guard in `index.js` |
| assignment-core | `assignScalerToZone` | Callable mode guard in `index.js` |
| completion-authority-core | `assignScalerToCampaignLocations` | Callable mode guard in retained `workspace-exports.js` |
| assignment-core | `configureZoneGroupAssignment` | Callable mode guard in retained `legacy-group/index.js` |
| assignment-core | `acceptZoneGroupSlot` | Callable mode guard in `index.js` |
| tracking-core | `startTrackingSession` | Callable mode guard and a guard before the retained funding-protection refresh in `index.js` |
| completion-authority-core | `initializeCampaignCompletion` | Callable mode guard in `index.js` |
| completion-authority-core | `startCampaignCompletion` | Callable mode guard in `index.js` |
| completion-authority-core | `appendCampaignCompletionEvidence` | Callable mode guard in `index.js` |
| completion-authority-core | `submitCampaignCompletion` | Callable mode guard in `index.js` |
| completion-authority-core | `submitZoneCompletion` | Callable mode guard in `index.js` |
| completion-authority-core | `reviewCampaignCompletion` | Callable mode guard in `index.js` |
| completion-authority-core | `finalizeZoneReview` | Callable mode guard in `index.js` |
| default | `approveZonePayout` | Callable mode guard in `index.js` |
| discovery-core | `getSmartZonePlan` | Own-team paid-membership exemption in `workspace_access.js` and `index.js` |
| discovery-core | `applySmartZonePlan` | Same exemption; server rejection of own-team recommended compensation in `index.js` |
| discovery-core | `analyzeCampaignZone` | Own-team planning authorization in `workspace_access.js`; planning-only mapping in `production_mapping_service.js` |
| logistics-access | `projectCampaignDiscoveryV1` | Non-marketplace exclusion in `policy.js` |

The 19 guarded callable packages also receive the shared `campaign_execution_authority.js`. The request resolver follows each deployed handler's actual campaign, Zone, completion or payout identifier and reads the authoritative parent campaign. Own-team, unknown modes and missing bound parents fail closed. A missing mode preserves legacy marketplace semantics. The pre-campaign quote calculator remains available without introducing a campaign-bound financial action.

`businessOperationsV1`, Firestore rules and Hosting are coordinated separately. No new production targets are created from source exports that were absent from the live inventory. This authority promotion does not deploy a webhook, transfer runner or scheduled payout processor.

## Source and configuration preservation

`tools/prepare_campaign_execution_promotion.cjs` prepares each package from that function's own downloaded production archive, pinned by its live Cloud Storage source generation. The retained inventory records archive SHA-256, original source identity, every candidate file SHA-256 and each changed file's before/after SHA-256. It does not replace production funding or completion code with a repository-wide generated index.

The callable wrapper preserves the original handler text byte for byte inside the guard. Additional changes use unique, checked source anchors. Parsing and a changed-file allowlist reject unreviewed source drift. Dependency manifests and lockfiles remain those of the deployed package. Existing allocation, payout, settlement, withdrawal, provider and launch-gate behavior is preserved.

Archived environment files were not accepted as current configuration. Some differed from the live service metadata. Candidate `.env.scaled-circle` files were reconstructed from the actual live custom environment, excluding platform-owned keys, and parsed back for exact equality. This reconciliation records only field names in sanitized reports; it does not change live environment values. No environment values, secret versions or private metadata are included in this document.

`tools/deploy_campaign_planner_overlay.py` invokes the existing target with `gcloud functions deploy --gen2 --source=...` and omits environment, secret, trigger, IAM and service-setting update flags. It re-describes the function immediately before promotion and rejects a changed live source generation or changed preserved configuration. It requires the exact prepared file inventory and SHA-256 values, rejecting extra, missing or changed files and symlinks. The authority packages use their preparation manifest; the separately prepared Business Operations package uses its own sealed 27-file manifest. A subsequent package edit requires a reviewed replacement manifest before promotion.

Preserved configuration now includes the full service configuration except generated revision, URI and service identity fields; build configuration except generated build, uploaded source and source-provenance fields; the full event trigger; and top-level environment, KMS key and labels. Before/after comparisons therefore cover runtime, entry point, build environment and account, service environment, secret bindings, scaling/resources and trigger settings. After deployment the runner requires `ACTIVE` and no differences. Protected command output and full metadata stay in ignored private files; safe output contains function name, state, revision and changed field names.

The independent runner review identified gaps in its original service-only comparison and package-inventory validation. Deployments paused while these checks were strengthened. All 23 authority packages still matched their exact manifests, and a local comparison of the first eight completed retained before/after readbacks found no changes in the expanded configuration fields. This review made no additional cloud requests. IAM is not established by function-description metadata; no IAM-changing flags are passed, but no separate IAM-policy equality claim is made.

## Synthetic verification

The source regression run passed **79 tests, zero failures**: 37 focused authority/rules/backend checks and 42 existing publication, funding, reserve, settlement-binding and canvassing-contract regressions. Tests ran against local Firestore/Auth emulators on ports 8185/9195 and stubbed external planning providers.

Coverage includes private owner/member access, revoked/unrelated/scaler/admin denial, immutable execution and planning fields, free authorized own-team planning, geometry review invalidation, rejection of financial/assignment/tracking/completion paths, forged recommended-compensation rejection, and preserved legacy/explicit-marketplace behavior. Existing financial regressions exercise the retained funding and settlement contracts; no production payment is created by this verification.

From `functions/`, with both emulator host variables set to localhost and `NODE_PATH` set to the workspace dependencies, the source command was:

```text
node --test --test-concurrency=1 campaign_execution_authority.test.js campaign_execution_rules.test.js campaign_execution_backend.test.js campaign_execution_funding_backend.test.js campaign_publish_backend.test.js campaign_funding_hardening.test.js campaign_reserve_settlement.test.js settlement_funding_binding.test.js production_canvassing_contract.test.js
```

`tools/verify_campaign_execution_promotion.cjs` separately passed **23 of 23 prepared-package checks** by loading each actual overlaid deployed export in its own process. The 19 financial/work entry points rejected own-team, unknown-mode and missing-parent fixtures. Three planning exports reached stubbed planning without a paid membership; recommended compensation was rejected for own-team. The projection export produced no public discovery record for an own-team campaign. The checks also asserted no campaign-bound financial or tracking records were created.

The verification tool refuses to run unless both SDK emulator hosts are localhost. The production project string is used only to satisfy retained production-isolation checks while both SDKs target the local emulators. No production campaign, payment, assignment, completion, provider request, OAuth attempt or email send is part of these checks.

## Private evidence and safe reporting

Ignored evidence is retained under `.firebase/campaign-authority/`: the generation-pinned archives, extracted baselines, prepared packages, private promotion manifest, source test log and private package-verification report. Per-function before/after readbacks and sanitized deployment summaries are under `.firebase/campaign-planner-deploy/`. These directories must not be staged or published because source archives and metadata can contain protected environment configuration.

The 79 source tests and 23 package checks are distinct evidence sets, not a claim that 102 production operations were exercised. Production completion is established by exact target readbacks, with rules/projection and all marketplace authority guards deployed before the planner and Hosting expose own-team creation.

The deployment runner additionally passed seven fully mocked Python safety tests covering runtime/build/trigger/environment/secret drift, unexpected source files, preflight rejection, post-deployment drift rejection without retry, and preservation of the source-only command flags. These tests make no cloud calls. Run them with `python -m unittest discover -s tools -p deploy_campaign_planner_overlay_test.py -v`.

## Completed production readback

All 24 existing callable/projection targets below are ACTIVE. Final retained before/after comparison reports no preserved configuration differences for every target. Firestore rules compiled and deployed before planner activation. Hosting deployment completed, and the public `main.dart.js` SHA-256 matches the prepared production build: `7165a22648a5620c0b8183255055542faea17f49ea7fc43cffc8673fe4bc4ff2`.

| Function | Active revision |
| --- | --- |
| `quoteCampaignFunding` | `quotecampaignfunding-00008-zuh` |
| `createCampaignFundingCheckoutSession` | `createcampaignfundingcheckoutsession-00011-cel` |
| `publishFundedCampaign` | `publishfundedcampaign-00007-yej` |
| `getCampaignFundingState` | `getcampaignfundingstate-00004-zir` |
| `fundCampaign` | `fundcampaign-00004-zin` |
| `applyToCampaign` | `applytocampaign-00005-nap` |
| `assignScalerToZone` | `assignscalertozone-00008-rip` |
| `assignScalerToCampaignLocations` | `assignscalertocampaignlocations-00004-kih` |
| `configureZoneGroupAssignment` | `configurezonegroupassignment-00003-pib` |
| `acceptZoneGroupSlot` | `acceptzonegroupslot-00005-rir` |
| `startTrackingSession` | `starttrackingsession-00004-rav` |
| `initializeCampaignCompletion` | `initializecampaigncompletion-00005-rem` |
| `startCampaignCompletion` | `startcampaigncompletion-00002-reg` |
| `appendCampaignCompletionEvidence` | `appendcampaigncompletionevidence-00002-saw` |
| `submitCampaignCompletion` | `submitcampaigncompletion-00002-por` |
| `submitZoneCompletion` | `submitzonecompletion-00010-cop` |
| `reviewCampaignCompletion` | `reviewcampaigncompletion-00005-xez` |
| `finalizeZoneReview` | `finalizezonereview-00005-yoc` |
| `approveZonePayout` | `approvezonepayout-00008-vod` |
| `getSmartZonePlan` | `getsmartzoneplan-00006-way` |
| `applySmartZonePlan` | `applysmartzoneplan-00006-now` |
| `analyzeCampaignZone` | `analyzecampaignzone-00007-fey` |
| `projectCampaignDiscoveryV1` | `projectcampaigndiscoveryv1-00002-col` |
| `businessOperationsV1` | `businessoperationsv1-00010-pep` |

Read-only production calls with no authentication and with an invalid token both returned HTTP 401 / `UNAUTHENTICATED`. In the existing authorized Mike Business session, Business Home loaded and Create Campaign → Flyer Distribution opened the new Campaign → Area → Materials → Review sequence. Selecting My Own Team changed the final stage to Review & Schedule and displayed the no-Scaler-compensation explanation. No form was committed and no synthetic production campaign was created.

The complete create/schedule/complete/overlap lifecycle is verified with synthetic emulator tests, not fabricated production activity. The production screenshot is retained locally at `.firebase/campaign-planner-deploy/own-team-planner-production.png`.

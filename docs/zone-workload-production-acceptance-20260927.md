# Scaler Zones — controlled production deployment and acceptance

Date: 2026-09-27. Deployed application source: **175edc45b1ebd854f07d27b5ceaf94bb9ef80610**, based on approved candidate **31cf90409257e5ee52e78c8a2578dcbdda40e3eb**, with the narrowly authorized compatibility corrections below. No native build, financial operation, campaign migration, paid provider request or forced research was performed.

## Deployment readback

All listed Cloud Run revisions are ACTIVE in `scaled-circle/us-east1`:

| Function | Deployed revision |
| --- | --- |
| getSmartZonePlan | getsmartzoneplan-00012-sid |
| applySmartZonePlan | applysmartzoneplan-00012-gas |
| businessOperationsV1 | businessoperationsv1-00012-nul |
| confirmCampaignZoneIntelligence | confirmcampaignzoneintelligence-00001-vad |
| quoteCampaignFunding | quotecampaignfunding-00009-suz |
| createCampaignFundingCheckoutSession | createcampaignfundingcheckoutsession-00012-mag |
| publishFundedCampaign | publishfundedcampaign-00008-sih |
| fundCampaign | fundcampaign-00005-lur |

The last four deployments update the reviewed planning-guard closure only; retained economic handlers, provider settings, configuration, identities and IAM remain unchanged. The new confirmation endpoint uses the maintained authenticated Business/campaign authority and the factual endpoint's runtime pattern. Its transport is callable, with mandatory application authentication and workspace authorization. No project-wide permission was added.

`getCampaignFundingState` was not changed or redeployed. Factual preview `getCampaignZoneIntelligence` remains at `getcampaignzoneintelligence-00001-bac`.

- Hosting: **sites/scaled-circle/versions/d866811bd101d299**; released **2026-09-27T11:07:15.947Z** (7:07:15 AM Eastern).
- Public `main.dart.js` SHA-256: `d09142422f87246c965ec6bac649e4fb9e293e608c69d6ab790031bd3c8daefc`, matching the prepared release.
- All eight generation-pinned uploaded source packages match the prepared packages; dependency locks are unchanged. Existing Hosting configuration and static public pages were preserved.
- Firestore ruleset: **projects/scaled-circle/rulesets/700b6412-93f3-4cdf-8838-a83716d5e12d**. Readback matches the reviewed six-field protection delta: `campaignWorkload`, `workloadVersion`, `workloadUpdatedBy`, `workloadUpdatedAt`, `smartZoneSelectionIds`, `smartZoneObjective`.

## Compatibility and saved-draft disposition

The retained Attractive Remodel draft `czp6YVRr4SNXHGugmKZu` has `map-parts-v1`, two saved geometry parts and two unassigned Zone documents. It has no payment or compensation-contract records. Its historical completed recommendation records five requested hours, but there is no new server-owned `CampaignWorkloadV1` or workload version. The recommendation run has expired.

The compatibility correction reads that historical request for explanation without turning it into new authority. The live message is:

> This saved 5-hour recommendation has 2 areas. The current plan requires 1 Scaler Zone. Choose which area to keep or explicitly revise the requested workload. Confirm the requested workload before review. Your saved areas remain unchanged.

Both original boundaries, Zone IDs, names and estimated minutes remain intact. Continue is held; the owner has not chosen which area to keep or changed demand. An older Apply request cannot silently replace this two-area legacy draft with a one-Zone result. Existing paid/accepted work is excluded from retroactive repartitioning by the new count guard; maintained materials, payment and work-start checks still apply.

Older-client compatibility was checked through the frozen request shapes, server/rules fixtures and retained records. Legacy reads/navigation and exact-input completed-run recovery remain available; missing protected authority cannot be bypassed. This is not a claim that a newly installed physical native client was tested during this deployment. The frozen native checkout remains clean at **0f57f0894a06fc0de0b769d3c4fa012c62e51cb1**; iOS38/Android37 and store selections were untouched.

## Production web acceptance

The browser session was verified as Attractive Remodel. Only existing saved records, factual previews and discarded local edits were used.

| Check | Observed result |
| --- | --- |
| 0.49-hour input | Rejected in the actual workload dialog with **Minimum campaign workload is 30 minutes.** Cancelled without saving. |
| Legacy transition | Five-hour historical request shown separately, one required Zone, both original areas preserved, Continue disabled with the specific adjustment. |
| Multipart reopening | **Review area options** opens both actual saved Zone boundaries despite the empty legacy single-area field and expired recommendation. No new search. |
| Area switching / numbering | Mouse selection of map marker 1 changes the card to Zone 1 and its facts. Marker 2/card Zone 2 agree. Old facts clear while the selected boundary is analyzed. |
| Technical evidence | **View property evidence** expands and collapses using the actual keyboard control. Regional source counts/dates, OSM freshness and assumptions remain secondary. |
| Unsaved edit | Edit selected Zone opens the correct saved Area 1. Entering replacement/redraw mode removes the old factual card and disables save until a valid boundary exists. Switching to Rectangle clears the visible original boundary. |
| Cancel / reopen | Cancel restores the saved Zone list. Reopening shows both original boundaries; selecting Zone 1 again restores its 10-target/403 m/~24 min facts. |
| Complete new redraw | **Not completed with browser controls:** the two map clicks did not place rectangle points. No new geometry was submitted. Full geometry-change invalidation remains covered by fixtures, not claimed as a physical redraw pass. |
| Selected-Zone alternate | **Fixture coverage only for replacement.** The saved run is expired and has no current selection IDs; the live review correctly offers refresh rather than an unavailable alternate. No new recommendation or persisted replacement was manufactured for QA. |

Live per-Zone facts:

| Display | Targets / property mix | Nearby regional housing | Supporting streets | Advisory field time |
| --- | --- | --- | ---: | ---: |
| Zone 1 | 10 mapped residential; attached / semi-detached | Predominantly 1960–1979 | 403 m | ~24 min |
| Zone 2 | 11 mapped residential; detached | Predominantly 1940–1959 | 251 m | ~21 min |

These are separate saved geometries, not a combined execution route. The factual previews total 45 advisory minutes; they are not inflated to the five-hour request or the 30-minute input minimum. **Execution route not yet verified** remains visible. Regional era is not represented as the age of every mapped target.

The legacy workload authority summary reports **Supported planning workload: Not established** / **0 of 1 ready** because the old draft has not confirmed the new workload/evidence contract. This does not erase the available read-only historical/factual previews above or claim there are zero targets. No evidence confirmation write was performed to make readiness pass.

Existing source readback showed OSM snapshot **2026-09-25T20:24:36Z**, retrieval **2026-09-26T21:55:03.501020+00:00**, fresh state. Regional Maryland property source did not supply a source date; the analysis timestamp was **2026-09-26T23:51:13.769Z**. These remain distinct.

Authenticated UI reads reached `businessoperationsv1-00012-nul` with HTTP 200 at **11:08:10.881574Z** and the unchanged factual endpoint with HTTP 200 during Zone selection. Eight signed-out/invalid-auth probes across Get/Apply/Confirm/Business Operations returned **401 UNAUTHENTICATED**. No financial handler was invoked as a production acceptance test.

The final authoritative document comparison (excluding query read timestamps) confirmed **all campaign, Zone, payment and compensation-contract documents unchanged**.

## Fixture coverage and build verification

The accepted candidate's 220 tests remain the predeployment regression baseline. This rollout additionally ran/re-ran:

- **44 Node unit tests passed**: compatibility, count authority, 0.5/6-hour boundaries, representable values immediately around six-hour multiples, requested allocation and existing-work protection.
- **35 distinct Auth/Firestore emulator checks passed** across planning, Smart Zone, funding-entry and rules suites. A test harness initially dropped Firebase error details; it was corrected, and the affected 28-test group passed on rerun. Coverage includes legacy two-area refusal, server-owned fields, tenant/consent checks, idempotency and other-Zone preservation.
- **32 Flutter tests passed** for presentation and planning/navigation behavior; affected analyzer clean; production web release build passed.
- Eight prepared deployment package checks passed, followed by exact uploaded-package and public-bundle hash verification.

The boundary/count cases requiring a persisted workload, manual progress, valid new evidence and selected-Zone replacement were verified using fixtures/emulators. They were not replayed by changing the real saved draft. Exact 0.5/6 hours requires one Zone; greater than 6 through 12 requires two; balanced demand remains a planning target independent of supported minutes. Physical Starter/Growth QA remains pending because no authorized eligible account is available.

## Evidence and remaining physical check

Actual production screenshots:

- [Legacy adjustment and preserved boundaries](qa-artifacts/zone-workflow-legacy-adjustment-20260927.png)
- [30-minute input minimum](qa-artifacts/zone-workflow-minimum-20260927.png)
- [Zone 1 summary](qa-artifacts/zone-workflow-zone1-20260927.png)
- [Zone 2 summary](qa-artifacts/zone-workflow-zone2-20260927.png)
- [Unsaved redraw state, old facts absent](qa-artifacts/zone-workflow-edit-invalidated-20260927.png)
- [Multipart reopening after Cancel](qa-artifacts/zone-workflow-cancel-restored-20260927.png)
- [Zone 1 facts restored after Cancel](qa-artifacts/zone-workflow-cancel-zone1-restored-20260927.png)

**One remaining Founder interaction:** in this existing draft, open Review area options → select a Zone → Edit selected Zone → Edit Boundary; draw a different closed boundary without saving. Confirm the old intelligence is removed or marked stale, then Cancel and reopen to confirm the original boundary/facts return. Do not Save, Use, fund, assign or refresh merely for this check.

Two pre-existing limitations were observed without widening this deployment: Campaign Details still reports campaign status unavailable, and the saved-boundary map's accessibility/legend summary has no target/street overlays even though per-Zone factual cards load. These are not new financial-authority changes or proof that the individual cards have zero evidence.

Disposition: reviewed deployment and bounded read-only production checks complete; the full physical redraw gesture and an eligible non-Scale physical session are not claimed as passed. Native, prices, compensation, platform fees, financial/payout controls, PI scoring, workload model, entitlements, Email/Social and research remain unchanged.

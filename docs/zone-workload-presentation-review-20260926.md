# Zone presentation and workload authority — review candidate

Status: implemented and locally verified; **not deployed**. This review includes the broader workflow attachment following Founder’s explicit scope clarification. The frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. No CI, native build, production write, financial operation or public submission was performed.

## Before / after

| Before | Candidate |
| --- | --- |
| Repeated target, route, workload and source explanations competed in the primary card. | Zone number → mapped targets → property type → prominent estimated field time → supporting streets → nearby housing → why it fits → route status. |
| Source record counts, dates and scorer wording interrupted the customer summary. | Accessible **View property evidence** expansion retains detailed counts, source/vintage/retrieval, assumptions, limitations and original scorer evidence. |
| Requested hours influenced accumulation of multiple recommended areas, without a persisted required-count contract. | Server-owned requested workload sets the required number of Zones. Actual evidence estimates remain separate. |
| Continue could rely on having any polygon. | Exact required count, current geometry-bound evidence, six-hour eligibility, ownership and assignment compatibility must pass server validation. |
| Reopening checked the empty legacy campaign boundary. | Review opens saved multipart Zone documents and their identities. A new search is a separate explicit action. |
| Area names could disagree with ordinal badges. | Numeric Area/Zone aliases resolve to one **Zone N** identity; custom names and document IDs survive. |

## Exact customer copy

Primary retained examples:

- **Zone 1:** “10 mapped residential targets”; “Attached / semi-detached homes”; “Estimated field time”; **“~24 min”**; “One-Scaler planning estimate”; “403 m supporting streets”; “Nearby housing: Predominantly 1960–1979”; “Regional property context”.
- **Zone 2:** “11 mapped residential targets”; “Detached homes”; “Estimated field time”; **“~21 min”**; “One-Scaler planning estimate”; “251 m supporting streets”; “Nearby housing: Predominantly 1940–1959”; “Regional property context”.
- Recommendation heading: **“Why ScaledCircle recommends this area”**. Neutral supported explanation: “Mapped homes and local streets support reviewing this area for your campaign.” Business targeting uses businesses instead of homes.
- An explicit lower-fit server comparison permits: “This area is a weaker match than the top recommendation, but still has usable residential and street evidence.” An equal-fit comparison permits “This area has a similar match to the top recommendation, with usable residential and street evidence.” Neither is inferred just from being an alternate.
- Manual heading: **“What we found in this area”**. Manual facts do not imply a Scale recommendation.
- **“Execution route not yet verified”** remains visible in secondary text.
- Missing details remain Unavailable/Partial. Housing era remains regional context, not a fact about every target. Detailed evidence retains the limitation that mapped features are not verified households, entrances, delivery stops or a material quantity.

No lead-probability, guaranteed-conversation, execution-route or revenue claim was added.

## Render evidence

These are actual Flutter widget renders using AppTheme and the retained production-evidence JSON, not browser mockups, generated artwork or new physical-device acceptance:

- [Desktop comparison](qa-artifacts/zone-summary-desktop.png)
- [390 px, 2× text](qa-artifacts/zone-summary-narrow-2x.png)

Both were visually inspected: text wraps, the workload is prominent, the evidence control is readable, and regional/route limitations remain visible. The side-by-side image compares retained alternatives; it does **not** mean a five-hour campaign requires both Zones. The earlier production screenshots are retained as the before state. Real production interaction with the new candidate remains pending deployment approval.

## Server authority and storage

`functions/campaign_workload_authority.js` defines `CampaignWorkloadV1`:

- Numeric, finite requested hours: minimum **0.5**, existing maximum **192** retained.
- `requiredZoneCount = ceil(requestedHours / 6)`.
- Balanced requested allocation: `requestedMinutes / requiredZoneCount`. This is a planning target, never an evidence estimate.
- A valid saved Zone must belong to the campaign/Business, have a valid simple polygon, current `ZoneIntelligenceV1` geometry digest, available/partial evidence, positive advisory minutes ≤360, and one-Scaler eligibility. Assigned/locked/active Zones and duplicate geometry cannot count as editable planning Zones. Missing, extra, stale or incompatible Zones block review.

`businessOperationsV1` adds `campaignWorkloadContext` and `saveCampaignWorkload`. Writes recheck Business campaign permission and current consent, use an optimistic workload version inside a Firestore transaction, reject protected payment/contract/assignment records, invalidate prior material review and write `campaigns/{campaignId}/planningAudit/workload_{version}`. Requested workload/version and recommendation-selection fields are protected from direct client writes in all maintained rule sets.

`confirmCampaignZoneIntelligence` acquires factual evidence through the maintained public-cache path for the **saved** Zone. It ignores caller-supplied evidence/geometry, then rechecks authorization, draft state, protected records and geometry inside a transaction before storing `zoneIntelligence`. Preview remains read-only. Save/retry and an explicit “Analyze current area evidence” action can establish current evidence without requesting Scale recommendations.

Existing material-review and funding/publication guards consume this authority. Quote economics, compensation, assignments, contracts, payouts and financial settings are unchanged. Pre-campaign amount calculation remains separate. Already-open campaigns and existing worker obligations are not converted back into editable drafts.

## Manual and Scale behavior

| Requested demand | Required Zones | Requested target per Zone |
| --- | ---: | ---: |
| 5 h | 1 | 5 h |
| 8 h | 2 | 4 h |
| 10 h | 2 | 5 h |
| 15 h | 3 | 5 h |

The table is demand allocation, not promised field time. For example, two synthetic evidence-backed Zones of 190 and 140 minutes show **10 hours requested / 2 Zones / 5 h 30 min supported**, with an insufficient-workload explanation. A five-hour campaign may have one valid 24-minute Zone while clearly reporting the shortfall; its alternatives do not automatically become extra required Zones.

- Starter/Growth: workload input and progress are available; draw/saved-area actions first save the workload. Users create the required practical areas manually. Factual analysis remains available without Scale/intelligence authority.
- Scale: PI ranks sections as before. Selection assembles at most the required number of distinct validated candidates, preferring the balanced target within a section; underlying feature counts, ranking scores, geometry, street evidence and advisory calculation are unchanged. Each selected candidate stays separate and ≤6 hours. The maintained 45 targets/hour, 80 m/min walking, doubled street length and 15-minute advisory floor remain untouched.
- Own-team plans retain their separate workflow; the Scaler-assignment completion gate applies to marketplace plans, not private own-team scheduling or exact-location workflows.
- Review summary separates requested workload, required Zones, valid saved Zones and supported minutes. Client display gating checks current geometry and the server’s readiness result; Continue rechecks the server. The server also blocks bypasses into material review/funding.

## Multipart re-entry and alternatives

Saved-area review loads the actual `campaignZones` documents even when campaign `serviceArea` is empty or the recommendation cache has expired. It renders each saved boundary and factual preview without starting another search. Fresh recommendations require the explicit refresh action and preserve the recorded search region.

While a retained run is valid, an alternate replaces the selected candidate slot. The Apply transaction preserves every other Zone document byte-for-byte and reuses the changed Zone’s document ID/ordinal. It keeps workload, goal and search context, refuses extra changes, checks protected records, and records the applied Zone IDs in the planning audit. Repeated Apply is idempotent. A workload change invalidates an older pending Apply. Expired or changed run/context fails closed; it does not silently requery.

Legacy drafts are **not migrated automatically**. They must explicitly set workload, renew missing/stale evidence and resolve extra/missing Zones. A historical five-hour/two-Zone draft is retained unchanged until its owner chooses one Zone or intentionally changes demand. Old installed native clients do not gain these new controls; the isolated client changes are for web review and later native reconciliation.

## Tests and build

- **92 Node unit/package tests:** exact/decimal boundaries, existing maximum, invalid values, requested balancing, shortfall, duplicate/stale/foreign/assigned Zones, closed/simple geometry, per-Zone limit, disconnected candidates, explicit one-slot alternatives, PI/source/model regressions and deployment-module parity.
- **42 Auth/Firestore emulator tests:** 38 planning/evidence/cache/rules tests plus 4 funding-entry tests. Positive manual owner flow, revoked/foreign/signed-out access, concurrent workload-version writes, audit receipt, stale geometry during acquisition, multipart re-entry, one-Zone replacement, idempotency, changed workload rejection, immutable other Zone and no payment/assignment artifacts. The final re-entry subset was rerun after audit/concurrency additions.
- **85 Flutter tests:** per-Zone facts/hierarchy, keyboard/touch expansion and collapse, narrow/2× layout, manual plan availability and save refusal, account capability boundaries, exact selection request, stale-review display gate, map/selection/navigation regressions and saved geometry behavior.
- Affected analyzer: **clean**. Local production-mode web release build: **passed**. Dependency locks unchanged.
- Five retained production financial-entry overlay packages: dependency/guard checks passed; **zero handler or configuration changes**. These package checks are separate from the 220 test total, and are not production financial operations.

## Proposed deployment scope — held for review

1. Rules: only the new server-owned workload/selection field protections.
2. `businessOperationsV1`: workload read/save operations and current-Zone material-review validation.
3. Recommendation functions: `getSmartZonePlan`, `applySmartZonePlan`; new `confirmCampaignZoneIntelligence` under the same authenticated Business campaign authority as factual previews.
4. Financial-entry **planning guard module only** for the retained `quoteCampaignFunding`, `createCampaignFundingCheckoutSession`, `publishFundedCampaign`, `getCampaignFundingState` and legacy `fundCampaign` packages. Keep each existing economic handler, environment, secret/IAM configuration and provider setting. No webhook, refund, transfer, payout or scheduler deployment.
5. Web Hosting: reviewed Zone presentation, workload progress, manual flow and multipart re-entry. No native merge/build from the frozen checkout.

`tools/sync_zone_workflow_package.cjs` synchronizes the reviewed local module closure. `tools/prepare_zone_workload_overlay.cjs` creates ignored offline funding review packages from hash-checked retained production packages. The older general funding generator has an unrelated stale Smart Zone source anchor; it is not the deployment route for this change. The narrow overlay avoids regenerating any economic handler. Before any approved deployment, compare retained baselines to current live revisions and reject drift rather than deploying stale packages.

No production data migration, evidence refresh, provider search, CI, financial transaction or deployment was performed. Founder review of this candidate is the next gate.

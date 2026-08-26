# Smart Mapping production baseline reconciliation

Status: **LOCAL PRODUCTION CANDIDATE — NOT DEPLOYED / NOT PUSHED**
Review date: 2026-08-26

## Source-of-truth baseline

`origin/real-completion-proof` remains at `9e4867518593cb1440117740f924e8edac86a711`, but that commit predates the runtime already deployed for P0 Batch 4. The reconciled baseline is the verified Batch 4 release lineage ending at `cb30e731b42d86b54fc9e29e5de569ada41124d9`; `d8c457d7bc0b246f560a315920fe98213217a740` is the clean deployment-source record and `cb30e73` adds the immutable production verification record.

The 2026-08-26 read-only inventory still matches that release record:

| Callable | Owner | Generation | Deployed hash | Runtime / region | Secrets |
|---|---|---:|---|---|---|
| `recordLegalConsent` | `legal-core` | `1787623273894744` | `150e2caf5ae7818bcd3e8ef8eb7d5224b3e03dbb` | Gen 2 Node.js 24 / `us-east1` | none |
| `getLegalConsentStatus` | `legal-core` | `1787623311681657` | `150e2caf5ae7818bcd3e8ef8eb7d5224b3e03dbb` | Gen 2 Node.js 24 / `us-east1` | none |
| `applyToCampaign` | `application-core` | `1787623273991503` | `e817636b1471cc062bd7c33c84046b642ba83d3f` | Gen 2 Node.js 24 / `us-east1` | none |
| `assignScalerToZone` | `assignment-core` | `1787623274321991` | `ffe593cbb20359891c51a21361254bbce1acb914` | Gen 2 Node.js 24 / `us-east1` | none |
| `acceptZoneGroupSlot` | `assignment-core` | `1787623322431459` | `ffe593cbb20359891c51a21361254bbce1acb914` | Gen 2 Node.js 24 / `us-east1` | none |
| `createCampaignFundingCheckoutSession` | `campaign-funding` | `1787623274460526` | `c2bdc89b113f1cae9bc78b62475d251c47fab8da` | Gen 2 Node.js 24 / `us-east1` | `STRIPE_LIVE_SECRET_KEY` |

Production Hosting remains release `1787623420310000`, version `c8811a396e5683bb`, with live `main.dart.js` SHA-256 `1D8A754B6390F86D8BE7C659685FCCB905D7663AEDDD871C5308482378CBBE9C`. The Batch 4 release record also preserves Firestore ruleset `08214668-9748-429f-b2c3-c8a319978634`, content SHA-256 `F3FC592EC48329CEC2E5E548467DCBC94949819CDF0814E883A09AC9FDCB905F`. It denies direct client creation of campaign applications. Storage Rules were not changed.

A current Flutter-toolchain rebuild of the historical source is semantically equivalent but not byte-identical to the 2026-08-25 artifact; the immutable release record and matching live Function/Rules metadata are therefore the authoritative historical artifact evidence.

## Curated change classification

- **A — already-live production baseline:** Batch 4 consent/legal runtime and records through `cb30e73`.
- **B — Smart Mapping promotion:** deterministic planning; product-contract reconciliation; validated public-map example; geographic shaping; optional known-area entry; discovery-owned resolver; six-hour workload bound; authoritative map; tight camera/collision-safe labels; stable Zone identity.
- **C — required Business trust:** worker/earning terminology and dead-control cleanup, canonical Campaigns/Results navigation, review-state derivation, truthful LIVE/BETA/COMING SOON presentation.
- **D — documentation only:** later audit, Founder-away, attorney packet, and architecture records are not runtime inputs to this promotion.
- **E — staging/test only:** Android staging configuration and QA fixtures are excluded.
- **F — deferred:** completion-core, payout-core, physical-device worker lifecycle, cash-out/Connect, agents, outreach, and attribution V1 are excluded.

## Preserved consent and funding order

`createCampaignFundingCheckoutSession` retains this fail-closed sequence:

1. authenticated, verified Business and owned draft campaign;
2. current Terms and Privacy consent (`LEGAL_CONSENT_REQUIRED` on failure);
3. every authoritative Zone has distinct non-zero geometry, complete analysis, positive homes, matching server digest, and no more than 360 worker minutes;
4. server quote and approved quote digest;
5. payment record and Stripe Checkout authority.

Therefore no payment record, Stripe customer, or Checkout Session is created when consent or Zone readiness fails. `quoteCampaignFunding` uses the same strict Zone readiness and server quote authority but intentionally performs no Stripe operation. Certification must not call live Stripe.

## Resolver same-ID migration

Production currently has one `resolveServiceAreaPlace` owned by `platform-core` (generation `1786963874954039`, hash `a5d4b7655b04c18e5efa00f14228778479ebb8a0`). The desired owner is `discovery-core`, alongside `getSmartZonePlan` and `applySmartZonePlan`. The ID and client contract remain unchanged; the discovery package has zero secrets and no Census, OpenAI, Stripe, or SMTP dependency.

Use Firebase source discovery for an in-place same-ID update. If the CLI proposes deletion/recreation, duplicate ownership, or meaningful downtime, stop before mutation. Rollback is the prior `platform-core` source hash above, never a second callable with the same ID.

## Exact proposed production manifest

No deployment is authorized by this document. A later approved deployment should target only:

- `functions:discovery-core:resolveServiceAreaPlace`
- `functions:discovery-core:getSmartZonePlan`
- `functions:discovery-core:applySmartZonePlan`
- `functions:campaign-funding:quoteCampaignFunding`
- `functions:campaign-funding:createCampaignFundingCheckoutSession`
- Hosting from the exact certified production build

Firestore Rules, Storage Rules, indexes, provider configuration, and all unrelated Functions remain unchanged.

## Rollout and verification

1. Run Firebase source discovery/dry-run for all five callables; confirm exactly one owner and no deletes outside the resolver ownership move.
2. Deploy additive planner/apply callables.
3. Migrate the stable resolver ID in place to `discovery-core`; verify ACTIVE, Gen 2, Node.js 24, `us-east1`, zero secrets, and exactly one owner.
4. Deploy both strict funding callables together. Verify Checkout keeps only `STRIPE_LIVE_SECRET_KEY`; quote keeps zero secrets.
5. Safely probe signed-out denial and authenticated read/plan behavior without live Stripe.
6. Deploy the exact Hosting bundle and verify its SHA on the Firebase origin and custom domain.
7. Run production Business smoke QA through search, plan, apply, quote boundary, canonical Zone identity, desktop/mobile maps, legal routes, and consent recovery. Do not fund a campaign solely for QA.

Rollback order is Hosting first, then both funding callables as one unit, then resolver/planner/apply if required. Restore Hosting to `c8811a396e5683bb`; restore funding to `quoteCampaignFunding` hash `d869a5431bff2129e8303f70348f9e23b89a4e22` and Checkout hash `c2bdc89b113f1cae9bc78b62475d251c47fab8da`; restore the resolver to the `platform-core` hash above. Never roll back legal-core, application-core, assignment consent, or Firestore application-create authority.

## Production branch repair

After production promotion is separately approved and verified, push the single reconciled candidate non-force to `real-completion-proof` and record the deployment result in a child release-record commit. That makes the runtime source lineage—Batch 4 plus the approved Smart Mapping release—the canonical production baseline. Future deployment policy should require: remote production HEAD match, clean exact candidate, immutable manifest with function generations/hashes and Hosting SHA, non-force push before deployment, and a post-deploy release-record commit. A deployment must stop if live runtime cannot be traced to the candidate.

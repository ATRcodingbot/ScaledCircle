# Social enforcement and inactive research pilot — September 20, 2026

## Production Social checkpoint

Deployed source: `044d94d5bb2e781d2ed526bad58bc42c1e1675fb`.
Authenticated Admin enrollment completed September 20 at 13:10:51.952 UTC.
Readback at 13:15:40 UTC confirms the ScaledCircle-only operating grant is active:

- Workspace `p1tigN2XE9ascVN4es3RBncw6nf1`.
- Policy `managed_social_7e3921a1ce6ad4339e08ff68aee79ec1d4c29d91946ab06118a6995a98a02e3d`.
- Grant `operating_c3a3bcc8dcf2476a975034d3ad00c53210dcf5d4`.
- $15 total; maximum 60 successful source concepts. Reviews and derivatives do not consume source units; billable reviews/rejections still consume money.
- Ends **2026-10-20 00:00:00 UTC / October 19, 2026, 8 PM America/New_York**.
- No renewal, monthly reset, top-up or policy extension.
- At readback: $0 spent, $0 reserved, $15 remaining; 0/60 concepts; zero current-policy scheduled jobs or publications.
- Saved categories: Business and Scaler roles, Business value, Product explanation.
- Existing planning buffer: six ideas/twelve platform versions; eighteen unused topics. A topic is not a ready or scheduled post.

The last saved preparation cycle preceded grant activation and still reports the old entitlement/cohort blockers. The next normal preparation visit reads the new grant and may resume only an old pre-grant request without a generation job. Generation, quality review, media attachment and scheduling still must succeed. No worker, paid generation, scheduling or publication was manually invoked for evidence. Historical publications and unresolved Instagram jobs remain separate. No verifier was recreated.

## Enforcement and deployment

All actual image-generation callers use the transactional reservation/claim/reconciliation store. Visual review shares its cost ledger. Provider calls occur outside database transactions. Dispatch is exactly once per attempt. Unknown outcomes retain money and do not blind-retry. Missing usage does not become a zero-cost success. Definitive no-charge evidence is required before release. Policy expiry/revocation is checked again at dispatch; late settlement remains possible.

Image requests are fixed to the authorized image snapshot, medium 1536×1024, one image, no input images, an 8 KiB prompt ceiling and no automatic provider retries; each reserves $0.50. Review inputs are bounded to 6 MB / 2048×2048, approved review models, 1,200 output tokens and no retries; each reserves $0.10. These conservative request envelopes, not average output-cost estimates, underlie the cap. An unknown call continues consuming its reservation until reconciled. No claim is made that an external provider can never change its pricing; configuration/rate changes require renewed cost-bound review.

Verified ACTIVE revisions:

| Function | Revision |
|---|---|
| runManagedSocialPreparationV1 | runmanagedsocialpreparationv1-00008-yen |
| prepareCustomerSocialPostV1 | preparecustomersocialpostv1-00025-yih |
| runManagedSocialVisualGenerationV1 | runmanagedsocialvisualgenerationv1-00003-mow |
| getGeneratedServiceVisualWorkspace | getgeneratedservicevisualworkspace-00006-jip |
| requestGeneratedServiceVisual | requestgeneratedservicevisual-00008-viq |
| processGeneratedServiceVisual | processgeneratedservicevisual-00009-zed |
| approveGeneratedServiceVisual | approvegeneratedservicevisual-00005-juh |
| rejectGeneratedServiceVisual | rejectgeneratedservicevisual-00005-gac |
| getGeneratedMediaOperations | getgeneratedmediaoperations-00004-rif |
| enrollCreativeOperatingGrantV1 | enrollcreativeoperatinggrantv1-00001-dah |

245 unrelated existing Functions unchanged. Existing application environment and secret bindings preserved. Hosting remains `77c805c14d14357d`; Rules remain `eabb947e-4e2b-41ca-a4e2-ef993e4dd3e8`. Enrollment adds only ScaledCircle to the existing cohort and creates its grant/audit; no billing or Wallet record is created.

Local evidence: `.firebase/launch-close-20260919/socialbudget-deployment-readback.json` and `socialbudget-enrollment-readback.json`.

## Attractive Remodel

Its paid preparation path was eligible and had historical visual-review calls outside the combined counters. The repaired paid entry points now fail closed with `historical_preparation_accounting_required` until those costs are reconciled into its existing allowance. This is not a reset or the ScaledCircle grant. Its saved publishing policy and comped subscription remain unchanged; ready-media scheduled publication is untouched. Unknown historical provider costs must not be fabricated as zero. Historical reconciliation remains an explicit blocker to new paid preparation for Attractive Remodel.

## Research prepared, NOT activated or deployed

The existing public discovery stage now accepts an optional budgeted search transport. Production constructors do not supply it. Fixture integration proves results enter maintained tenant qualification, CRM and draft-only authority; later cycles retain dedupe and suppression state. The adapter passes only service labels, saved service-area labels and enabled opportunity categories to search, never Gmail, private CRM conversations, credentials or financial data.

Public results require citations plus independently retrieved supporting service/geography evidence. They remain possible accounts/partner channels, not current jobs or inferred purchase intent. Sources are DNS-validated/pinned HTTPS with no redirects, private networks, authentication bypass or paid source access. Unavailable sources back off; search dimensions rotate. No government search is enabled. Backoff/cursor and evidence are tenant-scoped. Automatic outreach stays off.

Separate `researchOperatingGrants`, `researchOperatingReservations`, `researchOperatingUsage` reuse the shared reservation-transition primitive. One central ledger must cover both projects; do not create independent $5 grants. Reserve/claim/settle, unknown holds, expiry and two calls per workspace/day are fixture-tested. No production research grant exists.

### Proposed one-time pilot, awaiting Founder approval

- $5 TOTAL, seven days from activation, no renewal/top-up. Record exact start/end only upon activation.
- Attractive Remodel: production `scaled-circle/IqRjZYHKOzXYuJcSyL68LYNwtDg1`.
- ScaledCircle internal Growth namespace: `scaledcircle-staging/FF1bfDuvtdNjuuC4mc7NdGtk3LC3`; distinct from its production Social owner.
- Existing maintained provider identity; model `gpt-4.1-mini`, Responses `web_search` (non-preview), low search context, one tool call/request, max 1,200 output tokens, no automatic retries.
- Rates: model $0.40/M input and $1.60/M output; search $10/1,000 calls; non-preview search on this model has an 8,000-input-token search-content block per call.
- Reserve $0.10/request; at most two requests/workspace/day = $0.20/cycle. Four requests/day across both workspaces, 28 requests in seven days, at most $2.80 reserved under these initial limits; the $5 overall cap remains independent. No extra calls or retries are implied by unused funds.
- Illustrative 1,000 model-input + 100 output + 8,000 search-content tokens: $0.01376/request, about $0.38528 for 28. This is not a quote or lead guarantee. Conservative accounting retains an extra search-content block if provider usage aggregation is ambiguous, labeled as conservative rather than a final invoice charge.
- No additional paid provider dependency. DNS/public-source retrieval uses existing infrastructure. Provider project access and the cross-project central-ledger runtime identity binding must be verified before activation; do not broaden IAM silently or spend to test availability.
- Local non-billable model-catalog attempt could not obtain the existing runtime identity (`google_metadata_unavailable`); no paid API call was made. Documented compatibility is established; runtime tool access remains unproved. First paid access verification, if needed, belongs inside the approved pilot.
- Measure attempted/completed searches, qualified new candidates, duplicates/suppressions, unavailable sources, conservative accounted usage and provider-reconciled actual cost separately. Zero results remain zero results.

Official references: [model rates](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [web search compatibility](https://developers.openai.com/api/docs/guides/tools-web-search), [tool pricing](https://developers.openai.com/api/docs/pricing).

## Validation and release impact

Social focused suites: 52 passing generation/storage/adapter/review tests; 38 passing affected storage/paid/foundation/worker/supply tests (overlapping suites, not additive), plus two grant enrollment tests. Research/customer focused suite: 36 passing; an additional real-persistence fixture covers public discovery → CRM → later-cycle dedupe/suppression, with no outreach. Eleven adapter/budget cases rerun after final bounds changes, all passing. No paid providers were used by tests.

Server-only source changes; no Flutter delta introduced here and no native build. Research source is prepared and intentionally inactive/undeployed pending the budget/access step. Natural Social scheduling/publication proof remains open. Useful fresh research discovery remains NOT YET VERIFIED despite the previously accepted recurring-execution PASS. Do not reopen completed Google, Stripe, mapping or billing work.

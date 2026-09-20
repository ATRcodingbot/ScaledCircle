# Budget enforcement implementation checkpoint — not deployment approval evidence

## Implemented and tested locally

`functions/generation_budget_store.js` extends the maintained `visualGenerationReservations` / `visualGenerationUsage` storage with transactionally checked reservations and an optional explicit `visualGenerationGrants/{businessUid}` operating grant. It is not a billing subscription or Wallet ledger.

The storage transaction reads config, entitlement, cohort, grant, current publishing policy and usage before writing. Grant usage is keyed by immutable grant ID, not calendar month. Monetary accounting uses safe integer USD microdollars. Source-concept holds, successful concepts and spend are distinct. Review reservations consume money without another concept. Dispatch can be claimed once; revocation/expiry between reservation and dispatch blocks the claim. Uncertain outcomes retain reservations. Missing actual cost cannot settle as zero. Final outcomes may reconcile after expiry. Existing normal plan rollout remains supported without inheritance of another tenant's grant.

Validation: local Firestore project `demo-generation-budget`; 7 new emulator tests plus existing generation budget/foundation tests, **32 passed total**. Separately 5 customer-discovery tests pass. No provider calls occur in these tests.

## Incomplete — do not activate enrollment

This is a tested storage implementation, **not an end-to-end repaired production path**. Remaining work:

1. Replace live image reservation callbacks with this storage authority, retaining compatibility for existing reservation records.
2. Wire visual review and each paid attempt into the same authority, with stable attempt identity and dispatch claims. Remove implicit paid retries that do not have their own reservation.
3. Finish bounded request/cost validation and usage reconciliation. The existing `.165` image reservation is not sufficient proof for arbitrary prompt/review/retry costs. Official image documentation describes estimates excluding input tokens; it must not be presented as a hard combined cost guarantee.
4. Add adapter-level integration tests proving no unreserved call, no dispatch replay after crash, and retained holds on missing provider usage. The current storage tests do not prove those call-site properties.
5. Only then deploy the bounded caller set and enroll the already-approved exact ScaledCircle workspace through maintained server authority; read back the grant/cohort/policy/usage.

The approved budget remains USD 15 total / 60 successful concepts through **2026-10-20T00:00:00Z (October 19, 8 PM EDT)**. No reapproval of those limits is needed. No grant/cohort/config mutation or paid call was made. Last readback: generation spend $0, reserved $0, successful concepts 0, current-strategy jobs 0. Categories are ready. Natural scheduling/publication proof stays open.

Shared exposure: the deployed pre-transaction budget check and separately unpriced visual reviews also apply to Attractive Remodel's current paths. Its configuration was not changed; that does **not** mean its runtime enforcement is unaffected by the diagnosed defects. Do not claim global enforcement is repaired before integration/deployment.

## Research dependency checkpoint

No runtime search-provider client/configuration integration was found in the maintained `functions`, `functions-agentic-growth`, `functions-social-operations` or `functions-creative-media` JavaScript. The existing Lead Generator fetches its maintained known URL catalog and optionally parses government bids. Agent-session browsing tools are not an unattended production dependency or research spending authorization.

Consequently, fresh non-government discovery is **not implemented**, and general-sale readiness remains unresolved. Existing recurrence is proven, fresh discovery is not. No preference, suppression, government opt-in, source or paid provider was changed. The denied county source was not repeatedly retried or bypassed.

One concrete implementation option, requiring separate access/cost authorization: integrate OpenAI Responses web search into the existing discovery stage, with server-selected service-area/topic queries, persistent query rotation, bounded results and fetches, per-source backoff, citation/observed-date preservation, deterministic tenant/source dedupe and existing suppression/qualification/CRM pipeline. Use the existing production OpenAI identity only after its search/model access is verified; image-model access does not establish search permission. Research must have its own explicit cost authority. Current published search fee is **$10 per 1,000 calls plus model/search-content tokens**; at two calls per daily cycle, 30 days means $0.60 search-call fees plus tokens, not a total budget guarantee. Do not enable it or use the Social $15 grant without separate research authorization. A sourced website remains a target account or partner unless evidence establishes an active service request.

Sources inspected September 20, 2026:
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/models/gpt-image-2
- https://developers.openai.com/api/docs/pricing

No deployment or native rebuild at this checkpoint. No new verifier. Google, Stripe, billing, mapping and Admin remained untouched.

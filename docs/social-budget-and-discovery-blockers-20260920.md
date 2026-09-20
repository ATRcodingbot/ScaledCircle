# ScaledCircle bounded creative budget and discovery readback

Read-only production evidence: September 20, 2026, 12:15–12:20 UTC.

## Founder authorization accepted; enrollment NOT activated

Exact workspace: `p1tigN2XE9ascVN4es3RBncw6nf1`. Publishing policy: `managed_social_7e3921a1ce6ad4339e08ff68aee79ec1d4c29d91946ab06118a6995a98a02e3d`.

Founder authorized at most USD 15 combined generation/review spend and 60 successful source concepts, existing image snapshot `gpt-image-2-2026-04-21` and maintained visual-review models. This is operating spend, not subscription revenue or Wallet funding. No renewal, reset, top-up or extension. Policy expires **2026-10-20 00:00:00 UTC / October 19, 2026, 8:00 PM EDT**.

No production grant, cohort change, paid generation, scheduling or publication was performed. The existing accounting cannot yet enforce the approved combined limit:

- `functions-creative-media/generation_budget.js` checks current allowance before `writeReservation`; the reservation transaction does not atomically recheck shared usage. Distinct concurrent jobs can reserve against the same previously available balance.
- Usage is monthly/daily, not a nonrenewing policy-term allowance with a lifetime successful-concept ceiling.
- Visual reviews use separate attempt counters rather than dollar reservations/reconciliation against the same budget.
- Image retries share a request reservation; per-attempt billable/unknown outcomes are not all reconciled to the proposed combined grant.
- The configured image reservation estimate is not sufficient evidence of a hard maximum for all covered paid work.

Required bounded repair remains inside the existing accounting: policy-bound internal grant, transactionally checked common reservations, conservative bounded per-call costs including review/retries, actual reconciliation with unresolved costs retained as reserved, and lifetime concept counting independent of derivatives/month changes. Do not activate enrollment before focused concurrency, expiry, retry/rejection and review-budget tests establish enforcement. Founder need not reapprove the same approved limits.

At 12:18:57 UTC the workspace had zero visual-generation jobs and zero generation reservations: recorded generation spend/reserved **$0/$0**, successful concepts **0**. The authorized $15/60 is pending enforceable enrollment, not an active spendable balance.

## Normal Social worker evidence

The 12:10 UTC preparation cycle completed normally and persisted all three strategy-authorized categories: Product explanation, Business value, Business and Scaler roles. Policy and Attractive Remodel configuration remained unchanged. Six ideas/twelve platform versions form the initial buffer; eighteen unused semantic topics remain available to the rolling planner. No eligible approved reusable asset library exists; historical restored media is not newly reusable authority.

Current-strategy scheduled jobs: **0**. A naturally queued creative request is Needs Attention; paid preparation remains blocked by enrollment/accounting. Next observed preparation schedule was 12:25 UTC. That is a worker visit, not a scheduled post or publication. Facebook/Instagram remain five/week initially, adaptive; X excluded. Autonomous publication proof remains OPEN. No manual worker invocation. No verifier recreated.

Private readbacks: `.firebase/launch-close-20260919/social-creative-ready-final-read.cjs` output and `bounded-budget-research-readback.private.json`.

## Attractive Remodel research limitation

Accepted two-cycle result: **Recurring execution PASS; useful fresh discovery NOT YET VERIFIED**. Existing evidence `research-two-cycle-completion-20260920.json` records genuine September 19 and 20 scheduled runs, each zero new prospects, six dedupe exclusions, one unavailable source, cleared leases and no automatic outreach.

The maintained customer catalog contains eight static organization channels. Production matching shows:

- Existing, deduped: ACDS; AAWDC; AACC; Baltimore City One-Stop; PMI Baltimore; Aspen Property Management.
- Healthy Neighborhoods: existing but excluded before dedupe by active contact suppression. Preserve it.
- Baltimore County Business Services: no saved prospect; the latest saved observation is UNAVAILABLE. A separate read-only request using the maintained research User-Agent and redirect policy returned **HTTP 403** on September 20. Saved run diagnostics do not retain the original HTTP status, so this does not prove the earlier runs had the identical response.

The sole dynamic hub in `customer_discovery.js` discovers government bids. Production preferences omit overrides and normalize to government=false; it correctly does not fetch that hub. There is no enabled dynamic non-government discovery path. Re-running the same catalog cannot produce a continuing stream of fresh candidates; source recovery could yield at most the one remaining organization, not verified buying intent. Do not defeat suppression/dedupe, enable government or add paid providers to mask this limitation.

Focused test: `node --test functions/customer_discovery.test.js` — **5 passed**, including government exclusion even with a valid matching geography and potential bid content. No production code/config deployment; source change is regression coverage plus this ledger only. Existing provider/suppression/preferences, memberships, financial records and outbound messaging remain untouched.

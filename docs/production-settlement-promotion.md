# Held production settlement candidate

This candidate rebases the reviewed production migration onto the newer saved-work and reserve-return implementation. It does not authorize deployment, provider execution, or changes to historical assignments.

## Preserved authority

Production uses `CanvassingRoute80_95V1` only for new, mapped, explicitly accepted contracts. The native location bridges, accepted-point validation, tolerant coverage algorithm, 80/95 eligibility thresholds, and historical contract dispatch remain intact. The production mapper and denominator authority are reused. Completed physical evidence remains valid for the exercised continuous-tracking lifecycle. Intentional pause/resume is a distinct, newly introduced branch; its targeted device sanity check does not require repeating an already completed walk.

`publishFundedCampaign` retains the deployed valid-zone filtering predicate. Its coordinated replacement also validates the signed funded offer and immutable route. The deployed revision stays in place until an explicit promotion; neither the staging all-valid-zones implementation nor a blanket Functions deployment is appropriate.

## Saved work and settlement

The production adapters require the exact production environment, intact accepted contract digest, assigned Scaler and Business identity, authoritative route binding, and signed LIVE-mode funding for that offer. Local integration tests use emulator-only projects and injected provider objects; they never call Stripe.

Intentional pause preserves the same tracking session and accepted evidence for a 24-hour resume window. Expiry requests review and does not pay or refund automatically. Secured base compensation cannot be reduced. Below the ordinary threshold, an exact partial offer requires the intended Scaler's explicit acceptance. Technical uncertainty holds settlement.

Funding and settlement round the 20% fee at the same assignment boundary. A campaign with several separately settled zones reserves the sum of each assignment's rounded fee. This prevents aggregate-versus-assignment rounding from stranding cents or blocking the final worker's payment. Historical funding and contracts are not recalculated.

For an accepted $15 base plus $3 potential bonus:

| Earned worker pay | Earned fee | Business return | Final cost |
|---|---|---|---|
| $15 | $3 | $3.60 | $18 |
| $18 | $3.60 | $0 | $21.60 |

One transaction binds settlement, earning, Wallet entry, earned fee, and any unused-reserve refund operation. It protects already allocated worker compensation. A refund uses the original provider payment, stable idempotency, known-ID recovery, and reconciliation before retry. An unknown create outcome holds; pending is not returned money. A late provider failure restores the Business return liability without recognizing it as revenue or blindly creating another refund.

`UNUSED_WORK_REFUNDS_ENABLED=false` is sealed into the held candidate. Changing it is a separate provider-execution decision. Turning prospective campaign creation off must not erase accepted obligations or disable known-refund reconciliation.

## Client and privacy migration

Current clients use coarse discovery and assignment-scoped logistics. Old raw-source queries are denied by the restrictive Rules; old Job Room callers receive an update-required error. An intended Scaler retains assignment logistics during a resumable pause, while incomplete review and terminal work use a sanitized evidence response. Expired, unrelated, and unassigned users cannot recover private logistics through the new response.

Job Room adds saved-work actions and an explicit settlement preview/actual result. Production canvassing presents Pause & Finish Later only for the supported versioned policy. The acceptance dialog discloses the resume window and partial-offer rules. No residential-photo or mandatory progress-marker requirement is added.

Postcard fulfillment remains a separate staging release. Its new callables, renderer changes, QA helpers, identities, and TEST contracts are excluded from this production package. The prior production material renderer is retained explicitly.

## Promotion and rollback

Use the private sealed manifest and exact Function selectors, never a whole-project deploy. Recheck live revisions and source update-times immediately before promotion. Stage the coarse-discovery infrastructure and revision-bound seed, matching clients/Job Room, restrictive Rules, legacy guards, then the exact mapping, assignment, tracking, completion, and funding candidates in one controlled migration window. Keep new contracts disabled until dependencies, client compatibility, subscription price bindings, and the provider activation decision are verified.

Rollback keeps restrictive privacy and accepted-policy settlement. Disable new contracts first; do not restore a revision that reopens logistics or reinterprets work already accepted under the new policy. Preserve ledger and provider receipts; repair forward where new obligations depend on the candidate.

Production promotion, legitimate LIVE payment smoke, provider activation, store release, and final Founder go/no-go remain separate gates. Store candidate numbers are not reserved by artifact creation and must be checked again before any upload.

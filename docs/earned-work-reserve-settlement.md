# Earned-work reserve settlement — staging release

The accepted immutable worker contract is the maximum worker reserve. Ordinary
canvassing eligibility retains the full-base 80% and accepted-bonus 95% policy.
Route Coverage Estimate is not household coverage.

At review, the server allocates approved worker compensation and its 20% platform
fee. The unused worker reserve and associated fee remain owed to the Business.
For a $15 base and $3 accepted bonus, $21.60 is funded. Base-only approval yields
$15 worker pay, $3 fee and a $3.60 return; base plus bonus yields $18 worker pay,
$3.60 fee and no return. Explicitly accepted partial work follows the same cent
arithmetic. Unused reserves are never recognized as platform revenue.

`EarnedWorkReserveReturnV1` atomically creates one settlement, earning/Wallet
projection and deterministic refund operation. The refund executes against the
original verified TEST PaymentIntent with a stable idempotency key. Ambiguous
creates hold and reconcile by provider identity; they are not blindly retried.
Pending refunds are not represented as returned money. Successful reconciliation
releases the reserve and records the receipt in the same transaction. A later
provider failure restores the Business return obligation and requires review.
Recognized partial reserve refunds do not cancel or freeze the funded campaign.

`IntentionalWorkPause24hV1` synchronizes accepted evidence and intentionally pauses
native acquisition. It preserves the same tracking session, immutable segment
history, assignment and compensation. Resume uses the maintained tracking entry
point and a server-held 24-hour deadline. Expiry requests review without money.
Backgrounding or locking the screen does not invoke intentional pause.

At 80% or more, the Business can accept saved work at the full eligible base.
Below 80%, an exact partial offer requires an amount, reason and explicit
acceptance by the assigned Scaler. No response, rejection or expiry pays nothing
automatically. Changed evidence/contracts and technical uncertainty fail closed.

This implementation is restricted to `scaledcircle-staging`, TEST funding and
server-authoritative review. It does not approve existing submissions, fabricate
physical evidence, execute a LIVE refund or enable production promotion.

Coverage is exercised in `campaign_reserve_settlement.test.js`,
`paused_work_backend.test.js`, `canvassing_completion_backend.test.js`, tracking
and Rules integration tests, and the Flutter paused-work/review widget tests.
Provider interaction is injected in local integration tests. A real provider
refund remains a separate observation after an authorized Business approval.

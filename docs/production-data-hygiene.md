# Production data hygiene

**No new fake production accounts or campaigns.** Use `scaledcircle-staging` for
synthetic accounts, route fixtures, payout tests and destructive lifecycle testing.
Production verification is read-only, legitimate Founder/customer dogfood, or an
explicitly authorized real economic certification.

A name containing “test” is a candidate for review, never an automatic signup ban
or deletion rule. The staging physical-fixture creator must continue to reject
every project other than `scaledcircle-staging`.

`tools/production_hygiene_admin.cjs` provides a bounded operator-only Firebase
Admin service. It has no deployed endpoint and no client write path. It requires
an authenticated Google IAM administrator, an explicit production project, a
private reviewed synthetic inventory, protected identities, complete read-only
LIVE provider inventory and the exact fresh preview seal before execution.
Keep customer identities and the review manifest outside the public repository.

The current narrow implementation removes only independently reviewed identities
with no references other than an ordinary profile and unaccepted synthetic
applications, and unfunded synthetic draft/open campaigns with a closed set of
unassigned references. An explicitly reviewed `delete_verified_empty` disposition
also permits an empty root Business Wallet: its exact owner must match, all six
known balance fields must be zero, and no unknown metadata or nested record may
exist. Email-only references also block account deletion. Otherwise, Wallets, consent,
financial records, subscriptions, provider connections, accepted work and shared
records are never cleanup write targets. Terminal financial history needs a
separately reviewed archive action; this utility does not reinterpret it.

The separate draft-archive path can retain an unstarted synthetic draft and its
assets/payment history while removing it from active presentation. It rejects
funded, assigned or completed work and unknown relationships. Any provider-bound
draft requires an exact expired, unpaid Checkout match. It cannot refund money,
alter a payment record, or archive an unresolved worker obligation.

A separately reviewed legacy-visibility action can use the existing archived
campaign state to withdraw exactly one synthetic open opportunity. It requires
explicit preservation of outstanding obligations, unchanged source/reference
versions and no active tracking. It changes only campaign visibility/lifecycle
archive fields and writes an audit event. Accepted applications, zones, reserves,
payments and worker obligations remain unchanged and unresolved; archival is not
cancellation or settlement. Existing discovery projection authority processes the
archive. No direct projection write or new retention model is introduced.

For explicitly reviewed synthetic identities whose history must remain, the
existing Auth quiescence operation can disable login and revoke refresh tokens
without continuing to deletion. Preserve profile, work and economic records;
record the operator and exact identities in the private review and Admin audit.
Verify that maintained role/market eligibility prevents new work and job alerts;
Auth disablement alone must not be described as resolving historical obligations.

Execution disables the selected synthetic Auth identities, revokes their refresh
tokens, repeats the inventory and provider checks, and transactionally deletes
only the reviewed Firestore records with an authoritative audit event. It then
deletes those Auth identities and checks references again. A failure is a HOLD,
not success; disabled accounts remain quiescent. After the Firestore commit,
repeating the same reviewed seal resumes only its recorded Auth tail. A completed
seal cannot delete again. Audit records remain under the maintained retention
policy; no new retention period is introduced.

Keep the before/after inventory, provider readback and review seal privately.
Report account and campaign holds explicitly. Do not declare a clean launch
marketplace while synthetic opportunities remain available. Separately report
preserved accepted-work and economic holds even when public visibility is clean.

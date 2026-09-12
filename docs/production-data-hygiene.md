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
unassigned references. Anything else is held. In particular, Wallets, consent,
financial records, subscriptions, provider connections, accepted work and shared
records are never cleanup write targets. Terminal financial history needs a
separately reviewed archive action; this utility does not reinterpret it.

The separate draft-archive path can retain an unstarted synthetic draft and its
assets/payment history while removing it from active presentation. It rejects
funded, assigned or completed work and unknown relationships. Any provider-bound
draft requires an exact expired, unpaid Checkout match. It cannot refund money,
alter a payment record, or archive an unresolved worker obligation.

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
marketplace while unresolved synthetic available or accepted work remains.

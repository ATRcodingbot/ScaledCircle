# Staging account closure and TEST reversal

The dedicated `staging-payment-certification` codebase now includes a customer
account-deletion callable and an idempotent recovery trigger. They fail closed
outside staging and are absent from production deployment manifests.

The customer opens Account → Delete Account, reviews unresolved obligations,
types DELETE and authenticates again. The server independently checks recent
authentication and revocation. A durable intent removes active authority before
Auth deletion; retries finish cleanup after a lost response. Firestore and
Storage deny a closing UID even when its old JWT has not expired.

Final Business owners must transfer ownership or close the Business first.
Ordinary members leave their team without deleting its workspace or action
history. Unresolved Wallet, work, referral or connected-payout obligations hold
deletion. Original compensation, Wallet transactions, referral journals,
completed work, consent and audit evidence remain retained. Uploaded work proof
remains part of that evidence. Active personal preferences and login data are
removed; the retained user tombstone carries no email or contact information.

The isolated TEST certification can append one negative earning adjustment to
its original positive earning. It never edits the original entry or accepted
compensation. Its transfer lifecycle causes the existing referral authorities
to append a reversal and negative liability adjustment. This is TEST ledger
cleanup, not a provider refund or cash-out. No worker deduction funds referrals.

Validation covers replay/concurrency, spent or pending balances, production
denial, deletion confirmation/recent auth, owner safety, member revocation,
retained history, stale JWT reads, private Storage access and recovery after
an Auth failure. Hosted deletion, invitation email delivery, new-account
verification and real membership must be recorded separately from local tests.

# Production Scaler cash-out

This isolated codebase adapts the maintained cash-out state machine to approved
production work. Canonical sources are in `functions/scaler_cashout_*.js` and
`functions/live_work_certification*.js`; run
`node functions/scripts/prepare_live_cashout.js` after changing them.

Production requires `APP_ENV=production`, project `scaled-circle`, the maintained
LIVE Stripe key and exact platform identity. The TEST balance store and fixture
creators are not included. All financial mutations are server-only; existing
deployed privacy Rules deny client writes to the financial records.

Available money must reconcile to the immutable accepted compensation, approved
completion, funded campaign payment, reserve settlement and matching Wallet
ledger entries. A transaction reserves the amount before Stripe execution.
Deterministic operation IDs and provider keys prevent duplicate movement.
Unknown provider outcomes remain reserved and are observed without blind
creation retries. A late bank failure restores the same pending obligation.

The temporary physical-task permit is supplied privately at deployment. It
binds one owner, Scaler, campaign, task, expiry and exact $3/$0.60 contract. It
does not activate general paid work. The owner must select an authorized
location; the intended Scaler must apply, accept and submit real before/after
photos; the owner must approve. Settlement uses `campaign_reserve_settlement`.
No GPS session is invented for this task. Expiry blocks new funding but does not
erase an existing funded obligation.

`tools/prepare_live_cashout_promotion.py` checks the retained production funding
archive before adding its narrow funding exception. Private configuration,
credentials, production identities and release readbacks remain under ignored
`.firebase/` paths. Never deploy a generated monolith or the repository's older
Rules as part of this overlay.

## Verification

Run the cash-out, task and financial unit tests; the LIVE and maintained TEST
emulator suites; and `scaler_cashout_live_rules.test.js` with
`CASHOUT_PRODUCTION_RULES` pointing at a fresh copy of deployed Rules. Run Flutter
cash-out/Wallet/private-task widget tests and the analyzer. Software tests are
not evidence that a LIVE bank payout occurred. That requires attended real work,
Business approval and provider reconciliation.

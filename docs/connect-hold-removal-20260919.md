# LIVE Connect obsolete application hold removed — September 19, 2026

Founder authorized removal after LIVE Dashboard showed Connect setup complete and enabled creation controls. The original production secret still authenticates; no credential replacement is required.

## Exact repair

Removed only SCALEDCIRCLE_CONNECT_SETUP_BLOCKED_REASON=platform_activation_required from serviceConfig.environmentVariables on setupScalerPayoutsV1 and getScalerCashoutV1. No readiness value was hardcoded. Future setup uses the maintained Stripe Accounts v2 request and provider rejection handling. Historical failure evidence and original idempotency binding remain intact. Do not redeploy the old historical blocked environment snapshot over this correction.

Google performed a rebuild during the configuration patch. Verified identical before/after source ZIP SHA-256 for each function, unchanged build settings except build identity/source object generation, unchanged secret bindings and unchanged other service settings.

- setupScalerPayoutsV1: setupscalerpayoutsv1-00003-bof
- getScalerCashoutV1: getscalercashoutv1-00003-kez
- Other 252 Functions: revisions and environment unchanged.

No Rules, Hosting, Scheduler, subscription, marketplace or paid-work hold updates were requested. No connected account, onboarding link, identity/bank entry, job, earning or payout was created by the agent.

## Focused regression

62 payout/Connect/backend/Rules/packaging tests passed. New regression starts with the historical platform rejection and a zero Wallet, removes the environment override, resumes the same deterministic setup, binds one mocked recipient across retries, and still denies withdrawal. Existing tests cover provider/UID mismatch, concurrent attempts, incomplete linked onboarding, lost responses, readiness restrictions, failure/reversal, financial provenance and tenant isolation. Tests use emulators/mocked Stripe only.

## Production readback

At 18:58 UTC, both setup overrides are absent. Existing secret authenticates to LIVE acct_1U328bI9d5xWNArH. Accounts v2 listing remains empty. skotiatrades has no bound account. Wallet, binding and audited financial collection hashes equal the preceding baseline. Paid-work restriction remains unchanged.

The existing UI preserves setup/retry/incomplete/ready/error handling. There is no newly created account from which to certify actual verification-pending or requirements state. Provider creation and hosted onboarding remain the next genuine Founder evidence, not claimed completed by deployment.

## Founder test

Sign in to production as skotiatrades@gmail.com → Earnings → refresh → Set up payouts (or Try payout setup again for the preserved prior failure) → complete Stripe-hosted onboarding with genuine information → return → refresh payout status. Stripe owns identity/bank collection. Expect exactly one maintained LIVE recipient and either provider-ready or truthful incomplete/requirements state. Do not withdraw; genuine earning/cash-out certification remains separate.

Private deployment operations and immutable baselines: .firebase/connect-recheck-20260919/hold-removal-*. Source changes for this repair are regression/documentation only.

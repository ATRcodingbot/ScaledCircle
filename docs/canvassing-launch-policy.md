# Provisional canvassing launch policy: 80% base / 95% bonus

Status: staged implementation for Founder review. Production deployment, native builds and new physical fixtures are separately controlled. Policy version: `StagingCanvassingLaunch80_95V1`.

- Below 80.00% reliable authoritative Route Coverage Estimate: Continue Route; ordinary completion is not eligible.
- At least 80.00%: full accepted immutable base, only with a valid assignment, completed authoritative finalization, intact evidence and no disqualifying hold. Never linear base proration.
- At least 95.00%: the separately defined, accepted contract bonus is eligible. No bonus amount is invented or retroactively added. A zero accepted bonus remains zero; technical uncertainty never earns bonus. Aim for 100%.
- This is unique route-proximity coverage, not household coverage, both-side service or permission to enter private property. No distance-derived household counts.
- GPS runs automatically while the authoritative session is active. Manual progress marks are optional and give no extra credit.
- Documented access issues use review; self-reporting does not alter the denominator or grant credit. No new automatic exclusion authority is introduced.
- Authoritative processing/finalization inconsistency with captured evidence leads to Technical Review Required. Base is protected and held, not denied, reduced or automatically paid. Resolution needs trusted review; the normal approval action cannot bypass it.
- Historical submissions without the new policy receipt remain held. Read-only replay never rewrites their evidence or creates economic effects.

## Evidence and approval

Submission stores policy version, accepted base/bonus, route/corridor hashes, session identity, finalization digest and accepted-evidence hash. Business approval re-reads the finalized session, chunks, assignment contract and funding. Changed evidence/contracts, unresolved exceptions, unavailable funding or old receipts fail closed. Existing deterministic ledger IDs and transaction semantics preserve exactly-once earning effects. Business cannot arbitrarily reduce accepted base or override the bonus threshold.

Both parties see coverage meaning, automatic GPS evidence, dates, accepted base, eligibility, bonus status and exact held payable amount before review. Incomplete work uses Continue Route. Access/technical review is explicitly distinct from ordinary completion.

## Reproducible staging package

`node functions/scripts/build_canvassing_staging_candidate.js`

This deterministic source-only command builds four export-limited packages under ignored `.firebase/canvassing-policy-candidate`, and hashes every packaged file in `manifest.json`:

- getTrackingSessionState
- getJobRoom
- submitZoneCompletion
- finalizeZoneReview

It does not deploy, read credentials or create records. It uses the same dependency selector as the maintained general codebase generator. The candidate does not need unrelated subscription, email or provider secrets. Re-running with the same source must produce the same manifest. Existing generated packages outside the affected codebases remain outside this change; do not reconcile shared/deployed production drift through this release.

## Verification

Run full backend and Flutter regression, local privacy/Rules/compensation emulator tests, boundary and off-route cases, analyzer, generated export checks, and exact-package emulator smoke tests. Generated fixtures are synthetic loopback data only. No physical certification is inferred from source tests. Private GPS, credentials and operational reports stay excluded from Git.

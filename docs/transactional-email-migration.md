# Transactional email migration runbook

This migration replaces default `sendOutboundEmailJob` with isolated
`sendTransactionalEmailJob`. A short overlap is intentional and safe because
both workers atomically claim the same durable queue record before sending.

## Preconditions

- Certify the candidate and generated `functions-transactional-email` package.
- Verify it exports exactly `sendTransactionalEmailJob`,
  `finalizePublicAccountSignup`, and `resendEmailVerification`.
- Verify its only secret binding is `SUPPORT_EMAIL_SMTP_PASSWORD`.
- Record the current default worker generation, region, and queue backlog.
- Do not deploy `functions:default`.

## Approved-transition commands (do not run without release approval)

1. Deploy the isolated worker while the legacy worker is still active:

   `npx.cmd --yes firebase-tools@15.25.1 deploy --only functions:transactional-email:sendTransactionalEmailJob --project scaled-circle`

2. Confirm it is ACTIVE and both workers use the atomic `queued` claim.

3. Delete only the deployed legacy worker:

   `npx.cmd --yes firebase-tools@15.25.1 functions:delete sendOutboundEmailJob --region us-east1 --project scaled-circle --force`

4. Confirm the replacement remains ACTIVE, Gen 2, Node.js 24, codebase
   `transactional-email`, with only `SUPPORT_EMAIL_SMTP_PASSWORD` bound.

5. Deploy the two callables only after worker health is confirmed:

   `npx.cmd --yes firebase-tools@15.25.1 deploy --only functions:transactional-email:finalizePublicAccountSignup,functions:transactional-email:resendEmailVerification --project scaled-circle`

6. Deploy certified Hosting last.

`outboundEmailJobs` is durable Firestore state. During overlap, both triggers may
receive a create event, but the Firestore transaction permits only one to change
`queued` to `sending`; the loser observes `sending` and exits. There is no
no-worker interval and no replay assumption.

The generator excludes all three transactional-email exports from
`functions-legacy`. Architecture tests fail if a future generated default
package regains them. Bulk default deployment remains prohibited.

Historical pending-account onboarding is a separate, approval-gated operation.
Use deterministic `pending-scaler-onboarding_<uid>_v1` jobs, send only to the
reviewed unverified/pending/profile-incomplete cohort, and never call it
"Welcome". No cohort job is produced by this release.

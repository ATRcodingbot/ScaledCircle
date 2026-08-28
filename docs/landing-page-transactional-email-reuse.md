# Landing Page transactional email reuse

Status: local implementation only. No IAM, secret, deployment, or email action in this change.

## Canonical delivery contract

Landing Page email uses the maintained `outboundEmailJobs` queue and the `transactional-email` codebase. It does not introduce a second queue or provider.

Supported Landing Page templates are exactly:

- `landing_page_business_inquiry`
- `landing_page_customer_confirmation`

Jobs contain a validated recipient and structured template payload. Public requests cannot provide From, CC, BCC, Reply-To, subject, HTML, headers, SMTP settings, Business identity, or recipient. The worker renders subject, text, and mobile-safe HTML itself. Existing signup, support, and verification templates remain supported.

The Business recipient is resolved exclusively as:

`Landing Page businessUid -> Firebase Admin Auth getUser(uid) -> emailVerified == true -> valid Auth email`

Failure to resolve that identity does not invalidate the lead or in-app notification. It records email delivery as unavailable until an authorized reconciliation can repair it.

## SMTP configuration

- Provider adapter: Nodemailer `service: gmail`
- SMTP identity: `support@scaledcircle.com`
- Visible sender: `ScaledCircle Support <support@scaledcircle.com>`
- Reply-To: `support@scaledcircle.com`
- Secret: `SUPPORT_EMAIL_SMTP_PASSWORD`
- Port/TLS: selected by Nodemailer's reviewed Gmail service preset; no repository override

No other environment variable, provider credential, index, or Rule change is required.

`sent` means the SMTP provider accepted the message and ScaledCircle durably recorded that acceptance. It does not mean inbox delivery, opening, or reading.

## Claiming, retry, and recovery

The initial create trigger and update-aware retry trigger share one atomic claim:

`queued | retry_requested -> sending`

Only an explicit transition into `retry_requested` can activate the update trigger. Updates to `sending`, `sent`, `failed_retryable`, or `failed_terminal` do not send email. Attempts are capped at three. SMTP authentication/provider rejection is terminal; transient transport errors are retryable. There is no infinite retry loop.

`reconcileLandingPageInquiryDelivery` is Admin-only and accepts one canonical `landing_*` lead ID. It derives the Business, page, published-version context, contact data, recipient, and deterministic job IDs from authoritative records. It cannot accept arbitrary email content or replay a bulk set. Repeated calls create no duplicate jobs. A historic queued job is transitioned to `retry_requested`; it is never deleted and recreated.

## Health semantics

Form acceptance, lead persistence, in-app notification, Business email, and customer confirmation are independent signals.

| State | Meaning |
|---|---|
| `not_applicable` | No customer email was requested, such as phone-only contact |
| `recipient_unavailable` | The verified authoritative Business recipient could not be resolved |
| `worker_unavailable` | An eligible job is queued but no worker is deployed |
| `queued` / `retry_requested` / `sending` | Pending, not healthy delivery evidence |
| `sent` | Provider acceptance was durably recorded |
| `failed_retryable` | Delivery is degraded and may be explicitly reconciled within the attempt limit |
| `failed_terminal` | Delivery is degraded and requires operator review |

A persisted lead still produces the public success response. Email failure must not ask the visitor to resubmit. The Business in-app notification remains the operational fallback.

## Staging infrastructure runbook — do not execute without approval

Project: `scaledcircle-staging`

Principal: `serviceAccount:998249478055-compute@developer.gserviceaccount.com`

### A. Least-privilege Firebase Auth reader

Create a project custom role containing only `firebaseauth.users.get`:

```powershell
gcloud iam roles create scaledCircleFirebaseAuthUserReader --project=scaledcircle-staging --title="ScaledCircle Firebase Auth User Reader" --description="Read one Firebase Auth user for authoritative Landing Page Business email resolution" --permissions=firebaseauth.users.get --stage=GA
```

Bind only that role:

```powershell
gcloud projects add-iam-policy-binding scaledcircle-staging --member="serviceAccount:998249478055-compute@developer.gserviceaccount.com" --role="projects/scaledcircle-staging/roles/scaledCircleFirebaseAuthUserReader"
```

Do not alter the existing Editor binding during this rollout.

Rollback the binding:

```powershell
gcloud projects remove-iam-policy-binding scaledcircle-staging --member="serviceAccount:998249478055-compute@developer.gserviceaccount.com" --role="projects/scaledcircle-staging/roles/scaledCircleFirebaseAuthUserReader"
```

After confirming no binding remains, disable the unused role if desired:

```powershell
gcloud iam roles update scaledCircleFirebaseAuthUserReader --project=scaledcircle-staging --stage=DISABLED
```

### B. Existing support-mail credential

The Founder enters the already-established credential directly into the CLI prompt; it must never appear in code, command history, docs, logs, or chat:

```powershell
npx.cmd --yes firebase-tools@latest functions:secrets:set SUPPORT_EMAIL_SMTP_PASSWORD --project scaledcircle-staging
```

Prompt value: `<EXISTING_SUPPORT_EMAIL_SMTP_PASSWORD>`

Do not read or copy the production secret value. A normal code rollback does not delete this staging secret.

### C. Exact Function deployment

After regenerating and certifying isolated packages, deploy only:

```powershell
npx.cmd --yes firebase-tools@latest deploy --project scaledcircle-staging --only "functions:transactional-email:sendTransactionalEmailJob,functions:transactional-email:retryTransactionalEmailJob,functions:landing-page-core:submitLandingPageForm,functions:landing-page-core:reconcileLandingPageInquiryDelivery"
```

Expected: Gen 2, Node.js 24, `us-east1`; only the two transactional-email Functions bind `SUPPORT_EMAIL_SMTP_PASSWORD`. Landing Page Functions remain zero-secret.

### D. Existing inquiry recovery

Using a normally authenticated staging Admin, invoke `reconcileLandingPageInquiryDelivery` once with:

```json
{"leadId":"<EXISTING_QA_LANDING_LEAD_ID>"}
```

Expected:

- existing customer job keeps the same deterministic ID and becomes `retry_requested`;
- missing Business job is created once at `landing-business_<leadId>` after verified Auth-recipient resolution;
- repeated reconciliation is a no-op for sent jobs and creates no duplicates.

External staging email delivery requires a separate action-time approval. Certification must prove exactly one Business email and one customer confirmation, provider acceptance recorded, and no second customer submission.

## Code rollback

Roll back the two isolated codebases to their recorded prior revisions or redeploy the previously certified source for the same exact Function IDs. Remove `retryTransactionalEmailJob` and `reconcileLandingPageInquiryDelivery` only if those IDs did not exist in the prior release. Remove the custom IAM binding using the command above if recipient lookup is also being rolled back. Do not automatically destroy the staging secret.

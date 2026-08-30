# Generated Service Visuals V1 — Phase 3A foundation

Status: local foundation only. External generation is disabled in every deployed environment. No provider, credential, billing account, or budget has been selected or configured.

## Product contract

Businesses choose an approved service category and a bounded visual direction. They never submit a raw provider prompt or provider parameters. A candidate is review-only until the Business explicitly approves it. Approval uses a generated-content acknowledgement, not the upload rights attestation.

Every generated revision has immutable origin `generated_service_concept` and the disclosure:

> Service concept image — not a photo of this Business's completed work, team, customers, or property.

The same origin and disclosure are frozen into each Landing Page version and remain visible on the public page. Generated visuals cannot be relabeled as uploads or represented as completed work, real people, customers, or property. The existing deterministic no-asset renderer remains the fallback.

## Authority and lifecycle

`visualGenerationJobs` is a server-only, tenant-owned job collection. A deterministic ID derived from Business UID plus client request ID makes request retries replay-safe. States are `queued`, `processing`, `review_required`, `approved`, `rejected`, `blocked`, or `failed`. “Try another” creates a distinct request and job; a retry of the same request returns the original job.

The adapter receives only a server-built safe brief derived from the Business Brand Profile and approved services. It is prohibited from logos, embedded factual text, identifiable people, real customer property, before/after imagery, credentials, ratings, awards, and completed-work claims. Moderation fails closed before media ingestion.

A passed result enters the existing private Brand Assets pipeline as one canonical immutable revision. Sharp/libvips validates and normalizes the bytes, strips metadata, and creates the existing private renditions. Only approved revisions may be selected. Landing Page publication materializes immutable content-addressed public derivatives exactly as Phase 2 established.

Provider request references, usage, and future cost fields are server-only. Business responses expose safe status, service, direction, candidate identity, moderation status, and disclosure. Admin receives a bounded latest-100 operational projection with status/failure totals, stuck-job count, latency, capability, budget status, and provider availability—not raw prompts, images, credentials, or cross-tenant customer content.

## Safety gates

- Capability defaults to `disabled`; deployed adapters are absent and budget is false.
- The deterministic fixture adapter requires both a `demo-`/`local-` project and an emulator/test runtime. Staging and production fail closed.
- Maximum 2 active jobs and 8 requests per rolling 24 hours per Business.
- Business pagination is fixed at 20 with opaque `(createdAt, document ID)` cursors and page-ID deduplication.
- Firestore clients cannot read or write job documents.
- Provider execution may later be synchronous, callback-based, or polled behind the adapter; canonical job state and idempotency remain provider-neutral.
- Failed/rejected jobs retain bounded audit state. Temporary provider output cleanup must be defined by the selected adapter and may never delete canonical approved media.

## Required infrastructure if enablement is later approved

Expected deployment surfaces are the six new `creative-media-core` callables, the exact `visualGenerationJobs` composite index (`businessUid ASC`, `createdAt DESC`, document ID `DESC`), Firestore Rules, and Hosting. Landing Page publication/render changes require the four maintained Landing Page read/write/render authorities only if their certified source differs at promotion time. No Storage Rules change is required by this foundation.

Provider enablement is a separate review. It must select a provider, moderation contract, callback/polling strategy, regional/privacy posture, retention and deletion rules, server-held secret, hard Business/platform budget caps, cost observability, outage behavior, and a provider-specific test matrix before any staging credential or paid call exists.

## Quality gates

- Technically Correct: provider-neutral idempotency, tenant isolation, moderation, immutable origin/version snapshots, private processing, pagination, rate/budget gates, and disabled deployed capability all pass.
- Customer Ready: the Business receives a simple service/direction flow, truthful progress and failures, review-first approval, Try another/remove controls, and visible disclosure.
- Renewal Grade: approved concepts can safely strengthen a Landing Page without weakening historical truth, public privacy, or the deterministic fallback. This gate remains local-foundation certified; provider enablement and hosted actor proof require separate approval.

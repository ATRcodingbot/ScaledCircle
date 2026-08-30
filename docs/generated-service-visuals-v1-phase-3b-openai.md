# Generated Service Visuals V1 — Phase 3B OpenAI adapter

## Certified local contract

The provider-neutral generation boundary uses OpenAI `gpt-image-2`, pinned by default to
`gpt-image-2-2026-04-21`. The server-authoritative configuration may deliberately advance the
snapshot after review. Defaults are one medium-quality `1536x1024` WebP image. Provider output
is untrusted and must pass secondary safety moderation plus the existing Sharp decode, pixel,
metadata-removal, rendition, domain-truthfulness, and Business-approval pipeline. The public
product continues to say “Conceptual service visual”; OpenAI metadata stays operational.

The adapter constructs a bounded brief from approved service/category/style fields. It sends no
lead, contact, address, tracking, finance, private-note, or customer-image data. It positively asks
for an empty generic work setting and excludes people, real/customer property, before/after claims,
logos, signage, credentials, ratings, guarantees, embedded factual text, and completed-work claims.

## Authentication decision

Preferred: the OpenAI Node SDK's production workload-identity support with a GCP metadata-server
ID token and OpenAI short-lived token exchange. Future setup requires separate staging and
production OpenAI API projects, an OpenAI identity-provider resource, an OpenAI project service
account bound to that verified identity, and the two resulting non-secret resource IDs in the
server-only provider configuration. The deployed Firebase Gen2 service identity must be verified
to obtain its own metadata ID token. No GCP IAM mutation is expected merely to obtain that token;
if the actual runtime requires extra or preview-only configuration, stop and use the fallback.

Fallback: a narrowly scoped OpenAI project service-account key in Firebase Secret
`OPENAI_IMAGE_PROVIDER_API_KEY`. Do not reuse a personal or organization-wide key. The fallback
would require an explicit later secret creation/binding approval; it is not present in this
candidate.

## Provider and budget controls

`providerConfigurations/generated-service-visuals` is server-only and absent/disabled by default.
An external call requires the global kill switch, an active paid Business entitlement, a configured
per-plan monthly allowance, the rolling daily limit (8), global daily/monthly ceilings, and a
successful deterministic reservation. Plan allowances are deliberately configuration-driven; this
candidate does not alter subscriptions or pricing. Suggested commercial-review starting points,
not enabled entitlements, are 10 Starter, 30 Growth, and 60 Scale/Managed Growth images monthly.

A reservation is retained for an indeterminate provider outcome. Only a failure known to occur
before provider acceptance is safe to retry/release. A 429 or proven pre-dispatch transport error
gets bounded backoff; 5xx or post-dispatch timeout is `UNKNOWN_PROVIDER_OUTCOME` and never creates a
second billable attempt automatically. “Try another” has a new request/job/reservation identity.
No automatic cross-provider fallback exists.

Provider usage is authoritative for text/image input tokens and image output tokens. Server config
holds current pricing; records contain provider, alias, snapshot, request ID/timestamp, usage,
estimated cost, and calculated actual cost. Normal Business responses omit these fields. At the
planning estimate of $0.041 per medium landscape output: 100 ≈ $4.10, 1,000 ≈ $41, 10,000 ≈ $410,
and 50,000 ≈ $2,050, before inputs and any billable retry.

## Future enablement manifest (not executed)

1. Create isolated OpenAI staging project and project service account.
2. Configure OpenAI workload identity for the exact staging Gen2 service identity; verify token
   exchange without broadening IAM. If unsuitable, create the exact fallback Firebase secret.
3. Populate the server-only staging configuration with provider/snapshot, identity resource IDs,
   current pricing, plan allowances, and conservative global daily/monthly ceilings while leaving
   `providerGenerationEnabled=false`.
4. Deploy only the changed creative-media Functions, Firestore Rules, and Hosting surfaces derived
   from the final candidate; no image call during deployment verification.
5. Obtain Founder approval, enable the kill switch for the bounded smoke, and generate at most three
   person-free concepts (deck/patio, landscaping/exterior, remodel/general contracting).
6. Maximum estimated image-output cost: **$0.123** (3 × $0.041), plus small prompt-token cost. Score
   relevance, quality, adherence, people/property neutrality, signage/claims, composition/crop,
   moderation, latency, and actual cost. Disable immediately after the smoke.

Provider health remains **DISABLED / NOT CERTIFIED** until that separately approved paid smoke.
OpenAI customer-content ownership, output ownership to the extent permitted by law, and default
API training/data-handling terms require normal business/legal review before broad enablement; this
document is an engineering record, not legal advice.

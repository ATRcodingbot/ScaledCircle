# Social + Advertising Operating Layer V1

## Safety boundary

This candidate is provider-free. External social publishing, bulk marketing-email
delivery, and advertising mutations are disabled. It creates no OAuth client,
token, provider account, post, ad, charge, or media spend. Provider secrets and
refresh tokens remain future server-only authorities.

Tracking Phone remains frozen at its separate staging checkpoint: Twilio
compliance approved, provider disabled, and zero destination verifications,
numbers, calls, or spend.

## Current-system audit

| Component | Classification | Evidence and disposition |
| --- | --- | --- |
| Managed Growth profile and grounded artifact generation | REUSABLE | `businessGrowthProfiles`, managed entitlement checks, versioned generated artifacts, exports, and customer approval UX already exist. |
| Social draft review and explicit approval | REUSABLE | `socialPostDrafts`, content versions, owner checks, and approval invalidation already exist. |
| Publish-job identity | PARTIAL | Deterministic `socialPublishingJobs` IDs exist, but no live worker, provider receipt reconciliation, or unknown-outcome lifecycle was present. |
| Social media library | PARTIAL | Owner-scoped upload and Storage Rules exist. It is not a canonical Brand Asset replacement and contains no provider publishing authority. |
| Facebook/Instagram connection | COMING SOON | Existing projections advertise unavailable capabilities. There is no OAuth refresh/token authority or live Page/Instagram publisher. |
| X/YouTube connection | MISSING | No connection, publish, media-upload, or analytics adapter existed. |
| 30-day social calendar | PARTIAL | Managed Growth could generate a textual 30-day artifact, but there was no canonical calendar/item/version authority. |
| Scheduled publishing worker | MISSING | Scheduling records existed, but no provider dispatcher/reconciler was live. |
| Performance normalization and learning | MISSING | No provider metric snapshots or evidence threshold for recommendations existed. |
| 30-day email content | PARTIAL | Short email-sequence artifacts and one-to-one artifact delivery existed. Bulk marketing delivery is intentionally not certified. |
| Meta/Google Ads read model | MISSING | Advertising-plan drafts existed, but no ad connection, account, billing-health, or campaign snapshot authority. |
| Archived Attractive Remodel scheduler releases | DEPRECATED / PARTIAL | Archived folders contain the same provider-free scaffolding and rollout notes. No reusable live tokens, OAuth flow, publisher, or analytics worker was found. |
| Firebase scheduled functions and notifications | REUSABLE PATTERN | Durable scheduled Functions, queues, idempotency, and bounded notification patterns exist elsewhere in the repository. |

## Canonical authority

Server-owned concepts are:

- `socialConnections` and `socialAccounts`: sanitized connection/capability
  projections; tokens belong only in a separate credential authority.
- `socialContentPlans`, `socialContentItems`, and `socialContentVersions`:
  rolling plans, calendar items, and immutable platform-specific content.
- `socialPublishingJobs` and `socialProviderReceipts`: replay-safe dispatch and
  authoritative provider evidence.
- `socialPerformanceSnapshots` and `socialLearningSignals`: normalized metrics
  with `unavailable` distinct from numeric zero, and evidence-gated learning.
- `managedGrowthPlans` and `emailContentPlans`: Managed Growth strategy and
  content-only email plans. Email delivery remains independently gated.
- `adConnections`, `adAccounts`, `adCampaignSnapshots`, and `adAccountHealth`:
  read-only advertising projections. Mutations remain off.

All new collections are client-read/write denied. Business and Admin clients use
bounded callable projections. Provider credentials, tokens, raw private content,
and social passwords are never returned.

## Automation modes

- `manual`: every item needs Business approval.
- `approve_plan`: the Business approves an exact calendar/version set; later
  provider publishing may execute only those approved versions.
- `managed`: requires both an active `managed_growth` entitlement and a separate
  explicit customer authorization. It never follows automatically from plan
  price or a prior mode.

Editing an approved or scheduled item creates a new immutable version and
invalidates the earlier approval. A publish job can become `published` only with
provider post evidence. `unknown_provider_outcome` requires reconciliation
before any retry.

## Capability split

Scale ($499) is the tools and approval-assistance tier: connections, content
planning, review, manual or plan-approved scheduling, analytics, Landing Page and
Response Asset linkage, and read-only advertising health.

Managed Growth ($999) adds an operating service: rolling 30-day strategy,
continuous platform-specific content, explicit managed automation, weekly
evidence review, recommendations, exception handling, and a balanced 30-day
email-content plan. The additional value is ongoing management, not a larger
generic generation quota.

## Provider review

### Meta: Facebook Pages and Instagram

Meta's current official surfaces support Facebook Page publishing and Instagram
professional-account publishing, including media containers and insights.
Production requires a Meta developer app, OAuth, the least required Page and
Instagram permissions, App Review/advanced access where applicable, and Business
Verification. ScaledCircle must test Facebook Page and Instagram professional
capabilities separately; account linkage and supported formats differ. Meta
media publishing may require a provider-fetchable temporary media URL, so the
future adapter must use a short-lived signed source rather than making Business
media public.

Meta Ads read-only should use `ads_read`/Insights access. Account, campaign, ad
set, ad, spend, and result data are viable. The API should not be assumed to
return the exact payable balance or every billing restriction; the UI must show
`Exact balance unavailable through connected API` when authoritative balance
evidence is absent.

### X

X supports user-context OAuth (OAuth 2.0 PKCE or three-legged OAuth) for creating
posts, a media-upload surface, public and owned/non-public metrics, endpoint rate
limits, and pay-per-usage credits. ScaledCircle must obtain a Developer Project
and App, request only posting/read scopes needed for the approved workflow, keep
tokens server-side, set an API spending limit, and treat the current per-endpoint
prices in the Developer Console as the commercial authority. Owned private,
organic, and promoted metrics have time-window limitations and must not be
represented as perpetually available.

### YouTube

YouTube requires a Google Cloud project, enabled YouTube Data and Analytics APIs,
OAuth web credentials, server-side refresh-token storage, `youtube.upload` only
when publishing is approved, and analytics read scope for owned channel metrics.
Uploads from unverified API projects are private by default until the project
passes the applicable audit. Default quotas and upload-specific limits apply;
additional quota requires a compliance audit. V1 should treat Shorts as an
ordinary video upload with suitable media/metadata rather than inventing a
separate provider status.

### Google Ads

Google Ads requires OAuth 2.0 plus a developer token from a manager account.
Access levels control production-account access and volume; production use may
require application review. Read-only account, campaign, spend, results, billing
setup, and account-budget data are viable. Billing setup and account budget are
not the same as an exact current payable balance, so exact balance remains
`unavailable` unless the connected account/API returns authoritative evidence.
No campaign, budget, billing, or ad mutation belongs in this candidate.

## Performance and weekly learning

Canonical metric fields use `{status: available|unavailable, value}` so missing
provider data never becomes zero. The first learning implementation refuses to
recommend changes with fewer than three owned performance snapshots. With enough
evidence it identifies the strongest attributable-response score and suggests a
bounded follow-up test. It does not claim causality or success from tiny samples.

## Email boundary

`emailContentPlans` contain subject, preview text, body, CTA, destination,
recommended day, theme, and segment intention for a rolling 30-day window.
`deliveryEnabled` is false. Bulk delivery stays blocked until unsubscribe,
suppression, sender-domain authentication, reputation, abuse handling, and
CAN-SPAM/compliance authorities are separately certified.

## First live ScaledCircle connection batch

No provider project, credential, OAuth token, account connection, or post is
created by this provider-free candidate. The next batch is connection and
capability verification only:

1. Create a production Meta Business app named `ScaledCircle Social Operations
   — Production` in the verified Scaled Circle LLC Business Portfolio. Configure
   Facebook Login for Business, the Pages API, the Instagram API with Facebook
   Login, and the HTTPS OAuth callback. Request read-only discovery and analytics
   first: `pages_show_list`, `pages_read_engagement`, `read_insights`,
   `instagram_basic`, and `instagram_manage_insights`. Select the provider-returned
   ScaledCircle Facebook Page and its linked ScaledCircle Instagram professional
   account only after the Founder verifies their exact names and IDs. Do not
   request `pages_manage_posts` or `instagram_content_publish` until the bounded
   first-post review.
2. Create a separate production X Web App named `ScaledCircle Social Operations
   — Production`, with an exact HTTPS callback and OAuth 2.0 Authorization Code
   with PKCE. Connect read-only with `users.read`, `tweet.read`, and
   `offline.access`; the authenticated account ID and handle must be shown for
   Founder selection. Add `tweet.write` and `media.write` only at the first-post
   boundary. Do not request Direct Message, follows, likes, moderation, or other
   unrelated scopes.
3. Create a dedicated Google Cloud project named `ScaledCircle Social Operations
   — Production`, enable YouTube Data API v3 and YouTube Analytics API, and create
   one Web application OAuth client. Connect with offline access using
   `youtube.readonly` and `yt-analytics.readonly`, then enumerate the exact owned
   channel with `channels.list(mine=true)` for Founder selection. Add
   `youtube.upload` only at the first-video boundary. Public API uploads remain
   blocked until the project has the required OAuth verification and YouTube API
   compliance/audit disposition.
4. Store provider application secrets in server-side Secret Manager. Store each
   account refresh/access token only in the encrypted, server-owned connection
   credential authority; never return tokens to Flutter or Hosting. Client IDs,
   selected provider account IDs, granted-scope summaries, expiry/health, and
   sanitized capability projections may be stored as non-secret server-owned
   configuration.
5. Verify callback state/PKCE, exact provider identity, granted scopes, token
   refresh, revocation detection, tenant binding, and read-only analytics. Keep
   all publish adapters disabled. No post, media upload, scheduling mutation, or
   provider webhook subscription is part of connection certification.

After all four accounts are connected, create the first real ScaledCircle
30-day plan from canonical Business context and available performance evidence.
The plan remains `manual`; every platform-specific immutable version stays in
review. Before any external post, return the exact account IDs, granted write
scopes, content/version, media, destination, platform, proposed time, and
idempotency key for a separate explicit Founder approval. That approval must
authorize the write-scope upgrade and the named first post; connection approval
alone never authorizes publication.

## Official references reviewed

- Meta Instagram API official Postman workspace:
  https://www.postman.com/meta/workspace/instagram/documentation/
- Meta Marketing API official Postman workspace:
  https://www.postman.com/meta/facebook-marketing-api/overview
- X Manage Posts: https://docs.x.com/x-api/posts/manage-tweets/introduction
- X pricing: https://docs.x.com/x-api/getting-started/pricing
- X metrics: https://docs.x.com/x-api/fundamentals/metrics
- X rate limits: https://docs.x.com/x-api/fundamentals/rate-limits
- YouTube server-side OAuth:
  https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps
- YouTube video resource/audit restriction:
  https://developers.google.com/youtube/v3/docs/videos
- YouTube quota and compliance audits:
  https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- YouTube Analytics metrics:
  https://developers.google.com/youtube/analytics/metrics
- Google Ads OAuth: https://developers.google.com/google-ads/api/docs/oauth/overview
- Google Ads developer token:
  https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- Google Ads billing setup:
  https://developers.google.com/google-ads/api/docs/billing/billing-setups
- Google Ads account budgets:
  https://developers.google.com/google-ads/api/docs/billing/account-budgets

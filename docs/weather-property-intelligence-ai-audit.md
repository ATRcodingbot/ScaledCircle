# Weather and Property Intelligence AI architecture

## Classification

Weather Intelligence began as deterministic rules/scoring with no model
transport. The deterministic `weather-opportunity-v1` engine remains the
authoritative Weather signal: it fetches National Weather Service alerts and
assigns disclosed service categories, experimental lead-lift ranges,
confidence, and rationale through local rules.

Weather Intelligence is now a hybrid architecture. The existing deterministic
result can be passed to the same server-side OpenAI Responses transport used by
Property Intelligence. AI interpretation cannot replace NWS facts or the
deterministic classifications.

## Exact authoritative Weather path

1. `functions/index.js` exports public `localOpportunityAlerts`.
2. `loadWeatherOpportunityFeed` reads/writes `weatherOpportunityCache`, rounded
   to two decimal places, with a five-minute TTL and stale-cache fallback.
3. `weatherOpportunityFromFeature` applies deterministic templates.
4. `apps/mobile/lib/services/public_site_service.dart` parses the feed.
5. `MarylandWeatherService` loads county feeds and Scale entitlement UI.
6. `business_dashboard.dart` and `weather_alerts_screen.dart` render NWS facts
   separately from experimental estimates and optional AI interpretation.
7. The separate scheduled `functions-weather` codebase continues monitoring
   counties and creating deterministic deliveries/notifications. It does not
   import OpenAI.

Failures return HTTP 503 when no Weather cache exists, or stale cached alerts
when one exists. The deterministic engine never fabricates an official weather
fact.

## Shared AI transport

The default Functions package uses the official OpenAI SDK through the
server-only `analyzeScaleIntelligence` callable and `OPENAI_API_KEY` secret.
Flutter never receives the key or calls OpenAI directly. Property and Weather
facts are allowlisted into `ScaledCircleIntelligenceContextV1`; owner fields,
protected demographics, and raw parcel observations are excluded.

The response keeps server-owned `knownData` separate from validated advisory
`aiInterpretation`. See `scaled-circle-ai-intelligence.md` for model, prompt,
cache, quota, failure, and local secret details.

## Public wording

The repository may accurately describe **AI Property Intelligence** and **AI
Weather Intelligence** because a real server-side model transport exists.
Current official documentation lists the requested model for Responses and
structured outputs. Pre-deployment review must confirm the configured OpenAI
project has access and that `OPENAI_API_KEY` is bound correctly.

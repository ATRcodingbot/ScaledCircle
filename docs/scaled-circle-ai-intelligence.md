# ScaledCircle AI Intelligence

ScaledCircle uses one server-side intelligence boundary for Property, Weather,
combined Property + Weather, and future campaign-performance interpretation.
Authoritative calculations are completed before AI is invoked. The model never
calculates or changes Property Age Signal, National Weather Service facts,
campaign geometry, compensation, assignment, funding, or settlement.

## Runtime architecture

`analyzeScaleIntelligence` is a second-generation callable in `us-east1`. It:

1. authenticates a Business and reads the authoritative
   `businessSubscriptions/{uid}` Scale entitlement;
2. loads Property facts from `propertyIntelligenceCache/{analysisId}` and/or
   deterministic Weather facts from the existing NWS cache/provider path;
3. constructs `ScaledCircleIntelligenceContextV1` using allowlisted fields;
4. checks `intelligenceAnalysisCache/{cacheId}`;
5. applies `ScaleIntelligenceRateLimitV1` (12 uncached requests per ten minutes,
   60 per day);
6. invokes the official OpenAI Node SDK Responses API with `store: false` and a
   strict JSON schema; and
7. returns authoritative `knownData` separately from advisory
   `aiInterpretation`.

The central requested model is `gpt-5.6-terra`, model configuration
`OpenAIResponses_gpt-5.6-terra_v1`, prompt `ScaledCircleIntelligencePromptV2`,
and response schema `ScaledCircleIntelligenceResponseV1`. Current official
OpenAI documentation lists that exact model for the Responses API and structured
outputs. Pre-deployment validation must still confirm that the intended OpenAI
project can use it. The implementation does not silently substitute a different
model; an unavailable model produces the safe unavailable state.

## Grounding and privacy

Property context contains normalized analysis identifiers, geometry digest,
source/version/freshness, granularity/precision, confidence/coverage, aggregate
counts and age metrics, Property Age Signal, type distribution, and limitations.
It never contains owner names, raw parcel rows, or protected demographics.

Weather context contains the existing deterministic NWS alert facts and the
separately disclosed ScaledCircle deterministic opportunity recommendation,
rationale, confidence, and limitations. The model cannot replace those facts.

Business objective and question text are untrusted context. The server prompt
requires qualified inference, rejects missing facts, and prohibits claims about
specific HVAC systems, roofs, windows, appliances, property condition, or buyer
intent. Strict output validation rejects any model attempt to return application
authority fields.

## Local secret configuration

For emulator-only testing, add this entry to the existing ignored
`functions/.secret.local` file:

```text
OPENAI_API_KEY=<local test key>
```

Do not commit that file or log its contents. Automated tests inject a mocked
Responses transport and never require or read a real key. Production activation
requires creating the Firebase secret named `OPENAI_API_KEY`, confirming model
access, and deploying only the reviewed function. Nothing in this implementation
creates or modifies that secret.

## Cache, usage, and failure behavior

The deterministic cache key includes mode, analysis/digest, Property and Weather
versions/facts, sanitized objective and question, prompt version, response schema,
and model configuration. Cache hits do not consume request quota. Stored usage
metadata contains token counts, provider/model identifiers, and a non-authoritative
USD-micro estimate using the versioned public list-price snapshot; prompts and
secret values are not logged. Cached analyses expire after seven days.

Provider timeout/retry is bounded by the OpenAI SDK client configuration (20
seconds, one retry, low reasoning effort, 1,200 maximum output tokens). The
deterministic cache identity is also supplied as the provider idempotency key so
concurrent retries do not intentionally purchase duplicate analysis. Provider,
secret, malformed response, or model failures return
`AI analysis is temporarily unavailable.`
Factual Property and Weather intelligence remains usable.

## Authority boundary

AI recommendations are advisory. They cannot publish, fund, charge, assign,
transfer, alter worker compensation, or modify authoritative geometry. Future
campaign-performance context must be loaded from authoritative server records
before the existing `campaign` context mode can be activated.

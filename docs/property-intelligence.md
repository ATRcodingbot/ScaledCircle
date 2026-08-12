# Property Intelligence

Property Intelligence is an industry-neutral Business map layer. It describes
property and housing-stock characteristics; it does not diagnose the condition
of a property, roof, HVAC system, window, appliance, component, or structure.

## Existing architecture reused

- `campaignZones.serviceArea` and the current FlutterMap/OpenStreetMap zone UI.
- Server-side campaign ownership checks and `zoneGeometryDigest` conventions.
- The existing campaign analysis callable/zone document rather than a parallel
  campaign type.
- Firestore server-side caching, similar to Weather Intelligence, while weather
  remains a separate signal.
- Existing campaign draft confirmation, publishing, and funding boundaries.

No mandatory industry field was added. A future optional `businessCategory`
may personalize suggested questions without changing the normalized property
model or its score.

## Official data sources

### Maryland tier

The production provider uses Maryland Open Data's **Maryland Real Property
Assessments — Hidden Property Owner Names**, Socrata dataset `ed4q-f8tm`:

- Dataset page: https://opendata.maryland.gov/d/ed4q-f8tm
- Machine API: `https://opendata.maryland.gov/resource/ed4q-f8tm.json`
- Publisher: Maryland SDAT and Maryland Department of Planning
- Public access; no SDAT Real Property Search HTML scraping is used.
- Dataset metadata reported 2.44 million statewide records and a July 5, 2026
  update when selected. Underlying jurisdictions can update at different
  frequencies; the dataset source edition/update is retained where available.

Selected API fields are Account ID, county, WGS84 longitude/latitude, land-use
code, county property code, CAMA year built, structure square feet, and
MdProperty View edition. Owner fields are neither requested nor normalized.
Account ID is the deduplication key. This Socrata view supplies point geography;
the MVP does not manufacture parcel polygons or perform an ambiguous geometry
join. Future official parcel polygon joins must use a documented authoritative
property key and disclose join coverage.

### National fallback

The fallback uses U.S. Census Bureau **2024 ACS 5-Year Detailed Table B25034,
Year Structure Built**, at block-group geography. Official variables
`B25034_001E` through `B25034_011E` are retained. Results are explicitly labeled
"Neighborhood estimate based on intersecting Census block groups." Approximate
rolling-age metrics are disclosed because ACS publishes construction-year
buckets, not parcel years. `CENSUS_API_KEY`, if configured, remains server-side;
the Census API can also service low-volume requests without a key.

## Provider and cache flow

The callable validates Business authentication and ownership, canonicalizes
the saved server-side zone geometry, calculates a SHA-256 digest, and checks
`propertyIntelligenceCache/{sha256(analysisVersion:sourceBundleVersion:geometryDigest)}`. Cache
documents are backend-only under Firestore Rules and expire after 30 days.
Maryland parcel points are attempted first, followed by ACS block-group data,
then an explicit no-data response. Requests are bounded to 250 polygon points,
a 200 km² bounding box, 5,000 Maryland records, provider timeouts, and four
function instances. A geometry, provider-source version, or analysis-version
change creates a different cache identity.

## Property Age Signal V1

`PropertyAgeSignalV1` is server authoritative:

```text
raw = 50% × percent 40+ years
    + 30% × percent 30+ years
    + 20% × percent 20+ years

signal = clamp(round(raw × (0.65 + 0.35 × coverage)), 0, 100)
```

Categories are 0–24 NEWER STOCK, 25–49 MIXED STOCK, 50–74 OLDER STOCK, and
75–100 HIGH OLDER-STOCK CONCENTRATION. It measures older-stock concentration
and data coverage only—not commercial likelihood, system age, condition,
service need, or purchase intent.

## AI grounding and safety

The backend emits separate `knownData` and `inference` fields. Known data
contains only authoritative analysis, source, coverage, confidence, and
limitations. Any Business-objective interpretation is labeled as inference and
states that property age does not establish a property's service needs.
Property Intelligence cannot publish, fund, charge for, or assign a campaign.
The Business must confirm all existing campaign workflow steps.

No owner names or protected-class demographic variables are requested,
returned, cached, or used in scoring. Weather Intelligence remains visible and
independent; a future assistant may explain Property, Weather, and campaign
signals together without hiding them inside one opaque score.

## External configuration

## Intersecting Census geography and precision

The national fallback uses the official Census TIGERweb ACS 2024 Block Groups
layer (`Tracts_Blocks/MapServer/8`) with `esriSpatialRelIntersects` against the
saved campaign polygon. Every intersecting GEOID is retained in
`censusGeographiesUsed`. The display says **Neighborhood estimate based on
intersecting Census block groups.** No centroid-only lookup or invented
boundary is used.

B25034 housing-unit counts are summed bucket by bucket across the selected
geographies before percentages are calculated. Percentages are never averaged
without weighting and no area weighting is claimed. All housing units in each
intersecting block group contribute, so the estimate does not imply that every
represented unit lies inside the Business polygon.

Parcel observations with actual `yearBuilt` values expose exact 20+/30+/40+
metrics for the server analysis reference year. ACS publishes ranges, so its
rolling metrics use `estimatedPercent...` fields and disclose the reference
year, input buckets, a uniform-within-bucket approximation method, and the
limitation. `inputGranularity` and `signalPrecision` distinguish parcel-level
observations from aggregate estimates.

## Maryland access safeguards

Dataset `ed4q-f8tm` fields were checked against its official current Socrata
metadata: Account ID, county, WGS84 latitude/longitude, land-use code, county
property code, CAMA year built, structure square feet, and MdProperty View
edition. Owner fields are not requested. Queries use Account-ID ordering and
1,000-row deterministic pages. A sentinel request detects records beyond the
5,000-record guard and marks coverage partial/LOW instead of silently
truncating. The server rejects malformed coordinates, deduplicates Account IDs,
and filters points against the exact campaign polygon after bounding-box
retrieval. Current access terms and commercial-use policy still require
business/legal review; no legal conclusion is made here.

## Assistant transport status and comparison

The repository contains no OpenAI, Gemini, Vertex AI, Firebase AI, LLM proxy,
assistant callable, or other actual model transport. Ask AI is marked not
production ready and never fabricates a response. The prepared interface is
`PropertyIntelligenceAssistantContextV1` and the transport boundary is
`analyzeBusinessOpportunity({objective, propertyIntelligence,
weatherIntelligence, campaignContext})`.

Multi-zone comparison exposes neutral signal, source/granularity, predominant
era, pre-1980, pre-2000, applicable estimated age metric, confidence, and
coverage. It does not label one zone universally best; any future recommendation
must be tied to the Business's stated objective.

The `analyzePropertyIntelligence` callable binds a server-side
`CENSUS_API_KEY` Firebase secret. It is never returned to Flutter or stored in
Firestore. Configure it before deploying this callable. No provider credential
or production deployment was performed as part of this implementation.

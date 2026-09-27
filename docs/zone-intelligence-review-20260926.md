# Zone Intelligence — review before deployment

Status: implementation and local validation only. No production deployment,
native CI, financial changes or production campaign writes under this request.

## Existing evidence and missing projection

The production search already retained observed OSM classification tags, exact
candidate geometry, permitted street segments, maintained advisory workload,
and each candidate's PI ranking/context. Get discarded observed tags from its
client target projection. Apply did not retain a complete per-area summary.
Choose area displayed constant placeholders and Zone cards did not consume
the recommended street/workload evidence. Manual previews had no read-only
Core authority for the same factual map evidence before saving.

Added `ZoneIntelligenceV1`: exact ordered seven-decimal geometry digest,
intent, observed target count, property-mix categories and unspecified counts,
supporting street metres, advisory workload with assumptions, PI regional
context, actual ranking reasons, source/snapshot/retrieval/freshness and
limitations. `house` does not imply detached. Generic residential classification
does not imply a known housing type. B2B uses commercial category tags and
suppresses residential age context.

No target-level ownership, condition, household/entrance verification, intent or
conversion prediction is added. Era is explicitly **regional property context**.
Exact age ranges, lot dimensions and per-target year-built joins are not present
in this retained evidence and are not invented. Existing neutral PI cache can
supplement manual areas when it matches their exact geometry; absent context
is unavailable, not zero. No new PI ranking/AI system is created.

## UI and authority

- Recommendation Area 1/Area 2 selection updates the summary from that exact
  candidate; combined option workload is separately labeled.
- Choose area / Review boundary replaces the placeholder card with descriptive
  evidence before Use/Save. Edits invalidate results immediately; requests are
  debounced and late geometry/account responses discarded.
- Each saved Zone card uses the same summary and read-only authority. Saved
  evidence is revalidated rather than assumed permanently fresh.
- `View property evidence` expands source dates, uncertainty, contextual facts
  and assumptions. Primary UI has no JSON/provider error dump.
- Recommended heading: “Why ScaledCircle recommends this area.” Manual heading:
  “What we found in this area.” Both keep “Execution route not yet verified.”
- New `getCampaignZoneIntelligence` callable uses maintained workspace/campaign
  authorization, requiring Business campaign permission. No Scale, Intelligence,
  funding, assignment or payment permission is required for factual preview.
  Admin/foreign campaign/foreign Zone access is rejected. Scale recommendation
  entitlement remains unchanged.
- A saved recommendation can recover its original candidate from its own
  Business/campaign run only when geometry matches; stale geometry reanalyzes.
  Source age is recalculated. Source older than the existing 30-day cache limit
  cannot be reused as current. Manual analysis shares the maintained cache,
  provider limits and serviceability classifier. No campaign/Zone writes occur.
- Apply adds the descriptive summary to new immutable recommendation output/
  saved Zone evidence. This field grants no funding or work-start authority.

## Actual production-evidence examples

These are local projections of the **retained real production run**, not new
live acceptance of the undeployed UI. Exact geometry, digest and source metadata
for all nine areas: `zone-intelligence-21061-examples-20260926.json`.

| Area | Mapped targets / observed type | Nearby era (regional) | Street evidence | Advisory time |
| --- | --- | --- | ---: | ---: |
| Initial Area 1 | 10 attached/semi-detached | 1960–1979 | 403 m | 24 min |
| Initial Area 2 | 11 detached | 1940–1959 | 251 m | 21 min |
| Alternate Area 1 | 8 attached/semi-detached | 1940–1959 | 264 m | 18 min |
| Alternate Area 2 | 8 multifamily/shared residential | 1940–1959 | 121 m | 15 min |
| Alternate Area 3 | 8 attached/semi-detached | 1940–1959 | 350 m | 20 min |
| Alternate Area 4 | 6 attached/semi-detached | 1940–1959 | 162 m | 15 min |
| Alternate Area 5 | 30 attached/semi-detached | 1960–1979 | 233 m | 46 min |
| Remaining option Area 1 | 7 houses, attachment unknown | 1940–1959 | 185 m | 15 min |
| Remaining option Area 2 | 7 houses, attachment unknown | 1940–1959 | 115 m | 15 min |

All nine map/card digests agree in Dart and server tests. Targets total 95;
street evidence 2,084 m; workload 189 minutes. No five-hour inflation.
The source snapshot remains 2026-09-25T20:24:36Z. Maryland regional context for
the alternate's first four areas has partial coverage; its uncertainty remains
in expanded evidence. All nine polygons/networks passed retained Corkran,
known-exclusion, uncertainty-guard and barrier intersection checks. Mapping
completeness, actual pedestrian access and individual delivery stops remain
unverified.

## Workload assumptions

The maintained model is unchanged: `ceil(targets / 45 * 60 + 2 * networkMetres / 80)`,
minimum 15 minutes. It currently uses the same factor for flyers, door hangers
and door-to-door outreach. No conversation duration is assumed. Existing
yard-task factors are preserved; unsupported campaign types do not gain a new
estimate. Target counts never derive from requested hours.

For manual boundaries, all eligible mapped targets are reported, while workload
uses only targets with validated supporting local streets. Unknown streets mean
unknown workload, not zero walking time. Disconnected networks remain separate;
no connectors or itinerary are invented. Estimates above 360 minutes remain
visible with an explicit instruction to review smaller work areas; they are not
capped to six hours or presented as safe single-Scaler work.

## Validation and deployment scope

**149 focused tests passed**: 56 Node tests, 15 Firestore-emulator tests (test-only Auth adapter), and 78 Flutter tests. Focused analyzer: no issues. Local production-config web build succeeded in 35.4 seconds. Dependency locks unchanged.

Focused validation covers residential/partial/unknown/B2B classification,
school/restricted-road exclusion, street deduplication, workload/task factors,
six-hour handling, Starter/Growth factual access versus Scale recommendation,
tenant/member/Zone isolation, stale geometry/source, read-only unsaved preview,
area switching, late account responses, source/assumption disclosure and narrow
layout at enlarged text size. Production examples are replayed locally with no
provider calls; this is not new physical-device acceptance.

Deployment, only after approval: add the factual callable and its maintained
workspace capability; targeted Get/Apply overlays plus shared projection/map
modules; web Hosting. Deploy from current production baselines, preserving their
identities, dependency lock, auth/App Check settings and unrelated declarations.
Do not deploy the legacy whole `analyzeCampaignZone` implementation or replace
the entire Functions codebase. No Firestore rules/index change is required.
Existing authoritative source caches and campaign collections are reused.

The UI is shared Flutter code in the isolated web worktree. Web can receive it
without a native build. Installed native apps need a future reviewed native
merge/build to show the new UI; frozen source
`0f57f0894a06fc0de0b769d3c4fa012c62e51cb1` remains untouched. No new build is
requested or started, and Limited/Beta remains.

# Social reporting product requirements

Design proposal for weekly and monthly content cycles. This document does not
claim that every provider supports every metric or that a reporting UI is released.

## Cycles and observations

A cycle has a period, timezone, content selection and objective. A metric
observation identifies its provider, metric definition, measurement window,
observation time, value and availability. Reports identify their measurement
coverage and last update. Revised observations should be explained to the reader.

## Truthful comparison rules

| Metric | Interpretation |
| --- | --- |
| Followers | Compare snapshots; do not sum daily follower counts. |
| Reach | Preserve the provider's audience definition; do not sum overlapping reach into unique people. |
| Impressions or views | Combine only compatible, nonoverlapping measurements; distinguish cumulative snapshots. |
| Engagement | State included interactions and the denominator for any rate. |
| Website visits | Distinguish tracked visits from provider link clicks. |
| Leads | Count supported, deduplicated lead outcomes rather than profile views. |
| Conversions | Name the conversion event and state attribution limitations. |

Missing, unsupported, delayed and partial observations are distinct from measured
zero. Compare equivalent periods in the selected timezone, including daylight-saving
changes. Label incomplete cycles. With a zero baseline, show absolute change rather
than an infinite percentage. Do not compare incompatible provider definitions.

## Presentation direction

Use one compact weekly/monthly summary in the existing Social experience, with
optional detail, freshness and coverage labels. Keep customer wording simple:
Followers, Reach, Engagement, Website visits and Leads. Do not add another panel
solely to show unavailable metrics. A chart must distinguish gaps from measured zero.

## Future acceptance examples

Check missing versus zero, duplicate observations, cumulative measurements,
overlapping windows, partial periods, daylight-saving boundaries, revised data,
zero baselines and incompatible provider definitions. These are proposed acceptance
criteria, not a statement that implementation tests have run.

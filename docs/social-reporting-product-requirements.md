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

Cadence is adaptive per provider. A fixed three-post Week 1 is an
INITIAL_EXPERIMENT, not a permanent posting rule. After sufficient comparable
observations, the Marketing Manager recommends increase, hold or reduce, with
confidence, evidence references, measurement coverage and limitations. Insufficient
evidence means hold the approved experiment; technical posting capacity is not a
reason to increase volume.

Model posts per week, impressions/reach per post, engagement per post, follower
change, profile activity, repetition/fatigue, topic novelty, timing performance,
and the marginal performance of additional posts. Optimize efficient incremental
growth rather than maximum volume. Normalize observation age and distinguish
association from causation; a higher weekly total alone cannot prove marginal
benefit. Keep provider definitions and unavailable observations separate. X can
have higher cadence than Facebook or Instagram when its own evidence supports it.

Week 2+ recommendations remain subject to exact weekly approval, minimum spacing,
provider limits, fatigue controls and Supervisor stop authority. No recommendation
may silently expand approved job counts or activate bounded managed operation.
Future autonomous cadence must remain inside separately approved bounds. The
existing Week 1 jobs and measurement schedule are unchanged by this requirement.

Check missing versus zero, duplicate observations, cumulative measurements,
overlapping windows, partial periods, daylight-saving boundaries, revised data,
zero baselines and incompatible provider definitions. These are proposed acceptance
criteria, not a statement that implementation tests have run.

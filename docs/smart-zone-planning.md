# Smart Zone Planning Foundation

Status: local candidate only. Not deployed.

## Product flow

The preferred Business flow is:

1. Choose a Service Area or maintained address anchor.
2. Ask ScaledCircle to recommend workable Zones.
3. Review estimated properties, estimated work time, worker count, and workability.
4. Apply the deterministic recommendation or choose **Advanced Edit**.
5. Review authoritative pricing and fund only after every Zone passes publishability checks.

Manual polygon editing remains supported for existing campaigns and advanced users. It is no
longer the preferred first-time path. Every manual edit must be reanalyzed before funding.

## Authority boundary

`discovery-core` owns two proposed zero-secret Gen 2 Node.js 24 callables in `us-east1`:

- `getSmartZonePlan`: authenticated owning Business/Admin read authority. It returns a
  deterministic plan derived from the campaign's maintained Service Area.
- `applySmartZonePlan`: authenticated owning Business/Admin draft-only write authority. It
  recomputes the plan server-side, verifies its deterministic ID, refuses active/assigned
  replacement, and writes analyzed worker-sized Zones.

The Business UI and future agents use the same APIs. Neither path generates geometry through
map pixels, accessibility semantics, or LLM-authored polygons.

## Workload policy

- Product ideal: approximately 4–6 estimated hours.
- Product warning threshold: 8 hours.
- Current launch assignment safety ceiling: 6 hours per one-Scaler Zone.
- Six hours is the single authoritative maximum for one Scaler Zone. Smart Zone planning
  automatically splits any larger workload before funding, so the normal funded flow cannot
  produce a Zone that assignment later rejects solely for estimated duration.
- Estimates are planning guidance, not guarantees.

The first version uses conservative configurable property pace and available route distance.
When route distance is unavailable, confidence is low and the reason is returned explicitly.
No historical completion pace, live worker availability, live weather, or conversion
performance is claimed unless that authority is actually supplied later.

## Geometry and splitting

The deterministic engine:

- validates finite coordinates, distinct points, and non-zero area;
- constructs a bounded rectangular planning area around the maintained Service Area centroid;
- estimates total workload;
- chooses the minimum worker count compatible with the current safety ceiling;
- subdivides along the longer axis into contiguous rectangles;
- distributes estimated properties deterministically and evenly;
- produces stable plan IDs for idempotent review/apply behavior.

This initial split uses conservative estimated workload. A later version may incorporate
authoritative parcel clusters and route-network continuity without changing the callable
contract.

## Funding and assignment safety

Campaign funding now fails before Stripe customer/session/payment creation unless every Zone
has:

- at least three mapped points;
- completed analysis;
- a positive authoritative home estimate;
- a positive workload estimate within the current one-Scaler safety ceiling.

Existing assignment checks remain unchanged: current server geometry digest, current server
metrics version, positive homes, valid mapping, ownership, assignment status, compensation,
and legal consent are still required.

## Workability and marketplace guidance

The first deterministic presentation is categorical:

- Excellent
- Good
- Needs adjustment
- Too large

The model currently considers estimated work time and the data-confidence state. Compensation
attractiveness remains informational until campaign pricing can be compared safely against the
final per-Zone workload without changing immutable compensation semantics. The UI must not
guarantee acceptance, completion time, earnings, or worker availability.

## Future AI and agent use

Future recommendation/agent systems may rank maintained plans and explain supported signals.
They must call these authorities and consume structured outputs. They must not:

- click maps;
- invent coordinates;
- mutate Firestore directly;
- claim unavailable Property/Weather Beta inputs;
- create funding authority;
- bypass publishability or assignment checks.

The supported agent interface is `getSmartZonePlan` followed by `applySmartZonePlan`, exactly
the same boundary used by the Business UI. Real neighborhood ranking from richer maintained
intelligence signals is not implemented by this deterministic geometry planner.

## Access and pricing handoff

Smart Zone planning is available to active `starter`, `growth`, `scale`, and
`managed_growth` Business subscriptions. Free, expired, and cancelled records fail closed.
No recommendation quota is introduced in this candidate. The later pricing audit should
evaluate one generated recommendation as the natural metering unit while retaining useful
Smart Zone access on every paid tier.

Current marginal cost is Firebase callable execution plus bounded Firestore reads and writes.
The deterministic planner uses no AI model, paid map provider, weather provider, Census
provider, or external geospatial API. Viewing stored plans/results has negligible provider
cost. Future neighborhood ranking may add provider/model costs and requires a separate
entitlement and unit-economics review.

## Proposed staging rollout

No deployment has occurred. Minimum staging scope, pending Founder approval:

1. Deploy only `discovery-core:getSmartZonePlan` and
   `discovery-core:applySmartZonePlan` from the reviewed generated package.
2. Deploy only the reviewed `campaign-funding` Functions whose source hash includes the
   pre-Checkout publishability gate (`quoteCampaignFunding` and
   `createCampaignFundingCheckoutSession`).
3. Deploy staging Hosting with the preferred recommendation UI.
4. Deploy no Rules, indexes, Storage Rules, secrets, or external providers.
5. Verify signed-out/Business/Scaler/Admin authorization and deterministic plan replay.

Exact pre-deployment inventory captured read-only on 2026-08-25:

| Callable | Current staging owner/hash/generation | Target | Secret names | Reason |
| --- | --- | --- | --- | --- |
| `getSmartZonePlan` | absent | `discovery-core`, source digest `b7460e03124045d37b2f62327fa62352f26c4d2285939ba15fec94de15df805a` | none | New paid-tier deterministic planning authority |
| `applySmartZonePlan` | absent | `discovery-core`, same digest | none | New transactional plan application/repair authority |
| `quoteCampaignFunding` | `campaign-funding`, hash `84ced31009fa2cfdaf4083650642274b6e7c5108`, generation `1787313567690515` | `campaign-funding`, source digest `6f85e2a6e196e2e9ec1fd57e5e1a1e6a6c3dfca5a0b1261176d48e05a5501caf` | none | Require every Zone to pass the reconciled geometry/workload gate before quote |
| `createCampaignFundingCheckoutSession` | `campaign-funding`, hash `aaf4ab16b9415ba5c9769bdb1453b05c57d9fb52`, generation `1787603881045667` | `campaign-funding`, same digest | `STRIPE_TEST_SECRET_KEY` | Enforce the same gate before payment records or Stripe Checkout |

Firebase deployment hashes are assigned by Firebase at deployment; the target digests above
are reproducible SHA-256 digests of the reviewed generated codebase inputs. Rollback restores
the two recorded campaign-funding generations/hashes, deletes the two newly introduced Smart
Zone callable resources if rollback is required, and restores staging Hosting release
`1787656151946000` / version `7f0d171ef683d541` (the read-only inventory captured on
2026-08-25). No
Rules, indexes, Storage Rules, provider configuration, or new secret binding is required.
6. Create the two Internal QA campaigns through Smart Zones, verify positive analysis before
   each separately approved TEST Checkout, then continue the maintained lifecycle.

Rollback order:

1. Restore the prior Hosting release.
2. Restore the prior exact campaign-funding and discovery-core generations together.
3. Preserve all created campaign/Zone/payment audit records; do not delete or rewrite them.

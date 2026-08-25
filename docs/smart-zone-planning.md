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
- Under the current stricter assignment authority, Smart Zone planning splits work above six
  hours even though the broader product warning threshold remains eight hours.
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
6. Create the two Internal QA campaigns through Smart Zones, verify positive analysis before
   each separately approved TEST Checkout, then continue the maintained lifecycle.

Rollback order:

1. Restore the prior Hosting release.
2. Restore the prior exact campaign-funding and discovery-core generations together.
3. Preserve all created campaign/Zone/payment audit records; do not delete or rewrite them.

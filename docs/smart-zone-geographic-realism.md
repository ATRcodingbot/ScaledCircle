# Smart Zone Geographic Realism

Status: local candidate; staging review required.

## Operational model

SmartZonePlanningV3 separates the Business-selected territory, serviceability
shaping, and worker workload splitting. A large territory is retained and becomes
as many worker-sized Zones as needed. Current worker supply is reported later by
fulfillment; it never reduces campaign design.

The launch practical ceiling is 32 Zones, equivalent to 192 estimated hours at
the six-hour single-Scaler maximum. This supports 5, 12, 30, 60, and 100+ hour
campaigns while keeping every individual Zone within the assignment contract.

## Geographic inputs and fallback

The discovery authority makes one bounded (maximum 25 km², 12-second) Overpass
request for public OSM address/building centers, local-road geometry, mapped water,
and major highway/rail barriers. No secret or new dependency is used. Points in
mapped water are excluded; connected component identifiers and barriers guide
subdivision. Geometry is derived from serviceable point hulls with a small visual
working buffer.

OSM is incomplete. If the request fails, the territory is too large, or fewer than
the minimum useful signals remain, the result is explicitly `Basic Area Estimate`.
It remains valid, analyzed, split at six hours, fundability-checked, and editable,
but is never described as successful geographic intelligence. Provider failures
remain hidden behind safe product copy.

This is operational territory shaping, not pedestrian routing, parcel authority,
or AI neighborhood ranking.

## Provider and launch decision

Bounded public Overpass is suitable only for development/staging and modest proof.
Broad production should use cached regional OSM extracts or a contracted
OSM-compatible service; self-hosting has the highest operational burden. No paid
provider is introduced by this candidate.

Geographic data and raster tiles are separate decisions. The public OSM tile
service has no SLA and may block heavy/commercial usage. Before broad launch,
ScaledCircle must select a compliant production tile provider or self-hosted tile
path, preserve visible OSM attribution, identify requests correctly, honor cache
headers, and avoid bulk/offline scraping.

## Performance and agent contract

- One bounded geography request per plan/review; no request on map movement.
- 12-second deadline, 25 km² ceiling, deterministic fallback.
- Same `getSmartZonePlan` / `applySmartZonePlan` authority for UI and future agents.
- No browser clicks, raw coordinate generation, or direct Firestore geometry writes.
- A later production data service should cache snapshots by territory digest and
  OSM extract version so review/apply reproducibility does not depend on a public
  endpoint.

## Staging manifest

Do not deploy without Founder approval.

- Functions: `discovery-core:getSmartZonePlan`,
  `discovery-core:applySmartZonePlan`.
- Hosting: required for Business presentation and the maintained homepage demo.
- Rules, indexes, Storage Rules, secrets: none.
- New dependencies/provider cost: none.

Rollback restores the prior two discovery-core generations and prior staging
Hosting release together. No campaign, Zone, payment, earning, or Wallet evidence
is deleted during rollback.

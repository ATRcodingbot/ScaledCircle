# Real-World Map Visual Integrity Audit

Status: local certification candidate; staging review required.
Reviewed: 2026-08-26.
Scope: maintained customer-visible Flutter map surfaces and the public product preview.

## Product truth contract

ScaledCircle maps must identify the authority behind every visible shape:

- **Selected area** is the Business-chosen or saved planning area.
- **Smart Zone** is server-generated or server-validated worker-sized geometry.
- **Verified route** exists only after maintained GPS samples are finalized.
- **Current position** is shown only in active-work context or in an explicitly labeled demo.

The UI must not suggest that a planning rectangle follows parcel boundaries, street networks,
or an optimized walking route. Map overlays are not financial, assignment, completion, or
location authority merely because they are visible.

## Maintained surface inventory

| Surface | Maintained implementation | Geometry/data authority | Classification | Result |
| --- | --- | --- | --- | --- |
| Public homepage and Business funnel | `authentic_product_map.dart` | Non-customer deterministic `SmartZonePlanningV3` demo | Demo | Uses a fixed bounded OSM snapshot and the maintained serviceability planner; route remains explicitly unverified. |
| Public Scaler funnel | `authentic_product_map.dart` | Same validated demo Zone plus an in-Zone example position | Demo | Explicit active-work example; no fabricated route polyline. |
| Campaign area / Smart Zone workspace | `campaign_area_screen.dart`, `campaign_zones_screen.dart` | Saved Business area, `getSmartZonePlan`, `applySmartZonePlan`, authoritative analysis | Operational | Valid. Preferred server recommendation; Advanced Edit remains available and requires reanalysis. |
| Campaign location selection | `campaign_locations_screen.dart` | Business-selected maintained location records | Operational | Valid. Map renders actual selected locations rather than decorative geometry. |
| Cleanup location picker | `cleanup_location_picker_screen.dart` | User-selected location | Operational | Valid. Location picker, not a claimed service/route boundary. |
| Property Intelligence | `property_intelligence_center_screen.dart` | Selected saved area or explicit Explore Anywhere context | Beta operational | Valid when labeled Beta. It must not imply parcel-level need or unsupported certainty. |
| Campaign Details | `campaign_details_screen.dart` | Stored Zone geometry and finalized route points | Operational | Valid. Polygon and route are separate layers; route only appears when route points exist. |
| Scaler campaign details | `scaler_campaign_details_screen.dart` | Assigned campaign/Zone geometry | Operational | Valid. Read-only assigned work area. |
| Exact-location Job view | `exact_location_job_screen.dart` | Maintained job location | Operational | Valid. Point location only; no fabricated area or route. |
| Service-area preferences | `service_area_map_picker.dart`, `areas_preferences_screen.dart` | User-selected saved preference geometry | Operational | Valid. A preference boundary is not presented as assigned work. |

No maintained customer surface uses Google Maps or Mapbox. FlutterMap renders OpenStreetMap
tiles and retains OpenStreetMap contributor attribution.

## Public validated demo

The public preview now reproduces one exact deterministic planner result rather than a giant
fictional operational area:

- Place context: Baltimore, Maryland.
- Planner: `SmartZonePlanningV3` / `serviceable_territory_v1`.
- Plan ID: `smart-zone_d6c32ad2cde31cdf49808f31`.
- Geometry: thirteen distinct points; validated non-zero area of approximately 408,585 m².
- Estimate: 225 homes, 300 minutes (5 hours), one Scaler Zone.
- Confidence: conservative/low until route distance and authoritative geography are available.
- Route: not yet verified.
- Data: non-customer demo data; no production campaign or worker data.

The selected-area boundary and Smart Zone are visually layered and named. The demo does not
claim AI neighborhood discovery, parcel intelligence, route optimization, worker availability,
historical conversion performance, or live weather input. Advanced Edit is described as an
available Business control, not the preferred first-time workflow.

## Current planner limitations

The launch planner is deterministic and safe, but it is not a neighborhood-intelligence
engine. It currently:

- constructs a bounded rectangle around a maintained anchor;
- validates coordinate distinctness and non-zero area;
- estimates workload conservatively;
- automatically splits along the longer axis when a one-Scaler Zone would exceed six hours;
- produces stable IDs and server-authoritative apply behavior.

It does **not** yet follow roads, parcel clusters, subdivision boundaries, walkability,
barriers, land use, or route-network continuity. Consequently, the product must call its
output a planning estimate and must not describe it as an optimized neighborhood or route.

## Future review gates

Before introducing AI-assisted area recommendation or richer geometry, require a separate
review of:

1. authoritative parcel/road/provider sources and licensing;
2. barriers, disconnected polygons, waterways, highways, and non-residential land;
3. route-network continuity and realistic travel time;
4. confidence and explanation fields visible to Businesses;
5. deterministic replay and server digest compatibility;
6. privacy and redaction for customer and worker location data;
7. provider cost, entitlements, fallback behavior, and unit economics;
8. staging visual proof at desktop and 390×844 before any production promotion.

## Staging review manifest

Pending explicit approval, the required runtime scope is **Hosting only** for
`scaledcircle-staging`. No Function, Firestore Rules, Storage Rules, index, secret, provider,
payment, Wallet, earning, Connect, transfer, or payout change is required. Staging review must
confirm the public homepage, Business funnel, Scaler funnel, map attribution, dark/light
contrast, desktop layout, and 390×844 layout against the exact certified bundle.

Certified local staging `main.dart.js` SHA-256:
`32648BB3B9461A512042C68F70E5119EBC449C36C4E4A6F629A43E9AE0C747E7`.

Rollback is Hosting-only: restore the Hosting release that is current immediately before a
future approved staging deployment. No backend rollback is part of this candidate.

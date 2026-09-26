# Web campaign planning and completion history

## Scope and routes

Business Home → Create Campaign → Flyer Distribution, Door Hanger Distribution, Door-to-Door Outreach, or Business Card Distribution now opens Campaign → Area → Materials → Review on the web. Existing exact-location workflows and legacy campaigns retain their maintained routes. Native release checkout `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1` is unchanged; this work does not certify a new native binary.

The Business explicitly chooses ScaledCircle Scalers (`marketplace`) or My Own Team (`own_team`). The final action is Review & Fund or Review & Schedule respectively. Planning is not payment or an assignment. Existing marketplace authority remains responsible for entitlement, consent, allocation, compensation, readiness, funding and work start.

## Authoritative operations and schema

`businessOperationsV1` operations: `createCampaignPlan`, `campaignPlanningContext`, `saveCampaignPlanningArea`, `saveCampaignMaterials`, `scheduleOwnTeamCampaign`, `marketingAreaHistory`, and `markMarketingComplete`.

The maintained `campaigns` and `campaignZones` collections remain canonical. New campaigns add `executionMode`, `planningSchemaVersion: 1`, `planningVersion`, `planningStage` and `materialsAreaDigest`. Creation uses a stable request fingerprint. Updates recheck current workspace/campaign permission, consent, campaign ownership, financial/work bindings, expected version, and the digest of exact saved territory plus Zones. Changed geometry invalidates material review. Existing Zones are not deleted when a different Service Area is selected; outlying Zones must be deliberately corrected before materials can be confirmed. Unknown execution modes fail closed; missing mode preserves legacy marketplace semantics.

Own-team scheduling is available without subscription, Email, Managed Growth, funding, Stripe or a Scaler. It creates one linked `businessOperations/{businessId}/items` task with `sourceKind: own_team_campaign`, campaign ID, reviewed dates and no assigned Scalers. Multi-day plans remain visible on every overlapping calendar day. Schedule opens the campaign for management; a generic task status cannot certify actual marketing. Initial schedule and actual completion are supported; rescheduling/cancellation of these linked plans is not implemented in this change.

Own-team campaigns are excluded from marketplace discovery and guarded against all deployed funding, assignment, tracking, earning and transfer entry points. No production test campaign, assignment, customer, payment or completion is created to prove the workflow.

## Area and materials

Area uses existing Service Areas, custom map boundaries and maintained Zone analysis. Materials cannot be confirmed before a saved area. The server returns per-Zone source-backed residential/property estimates, dataset/date and limitations only when the analysis matches current geometry. It never adds overlapping Census block-group totals into a delivery count.

Verified accessible delivery points, automatic material quantity and sufficient-inventory claims remain unavailable where the maintained providers do not establish them. The UI explains this and retains owner-entered quantities. It does not invent a materials/workload recommendation from acreage, Census housing units or a missing result. Changing geography requires renewed review.

Existing material source, pickup/delivery/no-materials choice, location/time/window, printing shop/order reference, instructions, staging/return location and printing notes are saved and restored. No print order or AI generation is triggered by planning. Compensation inputs appear only for marketplace; own-team writes reject them.

## Completion and map records

See [Business Marketing Area History](business-marketing-history.md) for the immutable schema, authority checks, rolling calendar-year window and exact overlap algorithm. Recent meaningful overlap requires at least 25 m² and 0.1% of the proposed area; optional percentages are computed from the union of intersections and suppressed outside supported local geometry bounds.

Own-team completion requires explicit confirmation of an actual date and the whole saved territory or exact selected saved Zones. A+B does not include C. It is labeled Business-reported. Full completion closes only the linked own-team task; partial completion leaves it open. Marketplace history requires bound approved completion evidence. Partial/paused settlements lacking an actual completed footprint are not represented as whole-Zone coverage.

Download/Print Map remains a free, read-only operation using exact saved coordinates, multiple Zones, attribution and a clean image/print view. Planning, scheduling, drawing, downloading and printing never count as completed marketing.

## Verification and deployment

Focused backend, rules, client and web compilation evidence and exact deployed revisions are recorded in the final deployment appendix after verification. Tests use synthetic emulator data; production acceptance does not create fabricated activity.

Mike Email remains **EXTERNAL USER SIGN-IN BLOCKER — OAUTH NOT YET TESTED**. No OAuth configuration, provider connection, email send or Google sign-in attempt is part of this deployment.

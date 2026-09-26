# Business Marketing Area History

The maintained `businessOperationsV1` namespace exposes two operations. History is an advisory input to Area selection; it does not authorize or prohibit repeat marketing, funding, assignment, payment, or distribution.

## API

- `marketingAreaHistory`: input `{campaignId, proposedGeometry?}`. The optional proposed geometry is an array of `{latitude, longitude}` points and is used only for the comparison. Without it, the service uses the current saved campaign territory, or the saved zone union when there is no campaign polygon.
- `markMarketingComplete`: input `{campaignId, completedAtMs, confirmed: true, wholeTerritory, zoneIds?}` plus the normal unique `requestId`. Select either the entire saved territory or one or more saved zone IDs. Completion never accepts client-submitted geometry or an execution-mode override.

The Area response contains `state` (`never_marketed`, `marketed_recently`, or `marketed_historically`), `warning`, `mostRecentCompletedAtMs`, `overlapPercent` (nullable), `recent`, `historical`, `canContinue: true`, `windowStartMs`, `checkedAtMs`, `geometryDigest`, `inventoryComplete`, and `threshold`. Rows retain campaign name/type/material type, execution mode, evidence source, completion date, source campaign ID, completed zone IDs, and completed geometry parts. Both lists are sorted newest first. `never_marketed` means no meaningful overlap in the complete available authoritative inventory; it does not make claims about marketing outside ScaledCircle's records.

Missing or malformed approved evidence, mismatched ownership, unsupported geometry, and inventories above bounded limits return an error rather than a partial or false fresh-area result. The UI must display that history is unavailable, while leaving the Business free to continue. It must not convert an error into a no-history claim.

## Storage and authority

Each footprint is an immutable document at `businessOperations/{businessId}/marketingHistory/{historyId}`. Its schema version is `BusinessMarketingHistoryV1`. Fields include:

- `businessId` and `workspaceId`, both set from current server-authorized Business membership.
- `campaignId`, `campaignName`, `campaignType`, and `materialType` when saved by the campaign.
- `geometryParts: [{points: [{latitude, longitude}, ...]}]`, the exact saved completed polygon vertices, without direct nested arrays; `geometryDigest`; `zoneIds`.
- `completedAtMs`, `executionMode`, `completionEvidenceSource`, `recordedBy`, `recordedAtMs`, server `recordedAt`, and `immutable: true`.
- Marketplace `completionId` and approved review authority, or own-team `confirmed`, `wholeTerritory`, and an idempotency fingerprint.

The callable rechecks current membership and `campaigns` responsibility inside each transaction. Internal Admin workspaces cannot act as a customer Business. Reads and own-team completion are available without a paid subscription; completion still requires current terms and privacy consent. Direct client access is denied by the Business Operations namespace rules. History is never queried across tenant namespaces or returned from another Business.

For marketplace work, Area-history readback safely projects existing server records. A completed zone must have an approved review and a matching approved/completed completion record with the same Business, campaign, zone, submitted completion ID, and Scaler (or group). It uses the completion record's `completedAt` and the exact saved zone polygon. The deterministic history ID makes readback idempotent and preserves the first projected footprint. Only completed zones enter history; an unfinished Zone C is not inferred from completed Zones A and B. A broad campaign `completed` label alone is not evidence. Existing historical zones are captured without replaying financial or completion commands. This is a bounded readback projection, not a new financial trigger. Source zones are protected from client geometry edits after assignment/launch by existing campaign-zone rules.

An approved financial settlement is not necessarily a completed polygon. If a zone has a `reserveSettlementId`, readback also verifies the linked `campaignSettlements` identity and accepts only `ordinary_review` or `completed_task_review` sources. Maintained `partial_settlement` and `business_accepted_paused_work` sources record route percentages rather than exact completed geography; these remain unavailable for area history instead of projecting the whole zone. Non-ordinary exception reviews likewise cannot become whole-zone history. This safeguard reads settlement identity only and never writes financial state.

Own-team completion requires `executionMode: own_team` and status `own_team_scheduled` or `own_team_in_progress`. A Business confirms the actual date and either saved zones or the entire saved territory. Future dates and dates before known campaign creation are rejected. The evidence source is explicitly `business_reported`, not GPS-verified. Marketplace payment/contract/assignment inventories and saved assignment, tracking, group, and financial bindings cause rejection. The transaction writes only history, own-team campaign completion metadata, and the bound own-team Schedule task. Partial confirmations keep the campaign and Schedule task open. Whole-territory confirmation requires every saved zone to fit inside the current campaign polygon; it cannot silently certify zones left outside a changed territory. Whole-territory confirmation or cumulative confirmation of every saved zone sets `own_team_completed` and the task to `done` after verifying its Business, source kind, and campaign binding. Merely marking a Schedule task done never creates marketing history.

Opening, drawing, saving, estimating, scheduling, funding, downloading, and printing do not create own-team history. The module never creates Scaler assignments, completion evidence, earnings, wallets, transfers, or payment records. A read can project a prior authoritative marketplace completion; the read action itself is not completion evidence.

## Geometry and dates

The overlap engine uses the same maintained `polygon-clipping@0.15.7` package as Property Intelligence. It unions exact saved polygons, clips intersections, and retains holes. It does not match addresses, polygon equality, or bounding boxes as a proxy for overlap. Before clipping, it rejects crossing, retraced, and self-touching rings rather than silently repairing the Business's boundary. Validation is bounded to 1,000 vertices per ring and 10,000 total vertices per footprint; consecutive duplicate points and an explicit closing vertex are harmless and supported. The separate Map Download/Print limits remain unchanged.

A prior completed footprint counts as meaningfully overlapping only when its intersection covers **at least 25 square metres and at least 0.1% of the proposed area**. Both conditions are required. Boundary-only contacts have zero area. These thresholds suppress floating-point residue and insignificant narrow contacts, while retaining ordinary partial neighborhood overlap. The threshold is applied per completed history footprint.

Area uses a spherical longitude/latitude ring integral, subtracting hole areas. For the optional percentage, qualifying recent intersections are unioned first so multiple campaigns cannot double count the same territory. Percentages are computed only for local proposed polygons with longitude and latitude extents no greater than 0.25 degrees and absolute latitude no greater than 70 degrees. This bounds the small-edge spherical approximation; percentages are rounded to one decimal and must be described as approximate. Larger supported geometry still produces factual overlap but returns `overlapPercent: null`.

The window starts at the same UTC month, day, and time **one calendar year before the check**. February 29 clamps to February 28 when the prior year is not a leap year. The beginning is inclusive, the current time is inclusive, and future completion dates are rejected. The calculation is not a fixed 365-day or 360-day subtraction. Older records remain stored and can produce `marketed_historically`, but do not set the recent warning.

## Verification

`functions/marketing_history.test.js` covers full/partial/no overlap, boundary contact, both threshold conditions, polygon holes, reliable percentage bounds, union double-count prevention, newest relevant date, exact cutoff/leap day, older history, corrupt tenant/evidence handling, and marketplace completion authority.

`functions/marketing_history_backend.test.js` exercises the Firestore/Auth emulators: immutable exact footprints; partial and cumulative completion; draft/canceled/funded/scheduled/map-record separation; explicit confirmation and date bounds; injected mode/geometry rejection; financial/assignment contradictions; authoritative marketplace readback; proof mismatches; two Businesses and foreign IDs; unauthenticated/removed members; free own-team completion and consent; request replay; historical rows; and Schedule binding. No production mutation is needed for these tests.

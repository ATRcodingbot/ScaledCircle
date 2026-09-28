# Business profile completion and base ZIP lookup — review candidate

Status: prepared for review only. No Hosting/Functions deployment, production profile save, native build, account change or financial action.

## Demonstrated lookup cause

The actual Profile form uses `BusinessGeographyEditor` → `MappedAddressField` → `BusinessOnboardingService.searchPlaces` → `searchBusinessProfilePlaces` (us-east1) → owner-authorized `business_onboarding.search` → `business_geography.search` → the shared `service_area_resolution.resolvePlace`.

Production revision inspected: `searchbusinessprofileplaces-00001-rar`. Its generation-pinned deployed source contains the same rejection of every ID containing `unknown`. The existing production `USBoundaryCacheV3` result for 21061 has an upstream `place-unknown` ID but a valid, independently resolved Census identity: `us_census_tigerweb`, geography type `zcta`, geographic ID/postal code `21061`, label `21061, Anne Arundel County, Maryland, United States`, and real geometry. The adapter therefore discards the valid ZIP **after resolution and before creating selectable results**. The original UI renders that empty list as “This exact address was not found.”

Recent function POSTs at 2026-09-28 10:34:04.035510Z and 10:34:17.631182Z returned HTTP 200; preflight OPTIONS returned 204. These HTTP logs do not retain the query payload and are not asserted to identify an individual Founder click. The exact deployed filter and retained production ZIP result independently reproduce the defect. There is no demonstrated IAM/provider outage behind this case.

Correction accepts a five-digit Census ZCTA geographic identity and derives `census-zcta-<GEOID>` instead of requiring an unrelated OSM object ID. Unknown OSM results without verified Census ZCTA identity remain rejected. Geometry, bounds, source, geographic ID and label are unchanged. Base lookup does not require a polygon. Service-area selection retains its existing polygon requirement. No Scale, Overpass, PI, campaign-area ceiling or campaign territory is involved.

Whitespace is normalized, leading-zero ZIPs remain strings, malformed resolver envelopes are unavailable errors, and a query edit invalidates selected identity and pending results. The Profile-specific field distinguishes pending lookup, provider failure and genuine empty results and preserves text for retry. Existing address/manual-address workflows keep their separate wording and behavior.

## Completion authority and access

Reuse the exact existing `business_onboarding.load` completion rule: `completedAt` on maintained onboarding OR `managed_growth_profile.isProfileReady` (Business name, description, services offered, service areas). Extracted to `completionStatus`; no new completeness checklist or stricter legacy migration is introduced. Save validation additionally requires owner/contact name. Canonical-geography profile saves continue requiring a selected base and one to eight selected service areas, while the existing legacy edit-preservation path is retained. Website, phone, brand details and street address remain optional.

`getBusinessWorkspaceContext` gains a read-only projection from the same rule after existing workspace membership/seat/identity authorization. Projection includes completion, actual missing field names, workspace ID and current owner-only edit eligibility. It contains no private base/address or profile content. Team members receive owner guidance. Existing onboarding writes remain owner-only; Admin/member access is not broadened.

## Customer flow

Web Business Home leads its content with a compact completion banner, before Customers & Schedule. Confirmed complete profiles show no banner. Pending/error responses show neutral checking/retry copy. Equivalent workspace polls do not trigger repeated lookup; actor/workspace changes discard stale completion responses.

The web Create Campaign entry retains its intended campaign-type destination behind the same completion projection. Complete profile opens the maintained editor in place. On return, authoritative status is reloaded; once complete, an explicit Continue to campaign resumes the held destination. Nothing creates a campaign or chooses/funds territory automatically. Existing campaign detail, accepted work, Billing, support and cancellation remain outside this gate. Home refresh also refreshes the status. Saved profile/service areas are loaded by the existing editor; save failures preserve entered fields.

Both banner and prerequisite state support narrow/2x text. The full-page prerequisite scrolls with limited viewport space rather than shrinking text.

## Validation

- 3 Node unit tests: retained production 21061 geometry/identity; leading-zero/invalid-provider identity; completion/optional/legacy rules.
- 51 Auth/Firestore emulator tests: onboarding, geography and workspace regressions, including real 21061 selection/save/load, cross-workspace denial, non-owner edit restriction, preservation and no campaign/wallet writes.
- 26 Flutter tests: banner/loading/error/identity switching, editor return/explicit continuation, narrow/2x text, Enter/icon/error/stale-query handling, actual Profile form selection from the retained production 21061 result, preserved fields/service areas, existing onboarding and manual pickup-address regressions.
- Affected analyzer and production-config Flutter web build; final outcomes recorded in local `.firebase/onboarding-review/` evidence.

These are automated/fixture and emulator results, not physical production acceptance. No real Business profile was saved. After an approved deployment, a bounded read-only production Profile lookup can confirm the selectable ZIP; any production save still needs authorization.

## Narrow future deployment scope

Hosting plus `searchBusinessProfilePlaces` (geography adapter), `getBusinessWorkspaceContext` (completion projection), and `getBusinessOnboarding` (same-rule helper refactor, if packaging its revised bytes). No Firestore Rules, indexes, IAM, provider settings, financial functions or migration. Preserve all newer production changes when packaging; no deployment is performed under this request.

Frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. Home/campaign gating is web-only. Shared search recovery/wording and any desired native banner must be reconciled later into the already-required native candidate; this work does not authorize a native build. Dependency lock unchanged.

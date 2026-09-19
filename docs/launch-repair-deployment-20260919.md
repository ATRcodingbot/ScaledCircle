# Production launch repair deployment and dogfood grant — September 19, 2026

This is a deployment/readback checkpoint, not final launch or store certification.

## Source and deployment

Runtime/client source: `e34b66a94924de554617bd091527eddba09b6d0a`, branch `real-completion-proof`.

Production Hosting: `sites/scaled-circle/versions/a5a0185ca11ac5ae`.
Production Firestore Rules: `projects/scaled-circle/rulesets/eabb947e-4e2b-41ca-a4e2-ef993e4dd3e8`.
Deployed Rules bytes match the reviewed production file.

Targeted Functions:

| Function | Revision |
|---|---|
| analyzePropertyIntelligence | analyzepropertyintelligence-00008-jek |
| runCustomerMetaPublisherV1 | runcustomermetapublisherv1-00011-ruy |
| customerGrowthOperationsV1 | customergrowthoperationsv1-00014-pux |
| queueCustomerGrowthReportEmailV1 | queuecustomergrowthreportemailv1-00006-xij |
| grantCustomerGrowthDogfoodLeadV1 | grantcustomergrowthdogfoodleadv1-00001-gom |
| runScheduledCustomerGrowthResearchV1 | runscheduledcustomergrowthresearchv1-00001-waw |

244 unrelated Function revisions stayed unchanged. Existing application environment and secret bindings were preserved. No broad Functions deployment.

## Attractive Remodel-only Lead access

The Founder-authenticated production Admin invoked the maintained grant action once at 2026-09-19 11:10:32 UTC. Server result: granted, not an idempotent replay. Authoritative readback verified the grant and its matching audit event.

- Product: `lead_generation_research`.
- Source: `internal_dogfood`; no paid entitlement representation.
- Scope: only the exact Attractive Remodel workspace.
- Expiry: November 13, 2026, 17:51:06.617 UTC, matching its existing comped base expiry.
- Audit stores reason, product, grant time and authenticated granting actor.
- Original Business subscription document is byte-equivalent as a decoded REST object to the pre-grant snapshot.
- No Stripe object, billing history, revenue, campaign, earning or Wallet operation was created by the grant.
- Normal Managed Growth still requires the separate $699 Lead add-on.
- ScaledCircle's separate internal workspace remains separate.

The actual owner Lead Generator screen opened and showed Internal dogfood Lead Generation grant, expiry, daily schedule and research-only authority. Research does not approve outreach.

## Production browser and media checks

- Attractive Remodel Billing / Plan opens; complimentary Managed Growth, 10 total seats, expiry and no automatic renewal are truthful.
- Saved-area analysis used the existing deck objective without drawing geography. It examined 12 bounded sections and returned 12 ranked recommendations; 626 overlaps were excluded.
- Nearby comparison found four evidence-supported alternatives among six examined sections, without a second drawing. First immediate request was rate-limited by the maintained analysis cooldown; retry after the interval completed. Do not describe this as uninterrupted one-click comparison.
- The supported deck ranking currently uses residential share and says component-specific demand/condition evidence is unavailable. Do not claim verified deck demand or property condition. Area display names remain the saved generic 'Another Area' names.
- Postcard recommendation remains advisory with Coming Soon and Create Campaign Anyway.
- All five restored immutable Social image URLs returned image/png or image/jpeg and matched original SHA-256 bytes. No new approval or publication retry was performed.
- No service-area edit or campaign creation was performed in these checks.

## Remaining evidence gates

- Daily customer research is enabled with a server scheduler every 15 minutes; genuine first and subsequent daily cycle results must be recorded separately. Tests are not multi-day live proof.
- Owner browser retest remains required before final native pair and full release regression.
- Staging inventory has no analyzePropertyIntelligence Function in any region, and no CENSUS_API_KEY secret metadata. Staging client/Rules promotion was held rather than claiming backend compatibility. Production checks above are independent.
- Google branding is verified/shown; Gmail read/send Data Access review remains required. Real demo video URL is missing. Normal new-customer Gmail onboarding remains gated.
- Paid Scaler work hold remains active; no Connect retry or financial certification was performed.

Private readback evidence is under `.firebase/launch-repair-20260919/`; private account and provider records are not committed.

## Subsequent read-only runtime diagnosis and prepared status overlay

At 11:43 UTC, the production internal Meta scheduler was enabled every five minutes (last attempt 11:41 UTC, next 11:46 UTC), and the separate customer scheduler was enabled every five minutes (last 11:39 UTC, next 11:44 UTC). Recent HTTP executions returned 200 without browser invocation. Scheduled execution is proven; no new publication was forced.

ScaledCircle's internal queue contains three published Facebook jobs and one published Instagram job, each with one publication receipt and no duplicate published provider IDs. Latest Facebook publication was September 13. Two remaining Instagram jobs scheduled September 10 and 13 have no provider steps or receipts; their approval window ended September 14. Current logs report authority review required. No active provider-step leases were found. This establishes the present safe hold, not the original cause of the missed Instagram windows. Recorded connection status is connected_write/healthy from September 5, not a fresh provider token probe.

The internal research scheduler is deployed in the preserved isolated internal staging workspace, with the production Admin bridge. It runs daily at 09:00 America/New_York; last observed automatic execution September 18 returned 200. Do not conflate this with Attractive Remodel's separate production daily schedule.

Focused status-overlay tests passed: two Node read-model tests, nine Flutter Admin/Growth tests, and targeted Flutter analysis. The overlay separates legacy Social jobs from current Growth publication jobs and exposes internal research counters without inventing missing counts. These overlay bytes are not part of the earlier e34b66a deployment; deployment remains pending until separately recorded.

Production Property history → selected map → Create Campaign Anyway opened Flyer Distribution with the selected Another Area territory and the explicit promise that saved Service Areas remain unchanged. Campaign Zones proof remains pending: the maintained wizard requires logistics/date/pay before draft creation. No placeholder production logistics or draft was silently fabricated.

The published production Privacy Policy visibly contains the Google Business Email data-use/disconnect/retention disclosure. Exact scope justification and demo shot list are maintained in the two Google verification documents; real demo video and Google's review remain outstanding.

Recurring research verification is delegated to the existing read-only heartbeat. The main repair session does not wait for, invoke, or reschedule a research cycle.

## September 19 status overlay and campaign-map follow-up

Status overlay source `70643a67aa344f9a75978752050e1e5b6361786c` was deployed to Hosting `sites/scaled-circle/versions/0fc2323312e13d2a` and `getsocialoperationsadminsummary-00003-pef`. Existing environment, secrets, service account and ingress were preserved; Rules remain `eabb947e-4e2b-41ca-a4e2-ef993e4dd3e8`. Production notifications opened the exact published Social post and Back returned to Notifications without approval/publication.

Founder then explicitly authorized one unfunded, clearly labeled production QA draft for the selected Property territory. No financial, assignment or publication action was authorized. The actual editor exposed two additional boundaries: a pending zone attempted to read a nonexistent Firestore document; Use Analyzed Area supplied only a search boundary instead of an initial proposed polygon. The repair keeps unsaved geometry local and distinguishes the analyzed polygon from the optional manual drawing path. Flyer wizard return-to-review zone/location queries now include the canonical workspace predicate required by existing Rules.

Validation: full Chrome/Auth/Firestore emulator catalog-to-draft-to-manual-zone-to-review flow passed; selected analyzed polygon/cancel/manual editor/revoked-account regression passed; 15 geometry/membership/native-policy Flutter tests passed; six-file analysis passed; generated-code verification passed. Emulator-only unavailable analysis falls back to an attempted write denied by production Rules; the production path already avoids that client fallback. No Rules relaxation is included.

Production map repair deployment/browser verification and safe QA draft cleanup remain pending at this source checkpoint. The draft is explicitly QA/test-only, unfunded, and has no assigned Scaler, payment, completion, tracking session or earning. Do not claim final launch readiness from these tests.

## Production campaign-map retest — completed September 19

Client source `e80b7be473d52827cb74954f7360d24e336ab060` (including preceding `d1de094392955c496f3d8914140ed32399bc5696`) is deployed as Hosting `sites/scaled-circle/versions/d5cdfb7c5dadb8bf`. The second narrow change scopes all Campaign Details zone/location queries by their already-authorized campaign workspace. The full browser/emulator test now also scrolls the actual Details screen and rejects the previous work-area permission-error state. It passed; targeted analyzer passed. No Functions or Rules deployment was needed for these client fixes.

Actual production owner UI, using the one explicitly authorized QA/test-only unfunded draft:
- Existing Property selection opened as a four-point polygon with visible map tiles and a 236-acre preliminary geometric area. This is geometry, not a claim of serviceable homes or workload.
- Advanced Edit remained a distinct initially empty drawing path. Point entry and Undo changed the visible point count; Cancel discarded local edits. The emulator separately proved distinct-coordinate manual geometry saving and return to review. Production temporary point entry is not a physical/native pointer certification.
- Maintained address lookup returned Federal Hill, Baltimore and enabled area planning after explicit selection.
- A 193-hour input was visibly rejected before analysis with the maintained 1–192-hour validation message.
- Reopened Campaign Details truthfully showed No Campaign Zones, without the previous read error.
- Authoritative draft readback retained the original four-point service area and analysis identity. Zero zones, campaign payments, completions, tracking sessions and earnings; assigned Scaler count zero. No funding/publishing/assignment action was taken. The placeholder base field is $55, not a funded compensation promise.
- Authoritative saved Business profile/geography and Growth Preferences equal the preserved pre-analysis records.
- Rules bytes still match the restrictive production ruleset, and all five restored immutable Social images retain their original SHA-256.

The maintained permanent Delete Draft dialog is prepared for this exact QA draft. Action-time confirmation was requested under browser policy; cleanup is not yet claimed. No real campaign was used for this test.

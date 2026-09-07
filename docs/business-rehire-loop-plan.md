# Business rehire loop — Customer Ready plan

Status: design/source audit only. No invitations, assignments, preference mutations or notification delivery are enabled by this plan. Coverage/completion/review remains the active P0.

## Existing reusable authority

- `functions/index.js:submitCampaignReview` derives reviewer/target membership from completed paid zones/locations, or settled legacy campaigns. It supports both directions, overall rating, comment, deterministic reviewer/target/campaign identity, immutable original and reporting. Do not silently broaden its payment-conditioned eligibility; feedback on disputed unpaid work needs separate review.
- `campaignZones`, `campaignLocations`, assignment compensation, participant records and authoritative completion/review outcomes provide relationship provenance. A view or application alone is not work performed. Count distinct accepted/completed assignment outcomes, not tracking sessions, submissions, retries or payments as extra jobs. Keep pending/disputed work separate from verified completed jobs.
- `ReputationService` and `ReviewService` supply existing ratings, but the legacy `campaigns.completedBy` query is not a complete multi-assignment history. Missing ratings currently default to zero; new UI must use “No reviews yet”, not zero stars or invented reliability.
- `applyToCampaign`, `assignScalerToZone`, `acceptZoneGroupSlot` and existing application notifications are reusable lifecycle boundaries. An invitation is a separate notification/offer, never application, assignment, slot acceptance, funding or compensation approval.
- Source search did not establish maintained My Scalers pair projections, directional Preferred/Avoid authority, or targeted repeat-work invitation authority. These must be implemented and tested before the UI claims availability.

## Minimal missing data/authority

Proposed, not deployed:

1. Owner-scoped `businessScalerRelationships/{businessId}/scalers/{scalerId}` projection: stable marketplace identity; source assignment references; verified completed count; latest completion date; work types; objective counts with denominators/versions; own review summary. Idempotent rebuild from authoritative outcomes, including reversals/disputes. No personal addresses, private GPS or another Business's private details. Physical QA/test records excluded from normal customer reputation and matching.
2. Separate actor-owned preference: Preferred / Would Hire Again / Neutral / Avoid, actor identity, server timestamp, version. Server validates actual pair evidence and ownership. Subjective preference does not rewrite objective performance or global rating. Avoid reasons remain private. Preferences never cancel accepted work.
3. Deterministic campaign/Business/Scaler invitation: immutable current campaign identity and terms version, invited/declined/expired/applied state, expiry and deduplicated notification record. Server verifies funded/open campaign, owner, real prior relationship, recipient eligibility, isolation, both parties' applicable Avoid preferences and current job visibility. Private pickup details remain withheld until assignment. No invitation for hidden QA or unauthorized campaigns.
4. Separate authenticated actions for reading history, setting a bounded preference, inviting a selected eligible prior Scaler, and responding. No arbitrary user editor or direct client writes. Replay/concurrency tests enforce one invitation and one notification effect; decline never lowers reputation. Revalidate eligibility and current terms at application and assignment.

## Business UX

Add **My Scalers**: “People who have worked for you before.” Each card shows display identity, completed jobs for this Business, last job, work types, own review, objective reliability with sample size, and private relationship preference. Availability is shown only when current authoritative data exists; otherwise “Availability not confirmed”. No raw campaign IDs, CRM controls or unnecessary contact details.

Inside a historical campaign, **Scalers Used** shows outcome, own review and objective result, with **View Scaler History** and **Invite Again**. Invite Again opens normal creation for a NEW campaign and current terms; it never copies an old assignment or compensation contract.

Once core campaign requirements are defined, provide **Invite Scalers** with Preferred, Worked With Before and Recommended filters, alongside **Open to Marketplace**. Allow one/several/all eligible selections with a clear final count and explicit send action. Each recommendation explains evidence such as prior successful work and compatible work type. Geographic fit uses permitted approximate geography, not private historical GPS. Do not promise availability.

## Scaler invitation UX

“A Business you worked with wants to work with you again.” Where supported by the projection, show the exact prior completed-job count. Present current identity, description, approximate geography, accepted base/bonus terms, schedule and applicable materials/obligations under progressive disclosure.

Actions: **View Job**, **Apply**, **Decline**. Apply invokes the maintained application authority. Any subsequent assignment/slot acceptance still requires the existing affirmative consent step. If the campaign or terms change, reload and require current consent. No silent assignment; no penalty for declining; no disclosure of the other party's private Avoid reasons.

## Launch minimum and sequencing

After the active coverage P0: (1) read-only history from proven assignment evidence; (2) owner-only Preferred/Avoid preferences; (3) explicit, bounded invites from campaign creation to eligible prior Scalers; (4) normal Scaler application/acceptance. All four require owner/cross-tenant, privacy, concurrent replay, changed-terms, disabled-account, QA-isolation and notification-suppression tests. No fake enabled buttons if authority is absent.

For the smallest release, use explicit selection and deterministic explanation; do not introduce broad automated outreach or a new recommendation engine. Keep platform metrics separate from ratings and preferences. Healthy new marketplace discovery remains available.

Post-launch: richer mutual review dimensions with N/A values; transparent repeat-work recommendations; truthful availability; notification preferences/rate limits; moderated disputes; aggregate reliability with confidence/sample size. Never reward positive review values. Any participation incentive requires separate review and cannot depend on sentiment.

## Privacy and rollout boundary

Only the owning Business can read private pair history/preferences. Scalers see their own invitations and permitted public reputation, not private notes or other Businesses' relationship details. Invitation retrieval must not become a new campaign/private-logistics read bypass. No production schema, Rules, notifications, data backfill or automatic matching change is authorized by this design document.

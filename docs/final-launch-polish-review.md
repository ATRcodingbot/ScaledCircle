# Final launch polish — staging review candidate

This is a presentation-only staging candidate. Production promotion requires Founder acceptance of this candidate. It is not a production-complete report or new provider/payment certification.

## Implemented

- Schedule confirmation: **Remove this schedule item?** / **This will remove it from the active schedule. Its history will remain available.** / **Keep item** / **Remove item**. The server still determines delete, cancel or archive and retains history. No lifecycle authority changed.
- Schedule success: **Schedule item removed**. Empty state: **Nothing scheduled in this view. Try another date or filter.**
- People and assignment controls use **Crew member** rather than resource. They explain that scheduling a worker does not grant account access or consume a paid seat.
- Business Email uses the product name without a blanket Private Beta suffix. Provider-specific testing and invitation gates remain. Raw connection errors are replaced with a recoverable message; sending restrictions are described without server terminology.
- Campaign creation, publishing, editing, assignment and load failures; marketplace load, job application, submission, materials confirmation and tracking-status failures use customer-safe recovery copy. No error recovery automatically repeats an economic operation.
- Homepage: **Run your business. Grow locally.** with Customers, Schedule, Jobs and Team before optional growth tools. Business/Scaler actions use **Start Your Business** and **Join as a Scaler** in the changed funnels.
- Business sales page leads with Business operations. Existing campaign demonstrations and factual/no-guarantee disclaimers remain. Core operations are included with every paid plan.
- Scaler funnel remains about local work and accepted pay. Availability is explicit; no guaranteed work claim.
- How It Works leads with organizing Business operations and choosing growth tools; established campaign/evidence explanations remain.
- Pricing keeps all prices/seats unchanged. It explains common operating tools, separates campaign costs, marks Lead Generation/Growth Department Private Beta and clarifies that the account-management button opens login rather than a comparison page.
- Crawlable metadata and HTML align with the new positioning. Email Campaigns is Private Beta, with general sending unavailable. YouTube remains Coming Soon.

## Availability / promotion matrix

| Surface | Staging customer presentation | Production promotion condition |
|---|---|---|
| Customers, Leads, Schedule, Estimates, Jobs, Tasks, Crew | Ordinary product, no new Beta label | Promote approved client and reviewed Core Business OS delta |
| Team, permissions, invitations | Ordinary product; owner counts as a seat | Preserve server limits, ownership, isolation and invite authority |
| Account deletion | Maintained close-account flow; historical retention | Promote certified authority and client together; no deletion in this task |
| Starter / Growth / Scale | Available plan presentation: $99/1, $299/3, $499/5 | Current production billing authority remains unchanged |
| Managed Growth | $999, 10 seats; Private Beta / Invite Only | Preserve invitation/entitlement gates; no Lead Generation add-on grant |
| Business Assistant | +$399; Beta / Coming Soon | Keep controlled until customer workflow certified |
| Lead Generation | +$699; Private Beta | No automatic outreach or ordinary Managed Growth inclusion |
| Growth Department | $2,000, 10 seats; Private Beta | Bundle access remains controlled |
| Google Business Email | Business Email; provider-specific certification status | Confirm controlled production round trip before claiming general availability; reconnect only if required |
| Microsoft / Other Email | Private Beta — Setup Testing | No general provider certification claim |
| Email Campaigns | Private Beta | Invitation, recipients, provenance, opt-out/footer and explicit send approval remain required |
| Referral Program | Existing link/QR and history; current beta/payment-review wording retained | Verify exact production accounting/enrollment delta before availability label promotion; manual payout alone must not block program availability |
| Social Manager | Private Beta / Invite Only | Preserve approved workflow and provider + Business + scheduler authority |
| Postcards | Private Beta | Physical fulfillment gate remains |
| YouTube / customer X | Coming Soon / gated | No general customer publishing claim |
| New unrestricted paid marketplace work | Existing server hold | Legitimate LIVE earning → Connect → cash-out → provider reconciliation remains separate |

## Verification

- Full Flutter suite with APP_ENV=staging: **698 passed, 2 skipped**. No skipped test is counted as a pass.
- Additional public funnel check at **200% text size: 12 passed**. Schedule/permissions tests cover narrow layouts and 200% text.
- Backend/emulator/Rules: **76 passed** covering seats, cross-workspace isolation, limited-member permissions, removal/history, notifications and account closure.
- Public metadata/delivery: **10 passed**, including prices, referral-link retention, inert unavailable products and staged indexing rules.
- Analyzer: no issues. Generated codebase verification: pass. Diff whitespace: pass.
- Rendered Business/Scaler/How It Works/Pricing/Referrals at 320, 768 and 1440 pixels: no document horizontal overflow. Business hero inspected at 390 pixels. This is browser/rendered evidence, not a new physical native-device certification.
- Hosted limited-member landing: Schedule only, explicit Workspace menu, new empty state, no root Back. Owner navigation retained Home/Growth/Schedule/Campaigns/Results/Account/Support.
- Read-only staging evidence: accepted same fresh member, 2/10 seats, Schedule View/Edit only; old deleted account remains closed; original TEST reward/reversal and zero current balances preserved; twelve historical QA campaign/zone records unchanged.

The first broad test invocation omitted APP_ENV and was not counted as a passing run. The final environment-qualified run is green. A pre-existing profile test was corrected to scroll to a lazy-rendered work-preferences control before asserting it; profile behavior was not changed.

## Founder review

Use staging:

- /businesses, /scalers, /how-it-works, /pricing, /referrals — sales copy, mobile wrapping and availability.
- /#/business — existing owner and limited-member sessions; verify their distinct navigation.
- /#/business/schedule — wording and ordinary forms; do not remove real work just to retest copy.
- /#/business/email-connection — product/provider labels; do not send or reconnect solely for this polish.

No new email, invitation, approval, publication, schedule item, job, payment, earning, payout or account deletion was performed. Native tracking/coverage/completion authority and recorded physical proof are unchanged. No repeat GPS walk is required. No native build was produced in this task; a later matched presentation build may be needed if native distribution is part of the accepted promotion.

## Coordinated promotion remains conditional

After staging acceptance, inventory current production revisions and review the exact source delta for Core OS, Team/notifications Rules, account closure and referrals. Promote only reviewed selectors with separate Hosting, Rules, environment and secret checks. Google production smoke may require an attended Founder consent/reply checkpoint. Keep external referral payout automation, broad email sending, Social autonomous execution and unrestricted paid-work hold unchanged. Do not deploy a broad shared Functions bundle or infer that older sealed releases contain these later bytes.

Production Hosting, Rules and checked Function revisions were compared before/after staging release and did not change. This task deployed staging Hosting only.

## Changed files

- `apps/mobile/lib/screens/business/business_email_screen.dart`
- `apps/mobile/lib/screens/business/business_schedule_screen.dart`
- `apps/mobile/lib/screens/campaign/create_campaign_screen.dart`
- `apps/mobile/lib/screens/campaigns/campaign_applicants_screen.dart`
- `apps/mobile/lib/screens/campaigns/campaign_details_screen.dart`
- `apps/mobile/lib/screens/campaigns/edit_campaign_screen.dart`
- `apps/mobile/lib/screens/jobs/job_details_screen.dart`
- `apps/mobile/lib/screens/jobs/job_room_screen.dart`
- `apps/mobile/lib/screens/jobs/jobs_marketplace_screen.dart`
- `apps/mobile/lib/screens/jobs/native_job_in_progress_screen.dart`
- `apps/mobile/lib/screens/onboarding/account_type_screen.dart`
- `apps/mobile/lib/screens/public/business_funnel_screen.dart`
- `apps/mobile/lib/screens/public/public_landing_screen.dart`
- `apps/mobile/lib/screens/public/scaler_funnel_screen.dart`
- `apps/mobile/lib/widgets/business_email_entry.dart`
- `apps/mobile/test/business_schedule_test.dart`
- `apps/mobile/test/product_ux_redesign_test.dart`
- `apps/mobile/test/public_business_scaler_funnels_test.dart`
- `apps/mobile/test/scaler_profile_identity_test.dart`
- `apps/mobile/web/marketing/businesses.html`
- `apps/mobile/web/marketing/how-it-works.html`
- `tools/prepare_marketing_delivery.py`
- `tools/prepare_marketing_metadata.py`
- `tools/test_prepare_marketing_delivery.py`

## Staging release

Hosting: `sites/scaledcircle-staging/versions/92236f070b030e4a`

Hosted JavaScript SHA-256: `044b4b4028c3fba549b9fb5128eb41239eed4a7a923553f073b7977a69f16724`

Byte-identical to the release staging build. No Functions or Rules deployment in this polish task.

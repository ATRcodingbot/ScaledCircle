# Final owner UX and intelligence — staging review

This is a staging-only owner-presentation correction. Production promotion remains held for Founder acceptance. No native rebuild or physical lifecycle retest was performed.

## Changes

- Schedule shows owner Back navigation even when entered as the workspace root. Schedule-only members retain the limited Workspace menu and no root Back loop.
- Account has one Business Profile entry into the maintained owner editor. It verifies the expected workspace and retains exact legacy service-area labels when geography is unchanged. New onboarding still requires canonical selections. Missing required real profile details remain required; no details or consent were fabricated.
- The duplicated Growth header shortcut is removed; Growth stays in Business navigation. Home leads with submitted-work attention, Customers & Schedule, and a secondary Create Campaign action. The deterministic summary is labeled Business activity summary.
- Campaigns leads with a filled Create Campaign action and management cards. Results separately summarizes maintained active/completed campaign states, approved zones and pending review, with expandable links to exact Job Rooms. Aggregate financial/lead data is explicitly unavailable; planned budgets are never presented as spend or outcomes.
- Growth contains Local Intelligence with Property & Territory Intelligence and Weather Intelligence. Campaign-area planning links to Weather and retains Property Intelligence. Existing permissions and entitlements remain authoritative.
- Weather failure/empty source data produces an unavailable state and Retry, never a false zero-alert result. Property and Weather have visible Back paths.
- Managed Growth copy distinguishes separate Business Assistant/Lead Generation add-ons and private-beta Postcards/Business Email. Existing public Business/How It Works pages retain qualified property/weather planning descriptions.

## Staging profile root cause and repair

The maintained client called three endpoints absent in staging (404). Only these were created from maintained source:

- getBusinessOnboarding: getbusinessonboarding-00001-mir
- saveBusinessOnboarding: savebusinessonboarding-00001-yig
- searchBusinessProfilePlaces: searchbusinessprofileplaces-00001-doj

All read back ACTIVE. The real owner session subsequently loaded its profile. No profile fields were submitted during browser verification.

## Verification

- Full Flutter: 701 passed, 2 skipped; added owner-root Schedule regression subsequently passed in the 14-test Schedule suite.
- Onboarding/workspace backend and Rules emulator: 44 passed.
- Public marketing preparation: 10 passed.
- Analyzer: no issues. Generated codebase verification passed. Release web build passed.
- Existing stale campaign-error test was updated to assert the already-maintained fixed customer-safe message; no campaign publishing authority changed.
- Diff/credential checks passed. Private evidence remains excluded.
- Browser: owner Home/Create/attention hierarchy, Schedule Back to Business, separate Campaigns/Results, exact existing Job Room evidence, Growth Local Intelligence, Property entry and truthful Weather unavailable state.
- Existing limited-member acceptance/seats and TEST reversal records read back unchanged. No financial, job, email, referral, schedule or consent mutations.

Staging Hosting: sites/scaledcircle-staging/versions/79ac0a37170cf972
Hosted main.dart.js SHA-256: 24db3680854fa8829cec7f20ecc8d08123c77b9eedaea866eac5773da30831ce
Production Hosting, Rules and monitored Function revision readbacks unchanged. Staging Rules and Business Operations/reminder revisions unchanged.

Founder review: owner Home → Schedule → Campaigns → Results → Growth → Account → Business Profile. Review presentation and real profile details. No repeat GPS walk, account deletion, invitation, email or referral-economic test is needed for this correction.

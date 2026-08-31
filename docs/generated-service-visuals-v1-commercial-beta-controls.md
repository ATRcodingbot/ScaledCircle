# Generated Service Visuals V1 — Commercial Beta controls

Status: implementation candidate. Customer-wide production generation remains disabled. This is
an engineering and product-control record, not legal advice or a commercial activation record.

## Product decisions

The server-authoritative monthly customer allowances are Starter 5, Growth 15, Scale 30, and
Managed Growth 60. The window is the UTC calendar month and resets at 00:00 UTC on day one. There
is no rollover and no pay-per-image overage. The existing per-Business ceiling of eight intentional
generation attempts per rolling day remains independent of monthly entitlement.

Customer allowance is deliberately separate from provider accounting and outstanding reservations.
A usable output reaching Business review consumes one `customerConsumedUnits`; a definitive
pre-provider failure consumes none; and a provider-billed output rejected by ScaledCircle's own
safety or processing boundary records its provider cost but consumes no customer unit. Customer
rejection/removal of a valid delivered candidate does not restore the unit. Review, approval,
rejection, removal, Landing Page selection, reuse, ordering, and publication consume no additional
unit. Try another is a new intentional generation and explicitly says that it uses one generated
visual before dispatch. Unknown provider outcomes continue holding a reservation until reconciled.

## Rollout and cohort authority

`providerConfigurations/generated-service-visuals` retains the kill switch and adds these bounded,
server-only controls:

- `rolloutMode`: `founder_only`, `beta_cohort`, or `plan_entitled`; missing or malformed values
  normalize to `founder_only`.
- `authorizedBusinessUids`: the existing Founder-only list.
- `betaCohortBusinessUids`: the private-Beta list, resolved by the Admin callable from existing
  generation-job evidence rather than raw UID entry in the normal UI.
- `betaCohortStage`: `initial_5` or `expanded_10`; missing or malformed values normalize to
  `initial_5`. Six or more members fail closed unless the explicit expanded stage is selected.

Founder-only mode requires the existing Founder allowlist. Beta-cohort mode additionally requires
cohort membership, an active canonical paid/managed entitlement, and a nonzero allowance. The
architected plan-entitled mode requires a recognized active plan and allowance but is not approved
for production activation. All modes still require an approved service category, daily/monthly
unit availability, global call/cost budgets, and a reservation before dispatch. Normal clients
cannot read the lists, self-enroll, choose a mode, spoof authorization, or override limits.

Removing a Business affects only future generation and Try another requests. Jobs already accepted
by the provider finish or reconcile under their immutable authorization snapshot; historical jobs,
usage, media, approvals, and Landing Page versions are not rewritten.

## Business and Admin experience

Brand Assets displays the server-reported used/total values and exact reset date. At exhaustion it
keeps upload, existing approved media, and no-photo publication available. Provider/global-budget
unavailability uses a temporary message and explicitly preserves existing images and pages. Jobs
are durable, so the Business may leave the screen during the roughly one-minute generation and
return later.

One deduplicated in-app notification, keyed by generation job ID, is written when a candidate first
reaches ready-for-review. It links to Brand Assets and does not request email or push delivery.

Admin operations exposes the rollout mode, cohort stage/count (not raw UIDs), exact plan allowance
map, requests and customer/provider units by plan, daily calls, daily/monthly provider cost,
outstanding reservations, system rejection and limit-exhaustion counts, latency, and provider
failures. Provider prompt text, credentials, tokens, private images, and raw cohort membership are
not part of the ordinary read model.

## Private Beta budgets and promotion gates

Initial provider ceilings are 50 calls/day, $10/day, and $100/month, with eight attempts/day per
Business. The first-five cohort may additionally use a conservative 300-call monthly ceiling; an
explicit expansion to ten Businesses may raise that call ceiling to at most 600 while retaining the
$100 monthly cost ceiling. The OpenAI project hard limit must not be raised from its current QA
value until the separate production Private Beta activation authorizes the account change.

Promotion from Founder-only to the first-five cohort requires hosted commercial-control
certification, documented policy-review disposition, configured global budgets, customer usage UX,
Admin metrics, and no known accounting defect. Expansion to ten additionally requires zero
duplicate requests and tenant-isolation defects, zero stale reservations, p95 completion below 120
seconds, forecast-aligned cost, zero disclosure/privacy regressions, manageable support load, and
acceptable output diversity. Moving to plan-entitled access always requires separate Founder
approval.

The kill-switch sequence is: set `providerGenerationEnabled=false`, restore `rolloutMode` to
`founder_only`, reduce/empty the cohort if needed, and revoke WIF provider access only if the
provider identity itself is implicated. Existing approved media and Landing Pages remain usable.

## Legal and policy review checklist

Disposition: **PENDING — commercial activation blocked until reviewed and recorded**.

- Is the certified conceptual-service disclosure sufficient in the editor, picker, and public page?
- Do acceptable-use terms adequately prohibit deceptive portfolio, completed-work, credential,
  review, customer-property, and real-person representations?
- Do Business terms clearly address input ownership, generated-output rights, public-display rights,
  and the Business's approval responsibility without promising rights unavailable under law?
- Are OpenAI API data handling, retention, regional posture, and subprocessors acceptable for the
  bounded non-personal service brief?
- Is restoring customer allowance after a ScaledCircle system rejection, while retaining provider
  cost and the daily attempt ceiling, the approved customer policy?
- Are takedown, dispute, escalation, and audit-retention procedures documented for generated media?
- Is “Try another uses one generated visual” sufficiently clear before dispatch?

No attorney or Founder disposition is inferred by this checklist.

## Diversity evidence

Current certified evidence covers four distinct legitimate categories: Seasonal cleanup,
Landscaping improvements, build decks, and fences. At least one additional legitimate service
category must produce acceptable real-world evidence during the bounded Private Beta before broad
plan-entitled rollout. No paid request is authorized merely to fill this evidence gap.

## Production activation boundary

The later production proposal is: deploy the exact certified Functions and Hosting with provider
disabled; reconcile legacy usage into the customer/provider-separated projection; verify Founder
mode; configure the first-five cohort and 50-call/$10 daily plus $100 monthly budgets; raise the
OpenAI project hard ceiling to $100/month only with explicit approval; verify zero-call capability
responses; then explicitly enable `beta_cohort`. Production provider activation, cohort membership,
plan allowances, OpenAI account limits, and any real generation remain outside this candidate.

## Founder-only production safety remediation

Production verification completed on 2026-08-31 from application candidate
`26bdffbb6245c8740d6e233ab27ab07527096ccf`. The prior Admin Founder-only action restored only
the rollout mode and provider kill switch; it could not also clear an inactive stored Beta cohort
and apply the approved commercial safety ceilings without selecting Beta-cohort mode. The narrow
client remediation extended that maintained Admin/server-authoritative action to submit the complete
safe Founder-only configuration in one operation. No direct Firestore write or backend authority
change was introduced.

The verified production configuration is:

- `providerGenerationEnabled=false`
- `rolloutMode=founder_only`
- empty `betaCohortBusinessUids`
- `betaCohortStage=initial_5`
- `globalDailyMaximum=50`
- `globalMonthlyMaximum=300`
- `globalDailyCostMicros=10000000` ($10)
- `globalMonthlyCostMicros=100000000` ($100)

Commercial budget configuration does not grant access: Beta-cohort and plan-entitled modes remain
inactive, and paid-plan entitlement alone cannot dispatch generation. The Founder allowlist remains
the only account-level path in Founder-only mode, while the provider kill switch remains off.

The Hosting-only production release is version `15f3b90b41805f89`, release
`1788191615115000`, with live `main.dart.js` SHA-256
`94B98656B0F1FDAAD82A395BE7206FFDAD9D3DED54CA295519E71C45926E0305`. Desktop and 390×844
Admin verification showed Founder Only, provider disabled, cohort 0/5, 50 daily calls, 300 monthly
calls, $10 daily cost, $100 monthly cost, and zero outstanding reservations. Founder Business
verification preserved existing Brand Assets, generated media, and Landing Pages while generation
remained unavailable.

This remediation added zero generation jobs, reservations, provider image or moderation calls, and
provider spend. The historical three generated jobs and their settled accounting remain unchanged.
Functions, Firestore Rules, Storage Rules, indexes, IAM, and secrets were not deployed or changed.
Private Beta activation, commercial enrollment, provider enablement, and any OpenAI project-limit
increase remain separate approval boundaries.

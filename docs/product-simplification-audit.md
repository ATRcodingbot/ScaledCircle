# Product Simplification Audit

Principle: sophisticated authority stays server-side; each user sees one obvious next action. This is a recommendation inventory, not an implementation change.

## Top 20 simplifications

| Rank | Current experience | Problem | Simpler experience | Backend work | User benefit | Priority |
|---:|---|---|---|---|---|---|
| 1 | Login navigates with unnamed routes | Refresh can reconstruct `/login` | One authenticated, named route shell that restores role and workflow | Minimal session/route resolver | Users never lose their place | P0 |
| 2 | Campaign creation exists in multiple old/new screen families | Duplicate logic and inconsistent steps | One canonical campaign wizard with server-derived defaults | Retire callers; preserve canonical draft schema | Fewer choices and defects | P1 |
| 3 | Business dashboard promotes campaigns, subscriptions, intelligence, Managed Growth, social tools, and settings together | Competing primary actions | Lead with “Create campaign” and “Continue campaign”; place advanced services under Services | No new authority | Immediate clarity | P1 |
| 4 | Scaler approval dialog says “Approve Payment” | Conflates work approval, earning, transfer, and payout | “Approve completed work”; result says “$X earned” | None; copy only | Correct mental model | P1 |
| 5 | Job Room shows group-derived `0 / 1 received` for one worker | Summary contradicts authoritative handoff | Derive single-worker count from the authoritative handoff | Small projection fix | Trustworthy status | P1 |
| 6 | Material/fulfillment choices appear early and verbosely | Architecture leaks into setup | Ask “Who provides materials?” then reveal only relevant handoff fields | Server validates inferred default | Shorter campaign setup | P1 |
| 7 | Public Business and Scaler pages explain the product in long sections | Marketing requires reading instead of showing | One visual journey, real screenshots, three proof points, one CTA | None | Faster comprehension | P1 |
| 8 | Scaler Work Preferences exposes many toggles together | Cognitive load before value | Core work types first; travel, vehicle, cargo, and outreach conditionally disclosed | Preserve same preference model | Faster onboarding | P1 |
| 9 | Multiple marketplace/current/applied job screens overlap | Navigation duplication | One Work hub with Available, Applied, Current | Query facade or shared view model | Predictable navigation | P1 |
| 10 | Campaign detail combines state, payment, applicants, Zones, review, refund, and archive | Long technical status page | Progress header plus one “Next action”; secondary history below | Server next-action projection | Less interpretation | P1 |
| 11 | Wallet mentions approved earnings and payouts before cash-out is launch-proven | Implies unavailable action | Show Available/Pending/History; hide cash-out until operating model passes | Payout eligibility/status API later | Truthful expectations | P0 |
| 12 | Admin has cards but no correlated exception workflow | Routine work requires consoles | One Operations queue with filters and approved actions | Read-only aggregation + narrow commands | Faster safe recovery | P0 |
| 13 | Sales card is disabled | Dead navigation communicates unfinished product | Hide from non-Sales; replace with minimal internal funnel when ready | Sales authority | Clean Admin UI | P0 |
| 14 | Property, Weather, Managed Growth, and Social tools coexist with the core campaign journey | Advanced tools make core product feel unfinished | Put under “Growth tools (Beta)” with entitlement gates | Existing entitlement checks | Core journey stays focused | P1 |
| 15 | Push controls are shown as Coming Soon in preferences | Nonfunctional choices distract | Remove the disabled toggle; mention future push only in notification settings help | None | Fewer dead controls | P2 |
| 16 | Image generation appears in several Coming Soon/Beta labels | Repeated unavailable CTA | One passive roadmap label or hide entirely | None | Less visual noise | P2 |
| 17 | Funding/payment status exposes multiple backend state names | Users must decode authority | Human states: Payment needed, Confirming, Ready to publish, Refunded, Needs support | Canonical presentation mapper | Simple recovery | P1 |
| 18 | Review, payment, refund, earning, wallet, and payout records live on separate screens/collections | Financial story is fragmented | Participant-safe financial timeline with gross, fee, worker obligation, earning, refund | Read-only correlated projection | Trust and supportability | P1 |
| 19 | Public waitlist and active signup coexist | Two acquisition paths compete | Use signup for launched roles; show waitlist only for unavailable geography/product | Availability flag | One CTA | P2 |
| 20 | Settings/profile/account-mode concepts overlapped | Users could enter inconsistent navigation states | One authoritative account role with no customer-facing role switch | Existing Auth/profile role gates | Clearer identity and fewer wrong-role states | COMPLETE |

## Additional opportunities

| Current experience | Recommended simpler experience | Backend requirement | Priority |
|---|---|---|---|
| Zone drawing can require refresh/re-entry | Persist draft geometry continuously and offer one Resume button | Draft revision/version authority | P1 |
| Service Area and campaign target geometry feel like separate map products | Reuse the Service Area as default target; ask only for exceptions | Existing geometry codec | P1 |
| Property/provider failures expose analysis mechanics | “Analysis unavailable — continue without it” plus Retry | Durable provider outcome | P2 |
| Completion evidence uses route, checkpoints, photos, coverage, and calculations in separate cards | One evidence summary with expandable details | Existing evidence authority | P1 |
| Business cancellation confirmation is verbose | Three bullets: removed now, applications closed, full payment refunded | Existing authority | P2 |
| Internal development simulation labels appear in maintained widgets | Compile them only for local builds; never staging/production | Existing environment guard | P1 |
| Reviews/reputation have several screen families | One profile reputation panel and one post-campaign prompt | Review query consolidation | P2 |
| Admin “health” mixes configuration with runtime health | Separate Configuration and Incidents | Structured health events | P1 |
| Subscription and Managed Growth entitlement concepts overlap | One Billing page showing plan, included services, and manage action | Entitlement summary API | P1 |
| Affiliate UI can suggest a mature payout program | Show attribution/status only; explicitly gate commission cash-out | Affiliate liability model later | P2 |

## What should disappear or remain gated

- Hide self-service Scaler withdrawal until a tested payout operating model exists.
- Hide the disabled Sales card until the minimum internal funnel exists.
- Hide active purchase CTAs for direct mail, social ad spend, and unfinished image generation.
- Keep Property/Weather/Managed Growth as entitled beta tools, outside the core launch journey.
- Remove duplicate legacy campaign-creation and campaign-applicant navigation after caller migration.
- Keep local GPS simulation and demo fixtures compile-time local only.
- Keep Business credits absent; never reuse the Scaler Wallet model for Business payments.

## Completed: authoritative role experience

Before this simplification, Business and Scaler dashboards exposed a role-view
switch originally retained for development and testing. The maintained product
now opens directly into the account's authoritative role experience. No
Business/Scaler role switch, test-role selector, or role-changing navigation
shortcut is compiled into customer UI. Separate authoritative QA accounts replace
the old switcher for testing.

This removes navigation clutter, clarifies account identity, reduces confusion,
and narrows the customer-facing misconfiguration surface without changing Auth,
profile-role, or protected-route authority.

# ScaledCircle Master Launch Readiness Matrix

Audit date: 2026-08-23. Status vocabulary: `READY`, `PARTIAL`, `BROKEN`, `NOT IMPLEMENTED`, `LEGACY`. Decision vocabulary: `LAUNCH`, `FIX BEFORE LAUNCH`, `HIDE`, `COMING SOON`, `REMOVE`, `INTERNAL ONLY`.

The matrix contains 99 normalized, user-visible or operator-visible capabilities. Backend-only legacy authorities are inventoried separately below.

| Role | Feature | Screen / route | Backend authority | Status | Launch decision | Priority | Test coverage | Manual QA | Device | Financial | Security | Known issue | Recommended action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shared | Firebase signup | `/create-account` | Auth + `finalizePublicAccountSignup` | READY | LAUNCH | P1 | Backend/Flutter | Required | Web/mobile | No | High | None material | Smoke each role |
| Shared | Email verification | `/verify-email` | Auth action code + resend callable | PARTIAL | FIX BEFORE LAUNCH | P1 | Backend | Required | Browser/email | No | High | Deep-link matrix incomplete | Test expired/replayed links |
| Shared | Login | `/login` | Firebase Auth + `users/{uid}` | READY | LAUNCH | P0 | Flutter/hosted QA | Passed production | Browser/mobile | No | High | None material | Retain authoritative role restoration |
| Shared | Password reset | forgot-password screen | Firebase Auth | PARTIAL | LAUNCH | P1 | Limited | Required | Browser/email | No | High | End-to-end link QA absent | Run provider/browser matrix |
| Shared | Logout | role dashboards | Firebase Auth | READY | LAUNCH | P1 | Flutter/hosted QA | Passed production | Web/mobile | No | Medium | None material | Retain shared Sign Out action |
| Shared | Notifications inbox | notifications screen | `notifications` | READY | LAUNCH | P1 | Rules/Flutter | Required | Web/mobile | Indirect | High | No push delivery | Keep in-app; label push separately |
| Shared | Authoritative account role | role dashboards | Auth + profile `role` | READY | LAUNCH | P1 | Flutter | Required | Web/mobile | No | High | Customer role switch removed | Keep separate role-specific accounts |
| Shared | Support entry | Job Room/support surfaces | `createSupportCase` staging only | PARTIAL | FIX BEFORE LAUNCH | P0 | Backend | Required | Web/mobile | Indirect | High | Production authority absent | Add to migration/ops queue |
| Public | Homepage | `/` | static/public config | READY | LAUNCH | P1 | Flutter | Required | Responsive web | No | Low | Copy remains dense in places | Simplify hero/sections |
| Public | Business funnel | `/businesses` | static + signup | READY | LAUNCH | P1 | Flutter | Required | Responsive web | No | Medium | Long explanatory sections | Show product journey visually |
| Public | Scaler funnel | `/scalers` | static + signup | PARTIAL | FIX BEFORE LAUNCH | P1 | Flutter | Required | Responsive web | Indirect | Medium | “Support Available”; payout maturity unclear | Make claims capability-accurate |
| Public | Public product map | homepage component | public fixture only | READY | LAUNCH | P2 | Flutter | Required | Web/mobile | No | Low | Must remain clearly illustrative | Retain disclosure |
| Public | Pricing | public funnel/subscriptions | plan constants + Stripe | PARTIAL | FIX BEFORE LAUNCH | P1 | Funding tests | Required | Web | High | Full pricing/copy reconciliation needed | One canonical pricing table |
| Public | Waitlist | waitlist screen/dialog | `joinWaitlist` | PARTIAL | HIDE | P2 | Backend | Required | Web/mobile | No | Medium | Duplicates active signup path | Hide for launched roles |
| Public | Early-access pending | pending screen | profile/beta state | PARTIAL | LAUNCH | P1 | Flutter | Required | Web/mobile | No | Medium | Recovery ownership unclear | Add next step/support ETA |
| Public | Referral URL capture | public entry | attribution callable | READY | LAUNCH | P1 | Backend/hosted QA | Passed staging | Browser | Indirect | Medium | Full attribution conversion remains separate | Retain root query capture |
| Public | Affiliate entry | referral links | affiliate authority | PARTIAL | INTERNAL ONLY | P2 | Backend | Required | Browser | Future | Medium | Program not payout-ready | Keep invite-only |
| Public | SEO/share metadata | web shell | Hosting metadata | PARTIAL | FIX BEFORE LAUNCH | P1 | None | Required | Search/social | No | Low | No complete SEO audit | Add canonical/meta/site-map review |
| Public | Mobile responsive marketing | public screens | Flutter web | READY | LAUNCH | P1 | Widget tests | Required | Mobile browsers | No | Low | Safari unverified | Browser/device matrix |
| Public | Footer/support links | public components | static | BROKEN | FIX BEFORE LAUNCH | P0 | None | Required | Web/mobile | No | High | Trust/legal links not discoverable | Add reviewed footer links |
| Public | Legal/consent surface | signup/waitlist/footer | consent records | NOT IMPLEMENTED | FIX BEFORE LAUNCH | P0 | None | Required | Web/mobile | High | High | Required documents/versioning absent | Professional review + versioned links |
| Public | Unknown-route recovery | Router | Auth/profile-aware recovery | READY | LAUNCH | P1 | Flutter/hosted QA | Passed staging | Browser | No | Medium | None material | Retain branded recovery |
| Business | Business onboarding | signup → dashboard | Auth/profile | PARTIAL | FIX BEFORE LAUNCH | P1 | Flutter | Required | Web/mobile | No | Medium | Journey spread across screens | One progress checklist |
| Business | Service Areas | preferences/map | `saveDiscoveryPreferences` | READY | LAUNCH | P1 | Backend/Flutter | Passed staging | Web | No | High | Manual refresh history | Keep authoritative listener |
| Business | Dashboard | business dashboard | Firestore queries | PARTIAL | FIX BEFORE LAUNCH | P1 | Flutter | Required | Web/mobile | Indirect | Medium | Dense and multiple competing tools | Prioritize campaigns/next action |
| Business | Campaign catalog/types | create screens | work taxonomy | PARTIAL | FIX BEFORE LAUNCH | P1 | Flutter | Required | Web/mobile | High | Duplicate/legacy create screens | One canonical wizard |
| Business | Materials plan | campaign wizard | campaign material policy | READY | LAUNCH | P1 | Backend/Flutter | Passed staging | Web | Indirect | Copy can be verbose | Defaults + progressive detail |
| Business | Fulfillment selection | campaign wizard | material logistics | READY | LAUNCH | P1 | Backend/Flutter | Passed staging | Web | Indirect | Many choices exposed early | Infer safe defaults |
| Business | Zone mapping | campaign area/locations | Firestore + analysis callable | READY | LAUNCH | P1 | Flutter/backend | Passed staging | Web/map | High | Refresh/drawing friction observed | Preserve draft and simplify recovery |
| Business | Zone/property analysis | Zone screens | `analyzeCampaignZone` | READY | LAUNCH | P1 | Backend | Passed staging | Web/map | Indirect | Provider failure UX needs review | Simple unavailable/retry state |
| Business | Property Intelligence | intelligence center | platform-core + provider secrets | PARTIAL | COMING SOON | P2 | Backend | Required | Web | Subscription | High | Provider/entitlement complexity | Gate to entitled beta |
| Business | Weather Intelligence | weather screens | weather Function | PARTIAL | COMING SOON | P2 | Backend | Required | Web | Subscription | Medium | Operational value not launch-proven | Gate beta, no core dependency |
| Business | Campaign quote | campaign details/create | `quoteCampaignFunding` | READY | LAUNCH | P1 | Funding tests | Passed LIVE/TEST | Web | High | None material | Retain server authority |
| Business | Stripe campaign Checkout | funding CTA | `createCampaignFundingCheckoutSession` | READY | LAUNCH | P0 | Funding tests | Passed LIVE | Web/Stripe | Critical | None material | Retain |
| Business | Post-Checkout return | `/campaign-funding-return` | campaign listener | READY | LAUNCH | P1 | Flutter/hosted QA | Passed staging | Browser | Critical | Delayed/failure/expired financial fixtures remain separate | Retain authoritative listener |
| Business | Publish funded campaign | funded draft CTA | `publishFundedCampaign` | READY | LAUNCH | P0 | Backend/Flutter | Passed LIVE/TEST | Web | Critical | None material | Retain |
| Business | Applicants list | applicants screens | applications + assignment-core | READY | LAUNCH | P1 | Backend/Flutter | Passed staging | Web | Indirect | Duplicate screen families | Consolidate |
| Business | Assign Scaler | applicants | `assignScalerToZone` | READY | LAUNCH | P0 | Backend/race tests | Passed staging | Web | Critical | None material | Retain transactional guard |
| Business | Job Room | Job Room | production `job-room-core:getJobRoom`; remaining authorities staging/split | PARTIAL | FIX BEFORE LAUNCH | P0 | Focused tests | Routing/aggregate production verified | Web/mobile | Indirect | Remaining Job Room authority migration is part of worker-lifecycle P0 | Complete after physical gate |
| Business | Material handoff | `/job-room/<zoneId>` | `transitionMaterialHandoff` + production `job-room-core:getJobRoom` | PARTIAL | FIX BEFORE LAUNCH | P1 | Backend/Flutter | Aggregate production verified | Web/mobile | Indirect | Transition ownership migration remains | Single-Scaler aggregate is 1/1; retain group semantics |
| Business | Coordination/readiness | Job Room | configure/acknowledge callables | PARTIAL | FIX BEFORE LAUNCH | P1 | Focused tests | Passed staging | Web/mobile | Indirect | Production split ownership | Migrate coherently |
| Business | Active campaign status | details/dashboard | campaign/Zone projections | PARTIAL | FIX BEFORE LAUNCH | P1 | Flutter | Required | Web/mobile | High | Summary/detail drift | Derive/reconcile projections |
| Business | Completion evidence review | campaign Zones | `finalizeZoneReview` staging | PARTIAL | FIX BEFORE LAUNCH | P0 | 22 backend tests | Emulator pass | Web | Critical | Production newer authority absent | Physical gate then promote |
| Business | Approve earning | “Approve Payment” dialog | `finalizeZoneReview` | PARTIAL | FIX BEFORE LAUNCH | P1 | Backend/Flutter | Emulator pass | Web | Critical | Copy conflates earning/payment | Rename “Approve completed work” |
| Business | Request redo | review dialog | `finalizeZoneReview(request_redo)` | READY | LAUNCH | P1 | Backend/Flutter | Emulator pass | Web/mobile | Indirect | None material | Retain |
| Business | Eligible cancel/refund | campaign detail | `cancelUnassignedFundedCampaign` | READY | LAUNCH | P0 | Backend/hosted LIVE | Passed LIVE | Web | Critical | None material | Retain policy |
| Business | Refund finality | campaign detail/history | signed `stripeWebhook` | READY | LAUNCH | P0 | Replay tests | Passed LIVE | Web | Critical | None material | Retain |
| Business | Soft archive | campaign detail | `archiveCanceledCampaign` | READY | LAUNCH | P1 | Backend/Flutter | Passed LIVE | Web | High | None material | Retain |
| Business | Create revised campaign | canceled campaign | client prefill + fresh quote | READY | LAUNCH | P1 | Flutter | Passed staging | Web | High | Review copying breadth | Keep financial fields excluded |
| Business | Campaign history/financial history | dashboard/detail | campaigns/payments/events | PARTIAL | FIX BEFORE LAUNCH | P1 | Rules | Required | Web | Critical | No unified ledger/timeline | Add read-only timeline |
| Business | Subscription purchase/portal | subscription screen | legacy/default purchase functions | PARTIAL | FIX BEFORE LAUNCH | P1 | Backend | Required | Web/Stripe | Critical | Legacy ownership and UI audit needed | Isolate and test |
| Business | Managed Growth | managed-growth screens | platform-core | PARTIAL | COMING SOON | P2 | Backend/Flutter | Beta only | Web | High | Broad workflow, image generation incomplete | Entitled beta only |
| Business | Social publishing | social approval | platform-core/provider capability | PARTIAL | COMING SOON | P2 | Backend | Provider QA required | Web | Pass-through | High | Provider-dependent controls disabled | Keep gated |
| Business | Direct mail/postcards | Managed Growth artifacts | planning model only | NOT IMPLEMENTED | COMING SOON | P2 | Policy tests | No | Web | Critical | No complete payment/fulfillment authority | Do not expose purchase CTA |
| Business | Profile | profile screen | users/profile | READY | LAUNCH | P1 | Rules/Flutter | Required | Web/mobile | No | Medium | None material | Retain |
| Scaler | Pending approval | pending/profile | profile authority | PARTIAL | FIX BEFORE LAUNCH | P1 | Backend | Required | Web/mobile | No | High | Admin approval workflow incomplete | Add status/next action |
| Scaler | Profile completion | `/complete-scaler-profile` | `updateScalerProfile` | READY | LAUNCH | P1 | Backend/Flutter | Required | Mobile/web | No | High | Route matrix pending | Test deep links |
| Scaler | Work Preferences | areas preferences | `saveDiscoveryPreferences` | READY | LAUNCH | P1 | Backend/Flutter | Required | Web/mobile | No | High | Form is long | Progressive disclosure |
| Scaler | Work Areas | map/preferences | discovery-core | READY | LAUNCH | P1 | Backend/Flutter | Required | Web/map | No | High | None material | Retain |
| Scaler | Vehicle/cargo/consent | preferences | profile/discovery authority | READY | LAUNCH | P1 | Backend | Required | Mobile | No | High | Too many controls at once | Conditional fields |
| Scaler | Marketplace | marketplace screens | campaign queries/matching | READY | LAUNCH | P0 | Backend/Flutter | Passed staging | Web/mobile | Indirect | Multiple marketplace screens | Consolidate later |
| Scaler | Job map/details | marketplace/detail | campaign/Zone reads | PARTIAL | FIX BEFORE LAUNCH | P1 | Rules/Flutter | Required | Mobile/map | Indirect | Exact/private location boundary needs QA | Role-private display audit |
| Scaler | Apply | campaign detail | maintained application authority | READY | LAUNCH | P0 | Backend | Passed staging | Web/mobile | Indirect | None material | Retain |
| Scaler | Applied campaigns | applied screen | applications query | READY | LAUNCH | P1 | Flutter | Required | Web/mobile | No | Medium | None material | Retain |
| Scaler | Assignment acceptance/group slot | job/application | assignment-core | READY | LAUNCH | P0 | Backend/race | Passed staging | Web/mobile | Critical | None material | Retain |
| Scaler | Job Room | job-room screen | production `job-room-core:getJobRoom`; remaining authorities staging/split | PARTIAL | FIX BEFORE LAUNCH | P0 | Focused | Routing/aggregate production verified | Mobile | Indirect | Remaining authority migration awaits physical gate | Complete coherent migration later |
| Scaler | Material receipt | `/job-room/<zoneId>` | handoff callable + production `job-room-core:getJobRoom` | PARTIAL | FIX BEFORE LAUNCH | P1 | Backend/Flutter | Aggregate production verified | Mobile | Indirect | Handoff callable migration remains | Single-Scaler aggregate is 1/1; retain group semantics |
| Scaler | Readiness | Job Room | acknowledgment callable | READY | LAUNCH | P1 | Focused | Passed staging | Mobile | Indirect | None material | Retain prerequisites |
| Scaler | Start/active tracking | native job screen | completion-core | PARTIAL | FIX BEFORE LAUNCH | P0 | 22 backend + emulator | Emulator pass | Physical Android | Critical | Physical proof missing | Execute P0-1 |
| Scaler | Checkpoints/photos | native job screen | checkpoint + Storage | PARTIAL | FIX BEFORE LAUNCH | P0 | Rules/backend | Emulator partial | Physical Android | Critical | Real camera flow unproven | Physical test |
| Scaler | Complete tracking | native job screen | completion-core | PARTIAL | FIX BEFORE LAUNCH | P0 | Backend | Emulator pass | Physical Android | Critical | Production authority absent | Gate promotion |
| Scaler | Submit completion | submit screen | `submitZoneCompletion` | PARTIAL | FIX BEFORE LAUNCH | P0 | Backend | Emulator pass | Physical Android | Critical | Production default defect lineage | Promote corrected authority |
| Scaler | Redo | job detail | completion-core | READY | LAUNCH | P1 | Backend/Flutter | Emulator pass | Mobile | Indirect | None material | Retain |
| Scaler | Earning authority | review result | `scalerEarnings` via finalize | PARTIAL | FIX BEFORE LAUNCH | P0 | Backend | Emulator pass | Physical Android | Critical | Production not migrated | Gate promotion |
| Scaler | Wallet balance/history | wallet screen | wallet projection/transactions | READY | LAUNCH | P0 | 8 backend/Rules | Emulator pass | Web/mobile | Critical | Copy mentions payouts | Align with launch cash-out policy |
| Scaler | Cash-out/withdrawal | Wallet | no proven general launch backend | NOT IMPLEMENTED | HIDE | P0 | None | No | Mobile | Critical | No launch-safe operating model | Satisfy P0-3 |
| Scaler | Notifications | dashboard/inbox | notifications + email jobs | READY | LAUNCH | P1 | Backend/Rules | Required | Web/mobile/email | Indirect | Push is Coming Soon | Keep push disabled/labeled |
| Scaler | Support | Job Room/support | staging `createSupportCase` | PARTIAL | FIX BEFORE LAUNCH | P0 | Focused | Required | Mobile | Indirect | Production absent | Include operations migration |
| Scaler | Reviews/reputation | review screens/cards | reviews | PARTIAL | LAUNCH | P2 | Flutter/Rules limited | Required | Web/mobile | Indirect | Multiple legacy review surfaces | Consolidate later |
| Scaler | Account settings | settings/profile | Auth/profile | PARTIAL | FIX BEFORE LAUNCH | P1 | Flutter | Required | Mobile | No | Medium | Route restoration | Named route shell |
| Admin | Secure admin login/gate | `/admin/login`, `/admin` | Auth + admin role | READY | LAUNCH | P0 | Backend/Flutter/hosted QA | Passed production | Web | No | Critical | None material | Retain authoritative role/profile gate |
| Admin | Admin role management | admin screen | `setApplicationAdminRole` | READY | LAUNCH | P0 | Backend | Required | Web | No | Critical | None material | Retain audited replacement rule |
| Admin | Beta entitlement grants | admin/internal screen | grant/revoke callables | READY | INTERNAL ONLY | P1 | Backend | Required | Web | High | Internal QA only | Keep restricted |
| Admin | Subscription overview | admin screen | subscriptions | PARTIAL | LAUNCH | P1 | Flutter | Required | Web | Critical | Read-only and fragmented | Keep; add correlation later |
| Admin | Provider/platform health | admin screen | configuration status | PARTIAL | LAUNCH | P1 | Flutter | Required | Web | No | High | Not runtime health | Label configuration vs health |
| Admin | Open issues | Admin Command Center | `admin-ops-core:getAdminOperationsOverview` | READY | LAUNCH | P0 | Backend/Flutter | Passed production | Responsive web | Indirect | None material | Retain bounded Needs Attention model |
| Admin | Payments/refunds operations | Admin Command Center/timeline | reconciled payment/refund records via `admin-ops-core` | READY | LAUNCH | P0 | Backend/Flutter | Passed production | Web | Critical | Read-only visibility; recovery remains purpose-built | Preserve financial authority separation |
| Admin | Completion/earning operations | Admin Command Center/timeline | completion/earning/Wallet read model via `admin-ops-core` | READY | LAUNCH | P0 | Backend/Flutter | Passed production | Web | Critical | Production worker authority migration remains P0-2 | Keep read model compatible with current authority |
| Admin | Affiliate rates/overview | no primary nav | affiliate callables | PARTIAL | INTERNAL ONLY | P2 | Backend | Required | Web | Future | High | Payout liability incomplete | Keep restricted |
| Sales | Minimum lead funnel | `/sales` staging candidate | `sales-core` + server-owned Sales records | PARTIAL | FIX BEFORE LAUNCH | P0 | Backend/Flutter focused + full suites | Hosted staging required | Responsive web | Indirect | Admin is temporary launch Sales authority; production unchanged | Complete hosted QA, then production review |
| Operations | Payment/refund monitoring | Admin Command Center/timeline | bounded reconciled payment/event read model | READY | LAUNCH | P0 | Backend/Flutter | Passed production | Web | Critical | Typed recovery commands intentionally separate | Retain read model |
| Operations | Email failure queue | Admin Command Center | durable email job read model | READY | LAUNCH | P1 | Backend/Flutter | Production surface + focused tests | Web | Indirect | Provider retry execution remains existing authority | Retain failed/exhausted/long-pending classifications |
| Operations | Provider outage handling | Admin Command Center health | provider errors/adminIssues + partial-load state | READY | LAUNCH | P1 | Backend/Flutter | Passed production | Web | Indirect | Categorical status, not synthetic uptime | Add measured telemetry later |
| Operations | Support case handling | Admin Command Center | support cases + typed audited status transition | READY | LAUNCH | P0 | Backend/Flutter | Passed production surface/tests | Web | Indirect | No full ticketing suite by design | Retain Open → In Progress → Resolved scope |
| Operations | Release/rollback runbook | docs/release process | Firebase/Git | PARTIAL | FIX BEFORE LAUNCH | P1 | Manual | Required | N/A | Critical | Distributed historical notes | One release runbook |
| Operations | Flutter web update/cache recovery | Hosting + Flutter service worker | Firebase Hosting/CDN + browser cache | PARTIAL | FIX BEFORE LAUNCH | P1 | Direct HTTP + Firefox production QA | Required | Browser | No | High | A browser exposed to a broken intermediate release retained stale HTML for an asset path | Audit service-worker updates, cache headers, atomic release/rollback, and automatic recovery |
| Affiliate | Join program | affiliate screen | `joinScalerAffiliateProgram` | READY | LAUNCH | P2 | Backend | Required | Web/mobile | Future | High | Commission payout not implemented | Clearly label accrued/not payable |
| Affiliate | Attribution/dashboard | affiliate screen | attribution/dashboard callables | READY | LAUNCH | P2 | Backend | Required | Web/mobile | Future | High | Subscription commission incomplete | Keep field-campaign scope explicit |
| Affiliate | Commission settlement/payout | no complete surface | incomplete ledger/provider path | NOT IMPLEMENTED | COMING SOON | P2 | Negative tests | No | N/A | Critical | Liability/payout model incomplete | Do not promise payment date |

## Visible capability totals

- Total: 99
- Public: 14
- Business: 33
- Scaler: 25
- Admin: 9
- Sales: 1
- Operations: 6
- Affiliate: 3
- Shared: 8

Status summary: READY 43; PARTIAL 46; BROKEN 2; NOT IMPLEMENTED 8; LEGACY 0. Launch decisions: LAUNCH 47; FIX BEFORE LAUNCH 41; HIDE 2; COMING SOON 6; REMOVE 0; INTERNAL ONLY 3. Priorities: P0 31; P1 55; P2 13; P3 0. A capability may be technically ready yet still require P1 manual launch QA.

## Backend-only legacy authority inventory

| Authority | Production state | Maintained caller | Classification | Decision |
|---|---|---|---|---|
| `fundCampaign` | ACTIVE/default | No maintained client caller | LEGACY; traffic-sensitive history | Retain until monitored targeted retirement |
| `approveZonePayout` | ACTIVE/default | No intended new flow; older UI terminology remains | LEGACY competing completion/payout authority | Retire only after completion migration |
| `requestCampaignCancellationRefund` | Source/legacy path | No maintained client caller found | LEGACY competing refund authority | Exclude from new deployments; later traffic audit |
| `campaignTracking` | ACTIVE/default | Legacy tracking surfaces possible | LEGACY | Inventory traffic/callers before retirement |
| `provisionCampaignTracking` | ACTIVE/default | Legacy provisioning | LEGACY | Same migration as tracking |
| `submitCampaignReview` | ACTIVE/default | Review screens require caller audit | LEGACY/PARTIAL | Reconcile with finalize review model |
| `reportCampaignReview` | ACTIVE/default | Review caller audit required | LEGACY/PARTIAL | Consolidate review authority |
| `purchaseSubscription` | ACTIVE/default | Subscription UI/backend audit required | LEGACY/PARTIAL | Isolate before retirement |
| `deleteDraftCampaign` | ACTIVE/default | Draft delete compatibility | LEGACY | Retain pending traffic audit |
| `localOpportunityAlerts` | ACTIVE/default | Historical/local alert path | LEGACY | Confirm production traffic and intended policy |

Legacy count: 10.

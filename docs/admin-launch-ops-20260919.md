# Admin launch operations — September 19, 2026

Read-only modernization of the existing Admin overview, plus a narrow read-only operations permission group in the maintained Admin role-management framework.

## Authority
Full Admin alone may grant/revoke 30-day operations-read access to an existing verified account. The normal user role stays unchanged. Grants and revocations use adminAuditEvents; replay is duplicate-safe. The grant authorizes only the overview and redacted campaign timeline. It does not authorize support mutations, payments, subscriptions, refunds, payout/bank actions, configuration, secrets, role changes, publishing, impersonation or record deletion. Workspace work remains separately controlled by existing Team permissions. No assistant has been granted access during implementation.

The read-only route is /#/admin/operations. Full Admin retains /#/admin. No Rules change is needed: existing user create/update allowlists prohibit clients from writing adminOperationsAccess.

## Overview
- Unavailable or capped (>100) collection inventories retain unknown counts.
- Workspace-bound research last/next time, saved outcomes, dedupe, unavailable sources and stale leases; zero results are truthful.
- Social authorization/pause, worker and provider health, scheduling/publication counts; current-policy scheduling is separated from historical/manual jobs.
- ScaledCircle internal workspace is read through the maintained Founder-authorized Growth bridge, separately from Attractive Remodel. The new assistant grant does not bypass that internal-workspace restriction.
- Billing, complimentary memberships, cancellations, Team seat issues and failed reconciliation; no gross-money revenue inference.
- Push receipt failures without tokens, message bodies or arbitrary provider payloads.
- Bounded read-only control-plane metadata for Hosting/Rules/Function revisions/scheduler and the actual funding gate. Denied metadata reads remain unavailable, never imply healthy.
- Native candidate evidence is a dated store checkpoint with its distinct source SHA.
- Existing campaign/support details and Growth/Social/provider/subscription screens retained.

## Truth checkpoints
LIVE Connect and genuine recipient onboarding/readiness are Founder-certified. LIVE earning -> cash-out -> bank receipt remains pending; paid-work hold remains active. No financial or Social action was performed.
Google branding verified at maintained checkpoint; Gmail restricted review and Founder video remain open. No OAuth credentials or configuration changed.
Apple build 28 processed and assigned to ScaledCircle Internal, Ready to Submit. Android 25 available through Internal Testing. Native source 4fcdd8780677d5ff75acd498f1883a04b964f76f predates these Admin changes.

## Validation
Focused backend, Rules, Flutter and analyzer checks; no full release regression. Production deployment and rendered readback are recorded in the task result. Native binaries are not rebuilt for this Admin iteration.

# Managed Growth Email access repair

The normal Email authority previously required a private mailbox invitation before evaluating workspace entitlement. `BusinessEmailEntry` hides itself when that callable denies access, so this was both a server product gate and a missing navigation defect. The direct route already uses Business authentication, not Lead Generation or Business Assistant. Google provider eligibility was conflated with product eligibility.

Read-only production evidence: mrhealthynut is verified, active Business, Managed Growth, no add-ons, cancellation scheduled, entitlement active through 2026-10-10T10:04:44Z (06:04:44 EDT), ten seats, no connected mailbox. Attractive Remodel retains complimentary Managed Growth through November 13 and its connected Google mailbox with automatic sending off.

The existing shared subscription resolver now grants the Email workspace/campaign access decision for all active Managed Growth records, including legitimate complimentary records and future access-through cancellation. No new entitlement system or per-account product grant. Existing invited lower-plan behavior is preserved, not broadened. Expired Managed Growth owners can read saved history; paid mutations remain denied. Workspace membership, seat, communications permissions, current consent, and owner-only connection management remain required.

Google onboarding remains independently blocked without the existing exact workspace/owner/mailbox invitation. No new invitation is added. Existing invitations and credentials remain untouched. New uninvited workspaces default sending off. Social authorization is never consulted. The UI consumes the server's access decision and shows Included with Managed Growth, Email Campaigns, and a truthful Google connection limitation.

Scope: businessEmailOperationsV1 and production Hosting only. No callback/scheduler/Rules/billing/Stripe mutation. No connect/send/revoke. Existing mailbox scheduled jobs and approved-content controls remain unchanged.

Focused proof: 59 backend/provider/campaign tests (58 initially pass; the new test's authorized member lacked consent, corrected fixture and rerun passed); 16 Flutter Email/campaign tests pass; analyzer clean. Emulator files share a project and must run sequentially. Production read-only authority evaluation and before/after subscription/mailbox hashes retained under `.firebase/launch-close-20260919`.

Founder retest: Business → Growth → Business Email → Email Campaigns. mrhealthynut should open the workspace without an add-on and see Google connection temporarily limited. Stop there. A separate Founder-approved mailbox identity and audited Google-only provider invitation are required before recording first-time consent; no product-entitlement exception is required for Managed Growth.

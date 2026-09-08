# Workspace and mobile launch candidate

This candidate is verified in staging. Production promotion and LIVE billing remain held.

Authenticated startup resolves identity, onboarding and consent before routing to the appropriate role home. Root and Login share that resolution. Account contains visible Sign Out, Team and Billing / Plan actions.

Business workspaces include the owner in their server-enforced capacity: Starter 1, Growth 3, Scale 5, Managed Growth 10. Invitations reserve seats transactionally, expire, require the intended verified email and legal consent, and can be accepted once. The maintained outbound-email worker delivers invitations. Removed members lose authority without losing historical attribution.

Customer responsibilities are Campaigns, Authorize Campaigns, Payments, Intelligence & Growth Tools, Analytics & Results, Team Management, and Billing & Plan. Presets are Admin, Campaign Manager, Analyst, Finance, and Custom. Sensitive actions validate the actual actor and canonical workspace independently. Editing never implies spending authority.

Billing cancellation is scheduled for the paid period's end. Pending cancellation can be withdrawn. Provider reconciliation retains current paid access and preserves funded campaigns, accepted compensation and history. After the term ends, the owner retains historical and outstanding-obligation access; new paid actions require reactivation. Downgrades cannot silently discard team members. Subscription reconciliation never changes marketplace Wallet balances.

Canvassing progress is automatic. The ordinary manual progress button is removed; access, safety and note actions serve distinct purposes. Business progress refreshes at a bounded foreground cadence. Started, base-threshold, accepted-bonus-threshold and submitted milestones are deduplicated. Displays use Route Coverage Estimate, never inferred household counts.

Submitted work has a dedicated non-resumable result screen and appears under Awaiting Business Review. Final coverage, accepted base, eligible bonus and held payment remain visible. Display-only route simplification preserves authoritative evidence; off-route warnings require sustained, sufficiently accurate evidence. Native acquisition, background bridges, accepted-point validation, coverage calculations and Scaler completion authority are unchanged.

## Verification

- Flutter staging suite: 532 passed, one pre-existing skipped test; analyzer clean.
- Backend suite: 736 passed, two existing skipped tests.
- Workspace, subscription, live progress, funding and Rules emulator suite: 45 passed.
- Privacy and completion emulator suite: 75 passed.
- Production-compatible pinned-package lifecycle suite: 15 passed, using local emulators and blocked external providers.
- Real Stripe TEST subscription lifecycle: cancellation, reactivation, term expiry, no second renewal, event deduplication, and unchanged marketplace obligations verified. No LIVE customer was changed.
- Generated codebases and diff checks pass. Responsive widget checks cover mobile and desktop widths.

Hosted checks cover actual authenticated Business and Scaler routing, Team, Account, submitted result and Business review evidence. Source/widget tests are not substituted for device observation. Existing physical evidence remains valid for unchanged native tracking; refreshed mobile builds need startup and presentation sanity checks.

## Production release hold

The production package must be regenerated from this candidate and reviewed as a whole. It preserves pinned production publication semantics, legacy financial behavior and prospective contract guards. Staging QA creators, identity allowlists, TEST contracts and secrets are excluded. Production Growth, Scale and Managed Growth Stripe price bindings still require authorized configuration. Existing held mobile artifacts predate this candidate and must be rebuilt before promotion. Production logistics-privacy deployment, legitimate LIVE payment smoke and final go/no-go remain separate release gates.

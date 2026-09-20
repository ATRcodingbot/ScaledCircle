# Controlled Google onboarding invitation

The existing Managed Growth Email entitlement remains unchanged. Google onboarding still requires the maintained private invitation configuration. This change adds an optional bounded `onboardingInvitation` to that configuration, not a product entitlement or a new invitation database.

For the Founder-authorized recording, the server configuration binds the existing verified owner, workspace, Google provider and exact mailbox. The grant records purpose, grant source, granting operator, time and a seven-day expiry. Private identifiers and deployment configuration remain outside source control. No send permission is enabled by this invitation.

Both connection setup and callback re-evaluate the owner, workspace, current subscription/access-through, current consent and unexpired invitation. The provider registry enforces Google-only scope. Callback checks the provider-returned mailbox against both the original attempt and current invitation. Existing unbounded private invitations are preserved unchanged. OAuth attempts retain their existing ten-minute expiry and duplicate-safe behavior.

Before a verified connection exists, the screen says: “No mailbox connected. Choose the permissions to request, then connect Google.” Requested Read/Send switches do not establish granted provider permissions.

Focused validation: 38 backend tests, including expiry, incorrect owner/workspace/mailbox/provider and expiry between request and callback; 15 Flutter tests including enabled invited button without clicking it, disabled uninvited button and truthful disconnected copy; focused analyzer clean.

Google Console readback: production External audience, 2/100 unverified users, verification-required warning. No Google settings, clients, scopes, credentials or working mailbox connections changed. An unverified-app warning may appear during the Founder recording; it must not be concealed. Broad onboarding remains gated pending review.

Deployment scope: only `businessEmailOperationsV1`, `businessEmailCallbackV1` and Hosting. Each Function preserves its own existing environment and secret bindings except adding the exact reviewed invitation. No OAuth attempt, connection, send, billing or subscription mutation is performed by this repair. Production readbacks are stored privately under `.firebase/launch-close-20260919/email-demo-*`.

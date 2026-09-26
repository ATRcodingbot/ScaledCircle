# Mike Email OAuth attempt — September 26, 2026

## Disposition

Founder confirmed that Google opens and Mike entered an invalid password on Google's sign-in page. This is a Google account sign-in failure before authorization/callback, not evidence of a ScaledCircle app-password failure. Google did not send an OAuth error code to the retained callback logs. No Google configuration change or account/password reset was made.

Status: **BLOCKED — Google sign-in password rejected (Founder-reported); connection not established.** Mike is correcting his own Google sign-in. Do not send email.

The original connection request was created at 2026-09-26 17:00:31.020 UTC (1:00:31.020 PM Eastern), expired at 17:10:31.020 UTC, and remains pending in retained history. After correcting Google sign-in, a new Connect Email initiation is necessary; the expired tab cannot complete the request. This is a meaningful new initiation, not a blind repeat of an unexplained failure.

## Read-only production evidence

- Business/Firebase UID: eB8aNIMTq5bf5oxEGrt6Ts0jKnv1. Saved actor, workspace and expected mailbox match Mike.
- Initiation: Read + Send selected; server returned HTTP 200. Founder confirms Google opened.
- Callback: none observed for this attempt in retained logs. No authorization-code receipt or token exchange demonstrated.
- Last readback: 2026-09-26 17:14:10.831 UTC. Mailbox root exists with pending attempt only; connected status/permissions absent. Private credential document absent; no encrypted refresh credential persisted.
- Operations revision businessEmailOperationsV1 / businessemailoperationsv1-00031-cam. Callback revision businessEmailCallbackV1 / businessemailcallbackv1-00004-jiw. Region us-east1, project scaled-circle.
- OAuth client: 1010956217112-nqe30km9psk0q8cb6kqin40m43buegn4.apps.googleusercontent.com, named ScaledCircle Production Business Email Private Beta.
- Redirect sent and registered: https://us-east1-scaled-circle.cloudfunctions.net/businessEmailCallbackV1. Registered origin: https://scaledcircle.com. Exact match verified in Google Cloud.
- Google Audience: External, In production, cap 3/100. Testing-only test-user restrictions are not applicable. Branding verified; data access under review.
- Gmail API enabled.
- Requested scopes: openid, email, https://www.googleapis.com/auth/gmail.readonly, https://www.googleapis.com/auth/gmail.send. Google labels readonly restricted and send sensitive, both not yet verified in this project's Data Access view. That verification state alone does not establish the cause of Mike's failed sign-in.
- PKCE S256 and encrypted verifier/nonce; ten-minute actor/workspace/mailbox-bound state. Callback rechecks authority and mailbox, exchanges code, validates verified Google identity and refresh token, then encrypts persisted credential and atomically records connection.
- Callback success currently provides a Return to ScaledCircle instruction; no automatic redirect. This did not cause the observed pre-callback sign-in failure.

## Verification and boundaries

Existing Email backend suite was included in 104 passing backend checks. Current web regression suite: 38 passing tests, including direct Email route/login return and provider/entitlement states. These are not evidence of a completed live Google authorization.

No production sends, credential reset, OAuth scope expansion, consent-screen change, callback replay or fabricated connection. Await the actual new returned connection state before certifying CONNECTED. Independent CSV/maps/campaign work remains separate.

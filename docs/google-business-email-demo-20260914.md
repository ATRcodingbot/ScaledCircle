# Google Business Email verification evidence

Prepared September 14, 2026. This is a recording/submission package, not a recorded video or Google approval.

## Saved declaration and provider state

Production project: scaled-circle. Google confirmed `Data access changes saved!` after the Founder-approved save. The verification submission summary lists exactly:

- openid — non-sensitive.
- https://www.googleapis.com/auth/userinfo.email — Google's displayed identity-email scope (runtime requests email).
- https://www.googleapis.com/auth/gmail.send — sensitive, not yet verified.
- https://www.googleapis.com/auth/gmail.readonly — restricted, not yet verified.

Branding remains verified and shown to users. Client IDs, callbacks and existing credentials were not edited. The production Attractive Remodel UI still reports its invited Gmail mailbox Connected with Read/Send enabled and automatic sending Off. Saved campaign summary reports seven sent, zero replies; this was not a new send or reply test.

The actual Prepare for verification form contains both saved scope justifications. Its blocking error is `Missing the following fields for one or more requested scopes: demo video`; Confirm is disabled. Additional information has been prepared in the form but is not submitted. A true unlisted YouTube URL is still needed.

## Recording sequence

Use a real screen recording, in English. Do not use a slideshow as proof of runtime behavior. Avoid unrelated recipients, message bodies, credentials and browser tabs.

1. Show ScaledCircle's public homepage and public Privacy Policy at `https://scaledcircle.com/#/privacy`, including Connected Google Business Email. The disclosure was visibly verified in production September 19; it describes actual data handling, but is not itself evidence of organization-wide Limited Use compliance or Google's approval.
2. Show the authenticated Business Email page for the intended Business. Explain the separate Read leads and Send approved email capabilities. Existing Attractive Remodel must remain connected.
3. Show the actual OAuth consent grant, ScaledCircle branding, exact requested permissions and the client ID in Google's address bar. Use an existing truthful recording, or a separately authorized verification account. Do not revoke/reconnect Attractive Remodel just to manufacture this segment. The existing connected-state view is not evidence of a fresh grant.
4. Show the saved Email Campaigns view and the existing campaign's Review Campaign screen. This initial review loads saved application records. Show the reviewed copy, approval/version context and saved results, concealing unrelated contacts. Do not press approval, send, schedule, resume, discovery or refresh actions.
5. Show the existing controlled conversation/reply evidence if available and explicitly authorized. Distinguish it from the seven-recipient campaign, which currently shows zero replies. Do not invent a reply or send another message for this video.
6. Explain background reply reconciliation and previously approved scheduled campaigns. Connection alone does not approve new messages. Do not say all operations are manual.
7. Show where Disconnect is available without pressing it. Explain that it removes ScaledCircle's stored credential, not saved CRM history or Google's own authorization. Explain Google Account revocation and support deletion requests separately.

A recording of steps 1, 2 and 4 alone is insufficient: Google asks to see the grant flow and functionality enabled by each scope. No recording or uploaded video was fabricated in this work.

## Published factual privacy disclosure — production readback September 19

When you connect Google Business Email, ScaledCircle uses your Google account identifier and email address to identify the authorized mailbox. With your permission, we read relevant conversations, including participants, subjects, message text, dates and message identifiers, to show inquiries and replies, review historical contact context and opt-out requests, and reconcile approved outreach. We store relevant conversation excerpts, replies, contact records and campaign records in your Business workspace. With Send permission, we send messages you explicitly approve, including campaigns approved for later delivery. While connected, background checks can update replies and process approved campaigns. Connection credentials are encrypted on our servers. Disconnecting removes ScaledCircle's stored connection credential and disables new operations using that credential; it does not delete previously saved records or revoke permission in your Google Account. Contact support to request deletion of stored information, subject to applicable retention requirements.

Source basis: functions-business-email/gmail.js, service.js, campaigns.js, campaign_delivery.js and index.js. Do not promise cancellation of a request already in flight, instant deletion, a fixed retention term or blanket organization-wide Limited Use compliance from this source audit alone. Verify subprocessors, human access, advertising/model-use restrictions and retained-data handling before making the final policy assertion.

## Review gates

- Real unlisted demo URL, including relevant OAuth clients and grant flow.
- Google data-use and deletion/retention disclosure is published and rendered. Policy/compliance review of downstream processing and applicable assessment requirements remains separate.
- Google's required sensitive/restricted review and applicable independent security assessment. No assessment outcome is claimed.
- Keep new-customer Gmail onboarding gated until the required review is satisfied. Existing authorized connections remain intact.

Google review does not block separate native preparation. Store freeze still depends on the independent runtime-enrollment, native navigation and binary checks; do not substitute this scope save for those checks.

References checked September 14, 2026:
https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
https://developers.google.com/workspace/gmail/api/auth/scopes

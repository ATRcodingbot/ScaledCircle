# Google Business Email verification preparation

Current status (September 20, 2026): **SUBMITTED — DATA ACCESS UNDER REVIEW**. See the current readback below; earlier entries are historical preparation evidence, not the current submission state. This is not provider approval or store-readiness certification.

## Current production verification readback — September 20

One read-only check of Google Auth Platform for project `scaled-circle` confirmed: “Your branding has been verified and is being shown to users” and “Your app's data access is under review.” View verification progress explicitly says the Trust and Safety team has received the form. This supersedes the earlier Submitted: NO checkpoint taken before the Founder completed submission.

All seven categories are marked in progress: homepage requirements, privacy policy requirements, app functionality, branding guidelines, appropriate data access, request minimum scopes, and additional requirements. The expanded additional-requirements section says it is under review; no specific remediation request is shown. Google says first contact is expected within 3–5 days and review can take 4–6 weeks. The last approved consent screen remains in use.

The saved Data Access page still lists exactly `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/gmail.readonly`, and `https://www.googleapis.com/auth/gmail.send`, with the existing Email productivity use case and justifications. The saved demo is https://youtu.be/uZWplPJ1B6M. Both Gmail scopes remain marked not yet verified, consistent with review pending rather than approval.

Google displayed no submission timestamp or reference. The readback occurred around 05:12 EDT on September 20; that is an observation time, not an inferred submission time. CASA/security assessment remains open and is not certified complete. General new-customer Gmail onboarding remains gated pending required approval; normal Managed Growth Email product access and existing mailbox connections remain preserved. No resubmission, settings change, consent, disconnect, send, or credential operation was performed.

## Confirmed mismatch

Production project `scaled-circle`, function `businessEmailOperationsV1`, revision `businessemailoperationsv1-00008-cuw` requests `openid`, `email` and, according to the owner's selected permissions, `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`. The deployed Gmail adapter SHA-256 is `1168d13822ad04adb960bc6bcd357fc4f5fbaba5d3e760cddca86e6728624612`.

All three Data Access tables were empty in the production console. Google classifies Send as Sensitive and Read Only as Restricted. “Verification not required” on an empty declaration does not certify the deployed Gmail flow.

Runtime client: `1010956217112-nqe30km9psk0q8cb6kqin40m43buegn4.apps.googleusercontent.com`. Callback: `https://us-east1-scaled-circle.cloudfunctions.net/businessEmailCallbackV1`. Preserve client, credentials, existing grants and working Attractive Remodel send/reply evidence.

## Exact declaration prepared

- `openid`
- `https://www.googleapis.com/auth/userinfo.email` (Google's displayed equivalent of the runtime `email` identity scope)
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`

No profile, modify, compose, delete, full-mail or other API scope. Gmail use-case selection: Email productivity. Founder confirmed the exact save and Google returned “Data access changes saved!” on September 14. The saved submission summary contains exactly these four scopes and both justifications below. A declaration is not a grant to any mailbox; each owner must still consent, and verification is separate.

Send justification: Business owners connect their own Gmail or Google Workspace mailbox to send exact messages they have reviewed and approved, including approved Business Email campaigns and permitted outreach. Send is the narrow send-only scope used by the Gmail API. Broader compose, modify and full-mail scopes are not needed. Sending requires workspace authority, content approval and suppression checks. Connection alone does not enable automatic sending.

Read justification: Read access supports authorized Business mailbox conversations, detection and deduplication of replies to approved sends, and CRM conversation context bound to the correct workspace and contact. Read Only retrieves message bodies and thread context; metadata alone cannot provide readable conversations or reply content. No modify/delete access and no reading unrelated mail for advertising. New-customer onboarding remains restricted pending approval.

## Branding and public pages

Use ScaledCircle and the existing canonical 120x120 native logo `apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png`; do not regenerate it. Home: `https://scaledcircle.com/`. The actual rendered legal routes are `https://scaledcircle.com/#/privacy` and `https://scaledcircle.com/#/terms`. Bare `/privacy` is not a verified legal destination: it entered the authenticated application during inspection.

Developer contact: `support@scaledcircle.com`. The current Google support dropdown offers only `attractiveremodel@gmail.com` and no managed Google Groups. Do not invent selection or broaden IAM to force the desired address. Founder must make the maintained support identity eligible through Google's normal account/group mechanism before it can be selected.

The original September 14 privacy-page gap was repaired. September 19 production browser readback of `https://scaledcircle.com/#/privacy` visibly includes Connected Google Business Email: selected read/send capabilities; server processing/storage of message/thread context and CRM replies; encrypted credentials; disconnect versus Google revocation; and deletion/retention behavior. Account deletion now links its maintained flow conceptually and explains outstanding obligations and retained audit records. This disclosure does not by itself prove Limited Use compliance in all processing, including downstream AI access. Do not invent a security-assessment result or retention period.

## Required real evidence before submission

1. Verify Search Console ownership of `scaledcircle.com` with a Google account eligible for this project's verification. Domain listing alone is not ownership proof. Do not alter DNS blindly.
2. Record an unlisted demonstration covering every relevant OAuth client in the project: signed-in owner, exact Read/Send choices, complete Google consent including any test warning, exact mailbox binding, existing authorized conversation/reply, reviewed send controls and suppression, and disconnect/revocation controls. Do not expose tokens, unrelated mail, or private recipient data. Use approved certification data; no new message is authorized merely for this video.
3. Supply the real YouTube demo URL. The console requires one; none has been fabricated.
4. Complete accurate privacy/security disclosures and sensitive/restricted verification. Google's Gmail documentation requires a security assessment when restricted-scope data is stored or transmitted on servers; obtain the applicable Google assessment instructions and qualified assessment outcome. Do not claim approval before Google provides it.
5. Keep normal-customer Gmail connection held pending approval. Existing certified mailbox functionality may remain. Do not broaden runtime scope requests or revoke existing credentials for verification.

Sources inspected 2026-09-14: https://developers.google.com/workspace/gmail/api/auth/scopes and the actual production Google Auth Platform console. Submission remains incomplete; external review is not a reason to hold unrelated Core OS/store preparation.

## Completed provider readback, September 14

Branding was saved, verified by Google and explicitly published. The resulting console says: “Your branding has been verified and is being shown to users.” Name ScaledCircle; existing canonical logo; exact live hash-based legal routes; developer contact support@scaledcircle.com. Support dropdown remains the existing eligible attractiveremodel@gmail.com address; no IAM or group change was made. All three pre-existing authorized domains were preserved (Google reordered them).

Search Console Settings for the existing `https://scaledcircle.com/` URL-prefix property says “Ownership verification — You are a verified owner” while signed in as attractiveremodel@gmail.com. The separate domain-property URL was not accessible, but the existing verified URL-prefix property and successful Google branding verification mean no new DNS ownership change is indicated by this check. No DNS settings changed.

Sensitive/restricted scope verification remains separate from this completed branding result. After the confirmed scope save, Verification Center explicitly reports that data access is not verified and requires verification. Prepare for verification lists “Missing the following fields for one or more requested scopes: demo video”; Confirm is disabled. No demo URL, submitted review, or Google data-access approval exists in this preparation record.

The production Business Email UI was read after the declaration save: Attractive Remodel remains Connected to attractiveremodel@gmail.com, Read and Send are enabled, automatic sending is Off. No reconnect, token revocation, credential edit, callback change or new send was performed. This is connection-presentation readback, not a fresh send/reply certification.

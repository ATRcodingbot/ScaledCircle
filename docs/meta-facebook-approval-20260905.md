# Facebook approval packet — preparation only

Candidate `sc_fb_20260904_smart_mapping_v1`, known version suffix `_v1`.
Intended Page Scaled Circle `1198660363339503`. Current provider identity,
canonical database version, copy and permission grants require a fresh bounded
read before approval; old scheduled time is expired, not a new authorization.

Recovered exact image bytes from existing `codex/meta-first-publish-prep`
worktree (HEAD aa6b448), now preserved in `audit-media/meta-20260905/` with a JSON
manifest. SHA256 `2f453997dd7b59c24aa1246a2e197b3ba05b40817daa678428befeb11c1db28d`
matches the canonical packet. PNG 1200x630, 421804 bytes. Visual inspection shows
public Baltimore map demo, OSM attribution, explicit estimates and route-not-yet-
verified copy; no visible staging origin or customer PII. No regeneration occurred.

Proposed immutable hosting: `https://scaledcircle.com/social/<full-sha256>.png`.
Not uploaded or verified live. Before approval require public 200 image/png,
matching downloaded hash, no auth/expiring URL/staging redirects, privacy review
and a narrowly reviewed Hosting/media deployment. Audit media is deliberately
outside the deployable web tree.

Response path: a candidate-specific production `public_publish` Response Asset
under `https://scaledcircle.com/r?code=<actual-opaque-code>` resolving to approved
Business destination. No asset created here. Never borrow the frozen X asset or
invent a working code. Bind owner/campaign/content version and verify redirect
before freezing final copy/hash. Without that evidence, tracked-response claims
in the exact final post remain blocked.

Connection/release checklist: reverify Page identity; inventory existing grants
and Page tasks; proposed publish permission `pages_manage_posts`, read/list needs
`pages_read_engagement`/`pages_show_list` depending on maintained login flow.
Customer access requires App Review/appropriate access, not just app-role dogfood.
Meta docs returned HTTP429 during this audit, so current requirements are an OPEN
verification gate: [Page posts](https://developers.facebook.com/docs/pages-api/posts/).
No grant request or permission upgrade occurred.

One approved deterministic job must bind Page, immutable version, exact copy/hash,
media hash, Response Asset and approval digest. Reconnect changes credentials only;
identity mismatch stops the job. Ambiguous create reconciles provider ID/content/
media/actor/time before retry. URL shortening/image normalization belong in the
adapter, not a new customer action. Deleted historical content remains a receipt
with deletion evidence, never an automatic republish. Preserve terminal jobs.

Approval not yet executable: final canonical copy/version, production hosting,
Response Asset and current permissions remain open. Founder would approve this
specific complete payload and one future publication separately. Uploads/posts/
provider mutations in this pass: 0. externalPublishingEnabled remains disabled.

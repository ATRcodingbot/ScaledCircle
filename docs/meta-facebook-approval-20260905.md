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

Immutable hosting: `https://scaledcircle.com/social/2f453997dd7b59c24aa1246a2e197b3ba05b40817daa678428befeb11c1db28d.png`.
Verified September 5, 2026 by an anonymous GET: HTTP 200, image/png, exact SHA256,
and no redirect. Hosting was released under separate media approval. This is
media readiness only, not proof of Meta publication or permission authority.

Ordinary ScaledCircle posts use a natural Page/profile CTA. A tracked inline URL
or Response Asset is not a prerequisite. Any separately approved tracked CTA
must bind a verified production destination. Website visits, leads and conversions
remain NO_DATA unless attributable evidence exists; do not borrow another post's
attribution or invent a working tracking code.

Connection/release checklist: reverify Page identity; inventory existing grants
and Page tasks; proposed publish permission `pages_manage_posts`, read/list needs
`pages_read_engagement`/`pages_show_list` depending on maintained login flow.
Customer access requires App Review/appropriate access, not just app-role dogfood.
Meta docs returned HTTP429 during this audit, so current requirements are an OPEN
verification gate: [Page posts](https://developers.facebook.com/docs/pages-api/posts/).
No grant request or permission upgrade occurred.

One approved deterministic job must bind Page, immutable version, exact copy/hash,
media hash, CTA semantics and approval digest. Reconnect changes credentials only;
identity mismatch stops the job. Ambiguous create reconciles provider ID/content/
media/actor/time before retry. URL shortening/image normalization belong in the
adapter, not a new customer action. Deleted historical content remains a receipt
with deletion evidence, never an automatic republish. Preserve terminal jobs.

Approval not yet executable: current identity/grants, final canonical copy/version,
persistent publisher certification and insights baseline remain open. Prepare this
as part of a fresh bounded Meta week under APPROVAL_REQUIRED, with exact versions,
media, channels, future schedule and maximum creates. Do not reuse the old schedule
or activate BOUNDED_MANAGED. A prior quality score is not a fresh assessment.
No Meta publication is authorized by this packet.

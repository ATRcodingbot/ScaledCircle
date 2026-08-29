# Landing Page + Form V1 production release record

## Release identity

- Production deployment date: 2026-08-29
- Deployed and remote candidate: `840664db01a1580c6a91b78f2a64262a422196ba`
- Promotion method: non-force fast-forward to `origin/real-completion-proof`
- Deployment scope: Firebase Hosting only
- Product status: **Beta**
- Quality gates: Technically Correct **PASS**; Customer Ready **PASS**; Renewal Grade **PASS**

This release corrects Business router history and Landing Page Back navigation only. It does not change Landing Page, Attribution, lead, notification, email, payment, Rules, IAM, secret, provider, or Function authority.

## Hosting release

- Prior rollback version: `bbd041ab66301c8b`
- Prior rollback release: `1787960105001000`
- Prior live `main.dart.js` SHA-256: `43DDB99B92DA7656A10A2F782338771F0E1C3AA99FE55B6D00E1883AA25908B3`
- New production version: `933550b51107e4f3`
- New production release: `1788000550429000`
- Certified and live `main.dart.js` SHA-256: `6D116E94086F848D61199780CFA83E8322A7D09E38CBCA391CE159335816B523`
- Staging-certified version/release: `1ddf36e364cc0efc` / `1787999957316000`
- Staging-certified `main.dart.js` SHA-256: `A2C509133AF5D11D9C1911A105B5F03EB59B57C19FAC35208C5E7DB66ED96F6A`

The maintained Hosting rewrite order remains `/p/**` to `renderLandingPage`, `/landing-page-submit` to `submitLandingPageForm`, `/r` to `resolveTrackedResponse`, then the SPA fallback. No backend target was redeployed.

## Production navigation certification

- Direct `/#/business/landing-pages` rendered Landing Page — Beta with the standard Back control.
- In-app Back replaced direct entry with `/#/business`; Browser Back returned to the legitimate prior page rather than resurrecting Landing Pages.
- Normal Business navigation produced deterministic Browser Back and Forward transitions between Business and Landing Pages.
- Refresh-restored Landing Pages returned to Business; refreshing again remained on Business.
- A bounded double-click on Back produced one effective transition.
- Desktop and 390×844 mobile layouts passed without title collision or overflow.
- Visible screen, router-selected route, route information, and browser URL remained synchronized after settled transitions.
- Flutter/router console errors: zero, including zero `setState() called after dispose` events.

The existing production QA page `/p/YBT3EE7KH2RNAZ6H4VT6Y72X33TW2` remained published and rendered successfully on desktop and mobile. The missing-code `/r` path retained safe unavailable behavior. A Business actor remained denied from the Admin route without a bootstrap error.

## Preserved production actor evidence

The previously certified Tracking-Off inquiry remains authoritative: one existing published QA page, canonical inquiry, sales activity, submission receipt, Business notification, Business transactional email, and customer confirmation email. Tracking-Off isolation, zero attributable lead/conversion, and duplicate-effects zero remain valid. This navigation-only release did not repeat that side-effect-heavy proof.

## Safety and rollback

- New production Landing Pages, form submissions, leads, notifications, emails, and Attribution events: **ZERO**
- Functions, Firestore Rules, Storage Rules, indexes, IAM, secrets, providers, and financial systems changed: **ZERO**
- Force push: **NO**
- Immediate Hosting rollback target: version `bbd041ab66301c8b`, release `1787960105001000`

If a navigation-only regression is discovered, restore that Hosting release without reverting Landing Page data, leads, emails, Attribution data, Functions, Rules, or secrets unless independent evidence requires it.

## Multi-page workspace production promotion

The maintained Business workspace now supports multiple independently owned Landing Pages without overwriting the existing Tracking-Off page. It provides an explicit New Landing Page flow, owned-page selection, durable `pageId` selection, unsaved-change protection, and replay-safe page creation.

- Production Hosting version after multi-page promotion: `b44de60fb4207ff9`
- Production Hosting release after multi-page promotion: `1788012330650000`
- Certified `main.dart.js` SHA-256: `502935652C7A44BB2FA7AA321BF09257517353ADBF08948ACDE499D4D3BBA633`
- `getLandingPageWorkspace` source generation: `1788011899111524`
- `submitLandingPageForm` source generation: `1788012089079499`
- Runtime: Gen 2, Node.js 24, `us-east1`
- Pagination index: `landingPages`, collection scope, `businessUid ASC`, `createdAt DESC`, `__name__ DESC`
- Production index identifier: `CICAgNiav4AK`; state **READY**

Page discovery uses deterministic 20-record cursor pages with an explicit Load More contract. Automated 21-page and 45-page regressions proved no gaps or duplicates. Inquiry summaries use authoritative tenant-and-page-scoped Firestore aggregation counts rather than the removed 50-lead approximation; `3`, `61`, and `0` fixtures remained exact, and count failure renders unavailable rather than a false zero. Direct owned `pageId` access remains independent of pagination.

## Tracking-On production actor evidence

One Founder-owned production QA funnel was created and classified **Prelaunch/Test**. No second actor event was generated during final visibility certification.

- Landing Page: `page_de0bbd268606482386dd4597e49e42c9f45ae553`
- Immutable published version: `eLvYwKGHdELI1NyuEBZg`
- Response Asset: `qlld3IvPc23n0YN5cAXP`
- Interaction: `ca4acaa7acebe40dbd2d0730eaad324d049cb55953d3b3ba0308eb352985981e`
- Classification: **Prelaunch/Test**
- Canonical effects: one interaction, one lead, one sales activity, one Attribution conversion, one submission receipt, and one Business notification
- Delivery: one Business email and one customer confirmation, each sent once and provider accepted; Founder receipt previously confirmed
- Duplicate effects: **ZERO**

The Response Asset, interaction, canonical lead, and conversion retain the same Landing Page, immutable published version, and Prelaunch/Test classification. The read model does not replace historic attribution with a mutable current page pointer. The previously certified Tracking-Off inquiry remains unattributed and produced no Attribution conversion.

## Prelaunch outcome visibility production remediation

Candidate `c32019b22243fb22a11ed5294b68befe77486f0a` was pushed by non-force fast-forward to `origin/real-completion-proof`. Only `attribution-core:getAttributionOverview` and Hosting were deployed. Attribution write authorities, Landing Page Functions, transactional-email Functions, Rules, indexes, IAM, secrets, providers, and financial systems were unchanged.

### Function release

- Prior `getAttributionOverview` generation: `1787959929015592`
- Prior source MD5: `QO00m28MZEDGcATs202bsg==`
- New generation: `1788021563964049`
- New source MD5: `TmbDLeEfBVjcY/J7lL0a+w==`
- Update time: `2026-08-29T16:40:25.607484564Z`
- Runtime: Gen 2, Node.js 24, `us-east1`
- Secret bindings: **ZERO**

`createResponseAsset`, `resolveTrackedResponse`, and `bridgeResponseLead` remained ACTIVE at their prior revisions. Safe production probes returned maintained `UNAUTHENTICATED` and `INVALID_ARGUMENT` responses without raw backend details.

### Final Hosting release

- Rollback version: `b44de60fb4207ff9`
- Rollback release: `1788012330650000`
- Rollback bundle SHA-256: `502935652C7A44BB2FA7AA321BF09257517353ADBF08948ACDE499D4D3BBA633`
- Final production version: `80ba0d39d5c8597f`
- Final production release: `1788021671324000`
- Certified/live `main.dart.js` SHA-256: `5CACA1578108D7858339AB1E72EE1EB41EE36314DA336414FB1BD1BE74204E9C`

Hosting rewrites remained `/p/**`, `/landing-page-submit`, `/r`, then the SPA fallback.

## Final production Attribution correlation

Business and Admin consumed the same `getAttributionOverview` authority and displayed exact parity:

| Classification | Interactions/visits | Unique responses | Attributable leads | Conversions |
| --- | ---: | ---: | ---: | ---: |
| Live performance | 0 | 0 | 0 | 0 |
| Test / pre-launch activity | 3 | Maintained separately from Live | 1 | 1 |

The Tracking-On Landing Page Response Asset displayed `1 visit / 1 lead / 1 conversion`. The original production certification asset retained `2 visits / 0 leads / 0 conversions`. Asset totals therefore reconcile to the aggregate Prelaunch totals without cross-asset merging or double counting.

Business and Admin desktop views passed. Business and Admin 390x844 views passed without horizontal overflow or ambiguous Live/Test labels. Flutter, router, raw backend, and Attribution authority errors were zero. Live KPI contamination and duplicate effects remained zero.

## Final product and quality status

- Landing Pages: **Beta — Renewal Grade certified core funnel**
- Lead Forms: **Beta — Renewal Grade certified core funnel**
- Tracked Links: **Beta — Renewal Grade certified Landing Page flow**
- QR Response Tracking: **Beta — Renewal Grade certified Landing Page flow**
- Growth Attribution: **Beta — Renewal Grade certified Landing Page response flow**
- Technically Correct: **PASS**
- Customer Ready: **PASS**
- Renewal Grade: **PASS**

AI visual generation, a broad website builder, custom domains, tracked calls, inbound-email attribution, an advanced form builder, and autonomous marketing execution remain unavailable or Coming Soon. This release does not promote those capabilities.

Final certification created no new production Landing Page, Response Asset, tracked redirect, interaction, form submission, lead, conversion, notification, or email. Financial actions, provider actions, IAM/secret changes, and Rules/index changes were zero.

# Landing Page + Form V1 production navigation release record

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

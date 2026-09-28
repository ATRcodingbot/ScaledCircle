# Business-page benefits-first copy — production

Deployed source: `4794a062dfce041be02404f23e4480c588b29e23`.

Hosting: `sites/scaled-circle/versions/6c14d4cd968f93cc`, released `2026-09-28T13:30:18.428Z`.

Actual production baseline was verified as brand release `94449182c64a1df1`. The retained full package matched its deployment manifest and current served app/static files. Only `businesses/index.html` differs in the new package. No Flutter build, Functions deployment, native checkout change or CI run was required.

## Copy and layout

The approved headline remains. The hero now contains the three approved benefit paragraphs, Get Started and See Plans, immediately followed by the $99/month membership/separate campaign-cost statement and campaign-readiness/no-guarantee wording. Both disclosures use readable 16px text at the checked default size, outside any collapsed control.

The existing Customers & Schedule section now carries “What’s included in your membership,” the full Core exclusion list, exact $99/$299/$499 prices and 1/3/5 owner-inclusive seats. The materials/Postcards section distinguishes supported design/download tools from print ordering and general postcard fulfillment, which remain Coming Soon. The workflow illustration and its not-live/performance disclaimer are unchanged.

The CTA uses the existing session-aware `/#/login` entry rather than the public `/#/businesses` funnel, whose registration navigation bypasses initial session resolution. No routing code was modified. See Plans uses existing `/pricing`. Existing referral-link handling remains byte-identical and applies to the chosen same-site entry link.

Small Business-page-only CSS keeps disclosures readable and lets existing grid text wrap at enlarged sizes without reducing type size or changing shared navigation. No new artwork or product section was introduced.

## Verification

- Ten existing public-delivery/metadata tests passed. The existing audience-page test now checks the session-aware Business entry route. `git diff --check` passed.
- [Served-file readback](qa-artifacts/business-copy-20260928/hosting-readback.json): current Business HTML and ten retained app/static/artwork files match the package. Hosting configuration is unchanged. HTML scripts and the workflow figure are unchanged; all other package files, including app bundle, analytics, privacy code, pricing and artwork, are byte-identical to baseline.
- Live desktop and 390px layouts reviewed: no horizontal overflow; benefits precede exclusions; cost/readiness disclosures are visible in normal page flow. A cached prior page initially appeared in the browser; ordinary Reload displayed the newly served copy without clearing sessions/data.
- A local 2× text fixture doubles CSS pixel typography and root-relative text, preserving layout widths. At 390px, the final fixture has no horizontal overflow or out-of-bounds hero/content elements. The test initially exposed existing grid minimum-width overflow, corrected by page-scoped wrapping/min-width rules. This is local rendered accessibility evidence, not a physical-device test.
- Keyboard Tab from Get Started moves to See Plans with a visible focus outline; enlarged CTA/disclosure text wraps without clipping.
- Live See Plans click reaches `https://scaledcircle.com/pricing/`; Core exclusions, campaign-readiness distinctions and $99/$299/$499 terms remain visible before purchase. Pricing itself was not changed.
- Live Get Started click reaches `/#/login`, then resolves the already-authenticated Business to `/#/business` / Business Home. No duplicate-account form is shown.
- Signed-out local preview: Get Started → Login/Create Account → existing Business registration form. No data entered, terms accepted or account created. This is not a new production signup claim.

## Screenshots

- [Live desktop hero](qa-artifacts/business-copy-20260928/desktop-live.png)
- [Full desktop page, including membership/exclusions/materials](qa-artifacts/business-copy-20260928/desktop-full-live.png)
- [Live narrow hero](qa-artifacts/business-copy-20260928/narrow-live.png)
- [Live narrow cost/readiness disclosures](qa-artifacts/business-copy-20260928/narrow-disclosures-live.png)
- [Local 2× text and keyboard-focus fixture](qa-artifacts/business-copy-20260928/large-text-local.png)

## Preserved scope

All existing app repairs remain in the unchanged main bundle: own-team attribution, profile/21061, campaign management, mapping, Zone Intelligence and freehand recovery. Backend functions, permissions, financial/payout authority, plans, printing restrictions, queues, research schedules and provider settings were not changed or redeployed. No production person/profile/campaign/completion was saved; no message, search, payment or store submission occurred.

Frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. Temporary preview servers/tabs are closed and the browser viewport override reset. No material mismatch remains for this bounded copy update.

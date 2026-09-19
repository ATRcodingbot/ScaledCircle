# Native membership purchase disposition

Source preparation only; not deployed, built or accepted by either store. The final release freeze remains open.

## Finding and bounded repair

The existing native subscription screen called `createSubscriptionCheckoutSession` or `createBillingPortalSession` and opened Stripe URLs. Membership management also exposed plan/add-on changes and an introductory purchase card. This is a digital-service subscription path and cannot be assumed exempt merely because the app also contains physical marketplace work.

The proposed conservative launch behavior treats the mobile app as a companion for existing workspace access. Native subscription and billing deep links now show the authoritative existing membership, renewal, seats, active add-ons and reconciled billing-history amounts. Native purchase, portal, upgrade, add-on and reactivation controls are absent. The introductory purchase card makes no eligibility/Checkout call. Native client service guards reject digital purchase/portal/change/reactivation before calling the server. These are distribution controls, not a replacement for server authorization. Web Stripe authority is unchanged.

Cancellation remains available with explicit confirmation and provider readback. Canceling a scheduled future change remains available when required to cancel the membership. No external invoice/portal purchase escape is included in the native status screen. No native “buy on web” link is introduced. The paid-work activation hold remains unchanged; no physical-job funding or payment authority is modified.

## Policy basis, inspected September 14, 2026

- Apple App Review Guidelines 3.1.3(f) describes free companion apps for paid web tools without in-app purchases or outside-purchase CTAs. 3.1.3(e) separately addresses physical goods/services. Do not rely on enterprise or advertising-only exceptions for the entire mixed app. https://developer.apple.com/app-store/review/guidelines/
- Google Play payment guidance permits consumption-only access to previously acquired service, and restricts links leading to alternative payment. Its definition of consumption-only also excludes physical purchases within the app. The marketplace hold currently keeps paid work inactive; any later native paid-work activation needs a separate policy assessment rather than silently reusing the consumption-only rationale. https://support.google.com/googleplay/android-developer/answer/10281818

This is an engineering interpretation to minimize launch risk, not store approval. Final reviewer notes must accurately describe the actual binary, marketplace hold and web service. Audit remaining public/pricing/account navigation and external links in both final binaries before declaring the store policy gate passed. New marketplace activation must not automatically graduate under this disposition.

## Regression evidence

September 19 continuation: re-read the same official Apple Guidelines 3.1.3(f) and Google Play Payments FAQ. The bounded status-only native treatment remains the proposed launch disposition; this does not constitute store acceptance. The repaired membership route must retain these native purchase restrictions. Final matched binary inspection and physical push proof are still pending the web repair gate.

Targeted native/public presentation suites: 41 passing, zero skipped. Native home/pricing/business pages omit paid acquisition and upgrade prompts, while signup/login remain available. Membership status preserves seats and unknown-state retry; cancellation remains explicit. A later 18-test native billing/policy rerun also passed; these overlapping suite counts must not be added as unique tests.

Retained web purchase-preview/confirmation regression: 9 Chrome tests passed, zero skipped. The initial loading stall was a Flutter 3.44.8 Windows test-harness path-separator defect serving CanvasKit, not an application result. A temporary URI-path normalization in the local test harness allowed the normal runner to execute; the original SDK source, tool snapshot and stamp were then restored with byte-identical SHA256 checks. Evidence is in the ignored `.dart_tool/native-web-harness-evidence/` folder.

The executing web tests found a genuine application failure: `Random.secure().nextInt(1 << 32)` evaluates to an invalid zero bound on web. Four membership request-ID sites now use the exact integer `0x100000000`, retaining the intended entropy and provider request contract. The unchanged plan-change and cancellation assertions pass. No live billing mutation was performed. Affected-file analysis is clean. This is not final-binary or store approval evidence.

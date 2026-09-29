# Native website parity — September 29, 2026

Status: reconciled source candidate; **no native release build/upload or production deployment**.

## Source and rollout boundary

- Reference native candidate: `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`, retained untouched in the original workspace.
- Native branch: `codex/native-website-parity-20260929`. The commit containing this document is the consolidated application candidate; use its full SHA from Git, not an earlier release SHA.
- Reviewed client source: `d43e9b1536e7e5825f748b3a11a3babe75662aa0`. Production web app source `e72b896237a2a3eb34ec15b978ac85db252eb786`, Hosting `23b9f8dc42266fec`, served main bundle verified against the retained manifest.
- Client files/assets and retained test fixtures were reconciled onto the frozen native base. Backend implementations were not merged or redeployed. **Do not deploy Functions, Rules or Hosting from this native branch.** Current deployed server code remains authoritative.
- No app version/build number was changed. Existing iOS 1.0.0 (38) / Android 1.0.0 (37) remain available.
- Production Firebase identity, package/bundle, signing configuration, push entitlements, technical IDs and NativeReleasePolicy are unchanged. Dependency lock Git-blob SHA-256: `2d929b3279125c2a0732212aee86ebf51607aaff76f315c9a0ff51e0bbf8ea94`. Working checkout line endings may differ; dependency content does not.

## Compact parity checklist

| Website feature | Native disposition | Existing server authority | Validation |
|---|---|---|---|
| Scaled Circle branding and public journey | Included: display names, versioned approved wordmarks, visible strings, shared abstract workflow illustration. Removed retired geographic demo and unsupported 225-home/five-hour claims. | None; technical identities unchanged | Branding/source gates; public/role navigation, narrow and enlarged text tests |
| Business profile / 21061 | Included: authoritative Home completion banner, permission-aware Complete profile, explicit Continue after refresh, maintained ZIP selection | `getBusinessWorkspaceContext` revision `getbusinessworkspacecontext-00005-wax`; maintained profile/geography endpoints | Profile widget/retained ZIP tests; emulator owner/member/outsider and exact-location privacy denials |
| Campaign planning and lifecycle | Included: native supported distribution types use current Campaign → Area → Materials planner; shared header; delete/cancel/archive/restore eligibility; deleted-route recovery | `businessoperationsv1-00014-ruk` and existing lifecycle authority | Planner/list/navigation tests; actual emulator concurrency/obligation/delete protections |
| Funding, assignment, work and worker obligations | Included: existing current read-only eligibility client retained; funding alone never means Ready | `getcampaignfundingstate-00004-zir` | Funding/readiness tests and source-preserved financial authority. No live payment test |
| Mapping and Zone Intelligence | Included: persistent drawing controls, bounded repair, Clear/Undo, rejection recovery, geometry invalidation/Cancel, multipart and selected-Zone facts, ceil(hours/6), 0.5-hour minimum | `getsmartzoneplan-00012-sid`, `applysmartzoneplan-00012-gas`, `getcampaignzoneintelligence-00001-bac`, `confirmcampaignzoneintelligence-00001-vad` | Actual-editor synthetic pointer tests; geometry, selected facts, stale-response, Zone-count and entitlement tests. Web acceptance is not native touch proof |
| Scale recommendation / manual factual analysis | Included: existing PI-first cached backend and same entitlement; advisory workload, nearby housing context and unverified-route limitations | Existing deployed cache/PI/read endpoints | Retained digest-bound area fixtures and negative entitlement tests; no provider search triggered |
| My Own Team | Included: Assigned to versus Worked by, optional people/date/notes, Business-reported history and audited corrections | `businessoperationsv1-00014-ruk` | Widgets + emulator immutable-history, tenant, duplicate/correction and no-financial-artifact cases |
| Saved map record | Included: actual saved geometry; native Save / Share Map PNG and system Print PDF, iPad share anchor and accessible map credit; read-only access | `businessOperationsV1 campaignMapRecord` | Exact polygons, PNG decode/dimensions, print/share callback, one read/no writes; OS share/print sheet acceptance pending final device |
| Materials | Preview-only DoorHangerGeometryV2 guide and approved brand delta retained. Native-excluded physical marketing generation workspace stays excluded; existing supported material handoffs preserved | Existing server enforcement/geometry, unchanged | Guide tests and material-route/native exclusion tests. No print order, model call, or claimed live native guide on excluded routes |
| Notifications | Account-scoped list/detail/read and authorized Daily Brief fallback retained; excluded Growth tools remain blocked | Existing mobile notification recipient authority | Notification/account-switch/stale-response tests; no send/replay |
| Provider Email, Social, research, paid Assistant | Intentionally excluded on native even for privileged web members | Existing server entitlements unchanged | Deep-link/notification/UI native negative tests |
| Digital purchases, upgrades, web billing | Intentionally excluded. Membership status/cancellation retained; physical campaign funding remains separate | Existing server/provider authority unchanged | Native membership/no-sales and native-release policy regressions |
| Web analytics, browser CSV file import, external provider consoles | Remain separate web/provider workflows; no new native analytics SDK, provider scopes or purchase handoff | Existing web services | No native entitlement broadened |

## Regression evidence

- `flutter pub get --enforce-lockfile`: passed; no dependency changes.
- Production configuration: `flutter test --no-pub --dart-define=APP_ENV=production --reporter json`: **1,083 passed, 0 failed, 2 skipped**. Two opt-in Chrome/Firebase integration harnesses were not run; they are not counted as PASS.
- Fresh local Firebase Auth/Firestore emulator run against the maintained production-server reference: **91 passed / 0 failed**, covering profile/ZIP authority, campaign planning/lifecycle and own-team marketing history. All records synthetic; no production writes. The first emulator run exposed a local sibling-module resolution issue; rerun used existing locked `functions/node_modules` via process-local NODE_PATH, with no dependency or server change.
- Branding gate: 33 canonical symbol assets preserved; approved spaced-wordmark hashes and iOS/Android names verified. Three gate tests passed. Packaged IPA/AAB checks remain for the eventual build.
- Affected Dart analyzer clean after removing one unnecessary test import. Full-project analyzer retains three pre-existing curly-brace style notices in unchanged Email/Social/owner-alert files; no compile errors. `git diff --check` passed.
- Existing GPS/background lifecycle and permission tests are included in the Flutter suite; no real GPS assignment/session was created.
- Logs/read-only revision evidence: local `.firebase/native-parity/`. These are preparation evidence, not packaged-device acceptance.

## Store drafts and policy readback

Apple: display name already Scaled Circle; saved revised description and reviewer notes for the candidate, retaining build 38, reviewer credential fields, manual release and unsubmitted state. Play: saved Scaled Circle title and revised full description as draft, preserving existing screenshots and internal release. No Send for review, Add for Review or publish action.

Description length 2,286 / 4,000; Play title 13 / 30; short description 71 / 80. Store notes distinguish the future candidate from the retained older binary. Protected reviewer credentials remain in their consoles and are not copied into this document. No compliance attestations were fabricated.

Current policy references checked September 29:
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), especially physical services 3.1.3(e) and free companion apps 3.1.3(f).
- [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).
- [Apple metadata reference](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/) and [Play listing requirements](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).

The candidate adds no digital purchase/web-upgrade path. Physical campaign payments remain under existing authority. No new SDK, permission, OAuth scope, advertising feature or background collection was introduced. Own-team records use existing Business People/history data and user-initiated map export. No new privacy/export-compliance answer is inferred from this source review; review any build-specific console requirement when the actual pair processes. iPad listing images and real Play location-service video remain open, separate evidence gaps.

## CI disposition and exact next steps

September 29 readback: Personal plan, macOS Mac mini M2 / 8 cores / 8 GB; **488/500 used, 12 free minutes remaining**. Current editor timeout 60 minutes, minimum 30. Push/PR/tag triggers are off; no settings changed, billing enabled, build started, or build number consumed. A `[skip ci]` branch push records the source only.

The existing October 1 follow-up must reference the new candidate SHA. Confirm reset visibly (exact hour/timezone unknown), sufficient free capacity, actual inventory and no existing run before one matched pair. Expected numbers iOS39/Android38 remain provisional until fresh inventory. Do not run the historical iOS33 artifact-recovery YAML; use the maintained production matched-pair workflow with exact candidate checkout, existing signing/production configuration and unchanged lock. No automatic failed-build retry or simulator capture.

Keep iOS38/Android37 until replacements have separately built, uploaded, processed, become internally available and passed Founder QA. No public submission/release.

## Short final-pair physical QA

1. Fresh launch; isolated reviewer login; correct role Home and spaced branding; Back/navigation.
2. Business Home/profile guidance, Customers & Schedule and campaign type/planner at narrow and large text, without real profile saves.
3. Saved test Zone: Clear → Draw Area → unsaved valid preview → matching/stale facts → Cancel/reopen; saved count and boundary unchanged. Keep overlap/figure-eight and physical-touch observations distinct.
4. Campaign menu safe options; funding versus readiness and obligation labels; inspect own-team form then Cancel without recording work.
5. Map credit external-browser return; native map PNG share/print cancel; material guide only where actually entitled/supported.
6. Notification/account-switch access using existing items only; no new notification or GPS session. Final listing images from actual compatible native build: Business Home, Customers & Schedule, campaign types/planning. Login is acceptance evidence, not primary marketing image.

No customer record, financial operation, production service, store release or native build was changed during this preparation.

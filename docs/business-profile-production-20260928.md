# Business profile repair — production deployment

Approved application source: `c2f8c9fba9093691b87ae7c13b973fb7b03dd4cc`.

Deployed on September 28, 2026. Own-team attribution source `16dabbf907baf54487ade9c453db278e4c38fa21` is excluded and remains separately prepared. Frozen native source and installed builds were not changed.

## Deployed scope

| Function (us-east1) | Active revision |
| --- | --- |
| searchBusinessProfilePlaces | searchbusinessprofileplaces-00002-sos |
| getBusinessOnboarding | getbusinessonboarding-00003-ziy |
| getBusinessWorkspaceContext | getbusinessworkspacecontext-00005-wax |

Source-only overlays were applied to generation-pinned production archives. Configuration, IAM, environment and dependency locks compared unchanged before/after. The workspace projection package includes the maintained onboarding helper and required local dependencies; unrelated deployed workspace logic was preserved. No save endpoint, Rules, indexes, permissions or financial service was deployed.

Hosting version: `sites/scaled-circle/versions/87919d798775a5ce`.
Release time: `2026-09-28T11:33:07.481Z`.
Served main.dart.js SHA-256: `f13ec795c68c1c7a4b6bdc6d1c514cfe02e483c454b6637ce0291e7af9a18849`.

Live baseline was confirmed as `9e587c21aaac4ce7` / source `9f9279edae34cd8a56b3300998574630915220cc`, an ancestor of the approved profile candidate. Only the five reviewed Flutter presentation files differ from that web baseline. The web build used an exact Git archive of the approved source, outside the newer own-team checkout. All 321 checked compiled source inputs matched. Own-team widget bytes were absent. Production public pages, GA4 loader, Hosting headers/rewrites and dependency lock were retained. Served main bundle, bootstrap, index, analytics and all five retained public pages matched the package.

## Verification

Accepted prior evidence: 80 focused unit/emulator/Flutter tests and clean affected analyzer. Additional package verification loaded all three exact production packages, exercised their completion projection, and confirmed the 21061 Census identity with unchanged geometry and continued rejection of unsupported unknown identities. Three profile-presentation unit tests passed again. A fresh production-config local web build passed; no native build or CI was run.

All three live callable endpoints reject signed-out requests with HTTP 401 / UNAUTHENTICATED. This verifies application authentication remains active, not an authorized lookup result.

The signed-in Attractive Remodel browser loaded the deployed Business Home. Its existing authoritative-complete profile correctly produces no incomplete-profile banner. Business Account → Business Profile opens the maintained editor with saved values and existing service-area guidance. No Save profile action was used. Before/after document hashes and update timestamps for this Business's growth profile and onboarding state match exactly.

Live incomplete-profile banner, owner-guidance presentation for a member and save → authoritative refresh → explicit Continue are not claimed as physically verified in this complete owner session. They remain covered by accepted fixture/emulator/widget tests. No production profile was altered to manufacture those states.

## Exact remaining physical acceptance

The browser automation updates accessibility text but the Flutter canvas does not receive the ZIP. The visible input remains empty and no authenticated search request appears; therefore this is not recorded as a successful live ZIP selection. Founder was asked to type **21061** in the open **Business base** field, use its search icon, select the matching Anne Arundel County result, confirm selection, and leave without saving. The deployed editor is ready for this one bounded check.

Private deployment/package/readback evidence is under `.firebase/profile-deployment/` in the maryland-web-operations worktree, including `profile-editor-readback.png`. That image is readback of the unchanged editor, not proof of a successful ZIP search or profile save.

# Zone Intelligence production acceptance — 2026-09-26

## Deployment

Reviewed model: `65b48e4030af0b0093336d72748e14fe55ffff0b`.
Deployed source: `c071b9859a35281fb1ae52c791452cfeb531f735` (only the expressly requested heading and readable-minute wording was added to the reviewed candidate).

- `getSmartZonePlan`: `getsmartzoneplan-00011-sew`
- `applySmartZonePlan`: `applysmartzoneplan-00011-wiy`
- New factual callable `getCampaignZoneIntelligence`: `getcampaignzoneintelligence-00001-bac`
- Hosting: `sites/scaled-circle/versions/5ada6c87051b83aa`, released `2026-09-27T00:43:33.774Z` (September 26, 8:43 PM Eastern).
- Public `main.dart.js` SHA-256: `17944de65743de14aa7865ce0ce77bfcdedb029bca01a2e37c85783f0460b3bd`.

All three generation-pinned uploaded source archives matched prepared package hashes exactly. Existing Get/Apply runtime configuration and IAM were unchanged. Their dependency locks were retained. The new read-only endpoint uses the existing runtime identity and authenticated Firebase-callable pattern, mandatory Business/campaign permission and workspace ownership checks. It adds only its own HTTP callable transport permission, no project-wide role or secret binding. App Check matches the maintained callable policy. No finance/tracking/research/Email/Social endpoint was deployed.

Hosting configuration, static public pages and production Firebase identity were preserved. Flutter verified 318 compiled application inputs with no missing or mismatched inputs. Frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`; no native CI/build was started.

## Live readback

Authorized workspace: Attractive Remodel. Existing unpaid draft: `czp6YVRr4SNXHGugmKZu`. No Use/Save/funding action was performed by the agent.

| Retained Zone | Live card values | Geometry digest |
| --- | --- | --- |
| Initial Area 1 | 10 attached/semi-detached; regional 1960–1979; 403 m; ~24 min | `9cfeff0d31a89a350e7067428ceb3d830441309c2ba3667c8b27115b37d2bde3` |
| Initial Area 2 | 11 detached; regional 1940–1959; 251 m; ~21 min | `90d36107df6c3cbc280531a3f2c9b3f4bc91f5542b3707114da108afee44e9f8` |

Both cards were physically inspected in the browser. The read endpoint returned HTTP 200. Era explicitly says regional property context. Both show one-Scaler advisory workload and execution route not yet verified. Evidence/provenance is expandable. The same Area 1 facts also appeared in Choose area before Use/Save.

Retained alternate examples remain 8 attached/semi-detached / 264 m / 18 min and 8 multifamily/shared residential / 121 m / 15 min, both regional 1940–1959. Those are retained production-evidence projections covered by the reviewed tests, **not newly accepted alternate production UI results in this turn**.

## Boundary editing and manual acceptance

Entering Edit Boundary hid the previous intelligence and disabled Use while drawing was incomplete. Cancel drawing restored the original boundary and its matching intelligence. These browser results are verified.

A new Rectangle boundary was prepared using the supported manual tools, without saving. Browser automation did not successfully place the map corners. Founder was asked to make the two physical corner clicks, inspect the factual manual result, and Cancel without saving. Fresh manual recomputation and final Founder visual review remain pending; they are not counted as PASS.

## Observed presentation blockers

The existing draft has `geometryEncoding: map-parts-v1` and two separate `geometryParts`; its legacy `serviceArea` array is empty. `CampaignZonesScreen` enables "Review area options" only when `_serviceAreaBoundary.length >= 3`, and that getter reads only the legacy array. This disables reopening recommendations for this multipart campaign despite the server returning its authorized Scale-capable workspace context successfully. The condition predates this candidate. No entitlement or geometry was changed to work around it.

Therefore the recommended modal's physical Area 1/Area 2 switch and alternate-option acceptance could not be completed from this retained draft. The bounded next correction is to reopen planning from maintained multipart/search context without flattening disconnected polygons, altering saved territory or weakening recommendation authority. That correction is outside this exact reviewed deployment and has not been deployed.

Saved card ordinals also reflect storage ordering (badge 1 beside the existing name Area 2, badge 2 beside Area 1). Facts are bound to the correct geometry/name, but the ordering is confusing. No renaming or historical rewrite was performed.

## Validation and disposition

Reviewed suite: 149 focused tests (56 Node, 15 Firestore emulator, 78 Flutter). After the wording change, all 18 affected Flutter tests passed; focused analyzer clean; production-config web build passed. No dependency-lock change.

Production signed-out and invalid-auth calls both returned HTTP 401 / UNAUTHENTICATED. Existing positive read returned HTTP 200. Cross-workspace/member/Zone and Starter/Growth factual-versus-Scale entitlement negatives remain covered by the accepted emulator evidence; no account/plan was created or modified for physical testing.

Firestore readback after browser QA confirmed the campaign document and both Zone documents unchanged, including their update timestamps. No payment, assignment, campaign creation or fake work occurred.

**Web freeze disposition: not yet fully accepted.** The deployed factual cards pass their observed checks. Full freeze remains pending the multipart recommendation re-entry correction, modal/alternate switching acceptance, fresh manual recomputation, and Founder visual review. Limited/Beta remains unchanged.

Screenshots:
- `qa-artifacts/zone-intelligence-production-initial1-20260926.png`
- `qa-artifacts/zone-intelligence-production-initial2-20260926.png`
- `qa-artifacts/zone-intelligence-production-edit-invalidated-20260926.png`

Private deployment archives/logs and readback snapshots are retained under `.firebase/zone-intelligence-promotion/` and `.firebase/zone-intelligence-hosting/`; protected configuration is not published in this report.

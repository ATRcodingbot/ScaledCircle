# Freehand recovery: web deployment and acceptance

## Deployed package

- Reviewed/pushed application source: `75e49c2065ae5438584dc6b4975f7c3806d36e35`.
- Hosting version: `sites/scaled-circle/versions/9e31249bfac7489c`.
- Release time: `2026-09-27T12:16:43.746Z`.
- Public `main.dart.js` SHA-256: `103954838f4ac6efdb312fb1dcb3dd2e993375f3ef63cf40bda188897520f3c6`.
- Immediately preceding live version: `sites/scaled-circle/versions/d866811bd101d299`, application source `175edc45b1ebd854f07d27b5ceaf94bb9ef80610`.

The candidate descends from the current production source. The application delta is limited to the reviewed freehand geometry helper and campaign-area screen. All 319 compiled application inputs matched Flutter's declared input hashes; no inputs were missing. The retained Businesses, Pricing, How It Works, Referrals and Scalers static pages were compared with production before packaging and preserved byte-for-byte. The package contains 72 files and unchanged Hosting headers/rewrites. Public main bundle, bootstrap, service worker, index and retained pages matched the prepared package after deployment.

Only Firebase Hosting was deployed. No Functions, IAM, rules, financial/provider settings, subscriptions, data migrations, native builds or CI actions were included. The dependency lock is unchanged. The primary native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`.

Predeployment evidence accepted by Founder: 85 focused tests, clean affected analyzer and a successful production-mode local web build. No tolerances or rejection rules were expanded after review. See [implementation and test evidence](freehand-recovery-review-20260927.md).

## Saved QA baseline

Existing authorized Attractive Remodel draft: `czp6YVRr4SNXHGugmKZu` (`test`). Business/workspace: `IqRjZYHKOzXYuJcSyL68LYNwtDg1`.

| Saved Zone | Record | Geometry digest | Matching facts |
| --- | --- | --- | --- |
| Zone 1 / Area 1 | `TRt0I00LLk83mZNN0fAJ` | `9cfeff0d31a89a350e7067428ceb3d830441309c2ba3667c8b27115b37d2bde3` | 10 mapped residential targets; attached/semi-detached; 403 m supporting streets; ~24 min; nearby 1960–1979 regional context |
| Zone 2 / Area 2 | `SklyoKXm7vFdcPLPJhhK` | `90d36107df6c3cbc280531a3f2c9b3f4bc91f5542b3707114da108afee44e9f8` | 11 mapped residential targets; detached; 251 m; ~21 min; nearby 1940–1959 regional context |

Both Zones are unassigned. Two saved geometry parts remain. There are no campaign-payment or assignment-compensation records for this draft. Private read-only before/after snapshots are retained outside Git; comparison excludes transient query read times and compares the full campaign, Zone, payment and compensation documents, including their update metadata. All compared documents were unchanged after the tool-controlled checks.

## Browser observations

The existing production tab was refreshed without clearing authentication/session/local data. Its loaded script element points to the verified public `main.dart.js`. The reviewed client is demonstrably active: **Clear leaves Undo enabled**, whereas the previous implementation disabled Undo on an empty local preview. Clear removed the local boundary and facts, and Undo restored the original boundary and matching 10-target / 403 m / 24-minute facts. Cancel left the editor; reopening Zone 1 restored the same boundary and facts.

These were browser actions against the production client. They do not prove valid-redraw intelligence invalidation: the only tool-driven straight drag produced no observable stroke or validation event. It must not be recorded as a rejected drawing, a successful recovery, a replay of the Founder's unretained stroke, or physical-device evidence.

The available browser API provides straight drags but no supported multi-point held-pointer path. No lower-level event injection or browser-internal state mutation was used to simulate acceptance.

Production browser captures: [local Clear](qa-artifacts/freehand-production-clear-local-20260927.png) and [Undo restores saved boundary](qa-artifacts/freehand-production-undo-restored-20260927.png). These show the browser-controlled checks only, not the pending freehand gestures.

| Check | Actual disposition |
| --- | --- |
| Served package and updated browser client | Verified |
| Local Clear → Undo | Verified in browser |
| Cancel/reopen original boundary and facts after local Clear/Undo | Verified in browser |
| Saved campaign/Zone/payment/compensation preservation | Full document comparison unchanged |
| Repairable overlap/overshoot → corrected unsaved preview | Founder physical observation pending |
| Substantial crossing → Draw Again → valid preview without reopening | Founder physical observation pending |
| Prior intelligence invalidated against a different valid redraw | Founder physical observation pending; not inferred from Clear or rejection |
| Recovery controls after actual pointer cancellation/interruption | Automated tests passed; production gesture observation pending |
| Physical touch | Not tested |

## Focused Founder session

The tab is left on Zone 1's saved boundary editor. The request identifies the actual baseline and asks for one unsaved session:

1. Edit Boundary → Replace Area 1; draw a different outline with a tiny overlap/closing overshoot. Observe the cleanup notice, corrected shape, and disappearance of the original intelligence as current facts.
2. Edit Boundary again; draw a substantial figure-eight. Observe safe rejection, then use Draw Again and draw a valid outline in the same editor.
3. Cancel without Use This Area/Save; reopen Zone 1. Observe original boundary/facts and two saved Zones. Report the input device and actual outcomes.

No generic reporting template is acceptance evidence. The earlier template-only Founder message remains explicitly excluded. Physical acceptance is **open** until actual results arrive. No funding, assignment, compensation, paid recommendation/model search or persisted boundary change is part of this session.

Private deployment/package/readback evidence: `.firebase/freehand-recovery-hosting/` (ignored, not a public artifact).

# Own-team area attribution production deployment

Deployed September 28, 2026, from reviewed application source `16dabbf907baf54487ade9c453db278e4c38fa21`.

## Narrow package and readback

- `businessOperationsV1`: `businessoperationsv1-00013-nus` → **`businessoperationsv1-00014-ruk`**, ACTIVE.
- Hosting: `sites/scaled-circle/versions/87919d798775a5ce` → **`sites/scaled-circle/versions/414aeb5e1f4ea9a9`**, released `2026-09-28T11:56:29.964Z`.
- Served main bundle SHA-256: `24eaac215d39f13efbb265641d44f739fdb42c2ba0dc8c5e31377b76bc5efad2`.
- The generation-pinned deployed server archive was downloaded read-only after deployment: all 35 source-file hashes match the prepared package.
- Live main bundle, bootstrap, index, analytics and five maintained public pages match the Hosting manifest. Hosting configuration is unchanged.
- Function runtime configuration, identities, secret bindings and function/service IAM compared before/after: unchanged. No Rules/indexes deployment or migration.

Only four server files differ from the actual deployed baseline: `marketing_history.js`, `own_team_work.js`, `people_roster.js`, `service.js`. The latter applies only the extracted roster helper and own-team operation dispatch. The candidate's incidental controlled-test text-encoding hunk was excluded to preserve deployed unrelated behavior. All other baseline source bytes and the server lock remain unchanged.

Hosting uses the reviewed compiled application after Flutter compiled-input verification, over the verified current production package. Static public pages were retained byte-for-byte. Already-deployed profile/onboarding repair `c2f8c9f` remains present; its functions were not redeployed. Separate brand-spelling candidate `dcaf3e2` is excluded. Frozen native source, installed apps and store drafts are unchanged.

## Tests versus live observations

Accepted predeployment evidence remains 101 passing tests, affected analyzer clean and successful production-config web build. Completion writes, amendments, immutable geometry binding, retries, concurrent correction conflicts, cross-workspace denial, name/deactivation history and duplicate coverage prevention are covered by emulator/unit tests. Optional fields, explicit Business-reported completion, keyboard and narrow 390px/2× text are widget evidence, not physical production checks. Package validation additionally checked JavaScript syntax, source overlay boundaries, maintained locks and compiled web inputs.

Live browser session was Attractive Remodel. Its current Campaigns page has no active campaigns. The only nondeleted retained own-team campaign found in the bounded inventory is Mike's Contracting's `Showcase Mapping`, ID `plan_f931e1a1aba8284daef3967017afcb516490b537216422321afb2be77f9ca43f`; it is a draft with no saved Zones. That workspace also has no crew resources, marketing-history records or attribution amendments/projections.

Opening that other Business's draft from Attractive Remodel safely showed **Campaign no longer available**. **Return to Campaigns** returned to the authorized Attractive Remodel list. No authorization bypass or account switch was attempted.

Consequently, per-area recordkeeping controls, live planned-assignment versus Worked-by display, actual form Cancel, historical display and physical narrow/keyboard behavior **remain unobserved live**. No actual work-record save is claimed. Existing automated tests cover these behaviors; no person, Zone or completion was manufactured for acceptance.

## Data preservation and remaining acceptance

Read-only before/after snapshots of Mike's workspace campaign records, relevant Zones, People resources, marketing history, amendments and attribution are identical (snapshot SHA-256 `975f326e94ae7e89a2c74cb4344ce66d23882315e2d088fad97fa9183841cdee`). No production person, assignment, campaign, completion, compensation or history write was performed. No invitation/notification, financial operation, provider search or native CI occurred.

The remaining live acceptance requires an already-existing authorized own-team campaign with a saved area: open its recordkeeping form, inspect optional Worked by/date/notes and Business-reported wording, then Cancel without saving. A genuine existing completed record is separately needed for historical attribution display. Current production inventory does not supply either suitable record; do not create one solely for QA.

Private evidence is retained under `.firebase/own-team-deployment/`, including generation-pinned baselines, promotion manifest, deployment/config/IAM comparisons, deployed-source readback, Hosting manifest/readback, unchanged workspace snapshots and `production-campaign-list.png`.

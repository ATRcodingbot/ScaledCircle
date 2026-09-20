# Approved runtime applied; research activation awaits authenticated Admin

Founder approval: `2885dba2-7858-4a22-97d6-001bd57f9f2e`, accepting proposal `ba94511` with inherited-access limitations. This supersedes proposal-only status in `dedicated-research-runtime-approval-20260920.md`.

## Applied and verified

Created `research-pilot-runtime@scaledcircle-staging.iam.gserviceaccount.com`; assigned only staging `runScheduledGrowthDogfoodV1`. Applied exactly the six-permission custom staging role and two service-scoped Invoker bindings from the approved proposal. No keys, extra roles, secret permissions, production Firestore access or impersonation grants. Existing staging database-wide authority and inherited Editor/actAs/service-agent paths remain explicit hardening debt before broad reliance on this bridge.

Scheduler identity is now dedicated; schedule remains `0 9 * * *`, America/New_York. Firebase deployment retained the old Scheduler caller and removed the production endpoint's newly added service binding. Both were corrected within the exact approval and independently read back. No schedule/target/audience change. The staging research service's direct invoker binding now names the dedicated identity; the shared account retains existing project-wide staging invocation/Editor authority. No existing project/service-agent binding was revoked.

Production endpoint's verified-token allowlist replaces the shared staging caller with the dedicated identity, fixed to `scaledcircle-staging/FF1bfDuvtdNjuuC4mc7NdGtk3LC3`. Attractive Remodel production caller is unchanged and fixed to `scaled-circle/IqRjZYHKOzXYuJcSyL68LYNwtDg1`. Grant is fixed server-side, never selected by request input.

Non-billable integration preflights returned HTTP 200 from BOTH actual deployed runtimes. Central persisted proofs at 14:58:07.163 and 14:58:10.231 UTC contain the exact runtime emails/workspaces, shared grant ID `founder_research_20260920`, and provider model-catalog access. Preflights used a distinct handler branch and did not execute research. The initial Firebase CLI end-user ID token was rejected with HTTP 401 before dispatch; the existing gcloud user identity succeeded. No service-account impersonation/key creation or credential printing was used.

## Activation pending, not a budget reapproval

As of 14:58:37 UTC no research grant, usage or enabled adapter configuration exists. No paid access-validation call occurred; seven-day start/end are intentionally absent. The refreshed localhost Admin form at `http://127.0.0.1:18633/` requires Founder sign-in because the previous form used memory-only authentication. A pending user-input request explains this. Do not bypass maintained Admin authority through direct database writes.

After sign-in, run the already-authorized `getGeneratedMediaOperations` action `{researchPilotOperation:'activateAndValidate'}` once. It checks both recent runtime proofs, creates the one fixed seven-day grant, reserves/counts the one paid access check, verifies web_search execution, then authorizes recurring use. Unknown/failure keeps the reservation and prevents automatic retry. Save exact activation/expiry and actual/conservative accounted usage. This is integration validation, not natural discovery.

Then run `.firebase/launch-close-20260919/research-runtime-preflight.cjs enable` to let each exact runtime save its own adapter configuration only after the central grant says recurring is enabled. This branch performs metadata/configuration only, never a research cycle. Read back both enabled configurations and the central grant/usage. Existing next natural cycles are September 21, internal ScaledCircle 09:00 Eastern; Attractive Remodel follows its existing next-eligible daily timestamp within the unchanged 15-minute dispatcher. Read the actual timestamp before final activation report.

Budget remains $5 TOTAL, seven days from actual activation, two requests/workspace/day, 28 total including validation, $0.10 reservation/request, no automatic retries/renewal/top-up and no outreach. Social funds are separate. No fresh discovery claimed. Rollback commands and inherited-access findings remain in the approved proposal document; disable adapters before removing bindings, preserve ledger/history, never restore rejected shared production invocation.

## Social repair deployed, natural results pending

Inspected the exact failed Instagram derivative bytes: an abstract two-sided puzzle/roles illustration. The stored review used the **Product explanation** rubric, which explicitly evaluates abstract product illustrations, not contractor photos. It recorded visible/relevant subject, adequate subject fraction, no background/crop/border/logo failure, but confidence 0.70 below 0.75. No richer visual-defect explanation was recorded; do not invent one or claim a rubric mismatch.

Added one bounded corrective-source request per workspace/policy/item/platform through the maintained regeneration workflow. The normal recurring worker claims an audit record containing the complete failed candidate and quality evidence before requesting a new source. A repeated failure or interrupted attempt cannot create an unlimited regeneration loop; it becomes Needs Attention. No threshold lowered, identical asset rescored to force a pass, manual approval or publication. Generation/review continue through existing reservation/grant accounting and no-retry provider transport.

Preparation now scans at most 24 entries per visit, skipping existing publication/managed-hold records without using the single fresh-preparation slot. Cursor advances across skipped records; per-workspace expensive work remains one item and concurrency unchanged. Existing schedule occupancy, immutable history and downstream quality/attachment/cadence/idempotency checks remain intact. Attractive Remodel's seven consumed concepts and $4 unknown-cost reservation were not changed.

At 14:59:21 UTC both workspaces still had zero current-strategy jobs; their recorded cycles predate this deployed repair. No new publication proof is claimed. Allow normal workers to execute; do not invoke or wait for publication. No verifier recreated.

## Source/deployment and validation

Runtime source `575fe931ece93c1064dba6c59748dc973e13a475`; additional activation tests committed `9f3d52b`.

| Function | Revision |
|---|---|
| production runManagedSocialPreparationV1 | runmanagedsocialpreparationv1-00011-mit |
| production researchPilotAuthorityV1 | researchpilotauthorityv1-00002-vel |
| production getGeneratedMediaOperations | getgeneratedmediaoperations-00006-hug |
| production runScheduledCustomerGrowthResearchV1 | runscheduledcustomergrowthresearchv1-00002-cuz |
| staging runScheduledGrowthDogfoodV1 | runscheduledgrowthdogfoodv1-00007-qob |

252 unrelated production Functions and 240 unrelated staging Functions unchanged. Existing application environment and secret bindings preserved. No Hosting, Rules or native deployment in this change.

22 focused tests passed (runtime/budget/cadence/selection/recovery), plus three activation persistence tests: missing proof cannot start clock, one validation counts once without term restart, failure holds cost and cannot auto-retry. Fixtures/emulators only. Twenty historical terminal records ahead of a fresh candidate are traversed in one bounded visit. Exact source syntax and whitespace checks passed.

Evidence under `.firebase/launch-close-20260919`: `dedicated-research-iam-initial.private.json`, `dedicated-research-iam-applied.private.json`, `dedicated-scheduler-identity-applied.json`, `dedicatedpilot-final-readback.json`, `research-runtime-preflight-result.json`, `research-pilot-current-readback.json`, `social-transition-before-repair.private.json`, `social-transition-trace.private.json`. Preserve private evidence locally.

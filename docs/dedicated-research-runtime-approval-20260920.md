# Dedicated research runtime: prepared, awaiting consolidated approval

No IAM mutation, identity creation, deployment, paid access check or pilot activation is included in this checkpoint. Founder explicitly rejected the shared staging caller binding. Previous grant/clock/spending authorization is unchanged. Attractive Remodel historical accounting is closed; its unknown-cost reservations remain intact.

## Exact proposed change

Create `research-pilot-runtime@scaledcircle-staging.iam.gserviceaccount.com` in existing project `scaledcircle-staging`. The service-account inventory contains only App Engine default, Compute default and Firebase Admin SDK identities; no dedicated research identity exists.

Change **only** `scaledcircle-staging/us-east1/runScheduledGrowthDogfoodV1` runtime to this identity. Do not change global options, interactive research endpoints, the internal Growth bridge, Business Email, billing, report-email triggers or Attractive Remodel production research. Keep its existing 09:00 America/New_York cadence. The installed Firebase CLI's `cloudscheduler.js` uses `endpoint.serviceAccount` for Scheduler OIDC, so the same job's OIDC caller will also become the dedicated identity; include its own service-level invocation permission below.

All requested new bindings:

| Principal | Role | Resource scope |
|---|---|---|
| serviceAccount:research-pilot-runtime@scaledcircle-staging.iam.gserviceaccount.com | proposed custom role `projects/scaledcircle-staging/roles/scaledCircleResearchRuntime` | staging project `scaledcircle-staging` only |
| same | `roles/run.invoker` | `projects/scaled-circle/locations/us-east1/services/researchpilotauthorityv1` only |
| same | `roles/run.invoker` | `projects/scaledcircle-staging/locations/us-east1/services/runscheduledgrowthdogfoodv1` only, for the existing Scheduler job's dedicated OIDC caller |

Custom role exact permissions: `datastore.databases.get`, `datastore.databases.getMetadata`, `datastore.entities.get`, `datastore.entities.list`, `datastore.entities.create`, `datastore.entities.update`. No delete, Auth administration, secrets, storage, impersonation or IAM management. This Firestore authority is **staging database-wide**, not document-scoped; the Admin SDK relies on application tenant binding. It does not grant any production Firestore access. No roles are copied from the default account.

The scheduled path reads maintained internal workspace/geography, health, preferences, prospects, reports/runs, mailbox suppression and correspondence/outcome summaries, and research configuration/state. It writes research leases/results, public-source observations, prospects/CRM projections, draft-only actions, research health/state, reports and in-app notifications. It uses deterministic document IDs and transactions. It fetches public HTTPS sources and obtains an ID token from the runtime metadata identity. It has no deployed secret bindings; the paid provider credential stays at the receiving production service. This path does not call Firebase Auth or send outreach. Existing separate report-email trigger remains unchanged.

Deployer `user:attractiveremodel@gmail.com` already has staging Owner, including `iam.serviceAccounts.actAs`; no new deployer binding is proposed. Existing `service-998249478055@gcf-admin-robot.iam.gserviceaccount.com` and `service-998249478055@serverless-robot-prod.iam.gserviceaccount.com` retain their platform service-agent roles. These supply the existing same-project deployment/runtime prerequisites; no extra token-creator grant is proposed. No keys will be created/downloaded.

## Effective-access caveats, not hidden by service-level IAM

Both project ancestry readbacks contain only the project (no organization/folder inheritance). The production project policy contains no staging/shared-principal binding; receiving service has no bindings at readback. However:

- Staging Compute default already has project Editor. The actual role includes `iam.serviceAccounts.actAs`, `cloudfunctions.functions.update`, and `run.services.update`. Consequently, a privileged workload using it could indirectly act through the new identity by changing a runtime. Dedicated identity does **not** eliminate this existing administrative path. No new impersonation privilege is being granted, and no existing Editor binding will be silently removed.
- Staging Firebase Admin SDK (`firebase-adminsdk-fbsvc@scaledcircle-staging.iam.gserviceaccount.com`) and Pub/Sub service agent (`service-998249478055@gcp-sa-pubsub.iam.gserviceaccount.com`) already have project-wide `roles/iam.serviceAccountTokenCreator`, which would cover the new same-project account. Cloud Functions/Cloud Run service agents also possess required token/actAs permissions. These are existing broader access paths, not newly requested permissions.
- Scheduler currently invokes the staging research Function as Compute default, with existing invocation permission. The deployment will select the new dedicated OIDC caller without changing cadence. The old shared caller retains existing broader staging invocation permission and remains able to trigger the bounded handler; the identity change does not revoke that permission. It cannot select a different workspace/grant in the handler.

If elimination of these existing administrative paths is required, stop for a separate reviewed least-privilege/deny change; do not claim isolation that the current project IAM cannot provide or silently migrate unrelated Functions.

## Application changes prepared locally

The receiving endpoint replaces the staging Compute identity in its verified-token allowlist with the new dedicated email. It remains bound to `scaledcircle-staging/FF1bfDuvtdNjuuC4mc7NdGtk3LC3`, the fixed `founder_research_20260920` grant, and existing metadata/search operations. The legitimate production caller `1010956217112-compute@developer.gserviceaccount.com` remains bound solely to Attractive Remodel. Workspace mismatches and supplied identity/grant overrides are rejected. No identity header is trusted.

Six focused tests pass: dedicated mapping, shared direct caller denial, production caller preservation, tenant/grant/identity substitution denial, disabled transport and no-retry central dispatch. Syntax checks pass. No deployment yet.

After approval, create identity/custom role and apply exactly the three bindings; deploy the mapping and selected runtime only; verify effective IAM, Scheduler OIDC identity and both runtime paths; finish maintained Admin activation/access-check and enable the existing scheduled adapters. Start the seven-day term at actual activation. Count the one paid access check inside the $5/28-request pilot and label it integration validation. Never treat it as natural recurrence or fresh discovery.

## Rollback

First disable the pilot adapter through maintained configuration, preserving ledger/history. Remove only the dedicated member's production service binding:

```powershell
gcloud run services remove-iam-policy-binding researchpilotauthorityv1 --project=scaled-circle --region=us-east1 --member="serviceAccount:research-pilot-runtime@scaledcircle-staging.iam.gserviceaccount.com" --role="roles/run.invoker"
gcloud projects remove-iam-policy-binding scaledcircle-staging --member="serviceAccount:research-pilot-runtime@scaledcircle-staging.iam.gserviceaccount.com" --role="projects/scaledcircle-staging/roles/scaledCircleResearchRuntime"
gcloud run services remove-iam-policy-binding runscheduledgrowthdogfoodv1 --project=scaledcircle-staging --region=us-east1 --member="serviceAccount:research-pilot-runtime@scaledcircle-staging.iam.gserviceaccount.com" --role="roles/run.invoker"
```

Restore only `runScheduledGrowthDogfoodV1` to its prior runtime/source and Scheduler OIDC identity with paid adapter disabled and cadence unchanged. Remove the dedicated endpoint allowlist entry; **do not restore the rejected shared production caller permission**. Keep the now-unused account/role disabled or unbound until safe removal is separately reviewed; no financial/audit deletion. Preserve unrelated bindings and Scheduler settings.

## Social transition trace (one focused read, 14:32:18 UTC)

ScaledCircle: one generated source job `visual_job_ead964c5fb39f52a72f78396e22d1315f9a40553`, moderation passed, source generated at 13:42 UTC. The normal 14:31 preparation visit reused it for the same idea's Instagram derivative (1024×1024). Pixel validation passed, but visual confidence was 0.70 against maintained 0.75. The saved subject-quality result is blocked; `managed_creative_quality_or_revision` stopped automatic source authorization/attachment. No current-strategy job exists. This is a real quality exception, not a pending publish time. No threshold was lowered, source manually approved or regeneration forced. Facebook's prior preparation record still lacks its derivative; the recurring preparation cursor must revisit it. The generation worker's prepared status means a source exists, not ready-to-publish media.

Attractive Remodel: its fresh deck Facebook candidate (1080×720) has passed pixels and subject quality (0.90). It remains unattached/pending strategy authorization. The normal 14:31 preparation visit advanced cursor 37→38 while preserving historical Instagram `customer_week_1_1` as Published. The current queue contains eight original ideas plus a supplemental fresh idea; the worker examines only one platform version per workspace visit, including terminal historical entries. This traversal delays the fresh supplemental candidate, independently of the cleared accounting hold. Next responsible worker: `runManagedSocialPreparationV1`, when its maintained cursor reaches that item; it must validate the current copy/media/policy and cadence before attachment/scheduling. No scheduled timestamp or new publication can be claimed. No historical job is counted as autonomous proof.

Worker inventory pagination adds an empty-page reset visit before revisiting the two workspaces. Exact future candidate time is therefore not asserted; no schedule was changed or worker invoked. Both workspaces retain zero current-strategy jobs in this readback. Evidence: local `social-transition-trace.private.json`, `dedicated-research-audit.private.json`, and `dedicated-research-inherited-readback.json` under `.firebase/launch-close-20260919`.

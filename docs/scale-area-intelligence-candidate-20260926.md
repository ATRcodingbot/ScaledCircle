# Scale marketing-area intelligence — review candidate

Prepared in the isolated `codex/maryland-web-operations` worktree. **Not deployed.**
The native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`.
No CI/native build, production provider/model request, campaign mutation, money movement, or store action was performed for this candidate.

## Entitlement and authority

The previous recommendation helper accepted any active paid Business and bypassed that check for own-team campaigns. The candidate replaces this with the maintained `subscriptionEntitlements.hasActiveScaleEntitlement` against server-owned `businessSubscriptions/{businessId}` before location resolution, Property Intelligence context reads, or provider work.

Scale and Managed Growth qualify under that maintained model, including valid existing complimentary grants. Starter/Growth, expired/revoked grants, forged client plan claims and Admin-only access do not qualify. The workspace must authorize both `campaigns` and `intelligence`; the draft campaign must belong to the authorized Business. Apply repeats current entitlement, workspace/member, profile/preferences and campaign checks in the transaction. It never relies on the UI projection for authority.

The `getBusinessWorkspaceContext` capability projection supplies `capabilities.intelligentAreaRecommendation`. Web checks its exact actor and campaign Business identities, fails closed on a missing projection, and leaves manual search, freehand, shapes, edit, undo and clear usable. Subscription prices remain unchanged. Denied recommendation requests perform no resolver/provider/model work.

## Existing Property Intelligence reused

`property_service_area_analysis.js` remains the ranking/context layer. It reads authoritative `businessGrowthProfiles` and `discoveryPreferences`, including offered/priority/excluded services, goal, campaign format, explicit target intent and eligible service-area geometry.

- Actual OSM housing/business classification tags, mapped density and permitted street evidence provide disclosed planning proxies. Building type does not establish a deck, yard, ownership or a need for service.
- Explicit commercial/nonresidential goals select business evidence even for a flyer campaign. Conflicting residential/business goals and unsupported event intent fail closed.
- Fresh, exact-geometry `propertyIntelligenceCache` facts reuse the maintained residential-share/service-specific 20+/40+-year-age scoring. Missing or differently bounded facts are not used. This path does not launch a new Census, property or model analysis.
- Already-persisted, authorized `BusinessMarketingHistoryV1` completed footprints can supply an advisory recent-overlap penalty, capped at 15 points. The maintained calendar 12-month window and meaningful-overlap thresholds are preserved. Repeating an area remains allowed. Missing, corrupt or over-limit history is unknown, not evidence of no prior marketing. This read does not backfill older approved completions; it does not infer saturation, conversions, leads or revenue.
- Ranking is a relative heuristic: 50% disclosed service-fit proxy, 30% observed mapped-feature density and 20% local-street compactness, followed by the disclosed history adjustment. It is not a probability of purchase.

## ZIP search and evidence bounds

The real ZIP polygon is retained as requested search context. It is intersected with authoritative eligible Business service geography, then partitioned using the maintained Property Intelligence clipping/holes machinery. Internal windows use a maximum 0.04-degree grid, each independently checked at **≤25 km²**. Search rectangles are acquisition windows only; they never become fallback recommended territories.

- Up to 12 sequential windows, the existing 12-second provider timeout per call, a 150-second search budget, and no automatic retry. The callable deadline is 180 seconds.
- The actual retained 21061 boundary is **31,312,404.67 m²**. It produces **11 clipped windows**, covering the eligible ZIP in the regression; the largest is about **11.99 km²**.
- Larger regions use a disclosed bounded spatial sample; unqueried/failed sections are not reported as empty. The original requested boundary and Business saved territory are not silently shrunk.
- Each window independently checks target classification, local-road connectivity, school/institution/park/restricted exclusions and barriers. Missing/incomplete exclusion evidence fails closed. Targets, road-supported source IDs and selected features are deduplicated.
- Source snapshot times and retrieval times stay separate, including per-candidate provenance. Provider failures never become a zero-household claim.

## Workload and alternate selection

The existing mapped-feature/local-street advisory workload formula and compensation formulas are unchanged. Requested hours constrain candidate sizing and selection; they do not create properties. Evidence-supported nearby clusters may be combined as separate areas within a 3 km proximity bound. No connecting route or union hull is invented across disconnected areas.

The review retains the strongest supported candidates within 32-candidate/400 KiB evidence bounds. Up to three disjoint recommendation selections can be offered if the retained evidence supports them. `Try Another Recommendation` uses a different eligible selection from the same cached search, preserving goal/location/hours and explaining the lower/different ranking. It does not invoke the provider again. No supported alternative means the action stays disabled.

Server-owned search evidence is retained under `propertyRecommendationWorkspaces/{businessId}/mappingRuns` for 15 minutes, bound to Business, actor, campaign, exact input fingerprint, context version and source geometry. A transactional Business lease prevents concurrent searches; actor cooldown limits repeated new searches. Cache values are explicitly checked for Firestore-compatible types and a 500 KiB document limit. Cache records are not client-writable.

Apply reuses the reviewed evidence, checks its identity again and preserves financial guards. One area uses its exact geometry; multiple areas remain separate `campaignZones`/`geometryParts`. The full ZIP is recorded only as search provenance, not as completed/assigned work territory. Preview/alternate searches do not write campaigns or zones.

For older installed clients that omit the new run ID, Apply can recover only the already-completed, unexpired run matching the same actor, Business, campaign, current context and exact Get inputs. The submitted plan ID must match. This compatibility path never invokes a resolver/provider or creates a new search. A preview made before this server version must be refreshed. The frozen native UI and its older callable timeout remain unchanged; the new web presentation and longer bounded request handling are not claimed for installed native clients.

## Presentation

The review shows Recommended Marketing Area, goal/location, supported reasons, actual advisory minutes, mapped target features, supporting street metres, available PI signals and limitations. Map layers distinguish search region, candidate territories, mapped features and supporting streets. No execution route is approved by this screen.

Actions: Use Recommended Area, Adjust Area, Try Another Recommendation, Draw My Own Area. Adjust/Draw retains the selected goal/hours through the manual editor. Starter/Growth see a light Scale inclusion label while normal manual planning remains available.

Insufficient evidence uses: “We couldn't find enough reliable data to recommend an area here yet. You can still draw your own area.”

## Corkran regression result and limits

The retained OSM snapshot dated `2026-09-26T18:45:17Z`, retrieved `2026-09-26T18:46:46.541Z`, is replayed into the appropriate window of the real full-ZIP search. The other windows are explicitly unavailable in this offline fixture, not assumed empty.

Result: **19 mapped residential features, 22 supporting segments, 739 m of street evidence, 44 advisory minutes**, one candidate. Mapped school footprints remain outside the candidate and its supporting streets. No additional targets, five-hour workload, verified households, material quantity or approved execution route are fabricated. No alternate is asserted from this one supported candidate.

This establishes deterministic regression behavior, not current live whole-ZIP coverage or physical production acceptance. Fresh 21061 evidence and Founder inspection remain required after a separately reviewed deployment.

## Validation and deployment recommendation

Final results: **195/195 server unit/contract/packaging tests; 7/7 new Firestore runtime tests; 8/8 maintained Property Intelligence Firestore regression tests; 66/66 client tests; clean focused analyzer; successful production-configured web release build (65.1 seconds).** No skipped or failed tests in these final results. These are local/emulator/web/widget results, not deployed or physical-device acceptance.

Server tests cover denied Starter/Growth/expired/revoked/spoofed plans before provider work; role/tenant/member/seat isolation; current-authority Apply rechecks; exact evidence caching and concurrent Business leases; cached alternate/Apply provider non-repetition; legacy native request compatibility; full ZIP partitioning, holes, deadlines, deduplication, Corkran exclusions, partial evidence and no fabricated workload; service/category/history scoring; and the maintained PI/geometry/provider/entitlement regressions.

The first aggregate invocation could not resolve `polygon-clipping` from the separate Business Operations test package. Re-running with the already-installed root server dependencies on command-local `NODE_PATH` passed. No dependency version was changed to fix that test environment. Discovery packaging was independently installed offline and tested without this fallback.

Server commands, from the worktree root (Firebase CLI was the existing installed version):

```powershell
$env:NODE_PATH=(Resolve-Path 'functions/node_modules').Path
node --test functions/smart_zone_entry_authority.test.js functions/smart_zone_preview_backend.test.js functions/smart_zone_entry_contract.test.js functions/smart_zone_intelligence.test.js functions/smart_zone_intelligence_packaging.test.js functions/smart_zone_planning.test.js functions/smart_zone_geography.test.js functions/smart_zone_geography_diagnostics.test.js functions/smart_zone_21061_fixture.test.js functions/property_marketing_area_scoring.test.js functions/property_service_area_analysis.test.js functions/property_service_area_geometry.test.js functions/property_service_area_callable.test.js functions/property_service_area_runtime.test.js functions/property_intelligence.test.js functions/subscription_entitlements.test.js functions/service_area_resolution.test.js functions/scaled_circle_intelligence.test.js functions/marketing_history.test.js
firebase emulators:exec --config firebase.production-launch.json --project demo-scale-area-candidate --only firestore "node --test functions/smart_zone_intelligence_runtime_backend.test.js functions/property_service_area_analysis_backend.test.js"
```

The emulator files were checked together before the final authority/legacy additions; the changed runtime file was rerun independently afterward (7/7). The unchanged maintained PI file retained its 8/8 pass. All emulator work was localhost/demo-only, and the emulator shut down after each run.

Client commands, from `apps/mobile`:

```powershell
flutter test test/intelligent_area_recommendation_ui_test.dart test/campaign_mapping_interaction_test.dart test/smart_zone_planning_ux_test.dart test/smart_zone_recommendation_evidence_test.dart
flutter analyze lib/screens/business/campaign_area_screen.dart lib/screens/business/campaign_zones_screen.dart lib/widgets/smart_zone_geometry_map.dart lib/widgets/smart_zone_recommendation_evidence.dart test/campaign_mapping_interaction_test.dart test/smart_zone_planning_ux_test.dart test/intelligent_area_recommendation_ui_test.dart
flutter build web --release --dart-define=APP_ENV=production --no-pub
```

The root server and application dependency locks remain unchanged. Discovery packaging now includes the same existing root-pinned `polygon-clipping` 0.15.7 dependency and maintained Property Intelligence/HTTP helper modules; this is packaging an existing dependency, not upgrading it. Its lock preserves all 248 previous non-root package entries exactly and adds only the matching polygon-clipping/robust-predicates/splaytree entries. The discovery manifest and generator are kept consistent. Four packaging tests check exact source/helper bindings, the recursive mirrored dependency graph, an actual offline discovery-package Corkran replay, and the maintained generator transformation/manifest without broad regeneration.

Recommended disposition: **review this candidate, then authorize a narrow web/server promotion and bounded production acceptance.** No deployment in this task.

Required promotion scope is `getSmartZonePlan`, `applySmartZonePlan`, their reviewed module dependencies, the exact `getBusinessWorkspaceContext` capability projection, and web Hosting. Preserve environment, identities, current IAM/App Check, secrets, dependency locks, financial controls and all unrelated functions. The Get callable requires the reviewed 180-second deadline; do not blindly reuse the old deployment overlay, which preserved the superseded entitlement prelude and does not package this complete candidate.

No resolver redeployment is required solely for this candidate: the previously corrected ZIP resolver remains unchanged. No native build or migration of customer campaigns is required. The frozen native candidate must be reconciled separately at its authorized future release; this web candidate does not claim installed native clients contain the new UI.

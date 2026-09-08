# Prospective canvassing compensation migration

Status: policy core prepared; production runtime integration is not certified.
This document does not authorize deployment or reinterpretation of existing work.

## Contract semantics

New neighborhood canvassing work must have an explicitly offered, funded and
accepted versioned contract. Reliable Route Coverage Estimate of at least 80%
qualifies for the entire accepted base. At least 95% additionally qualifies for
the actual accepted bonus, if one was offered and reserved. Neither figure is
verified household coverage. There is no percentage proration of the base.

The prospective core in `functions/production_canvassing_contract.js` binds the
campaign, Business, zone, Scaler, offer digest, immutable base and optional bonus,
route/corridor hashes, source geometry provenance, and acceptance timestamp.
Its inputs must come from server reads inside maintained authority transactions;
the module is not a callable and must never accept client assertions as evidence.
Funding fees continue to use the maintained authoritative quote. The module
checks the worker reserve; it does not replace fee, payment or allocation checks.

Existing accepted contracts remain unchanged. Missing legacy contracts are not
permission to manufacture replacement terms. Unknown policy versions fail closed.
An offered amount change or counteroffer requires a newly reviewed, reserved and
explicitly accepted offer before assignment. No administrative batch migrates
historical completions, ledgers, accepted contracts or review results.

Technical uncertainty can protect the accepted base on HOLD for authoritative
review; it cannot automatically pay base or bonus. An access exception neither
shrinks the denominator nor grants coverage automatically. Ordinary completion
requires valid assignment, finalized immutable evidence and reliable coverage.
Manual progress marks and residential photographs are not required for canvassing.

## Unresolved production route dependency

The normal Smart Zone planner currently emits polygons, component points and a
workload-distance estimate. It explicitly lists `pedestrian_route` as unsupported.
It does not emit the verified `executionRoute` required by corrected coverage.
Ordering building centroids, drawing a polygon perimeter, or reusing workload
distance would invent walkable connections and reproduce the denominator defect.

Before migration is deployable, the maintained normal mapping authority must
produce a versioned serviceable route with connected public-access geometry,
known exclusions, provenance, route/corridor hashes and a truthful denominator.
Unknown access or disconnected components must require review, not invented
connectors. The Business and Scaler must review the same route before acceptance.
The production route-authority envelope expected by the pure core describes the
required contract; its existence is not evidence that the planner implements it.

## Required runtime integration

1. Mapping generates and preserves the route authority through edits and review.
2. Quote/funding binds exact offered policy, pay, route and reserve; reject drift.
3. Application captures explicit acceptance of that offer; assignment atomically
   validates eligibility, acceptance, funding, immutable route and contract.
4. Live progress and finalization use that accepted route and evidence model.
5. Job Room and submission expose full base, offered bonus, eligibility, evidence
   and HOLD reasons. Unsupported policy clients must update before new work.
6. Business review recomputes the same policy/evidence identity, then uses the
   existing atomic earning/Wallet/ledger transaction and duplicate protection.

These production handlers are not patched by importing the policy core. Prepare
each from its verified deployed implementation, preserve unrelated semantics,
and test actual handlers, concurrent review, accepted-hash drift, privacy and
reserve accounting before declaring a coordinated promotion ready. In particular,
do not substitute a broad staging completion or assignment codebase.

## Physical build compatibility

Preparing this policy core and fixing the Business creation entry does not change
native tracking, Scaler GPS/session/finalization code, or the existing staging
policy. Source tests are not physical evidence. Existing matched staging builds
remain usable for their authorized physical certification scope.

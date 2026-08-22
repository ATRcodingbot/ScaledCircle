# Discovery authority migration

`saveDiscoveryPreferences` and `analyzeCampaignZone` are generated from their
canonical implementations in `functions/index.js` into the secret-free
`discovery-core` codebase. Their public callable IDs and `us-east1` contracts
remain unchanged. Zone analysis uses the reviewed server geometry estimator and
public geographic lookup/fallback path; it declares no provider secret.

Production currently still runs the existing `platform-core` resource. Do not
perform a broad production `platform-core` deployment until a separately
reviewed migration has moved that resource to `discovery-core`. Staging may
deploy the exact selector:

`functions:discovery-core:saveDiscoveryPreferences`

or, independently:

`functions:discovery-core:analyzeCampaignZone`

The production migration must first determine whether Firebase updates the same
Function ID in place or requires a controlled replacement. Do not delete the
working production resource before that review.

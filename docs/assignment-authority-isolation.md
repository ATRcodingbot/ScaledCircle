# Assignment authority isolation

The maintained callable IDs `assignScalerToZone`, `configureZoneGroupAssignment`,
and `acceptZoneGroupSlot` are generated into the `assignment-core` Functions
codebase. The deployable default package excludes them.

`assignment-core` has only Firebase Admin and Firebase Functions dependencies. It
does not declare Stripe, SMTP, email, Weather, wallet, or other provider secrets.
In-app assignment notifications remain Firestore writes inside the existing
assignment transactions; no synchronous email is part of these callables.

Staging discovery selector:

```text
functions:assignment-core:assignScalerToZone,
functions:assignment-core:configureZoneGroupAssignment,
functions:assignment-core:acceptZoneGroupSlot
```

Neither staging nor production had these IDs deployed when this migration was
prepared, so the first isolated deployment creates one Function resource per ID.
No deletion, rename, or duplicate authority is required. Always deploy the three
IDs explicitly; never bulk-deploy the default codebase.

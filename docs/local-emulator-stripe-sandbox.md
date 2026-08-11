# Local Firebase Emulator + Stripe Sandbox

This is the approved pre-staging environment for ScaledCircle. It never uses
production Firebase data and it must not use a live Stripe key.

## Environment boundary

Flutter requires one explicit compile-time value:

- `--dart-define=APP_ENV=local` uses Firebase project `demo-scaledcircle`, all
  local emulators, and shows a visible `LOCAL / TEST` banner.
- `--dart-define=APP_ENV=production` uses the checked-in production Firebase
  options and public URL.
- Missing or unknown `APP_ENV` stops startup. Local mode also stops if Firebase
  resolves to project `scaled-circle`.

Cloud Functions emulator reads `functions/.env.demo-scaledcircle`, which sets
`SCALEDCIRCLE_ENV=local` and a localhost public URL. Stripe code refuses live
keys outside production and refuses test keys in production.

Copy `functions/.secret.local.example` to `functions/.secret.local` and replace
the placeholders locally. Firebase loads this ignored file for secret
parameters in the Functions emulator. Never commit, expose to Flutter, or log
these values:

- `STRIPE_SECRET_KEY`: sandbox `sk_test_` key only
- `STRIPE_WEBHOOK_SECRET`: snapshot listener signing secret
- `STRIPE_THIN_WEBHOOK_SECRET`: Accounts v2 thin listener signing secret

The two webhook signing secrets are deliberately different and are not
interchangeable.

## Stable ports

| Service | Port |
| --- | ---: |
| Emulator UI | 4000 |
| Hosting | 5000 |
| Functions | 5001 |
| Firestore | 8080 |
| Auth | 9099 |
| Storage | 9199 |

## Start the local stack on Windows

From the repository root:

```powershell
cd functions
npm install
npm run serve
```

In a second terminal:

```powershell
cd functions
npm run seed:local

cd ..\apps\mobile
flutter pub get
flutter run -d chrome --dart-define=APP_ENV=local
```

The seed requires Auth, Firestore, and Storage emulator host variables and
aborts if the project is `scaled-circle`. It creates only synthetic Local
Business, Local Scaler, Local Admin, campaign, zone, assignment, compensation,
and fake local funding records. It never calls Stripe.

For the Android emulator, Flutter uses `10.0.2.2` to reach the Windows host.
Web uses `127.0.0.1`. A physical Android phone cannot use either address; pass
the host computer's LAN address explicitly:

```powershell
flutter run --dart-define=APP_ENV=local `
  --dart-define=FIREBASE_EMULATOR_HOST=192.168.1.20
```

The phone and computer must be on the same trusted network and Windows Firewall
must allow only the required emulator ports. Never expose emulator ports to the
public internet.

## Verify production isolation

1. Confirm the UI visibly says `LOCAL / TEST`.
2. Open `http://127.0.0.1:4000` and confirm project `demo-scaledcircle`.
3. Confirm local logs show emulator endpoints for Auth, Firestore, Functions,
   and Storage.
4. Stop an emulator and verify the local app fails rather than accessing cloud
   data.
5. Never run `firebase deploy` as part of this workflow.

The checked-in native Firebase files still identify the historical placeholder
native app. They are not used as the local trust boundary. Before native
production release, register Android and iOS Firebase apps for
`com.scaledcircle.app` and replace generated configuration in a separately
reviewed operation.

## Stripe CLI on Windows (prepare only)

Install the official Stripe CLI using its current Windows instructions, then
authenticate only after approval:

```powershell
stripe login
```

Forward canonical snapshot events to the Functions emulator:

```powershell
stripe listen `
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.succeeded,payment_intent.payment_failed,charge.refunded,charge.dispute.created,charge.dispute.updated,charge.dispute.closed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,transfer.created,transfer.reversed,payout.failed `
  --forward-to http://127.0.0.1:5001/demo-scaledcircle/us-east1/stripeWebhook
```

The command prints a temporary snapshot webhook signing secret (`whsec_...`).
Store it only in ignored local Functions secret/environment configuration.

Accounts v2 events are thin events and require current-resource retrieval.
Use the separate canonical thin endpoint and its independent signing secret:

```powershell
stripe listen `
  --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' `
  --forward-thin-to http://127.0.0.1:5001/demo-scaledcircle/us-east1/stripeThinWebhook
```

The snapshot listener's `whsec_` belongs only in `STRIPE_WEBHOOK_SECRET`. The
thin listener's separate `whsec_` belongs only in
`STRIPE_THIN_WEBHOOK_SECRET`. Restart the Functions emulator after changing
either local secret. Do not run either listener before approval.

Local Functions emulator URLs:

- snapshot: `http://127.0.0.1:5001/demo-scaledcircle/us-east1/stripeWebhook`
- Accounts v2 thin: `http://127.0.0.1:5001/demo-scaledcircle/us-east1/stripeThinWebhook`

## Sandbox values needed later

Keep every secret server-side and out of chat/source control:

- Stripe sandbox/test secret API key (`sk_test_...`)
- snapshot webhook signing secret from `stripe listen`
- separate Accounts v2 thin-event signing secret from the thin listener
- sandbox subscription Price IDs for Starter, Growth, and Scale testing
- sandbox promotional coupon/promotion-code identifiers if tested

Flutter may receive only non-secret publishable configuration if a later flow
requires it. It never receives secret keys or webhook secrets.

## First approved end-to-end sandbox test (not run yet)

After secrets are configured and explicit approval is given:

1. Seed Local Business and Local Scaler.
2. Create a local campaign quote: $100 worker allocation, $20 platform fee,
   $120 business charge.
3. Create sandbox Checkout and complete it with Stripe test data.
4. Forward the signed webhook and verify local campaign funding.
5. Accept the zone as Local Scaler, record synthetic/local tracking, submit,
   and approve verification.
6. Create exactly one $100 sandbox Connect transfer through the trusted
   operation and reconcile the local ledger/campaign route.

Stop before step 3 until the first external Stripe API call is separately
approved.

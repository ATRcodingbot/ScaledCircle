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
`SCALEDCIRCLE_ENV=local` and a localhost public URL. The isolated campaign
funding source is `functions-campaign-funding`, so Firebase-supported secret
overrides for that codebase belong in
`functions-campaign-funding/.secret.local`. This filename is ignored
repository-wide.

Copy `functions-campaign-funding/.secret.local.example` to
`functions-campaign-funding/.secret.local` and replace the placeholders
locally. Never commit, expose to Flutter, or log these values:

- `STRIPE_TEST_SECRET_KEY`: sandbox key beginning `sk_test_`
- `STRIPE_TEST_WEBHOOK_SECRET`: local Stripe CLI snapshot-listener secret
  beginning `whsec_`

Do not use generic or production Stripe secrets for this campaign-funding test
path. Do not create the real override file until the TEST key is available.

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

From the repository root, prepare the generated codebases and start only the
local Firebase project:

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
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,payment_intent.payment_failed,charge.refunded,refund.updated,charge.dispute.created,charge.dispute.updated,charge.dispute.closed `
  --forward-to http://127.0.0.1:5001/demo-scaledcircle/us-east1/stripeWebhook
```

The command prints a temporary snapshot webhook signing secret (`whsec_...`).
Store it only as `STRIPE_TEST_WEBHOOK_SECRET` in the ignored campaign-funding
secret override. Restart the Functions emulator after changing this value. Do
not subscribe this listener to subscription, Connect, transfer, or payout
events.

Local Functions emulator URLs:

- campaign funding: `http://127.0.0.1:5001/demo-scaledcircle/us-east1/stripeWebhook`

## Sandbox values needed later

Keep every secret server-side and out of chat/source control:

- `STRIPE_TEST_SECRET_KEY` (`sk_test_...`)
- `STRIPE_TEST_WEBHOOK_SECRET` from the campaign-funding `stripe listen`

Flutter may receive only non-secret publishable configuration if a later flow
requires it. It never receives secret keys or webhook secrets.

## First approved end-to-end sandbox test (not run yet)

After secrets are configured and explicit approval is given:

1. Seed emulator-only Admin, Business, and Scaler identities.
2. Create the controlled campaign and prove Checkout rejects a missing Zone.
3. Add a mapped Zone and obtain the authoritative funding quote.
4. Prove a stale approval digest is rejected, then approve the current quote.
5. Create Stripe TEST Checkout and pause for manual hosted Checkout completion.
6. Confirm redirect is not authority; wait for the signed local webhook.
7. Verify paid/funded state, replay idempotency, and publish in the emulator.
8. Exercise cancellation, expiration, failure, refund, and dispute fixtures.

## Safe restart and shutdown

After the Stripe listener supplies a new local `whsec_...`, update only the
ignored `.secret.local`, stop the Functions emulator with `Ctrl+C`, and restart
`npm run serve` so secret parameters reload. Keep the project explicitly set to
`demo-scaledcircle`.

Before restarting an emulator that contains QA evidence, export it outside the
repository:

```powershell
npx firebase-tools emulators:export $env:TEMP\scaledcircle-stripe-e2e\firebase-export `
  --project demo-scaledcircle
```

Restore only from a confirmed local export by adding `--import <export-path>`
to the emulator startup command. Never point export/import at production or put
an emulator export containing QA identities into source control.

Stripe Dashboard CLI authorization can select a different account or sandbox
than the one represented by `STRIPE_TEST_SECRET_KEY`. Compare safe account IDs
before listening. For local QA, Stripe CLI supports receiving the ignored TEST
key through the listener process environment (`STRIPE_API_KEY`); do not put the
key in command arguments, shell history, Flutter, or a tracked file. The key
must still start with `sk_test_`.

An ephemeral `stripe listen` connection receives new events only. It does not
automatically replay events created before that correctly aligned listener was
active. For a historical TEST event, retrieve that exact event from the same
TEST account and deliver its unchanged raw JSON to the local endpoint with a
valid signature derived from the current local listener secret. Re-deliver the
same event ID to prove the durable `stripeCampaignEvents` claim is idempotent.
Do not create another Checkout merely to compensate for a missed local event.

At the manual Checkout checkpoint, leave the emulators and Stripe listener
running and complete only the hosted TEST Checkout URL. After QA, stop the
Stripe listener and emulator process with `Ctrl+C`. Confirm no Java, Firebase,
or Stripe listener process from this run remains active. Never run
`firebase deploy` from this procedure.

Stop before step 3 until the first external Stripe API call is separately
approved.

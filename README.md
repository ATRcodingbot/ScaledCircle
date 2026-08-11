# Scaled Circle

## Local Firebase + Stripe sandbox

The approved local test environment uses Firebase Emulator Suite project
`demo-scaledcircle` and Stripe sandbox only. Production project `scaled-circle`
must remain isolated. See [Local emulator and Stripe sandbox](docs/local-emulator-stripe-sandbox.md).

```powershell
cd functions
npm run serve

cd ..\apps\mobile
flutter run -d chrome --dart-define=APP_ENV=local
```

Production builds must opt in explicitly:

```powershell
flutter build web --release --dart-define=APP_ENV=production
```

## Stripe marketplace (sandbox only)

The current marketplace payment implementation is designed for an isolated Firebase staging project plus Stripe sandbox. It uses platform-owned campaign charges and later Stripe Connect transfers; it must not be described as escrow. See [docs/stripe-marketplace.md](docs/stripe-marketplace.md) for the trust boundary, 20% platform-fee policy, Accounts v2 onboarding, state machines, refund/dispute handling, and manual sandbox checklist. Do not deploy or use live Stripe credentials without a separate approved release procedure.

> The Operating System for Local Marketing.

Scaled Circle is a modern platform that helps businesses plan, launch, track, and optimize real-world marketing campaigns by connecting them with verified local Scalers.

Businesses can draw their own marketing territories or use AI-assisted planning to build campaigns, then monitor execution through GPS verification, photo validation, and detailed analytics.

---

## Core Features

- 🗺️ Interactive Territory Builder
- 🤖 AI-Assisted Campaign Planning
- 🚶 Scaler Marketplace
- 📍 GPS Route Tracking
- 📸 Photo Verification
- 📊 Campaign Analytics
- 💳 Secure Payments
- 🔔 Real-Time Notifications

---

## Technology Stack

- Flutter
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Cloud Functions
- OpenStreetMap
- GitHub Actions (future)
- Stripe (future)

---

## Mission

To become the operating system for local marketing by making offline advertising measurable, verifiable, and scalable.

---

## Mobile builds

The Flutter client is in `apps/mobile` and supports web plus native Android/iOS shells. Active Scaler jobs use first-party native background-location bridges; see [Mobile background tracking](docs/mobile-background-tracking.md) and [Physical device testing](MANUAL_DEVICE_TESTING.md).

```powershell
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter build web
flutter build appbundle --release
```

An iOS release must be built and signed on macOS:

```bash
cd apps/mobile
flutter build ios --release --no-codesign
open ios/Runner.xcworkspace
```

Background tracking uses server-authoritative sessions, immutable canonical GPS chunks, private checkpoint Storage paths, and first-party native Android/iOS bridges. No App Check enforcement is enabled yet. On Windows, run the Android/web checks below; iOS/Xcode/signing and physical iPhone behavior remain **MANUAL / NOT YET VERIFIED**:

```powershell
cd apps/mobile
flutter analyze
flutter test
flutter build apk --debug
flutter build apk --release
flutter build web --release
```

Android and iOS source identifiers are `com.scaledcircle.app`. The matching
Firebase Android/iOS apps still need to be registered manually before a native
production release; do not reuse the old placeholder Firebase app files.

## Status

🚧 Active Development (Pre-Launch)

Current Phase:
Development Environment & Application Foundation

---

Built with ❤️ by the Scaled Circle team.

import 'package:firebase_core/firebase_core.dart';

/// Emulator-only Firebase Web options.
///
/// This library is reachable only through a compile-time `APP_ENV=local`
/// branch. Production tree shaking must remove this entire configuration.
abstract final class LocalFirebaseOptions {
  static const currentPlatform = FirebaseOptions(
    apiKey: 'fake-api-key',
    appId: '1:000000000000:web:local-scaledcircle',
    messagingSenderId: '000000000000',
    projectId: 'demo-scaledcircle',
    authDomain: 'demo-scaledcircle.firebaseapp.com',
    storageBucket: 'demo-scaledcircle.appspot.com',
  );
}

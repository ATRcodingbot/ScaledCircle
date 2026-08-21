import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb;

/// Firebase client configuration for the isolated hosted staging project.
///
/// This file intentionally supports web only. Native staging apps require
/// separately registered Firebase apps and must fail closed until then.
abstract final class StagingFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    throw UnsupportedError(
      'ScaledCircle staging Firebase is configured for web only. '
      'No staging options exist for $defaultTargetPlatform.',
    );
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyDipq6S85pPIvSKw9Zc0zHF9ppzOLoEv38',
    appId: '1:998249478055:web:3920b24f2a986619352882',
    messagingSenderId: '998249478055',
    projectId: 'scaledcircle-staging',
    authDomain: 'scaledcircle-staging.firebaseapp.com',
    storageBucket: 'scaledcircle-staging.firebasestorage.app',
  );
}

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Firebase client configuration for the isolated hosted staging project.
///
/// Web and the explicitly registered iOS/Android apps are supported. Other native
/// platforms continue to fail closed.
abstract final class StagingFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    if (defaultTargetPlatform == TargetPlatform.iOS) return ios;
    if (defaultTargetPlatform == TargetPlatform.android) return android;
    throw UnsupportedError(
      'ScaledCircle staging Firebase is configured for web, iOS, and Android only. '
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

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyB0qEvr1tzaC4mK4RP8akbC6wOcXO4nQaA',
    appId: '1:998249478055:ios:e3e282258d5750db352882',
    messagingSenderId: '998249478055',
    projectId: 'scaledcircle-staging',
    storageBucket: 'scaledcircle-staging.firebasestorage.app',
    iosBundleId: 'com.scaledcircle.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBGVRUtMjgQIBohQBFUS2-DytztuI7Weh4',
    appId: '1:998249478055:android:afe7b04c80155aa6352882',
    messagingSenderId: '998249478055',
    projectId: 'scaledcircle-staging',
    storageBucket: 'scaledcircle-staging.firebasestorage.app',
  );
}

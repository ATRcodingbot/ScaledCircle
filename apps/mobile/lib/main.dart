import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'firebase_options.dart';
import 'screens/auth/login_screen.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  //if (kDebugMode) {
  //  await _connectToFirebaseEmulators();
  //}

  runApp(const ScaledCircleApp());
}

// ignore: unused_element
Future _connectToFirebaseEmulators() async {
  final emulatorHost = _firebaseEmulatorHost();

  try {
    await FirebaseAuth.instance.useAuthEmulator(emulatorHost, 9099);

    FirebaseFirestore.instance.useFirestoreEmulator(emulatorHost, 8080);

    FirebaseFirestore.instance.settings = const Settings(
      persistenceEnabled: false,
    );

    FirebaseFunctions.instanceFor(
      region: 'us-east1',
    ).useFunctionsEmulator(emulatorHost, 5001);

    debugPrint('Connected to Firebase emulators at $emulatorHost');
  } catch (error) {
    debugPrint('Unable to connect to Firebase emulators: $error');
  }
}

String _firebaseEmulatorHost() {
  if (kIsWeb) {
    return '127.0.0.1';
  }

  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      // Android Emulator reaches the host computer through 10.0.2.2.
      return '10.0.2.2';

    case TargetPlatform.iOS:
    case TargetPlatform.macOS:
    case TargetPlatform.windows:
    case TargetPlatform.linux:
    case TargetPlatform.fuchsia:
      return '127.0.0.1';
  }
}

class ScaledCircleApp extends StatelessWidget {
  const ScaledCircleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Scaled Circle',
      theme: AppTheme.lightTheme,
      home: const LoginScreen(),
    );
  }
}

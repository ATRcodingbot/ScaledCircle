import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import 'config/app_environment.dart';
import 'config/firebase_auth_emulator_session.dart';
import 'navigation/app_routes.dart';
import 'screens/business/business_dashboard.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/public/public_landing_screen.dart';
import 'screens/public/business_funnel_screen.dart';
import 'screens/public/scaler_funnel_screen.dart';
import 'screens/scaler/dashboard/scaler_dashboard_screen.dart';
import 'screens/admin/admin_dashboard_screen.dart';
import 'screens/admin/admin_login_screen.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final app = await Firebase.initializeApp(
    options: AppEnvironmentConfig.firebaseOptions,
  );
  AppEnvironmentConfig.verifyInitializedProject(app);
  if (AppEnvironmentConfig.isLocal) {
    await _connectToFirebaseEmulators();
  }

  runApp(const ScaledCircleApp());
}

// ignore: unused_element
Future<void> _connectToFirebaseEmulators() async {
  final host = AppEnvironmentConfig.emulatorHost;
  clearRetainedAuthEmulatorOrigin(Firebase.app().name);
  final auth = FirebaseAuth.instance;
  await auth.useAuthEmulator(host, 9099);
  if (kIsWeb) {
    // Keep emulator-only browser sessions in memory. This runs after Auth is
    // attached to 127.0.0.1 so persistence setup cannot initialize a
    // production-routed Auth transport.
    await auth.setPersistence(Persistence.NONE);
  }
  FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: false,
  );
  FirebaseFunctions.instanceFor(
    region: AppEnvironmentConfig.functionsRegion,
  ).useFunctionsEmulator(host, 5001);
  await FirebaseStorage.instance.useStorageEmulator(host, 9199);
  debugPrint(
    'LOCAL / TEST Firebase emulators: project=demo-scaledcircle host=$host',
  );
}

class ScaledCircleApp extends StatelessWidget {
  const ScaledCircleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Scaled Circle',
      theme: AppTheme.lightTheme,
      home: const PublicLandingScreen(),
      routes: {
        AppRoutes.login: (_) => const LoginScreen(),
        AppRoutes.createAccount: (_) => const RegisterScreen(),
        AppRoutes.publicExperience: (_) => const PublicLandingScreen(),
        AppRoutes.businesses: (_) => const BusinessFunnelScreen(),
        AppRoutes.scalers: (_) => const ScalerFunnelScreen(),
        AppRoutes.businessDashboard: (_) => const BusinessDashboard(),
        AppRoutes.scalerDashboard: (_) => const ScalerDashboardScreen(),
        AppRoutes.adminLogin: (_) => const AdminLoginScreen(),
        AppRoutes.adminDashboard: (_) => const AdminDashboardScreen(),
      },
      builder: (context, child) {
        if (!AppEnvironmentConfig.isLocal) return child ?? const SizedBox();
        return Banner(
          message: AppEnvironmentConfig.diagnosticsLabel,
          location: BannerLocation.topEnd,
          color: const Color(0xFFD97706),
          child: child ?? const SizedBox(),
        );
      },
    );
  }
}

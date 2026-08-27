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
import 'navigation/app_router.dart';
import 'navigation/protected_route_gate.dart';
import 'screens/business/business_dashboard.dart';
import 'screens/business/business_attribution_screen.dart';
import 'screens/campaigns/campaign_funding_return_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/auth/verify_email_screen.dart';
import 'screens/auth/complete_scaler_profile_screen.dart';
import 'screens/public/public_landing_screen.dart';
import 'screens/public/business_funnel_screen.dart';
import 'screens/public/scaler_funnel_screen.dart';
import 'screens/public/legal_document_screen.dart';
import 'screens/scaler/dashboard/scaler_dashboard_screen.dart';
import 'screens/admin/admin_dashboard_screen.dart';
import 'screens/admin/admin_login_screen.dart';
import 'screens/admin/sales_home_screen.dart';
import 'screens/campaigns/campaign_details_screen.dart';
import 'screens/jobs/job_room_screen.dart';
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

  static Route<dynamic> _generateRoute(RouteSettings settings) {
    final route = Uri.tryParse(settings.name ?? '');
    if (route?.path == '/') {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const PublicLandingScreen(),
      );
    }
    if (route?.path == AppRoutes.login) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AuthenticatedLandingGate(),
      );
    }
    if (route?.path == AppRoutes.createAccount) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const RegisterScreen(),
      );
    }
    if (route?.path == AppRoutes.publicExperience) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const PublicLandingScreen(),
      );
    }
    if (route?.path == AppRoutes.businesses) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const BusinessFunnelScreen(),
      );
    }
    if (route?.path == AppRoutes.scalers) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const ScalerFunnelScreen(),
      );
    }
    if (LegalDocumentKind.fromPath(route?.path) case final legalKind?) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => LegalDocumentScreen(kind: legalKind),
      );
    }
    if (route?.path == AppRoutes.adminLogin) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AdminLoginScreen(),
      );
    }
    if (route?.path == AppRoutes.completeScalerProfile) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const CompleteScalerProfileScreen(),
      );
    }
    if (route?.path == AppRoutes.businessDashboard) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ProtectedRouteGate(
          routeName: AppRoutes.businessDashboard,
          audience: ProtectedRouteAudience.business,
          builder: (_, _) => LoginNotificationWrapper(
            notification: settings.arguments as LoginNotificationData?,
            child: const BusinessDashboard(),
          ),
        ),
      );
    }
    if (route?.path == AppRoutes.businessAttribution) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ProtectedRouteGate(
          routeName: AppRoutes.businessAttribution,
          audience: ProtectedRouteAudience.business,
          builder: (_, _) => const BusinessAttributionScreen(),
        ),
      );
    }
    if (route?.path == AppRoutes.scalerDashboard) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ProtectedRouteGate(
          routeName: AppRoutes.scalerDashboard,
          audience: ProtectedRouteAudience.scaler,
          builder: (_, _) => LoginNotificationWrapper(
            notification: settings.arguments as LoginNotificationData?,
            child: const ScalerDashboardScreen(),
          ),
        ),
      );
    }
    if (route?.path == AppRoutes.adminDashboard) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ProtectedRouteGate(
          routeName: AppRoutes.adminDashboard,
          audience: ProtectedRouteAudience.admin,
          builder: (_, _) => const AdminDashboardScreen(),
        ),
      );
    }
    if (route?.path == AppRoutes.sales) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ProtectedRouteGate(
          routeName: AppRoutes.sales,
          audience: ProtectedRouteAudience.admin,
          builder: (_, _) => SalesHomeScreen(),
        ),
      );
    }
    if (route?.path == AppRoutes.verifyEmail) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) =>
            VerifyEmailScreen(actionCode: route?.queryParameters['oobCode']),
      );
    }
    if (route?.path == AppRoutes.campaignFundingReturn) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => CampaignFundingReturnScreen(
          campaignId: route?.queryParameters['campaignId'] ?? '',
        ),
      );
    }
    final segments = route?.pathSegments ?? const <String>[];
    if (segments.length == 2 && segments.first == 'campaign') {
      final campaignId = Uri.decodeComponent(segments.last);
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ProtectedRouteGate(
          routeName: settings.name!,
          audience: ProtectedRouteAudience.business,
          builder: (user, profile) =>
              FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                future: FirebaseFirestore.instance
                    .collection('campaigns')
                    .doc(campaignId)
                    .get(),
                builder: (context, snapshot) {
                  final isAdmin =
                      profile['role']?.toString().toLowerCase() == 'admin';
                  final fallbackRoute = isAdmin
                      ? AppRoutes.adminDashboard
                      : AppRoutes.businessDashboard;
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Scaffold(
                      body: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final campaign = snapshot.data;
                  final data = campaign?.data();
                  if (campaign == null || !campaign.exists) {
                    return RouteRecoveryScreen(
                      title: 'Campaign not available.',
                      destination: fallbackRoute,
                    );
                  }
                  if (!isAdmin && data?['businessId'] != user.uid) {
                    return RouteRecoveryScreen(
                      title: 'You don\'t have access to this campaign.',
                      destination: fallbackRoute,
                    );
                  }
                  return CampaignDetailsScreen(
                    campaign: campaign,
                    fallbackRoute: fallbackRoute,
                  );
                },
              ),
        ),
      );
    }
    if (segments.length == 2 && segments.first == 'job-room') {
      final zoneId = Uri.decodeComponent(segments.last);
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ProtectedRouteGate(
          routeName: settings.name!,
          audience: ProtectedRouteAudience.jobRoomParticipant,
          builder: (_, _) => JobRoomScreen(zoneId: zoneId),
        ),
      );
    }
    return MaterialPageRoute(
      settings: settings,
      builder: (_) => const UnknownRouteGate(),
    );
  }

  static final AppRouterDelegate _routerDelegate = AppRouterDelegate(
    _generateRoute,
  );

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'Scaled Circle',
      theme: AppTheme.lightTheme,
      routerDelegate: _routerDelegate,
      routeInformationParser: const AppRouteInformationParser(),
      builder: (context, child) {
        if (AppEnvironmentConfig.isProduction) {
          return child ?? const SizedBox();
        }
        return Banner(
          message: AppEnvironmentConfig.diagnosticsLabel,
          location: BannerLocation.topEnd,
          color: AppEnvironmentConfig.isStaging
              ? const Color(0xFF7C3AED)
              : const Color(0xFFD97706),
          child: child ?? const SizedBox(),
        );
      },
    );
  }
}

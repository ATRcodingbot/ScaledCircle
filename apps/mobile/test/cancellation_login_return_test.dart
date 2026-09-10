import 'package:firebase_core/firebase_core.dart';
// The Firebase plugins already pin these platform interfaces; this test replaces
// the transport only, so it cannot authenticate or change a real account.
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
// ignore: depend_on_referenced_packages
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/auth/login_screen.dart';
import 'package:flutter_app/screens/business/business_membership_screen.dart';
import 'billing_communications_ui_test.dart' show BillingHistoryService;
import 'package:flutter_app/navigation/app_router.dart';

class LocalCore extends FirebasePlatform {
  @override
  FirebaseAppPlatform app([String name = '[DEFAULT]']) => FirebaseAppPlatform(
    name,
    const FirebaseOptions(
      apiKey: 'test',
      appId: 'test',
      messagingSenderId: 'test',
      projectId: 'demo-cancellation',
    ),
  );
}

class LocalUser extends Fake
    with MockPlatformInterfaceMixin
    implements UserPlatform {}

class LocalCredential extends UserCredentialPlatform {
  LocalCredential(FirebaseAuthPlatform auth)
    : super(auth: auth, user: LocalUser());
}

class LocalAuth extends FirebaseAuthPlatform {
  @override
  FirebaseAuthPlatform delegateFor({required FirebaseApp app}) => this;
  @override
  FirebaseAuthPlatform setInitialValues({
    InternalUserDetails? currentUser,
    String? languageCode,
  }) => this;
  @override
  Future<UserCredentialPlatform> signInWithEmailAndPassword(
    String email,
    String password,
  ) async => LocalCredential(this);
}

void main() {
  test(
    'explicit web Billing hash is preserved before authenticated startup',
    () {
      expect(
        initialBillingRoute(
          Uri.parse('https://scaledcircle.com/#/billing/cancel'),
        ),
        Uri.parse('/billing/cancel'),
      );
      expect(
        initialBillingRoute(
          Uri.parse('https://scaledcircle.com/#/billing/history'),
        ),
        Uri.parse('/billing/history'),
      );
      expect(
        initialBillingRoute(Uri.parse('https://scaledcircle.com/')),
        isNull,
      );
      expect(
        initialBillingRoute(
          Uri.parse(
            'https://scaledcircle.com/#//unrelated.test/billing/cancel',
          ),
        ),
        isNull,
      );
    },
  );
  testWidgets(
    'signed-out cancellation destination survives the real Login screen',
    (tester) async {
      final core = FirebasePlatform.instance,
          auth = FirebaseAuthPlatform.instance;
      FirebasePlatform.instance = LocalCore();
      FirebaseAuthPlatform.instance = LocalAuth();
      addTearDown(() {
        FirebasePlatform.instance = core;
        FirebaseAuthPlatform.instance = auth;
      });
      final service = BillingHistoryService();
      await tester.binding.setSurfaceSize(const Size(700, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: const LoginScreen(returnRoute: '/billing/cancel'),
          routes: {
            '/billing/cancel': (_) => BusinessMembershipScreen(
              service: service,
              businessId: 'business',
              section: 'cancel',
            ),
            '/billing': (_) => const Scaffold(body: Text('General Billing')),
          },
        ),
      );
      await tester.enterText(find.byType(TextField).at(0), 'owner@example.com');
      await tester.enterText(find.byType(TextField).at(1), 'local-test-only');
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();
      expect(find.text('Keep My Membership'), findsOneWidget);
      expect(find.text('General Billing'), findsNothing);
      expect(service.calls, ['getBusinessMembership']);
      await tester.tap(find.text('Keep My Membership'));
      await tester.pumpAndSettle();
      expect(find.text('General Billing'), findsOneWidget);
      expect(service.calls, ['getBusinessMembership']);
    },
  );
}
